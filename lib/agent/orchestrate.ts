import { compareRooms, stereotypeBaseline, type Comparison, type PlainRoom } from "@/lib/atmosphere/baseline";
import { compileAtmosphere } from "@/lib/atmosphere/compile";
import type { Atmosphere } from "@/lib/atmosphere/schema";
import { readConfig, type AppConfig, type DispatchMode } from "@/lib/config";
import { NoTasteMatch, PromptError } from "@/lib/agent/errors";
import { knownProposal, placeCity, proposalSummary, sceneFromPrompt } from "@/lib/agent/propose";
import { assembleGraph } from "@/lib/agent/assemble";
import { scheduleSampleWarmup } from "@/lib/qloo/warm";
import { extractQueries, nameScore, tagAccepts, tagQueriesFor, tokens } from "@/lib/agent/queries";
import { relevantPlaces, rescuePlaces } from "@/lib/agent/rank";
import type { AgentStep } from "@/lib/agent/steps";
import { hashString } from "@/lib/atmosphere/color";
import type { QlooTraceCall, TasteClient, TasteEntity, TasteGraph, TasteTag } from "@/lib/qloo/types";
import { redactSecrets } from "@/lib/security/redact";

export type EntityView = {
  id: string;
  name: string;
  type: string;
  description: string | null;
  imageUrl: string | null;
  popularity: number | null;
  affinity: number | null;
  tags: string[];
  explainers: { id: string; name: string; score: number }[];
  mock: boolean;
};

export type CompileResult = {
  atmosphere: Atmosphere;
  graph: {
    source: TasteGraph["source"];
    synthetic: boolean;
    seeds: EntityView[];
    artists: EntityView[];
    places: EntityView[];
    brands: EntityView[];
    books: EntityView[];
    movies: EntityView[];
    tags: TasteTag[];
  };
  trace: QlooTraceCall[];
  agent: {
    kind: "deterministic" | "llm";
    provider: string | null;
    model: string | null;
    fallback: string | null;
  };
  dispatchPlan: {
    mode: DispatchMode;
    auto: boolean;
    configured: boolean;
  };
  /** Operator-facing notes that must not relabel live data as mock. */
  warnings: string[];
  steps: AgentStep[];
  baseline: PlainRoom;
  comparison: Comparison;
  diagnostics: CompileDiagnostics;
  /** Wall-clock time for this compile, including Qloo and the plain reading. */
  elapsedMs: number;
};

export type CompileDiagnostics = {
  candidates: { id: string; name: string; type: string; score: number; query: string; typed: string }[];
  rejected: { name: string; why: string }[];
  modelError: string | null;
  choice: { seedIds: string[]; tagIds: string[]; reason: string } | null;
  plainError: string | null;
};

const INSIGHT_TARGETS = [
  "urn:entity:artist",
  "urn:entity:place",
  "urn:entity:brand",
  "urn:entity:book",
  "urn:entity:movie",
  "urn:tag",
] as const;

