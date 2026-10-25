import { sanitizeEntityIds, sanitizeSearchQuery, sanitizeTagIds } from "@/lib/qloo/ids";
import { qlooErrorMessage, normalizeEntity, normalizeTag, unwrapEntities, unwrapTags } from "@/lib/qloo/parse";
import { backoffMs, cacheKey, holdQloo, readQlooCache, withQlooSlot, writeQlooCache } from "@/lib/qloo/traffic";
import type { InsightTarget, QlooTraceCall, TasteClient, TasteEntity, TasteTag } from "@/lib/qloo/types";
import { redactSecrets } from "@/lib/security/redact";

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

const SEARCH_TYPES = [
  "urn:entity:movie",
  "urn:entity:tv_show",
  "urn:entity:book",
  "urn:entity:person",
  "urn:entity:artist",
  "urn:entity:brand",
  "urn:entity:place",
].join(",");

/**
 * Live client for the Qloo hackathon API.
 * Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide
 *
 * - Base URL defaults to https://hackathon.api.qloo.com (hackathon keys 401 on api.qloo.com).
 * - Auth header is `X-Api-Key`, never a bearer token and never a query parameter.
 * - `/search`, `/v2/insights`, and `/v2/tags` are GET requests. `/recommendations` is not used.
 */
export class QlooClient implements TasteClient {
  readonly mode = "live" as const;
  readonly trace: QlooTraceCall[] = [];

  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      fetchImpl?: FetchLike;
    },
  ) {}

  async search(query: string, take = 8, types?: string): Promise<TasteEntity[]> {
    const safeQuery = sanitizeSearchQuery(query);
    const safeTake = String(Math.min(Math.max(take, 1), 20));
    if (safeQuery.length < 2) return [];

    const mapRows = (body: unknown) =>
      unwrapEntities(body)
        .map((row) => normalizeEntity(row, false))
        .filter((row): row is TasteEntity => row !== null)
        .slice(0, take);

    const requested = types?.split(",").filter(Boolean).slice(0, 8).join(",");
    const first: Record<string, string> = { query: safeQuery, take: safeTake };
    if (requested) first.types = requested;

    // A 400 sometimes means the untyped search is not accepted. An empty 200 or a 404 is a real miss
    // and must not spend a second call. A caller who already asked for types does not get a second try.
    try {
      const body = await this.get("/search", first);
      return mapRows(body);
    } catch (error) {
      if (requested || !(error instanceof QlooError) || error.status !== 400) throw error;
    }

    const typed = await this.get("/search", { query: safeQuery, take: safeTake, types: SEARCH_TYPES });
    return mapRows(typed);
  }

  async searchTags(query: string, take = 5): Promise<TasteTag[]> {
    const safeQuery = sanitizeSearchQuery(query, 40);
    if (safeQuery.length < 2) return [];
    // Typo tolerance turns bathhouse into Bach House and dusk into Desk. Exact match, then we filter.
    const body = await this.get("/v2/tags", {
      "filter.query": safeQuery,
      take: String(Math.min(Math.max(take, 1), 20)),
      "feature.typo_tolerance": "false",
    });
    return unwrapTags(body)
      .map((row) => normalizeTag(row))
      .filter((row): row is TasteTag => row !== null)
      .slice(0, take);
  }

  async insights(args: {
    filterType: InsightTarget;
    entityIds: string[];
    tagIds: string[];
    filterTagIds?: string[];
    location?: string;
    take?: number;
    timeoutMs?: number;
  }): Promise<{ entities: TasteEntity[]; tags: TasteTag[] }> {
    const take = Math.min(Math.max(args.take ?? 6, 1), 20);
    const entityIds = sanitizeEntityIds(args.entityIds);
    const tagIds = sanitizeTagIds(args.tagIds);
    const filterTagIds = sanitizeTagIds(args.filterTagIds ?? []);
    if (!entityIds.length && !tagIds.length && !filterTagIds.length) {
      return { entities: [], tags: [] };
    }
    const query: Record<string, string> = {
      "filter.type": args.filterType,
      take: String(take),
      "feature.explainability": "true",
    };
    if (entityIds.length) query["signal.interests.entities"] = entityIds.join(",");
    if (tagIds.length) query["signal.interests.tags"] = tagIds.join(",");
    if (filterTagIds.length) {
      query["filter.tags"] = filterTagIds.join(",");
      query["operator.filter.tags"] = "union";
    }
    if (args.location && args.filterType === "urn:entity:place") query["filter.location.query"] = args.location;

    const body = await this.get("/v2/insights", query, 0, args.timeoutMs ?? 6000);
    const signalIds = entityIds;
    const entities = unwrapEntities(body)
      .map((row) => normalizeEntity(row, false, signalIds))
      .filter((row): row is TasteEntity => row !== null)
      .filter((row) => !entityIds.includes(row.id));
    const tags = unwrapTags(body)
      .map((row) => normalizeTag(row))
      .filter((row): row is TasteTag => row !== null);
    return { entities: entities.slice(0, take), tags: tags.slice(0, take) };
  }

  private async get(
    path: "/search" | "/v2/insights" | "/v2/tags",
    query: Record<string, string>,
    attempt = 0,
    timeoutMs = 6000,
  ): Promise<unknown> {
    const key = cacheKey(path, query);
    const cached = readQlooCache(key);
    if (cached !== undefined) {
      const count = unwrapEntities(cached).length + unwrapTags(cached).length;
      this.trace.push({ method: "GET", path, query, status: 200, resultCount: count, mocked: false, cached: true });
      return cached;
    }

    const url = new URL(this.options.baseUrl + path);
    for (const [keyName, value] of Object.entries(query)) {
      if (value) url.searchParams.set(keyName, value);
    }

    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await withQlooSlot(() =>
        fetchImpl(url, {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-Api-Key": this.options.apiKey,
          },
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        }),
      );
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : "Network error", [this.options.apiKey]);
      this.trace.push({ method: "GET", path, query, status: 0, resultCount: 0, mocked: false, error: message });
      // A timeout already spent the budget. Retrying it is a storm, not a recovery.
      if (attempt < 1 && !isTimeout(error)) {
        await wait(backoffMs(attempt, null));
        return this.get(path, query, attempt + 1, timeoutMs);
      }
      throw new QlooError(message, 0, path);
    }

    if (response.status === 429 && attempt < 2) {
      const waitMs = backoffMs(attempt, response.headers.get("retry-after"));
      holdQloo(waitMs);
      await wait(waitMs);
      return this.get(path, query, attempt + 1, timeoutMs);
    }
    if (response.status >= 500 && attempt < 1) {
      const waitMs = backoffMs(attempt, null);
      holdQloo(waitMs);
      await wait(waitMs);
      return this.get(path, query, attempt + 1, timeoutMs);
    }

    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = { message: text.slice(0, 280) };
      }
    }

    if (response.status === 404 && (path === "/search" || path === "/v2/tags")) {
      const empty = { results: [] };
      writeQlooCache(key, empty);
      this.trace.push({ method: "GET", path, query, status: 404, resultCount: 0, mocked: false });
      return empty;
    }

    if (!response.ok) {
      let message = redactSecrets(qlooErrorMessage(body, response.statusText), [this.options.apiKey]);
      if (response.status === 401) {
        const hint =
          "Hackathon keys only authenticate against https://hackathon.api.qloo.com with the X-Api-Key header.";
        message = /[.!?]$/.test(message) ? `${message} ${hint}` : `${message}. ${hint}`;
      }
      this.trace.push({
        method: "GET",
        path,
        query,
        status: response.status,
        resultCount: 0,
        mocked: false,
        error: message,
      });
      throw new QlooError(message, response.status, path);
    }

    const count = unwrapEntities(body).length + unwrapTags(body).length;
    this.trace.push({ method: "GET", path, query, status: response.status, resultCount: count, mocked: false });
    writeQlooCache(key, body);
    return body;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError" || /aborted|timeout/i.test(error.message));
}
