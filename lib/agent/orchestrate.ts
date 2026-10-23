import { compileAtmosphere } from "@/lib/atmosphere/compile";
import type { Atmosphere } from "@/lib/atmosphere/schema";
import { readConfig, type AppConfig, type DispatchMode } from "@/lib/config";
import { NoTasteMatch, PromptError } from "@/lib/agent/errors";
import { extractQueries, nameScore, tagQueriesFor, tokens } from "@/lib/agent/queries";
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
  options?: { client?: TasteClient; env?: Record<string, string | undefined>; allowLlm?: boolean },
): Promise<CompileResult> {
  const cleaned = prompt.replace(/[\u0000-\u001F\u007F]/g, " ").trim().replace(/\s+/g, " ");
  if (cleaned.length < 3) throw new PromptError("Give the room a cultural prompt of at least a few words.");
  if (cleaned.length > 400) throw new PromptError("Keep the prompt under 400 characters.");

  const env = options?.env ?? process.env;
  const config = readConfig(env);
  const secrets = secretValues(config);
  const client = options?.client ?? (await import("@/lib/qloo")).createTasteClient(env);

  let agent: CompileResult["agent"] = {
    kind: "deterministic",
    provider: null,
    model: null,
    fallback: null,
  };

  let graph: TasteGraph | null = null;
  if (options?.allowLlm !== false && config.llm) {
    try {
      const { compileWithModel } = await import("@/lib/agent/llm");
      const modeled = await compileWithModel({ prompt: cleaned, client, llm: config.llm });
      if (modeled) {
        graph = modeled;
        agent = { kind: "llm", provider: config.llm.provider, model: config.llm.modelId, fallback: null };
      }
    } catch (error) {
      agent.fallback = redactSecrets(error instanceof Error ? error.message : "The model path failed.", secrets);
    }
  }

  if (!graph) {
    graph = await gatherGraph(client, cleaned);
    if (agent.kind === "llm") {
      agent = {
        kind: "deterministic",
        provider: config.llm?.provider ?? null,
        model: config.llm?.modelId ?? null,
        fallback: agent.fallback ?? "The model did not produce a compilable taste graph.",
      };
    }
  }

  const atmosphere = compileAtmosphere(cleaned, graph);
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
    trace: client.trace.map((call) => ({
      ...call,
      error: call.error ? redactSecrets(call.error, secrets) : undefined,
    })),
    agent,
    dispatchPlan: {
      mode: config.dispatch.mode,
      auto: config.dispatch.auto && config.dispatch.configured,
      configured: config.dispatch.configured,
    },
    warnings: liveWarnings(client, graph),
  };
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

export async function gatherGraph(client: TasteClient, prompt: string): Promise<TasteGraph> {
  const queries = extractQueries(prompt);
  const seedMap = new Map<string, { entity: TasteEntity; score: number }>();

  for (const query of queries) {
    const hits = await client.search(query, 8);
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
  for (const query of tagQueries) {
    let found: TasteTag[] = [];
    try {
      found = await client.searchTags(query, 5);
    } catch {
      continue;
    }
    for (const tag of found) {
      if (!tagFits(query, tag)) continue;
      if (tags.some((existing) => existing.id === tag.id)) continue;
      tags.push(tag);
      if (tags.length >= 6) break;
    }
    if (tags.length >= 6) break;
  }

  if (!seeds.length && !tags.length) {
    if (client.mode === "mock") return syntheticGraph(prompt);
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
        const result = await client.insights({ filterType, entityIds, tagIds, take: 6 });
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
        buckets[key] = result.entities.filter((entity) => !entityIds.includes(entity.id)).slice(0, 6);
      } catch {
        // The client already recorded the failed call. Other domains can still compile.
      }
    }),
  );

  const anyEntities =
    seeds.length + buckets.artists.length + buckets.places.length + buckets.brands.length + buckets.books.length + buckets.movies.length;
  if (!anyEntities) {
    if (client.mode === "mock") return syntheticGraph(prompt);
    throw new NoTasteMatch("Qloo accepted the signals but returned no entities to build a room from.");
  }

  return {
    source: client.mode === "mock" ? "mock" : "qloo",
    synthetic: false,
    seeds,
    ...buckets,
    tags,
    signalEntityIds: entityIds,
    signalTagIds: tagIds,
  };
}

function tagFits(query: string, tag: TasteTag): boolean {
  const q = query.toLowerCase();
  const name = tag.name.toLowerCase();
  if (name === q || name.includes(q) || (name.length >= 4 && q.includes(name))) return true;
  return tokens(name).some((token) => token === q || (token.length >= 4 && q.includes(token)));
}

function tagFitsPrompt(prompt: string, tag: TasteTag): boolean {
  const promptTokens = new Set(tokens(prompt));
  return tokens(tag.name).some((token) => promptTokens.has(token));
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
    tags: entity.tags.map((tag) => tag.name),
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