export async function compileFromPrompt(
  prompt: string,
  options?: {
    client?: TasteClient;
    env?: Record<string, string | undefined>;
    allowLlm?: boolean;
    debug?: boolean;
    onStatus?: (message: string) => void;
  },
): Promise<CompileResult> {
  const started = Date.now();
  const cleaned = prompt.replace(/[\u0000-\u001F\u007F]/g, " ").trim().replace(/\s+/g, " ");
  if (cleaned.length < 3) throw new PromptError("Give the room a cultural prompt of at least a few words.");
  if (cleaned.length > 400) throw new PromptError("Keep the prompt under 400 characters.");

  const env = options?.env ?? process.env;
  const config = readConfig(env);
  const secrets = secretValues(config);
  const client = options?.client ?? (await import("@/lib/qloo")).createTasteClient(env);
  const useLlm = options?.allowLlm !== false && Boolean(config.llm);
  if (useLlm) options?.onStatus?.("Writing the plain reading beside the Qloo room.");
  const baselinePromise = useLlm
    ? import("@/lib/agent/baseline-model").then((mod) => mod.modelBaseline(cleaned, config.llm!))
    : Promise.resolve(stereotypeBaseline(cleaned));

  let agent: CompileResult["agent"] = {
    kind: "deterministic",
    provider: null,
    model: null,
    fallback: null,
  };
  let diagnostics = emptyDiagnostics();

  let graph: TasteGraph | null = null;
  let steps: AgentStep[] = [];
  if (useLlm && config.llm) {
    try {
      const { compileWithModel } = await import("@/lib/agent/llm");
      const modeled = await compileWithModel({
        prompt: cleaned,
        client,
        llm: config.llm,
        onStatus: options?.onStatus,
      });
      steps = modeled.steps;
      diagnostics = { ...modeled.diagnostics, plainError: null };
      if (modeled.graph && modeled.modelUsed) {
        graph = modeled.graph;
        agent = { kind: "llm", provider: config.llm.provider, model: config.llm.modelId, fallback: null };
      } else if (modeled.graph) {
        graph = modeled.graph;
        const reason = modeled.diagnostics.modelError;
        agent = {
          kind: "deterministic",
          provider: config.llm.provider,
          model: config.llm.modelId,
          fallback: reason
            ? `The model did not name the seeds (${reason}). Canonical names were confirmed on Qloo instead.`
            : null,
        };
      }
    } catch (error) {
      const message = redactSecrets(error instanceof Error ? error.message : "The model path failed.", secrets);
      console.error("[atrium] model path failed:", message);
      agent.fallback = message;
      diagnostics.modelError = message;
    }
  }

  if (!graph) {
    options?.onStatus?.("Searching Qloo for the names in the prompt.");
    const gathered = await gatherGraph(client, cleaned);
    graph = gathered.graph;
    steps = steps.length ? [...steps, ...gathered.steps] : gathered.steps;
    if (config.llm && useLlm) {
      agent = {
        kind: "deterministic",
        provider: config.llm.provider,
        model: config.llm.modelId,
        fallback: agent.fallback ?? diagnostics.modelError ?? "The model did not produce a compilable taste graph.",
      };
    }
  }

  options?.onStatus?.("Compiling the room from those rows.");
  const atmosphere = compileAtmosphere(cleaned, graph);
  const baseline = await baselinePromise;
  if (baseline.source === "stereotype" && useLlm) {
    console.error("[atrium] plain-room fallback:", baseline.note);
    diagnostics.plainError = baseline.note;
  }
  const comparison = compareRooms(cleaned, atmosphere, baseline);
  if (options?.debug) {
    console.info(
      "[atrium] compile debug",
      redactSecrets(
        JSON.stringify({
          agent,
          diagnostics,
          calls: client.trace.map((call) => ({
            path: call.path,
            query: call.query,
            status: call.status,
            resultCount: call.resultCount,
            mocked: call.mocked,
            error: call.error,
          })),
        }),
        secrets,
      ),
    );
  }
  const trace = client.trace.map((call) => ({
    ...call,
    error: call.error ? redactSecrets(call.error, secrets) : undefined,
  }));
  scheduleSampleWarmup(client);
  return {
    atmosphere,
    graph: {
      source: graph.source,
      synthetic: graph.synthetic,
      seeds: graph.seeds.map(toView),
      artists: graph.artists.map(toView),
      places: graph.places.map(toView),
      brands: graph.brands.map(toView),
      books: graph.books.map(toView),
      movies: graph.movies.map(toView),
      tags: graph.tags,
    },
    trace,
    agent,
    dispatchPlan: {
      mode: config.dispatch.mode,
      auto: config.dispatch.mode !== "govee" && config.dispatch.auto && config.dispatch.configured,
      configured: config.dispatch.configured,
    },
    warnings: liveWarnings(client, graph),
    steps,
    baseline,
    comparison,
    elapsedMs: Date.now() - started,
    diagnostics,
  };
}

function emptyDiagnostics(): CompileDiagnostics {
  return { candidates: [], rejected: [], modelError: null, choice: null, plainError: null };
}

function secretValues(config: AppConfig): string[] {
  return [
    config.qlooKey,
    config.llm?.apiKey ?? "",
    config.dispatch.hueUsername,
    config.dispatch.haToken,
    config.dispatch.webhookUrl,
  ];
}

function liveWarnings(client: TasteClient, graph: TasteGraph): string[] {
  if (graph.source !== "qloo") return [];
  const insightErrors = client.trace.filter((call) => call.path === "/v2/insights" && call.error);
  const insightHits = client.trace.some((call) => call.path === "/v2/insights" && !call.error && call.resultCount > 0);
  if (insightErrors.length && !insightHits) {
    return [
      "Qloo search responded, but every insights call failed. This room uses the search hits only, and it is still live data.",
    ];
  }
  if (insightErrors.length) {
    return [`${insightErrors.length} Qloo insights call(s) failed. The room uses the domains that responded.`];
  }
  return [];
}

