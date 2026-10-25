import { FIXTURE_TAGS, FIXTURES, type Fixture } from "@/lib/qloo/fixtures";
import type {
  InsightTarget,
  QlooTraceCall,
  TasteClient,
  TasteEntity,
  TasteTag,
} from "@/lib/qloo/types";
import { tokens } from "@/lib/agent/queries";

const NOTE = "Synthetic fixture standing in for a Qloo entity. Not a live taste-graph record.";

function overlap(query: string, alias: string): number {
  const q = query.toLowerCase().trim();
  const a = alias.toLowerCase().trim();
  if (!q || !a) return 0;
  if (q === a) return 1;
  if (q.includes(a) || a.includes(q)) return 0.88;
  const qt = tokens(q);
  const at = tokens(a);
  if (!qt.length || !at.length) return 0;
  const shared = qt.filter((token) => at.includes(token)).length;
  return shared / Math.max(qt.length, at.length);
}

function toEntity(fixture: Fixture, extra: Partial<TasteEntity> = {}): TasteEntity {
  return {
    id: fixture.id,
    name: fixture.name,
    type: fixture.type,
    description: fixture.description || NOTE,
    imageUrl: null,
    popularity: fixture.popularity,
    affinity: extra.affinity ?? null,
    tags: fixture.tags.map((tag) => ({ ...tag })),
    explainers: extra.explainers ?? [],
    mock: true,
    matchScore: extra.matchScore,
  };
}

/**
 * Same call shape as the live client, served from local fixtures.
 * Every trace row is marked `mocked: true`.
 */
export class MockTasteClient implements TasteClient {
  readonly mode = "mock" as const;
  readonly trace: QlooTraceCall[] = [];

  async search(query: string, take = 8, types?: string): Promise<TasteEntity[]> {
    const allowed = types?.split(",").filter(Boolean);
    const ranked = FIXTURES.map((fixture) => {
      const score = Math.max(...fixture.aliases.map((alias) => overlap(query, alias)), overlap(query, fixture.name));
      return { fixture, score };
    })
      .filter((row) => row.score >= 0.45 && (!allowed?.length || allowed.includes(row.fixture.type)))
      .sort((a, b) => b.score - a.score || a.fixture.id.localeCompare(b.fixture.id))
      .slice(0, take);

    const queryParams: Record<string, string> = { query, take: String(take) };
    if (types) queryParams.types = types;
    this.trace.push({
      method: "GET",
      path: "/search",
      query: queryParams,
      status: ranked.length ? 200 : 404,
      resultCount: ranked.length,
      mocked: true,
    });

    return ranked.map(({ fixture, score }) => toEntity(fixture, { matchScore: score }));
  }

  async searchTags(query: string, take = 5): Promise<TasteTag[]> {
    const q = query.toLowerCase().trim();
    const tags = FIXTURE_TAGS.filter((tag) => tag.aliases.some((alias) => alias === q || alias.includes(q) || q.includes(alias)))
      .slice(0, take)
      .map((tag) => ({ id: tag.id, name: tag.name, type: tag.type, affinity: null }));

    this.trace.push({
      method: "GET",
      path: "/v2/tags",
      query: { "filter.query": query, take: String(take), "feature.typo_tolerance": "false" },
      status: tags.length ? 200 : 404,
      resultCount: tags.length,
      mocked: true,
    });
    return tags;
  }

  async insights(args: {
    filterType: InsightTarget;
    entityIds: string[];
    tagIds: string[];
    take?: number;
  }): Promise<{ entities: TasteEntity[]; tags: TasteTag[] }> {
    const take = args.take ?? 6;
    const query: Record<string, string> = {
      "filter.type": args.filterType,
      take: String(take),
      "feature.explainability": "true",
    };
    if (args.entityIds.length) query["signal.interests.entities"] = args.entityIds.join(",");
    if (args.tagIds.length) query["signal.interests.tags"] = args.tagIds.join(",");

    if (!args.entityIds.length && !args.tagIds.length) {
      this.trace.push({
        method: "GET",
        path: "/v2/insights",
        query,
        status: 400,
        resultCount: 0,
        mocked: true,
        error: "at least one valid signal or filter is required",
      });
      return { entities: [], tags: [] };
    }

    const names = new Map(FIXTURES.map((fixture) => [fixture.id, fixture.name]));
    const scored = FIXTURES.map((fixture) => {
      const explainers: TasteEntity["explainers"] = [];
      let score = 0;
      for (const id of args.entityIds) {
        const affinity = fixture.affinityTo[id] ?? 0;
        if (affinity > 0) {
          explainers.push({ id, name: names.get(id) ?? id, score: affinity });
          score = Math.max(score, affinity);
        }
      }
      const tagHits = fixture.tags.filter((tag) => args.tagIds.includes(tag.id));
      if (tagHits.length) {
        const tagScore = Math.min(0.8, 0.62 + (tagHits.length - 1) * 0.04);
        score = Math.max(score, tagScore);
        for (const tag of tagHits) explainers.push({ id: tag.id, name: tag.name, score: tagScore });
      }
      return { fixture, score, explainers };
    })
      .filter((row) => row.score > 0 && !args.entityIds.includes(row.fixture.id))
      .sort((a, b) => b.score - a.score || a.fixture.id.localeCompare(b.fixture.id));

    if (args.filterType === "urn:tag") {
      const tags = new Map<string, TasteTag>();
      for (const row of scored) {
        for (const tag of row.fixture.tags) {
          const current = tags.get(tag.id);
          if (!current || (current.affinity ?? 0) < row.score) {
            tags.set(tag.id, { ...tag, affinity: row.score });
          }
        }
      }
      const list = [...tags.values()].sort((a, b) => (b.affinity ?? 0) - (a.affinity ?? 0) || a.id.localeCompare(b.id)).slice(0, take);
      this.trace.push({
        method: "GET",
        path: "/v2/insights",
        query,
        status: 200,
        resultCount: list.length,
        mocked: true,
      });
      return { entities: [], tags: list };
    }

    const entities = scored
      .filter((row) => row.fixture.type === args.filterType)
      .slice(0, take)
      .map((row) =>
        toEntity(row.fixture, {
          affinity: row.score,
          explainers: row.explainers.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)),
        }),
      );

    this.trace.push({
      method: "GET",
      path: "/v2/insights",
      query,
      status: 200,
      resultCount: entities.length,
      mocked: true,
    });
    return { entities, tags: [] };
  }
}
