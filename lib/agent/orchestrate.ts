import { compareRooms, stereotypeBaseline, type Comparison, type PlainRoom } from "@/lib/atmosphere/baseline";
import { compileAtmosphere } from "@/lib/atmosphere/compile";
import type { Atmosphere } from "@/lib/atmosphere/schema";
import { readConfig, type AppConfig, type DispatchMode } from "@/lib/config";
import { NoTasteMatch, PromptError } from "@/lib/agent/errors";
import { extractQueries, nameScore, tagQueriesFor, tokens } from "@/lib/agent/queries";
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
  const baselinePromise =
    options?.allowLlm !== false && config.llm
      ? import("@/lib/agent/baseline-model").then((mod) => mod.modelBaseline(cleaned, config.llm!))
      : Promise.resolve(stereotypeBaseline(cleaned));

  let agent: CompileResult["agent"] = {
    kind: "deterministic",
    provider: null,
    model: null,
    fallback: null,
  };

  let graph: TasteGraph | null = null;
  let steps: AgentStep[] = [];
  if (options?.allowLlm !== false && config.llm) {
    try {
      const { compileWithModel } = await import("@/lib/agent/llm");
      const modeled = await compileWithModel({ prompt: cleaned, client, llm: config.llm });
      steps = modeled.steps;
      if (modeled.graph) {
        graph = modeled.graph;
        agent = { kind: "llm", provider: config.llm.provider, model: config.llm.modelId, fallback: null };
      }
    } catch (error) {
      agent.fallback = redactSecrets(error instanceof Error ? error.message : "The model path failed.", secrets);
    }
  }

  if (!graph) {
    const gathered = await gatherGraph(client, cleaned);
    graph = gathered.graph;
    steps = steps.length ? [...steps, ...gathered.steps] : gathered.steps;
    if (config.llm && options?.allowLlm !== false) {
      agent = {
        kind: "deterministic",
        provider: config.llm.provider,
        model: config.llm.modelId,
        fallback: agent.fallback ?? "The model did not produce a compilable taste graph.",
      };
    }
  }

  const atmosphere = compileAtmosphere(cleaned, graph);
  const baseline = await baselinePromise;
  const comparison = compareRooms(cleaned, atmosphere, baseline);
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
    steps,
    baseline,
    comparison,
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

export async function gatherGraph(client: TasteClient, prompt: string): Promise<{ graph: TasteGraph; steps: AgentStep[] }> {
  const steps: AgentStep[] = [];
  const queries = extractQueries(prompt);
  const seedMap = new Map<string, { entity: TasteEntity; score: number }>();

  for (const query of queries) {
    const hits = await client.search(query, 8);
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
  for (const query of tagQueries) {
    let found: TasteTag[] = [];
    try {
      found = await client.searchTags(query, 5);
    } catch {
      continue;
    }
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

  return {
    graph: {
      source: client.mode === "mock" ? "mock" : "qloo",
      synthetic: false,
      seeds,
      ...buckets,
      tags,
      signalEntityIds: entityIds,
      signalTagIds: tagIds,
    },
    steps,
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