export async function gatherGraph(client: TasteClient, prompt: string): Promise<{ graph: TasteGraph; steps: AgentStep[] }> {
  const known = knownProposal(prompt);
  if (known) {
    const steps: AgentStep[] = [
      {
        why: known.reason,
        call: "propose_seeds",
        detail: "canonical names",
        result: proposalSummary(known),
      },
    ];
    const graph = await assembleGraph(client, prompt, known, steps);
    if (graph) return { graph, steps };
  }

  const steps: AgentStep[] = [];
  const queries = extractQueries(prompt);
  const seedMap = new Map<string, { entity: TasteEntity; score: number }>();
  const searches = await Promise.all(
    queries.map(async (query) => ({ query, hits: await client.search(query, 8) })),
  );

  for (const { query, hits } of searches) {
    const kept = hits.filter((hit, index) => {
      const crossScript = !/[a-z]/i.test(query);
      const lexical = Math.max(hit.matchScore ?? 0, nameScore(query, hit.name));
      const score = lexical >= 0.45 ? lexical : crossScript && index === 0 ? 0.7 : lexical;
      return score >= 0.45;
    });
    steps.push({
      why: `Disambiguate “${query}” on the taste graph before asking what sits next to it.`,
      call: "GET /search",
      detail: `query=${query}`,
      result: kept.map((hit) => hit.name).slice(0, 4).join(", ") || "no entity kept",
    });
    // Latin overlap cannot score a Japanese (or other non-Latin) query against a Romanized Qloo name.
    const crossScript = !/[a-z]/i.test(query);
    hits.forEach((hit, index) => {
      const lexical = Math.max(hit.matchScore ?? 0, nameScore(query, hit.name));
      const score = lexical >= 0.45 ? lexical : crossScript && index === 0 ? 0.7 : lexical;
      if (score < 0.45) return;
      const current = seedMap.get(hit.id);
      if (!current || score > current.score) seedMap.set(hit.id, { entity: hit, score });
    });
  }

  const seeds = [...seedMap.values()]
    .sort((a, b) => b.score - a.score || a.entity.id.localeCompare(b.entity.id))
    .slice(0, 4)
    .map((row) => row.entity);

  const tagQueries = tagQueriesFor(prompt, seeds.map((seed) => seed.name));
  const tags: TasteTag[] = [];
  const tagBatches = await Promise.all(
    tagQueries.map(async (query) => {
      try {
        return { query, found: await client.searchTags(query, 5) };
      } catch {
        return { query, found: [] as TasteTag[] };
      }
    }),
  );
  for (const { query, found } of tagBatches) {
    const accepted: string[] = [];
    for (const tag of found) {
      if (!tagFits(query, tag)) continue;
      if (tags.some((existing) => existing.id === tag.id)) continue;
      tags.push(tag);
      accepted.push(tag.name);
      if (tags.length >= 6) break;
    }
    steps.push({
      why: `“${query}” is a mood word. Resolve a real tag id. Atrium does not invent tag URNs.`,
      call: "GET /v2/tags",
      detail: `filter.query=${query}`,
      result: accepted.join(", ") || "no tag",
    });
    if (tags.length >= 6) break;
  }

  if (!seeds.length && !tags.length) {
    if (client.mode === "mock") return { graph: syntheticGraph(prompt), steps };
    throw new NoTasteMatch(
      "Qloo search returned no entities or tags for that prompt. Try a film, book, artist, or place name.",
    );
  }

  const entityIds = seeds.map((seed) => seed.id);
  const tagIds = tags.map((tag) => tag.id);
  const buckets: Record<"artists" | "places" | "brands" | "books" | "movies", TasteEntity[]> = {
    artists: [],
    places: [],
    brands: [],
    books: [],
    movies: [],
  };

  await Promise.all(
    INSIGHT_TARGETS.map(async (filterType) => {
      try {
        const fitted = filterType === "urn:entity:place" ? placeCity(prompt) : null;
        const result = await client.insights({
          filterType,
          entityIds,
          tagIds,
          take: 6,
          location: fitted ?? undefined,
        });
        if (filterType === "urn:tag") {
          for (const tag of result.tags) {
            if (!tagFitsPrompt(prompt, tag) && !tagIds.includes(tag.id)) continue;
            const existing = tags.find((item) => item.id === tag.id);
            if (existing) {
              if (tag.affinity != null) existing.affinity = tag.affinity;
            }
          }
          return;
        }
        const key =
          filterType === "urn:entity:artist"
            ? "artists"
            : filterType === "urn:entity:place"
              ? "places"
              : filterType === "urn:entity:brand"
                ? "brands"
                : filterType === "urn:entity:book"
                  ? "books"
                  : "movies";
        const rows = result.entities.filter((entity) => !entityIds.includes(entity.id)).slice(0, 6);
        buckets[key] = key === "places" ? relevantPlaces(prompt, rows) : rows;
      } catch {
        // The client already recorded the failed call. Other domains can still compile.
      }
    }),
  );

  const rescued = await rescuePlaces(client, prompt, buckets.places);
  buckets.places = rescued.places.filter((place) => !entityIds.includes(place.id));

  const anyEntities =
    seeds.length + buckets.artists.length + buckets.places.length + buckets.brands.length + buckets.books.length + buckets.movies.length;
  if (!anyEntities) {
    if (client.mode === "mock") return { graph: syntheticGraph(prompt), steps };
    throw new NoTasteMatch("Qloo accepted the signals but returned no entities to build a room from.");
  }

  const seedNames = seeds.map((seed) => seed.name).join(", ") || "the tag signals";
  const insightRows: { why: string; detail: string; result: string }[] = [
    { why: `Which artists sit next to ${seedNames}.`, detail: "filter.type=urn:entity:artist", result: buckets.artists.map((row) => row.name).slice(0, 4).join(", ") },
    { why: `Which places sit next to ${seedNames}.`, detail: "filter.type=urn:entity:place", result: buckets.places.map((row) => row.name).slice(0, 4).join(", ") },
    { why: `Which brands sit next to ${seedNames}.`, detail: "filter.type=urn:entity:brand", result: buckets.brands.map((row) => row.name).slice(0, 4).join(", ") },
    { why: `Which books sit next to ${seedNames}.`, detail: "filter.type=urn:entity:book", result: buckets.books.map((row) => row.name).slice(0, 4).join(", ") },
    { why: `Which movies sit next to ${seedNames}.`, detail: "filter.type=urn:entity:movie", result: buckets.movies.map((row) => row.name).slice(0, 4).join(", ") },
    { why: "Which tags come back with the same signals, so affinities can land on the tag ids.", detail: "filter.type=urn:tag", result: tags.map((tag) => tag.name).slice(0, 6).join(", ") },
  ];
  for (const row of insightRows) {
    steps.push({
      why: `${row.why} This is the cross-domain step a plain model cannot take.`,
      call: "GET /v2/insights",
      detail: row.detail,
      result: row.result || "no rows",
    });
  }
  if (rescued.note) {
    steps.push({
      why: rescued.note,
      call: "GET /search",
      detail: "types=urn:entity:place",
      result: buckets.places.map((place) => place.name).join(", ") || "no place",
    });
  }

  return {
    graph: {
      source: client.mode === "mock" ? "mock" : "qloo",
      synthetic: false,
      seeds,
      ...buckets,
      tags,
      signalEntityIds: entityIds,
      signalTagIds: tagIds,
      scene: sceneFromPrompt(prompt),
    },
    steps,
  };
}

function tagFits(query: string, tag: TasteTag): boolean {
  return tagAccepts(query, tag.name);
}

function tagFitsPrompt(prompt: string, tag: TasteTag): boolean {
  const promptTokens = new Set(tokens(prompt));
  return tokens(tag.name).some((token) => promptTokens.has(token));
}

function uniqueTagNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

function toView(entity: TasteEntity): EntityView {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    description: entity.description,
    imageUrl: entity.imageUrl,
    popularity: entity.popularity,
    affinity: entity.affinity,
    tags: uniqueTagNames(entity.tags.map((tag) => tag.name)),
    explainers: entity.explainers,
    mock: entity.mock,
  };
}

function syntheticGraph(prompt: string): TasteGraph {
  const words = tokens(prompt).filter((token) => token.length > 3).slice(0, 4);
  const motif = words.length ? words.map(titleWord).join(" ") : prompt.trim().slice(0, 32) || "Untitled motif";
  const seedId = `mock:motif:${hashString(prompt).toString(16)}`;
  const motifTags = (words.length ? words : [motif]).map((word) => ({
    id: words.length ? `mock:tag:${word}` : `mock:tag:${hashString(word).toString(16)}`,
    name: words.length ? titleWord(word) : word,
    type: "urn:tag:keyword",
  }));
  const seed = syntheticEntity(seedId, motif, "urn:entity:movie", motifTags, null, []);
  const explainers = [{ id: seedId, name: motif, score: 0.4 }];
  return {
    source: "mock",
    synthetic: true,
    seeds: [seed],
    artists: [syntheticEntity(`${seedId}:artist`, `${motif} Ensemble`, "urn:entity:artist", motifTags, 0.42, explainers)],
    places: [
      syntheticEntity(
        `${seedId}:place`,
        `${words[0] ? titleWord(words[0]) : "After"} Room`,
        "urn:entity:place",
        motifTags,
        0.4,
        explainers,
      ),
    ],
    brands: [syntheticEntity(`${seedId}:brand`, `${motif} Supply`, "urn:entity:brand", motifTags, 0.36, explainers)],
    books: [],
    movies: [],
    tags: motifTags,
    signalEntityIds: [seedId],
    signalTagIds: motifTags.map((tag) => tag.id),
    scene: sceneFromPrompt(prompt),
  };
}

function syntheticEntity(
  id: string,
  name: string,
  type: string,
  tags: TasteTag[],
  affinity: number | null,
  explainers: TasteEntity["explainers"],
): TasteEntity {
  return {
    id,
    name,
    type,
    description: "Synthetic mock entity built from the prompt because no fixture matched. Not a Qloo record.",
    imageUrl: null,
    popularity: 0.2,
    affinity,
    tags,
    explainers,
    mock: true,
  };
}

function titleWord(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
