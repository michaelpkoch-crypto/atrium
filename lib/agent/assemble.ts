import type { AgentStep } from "@/lib/agent/steps";
import {
  confirmsName,
  dedupeByName,
  humanizeTagName,
  offVibe,
  placeFits,
  tagAllowed,
  type PersonKind,
  type Proposal,
  type WorkKind,
} from "@/lib/agent/propose";
import { keepInsightRows } from "@/lib/agent/rank";
import type { InsightTarget, TasteClient, TasteEntity, TasteGraph, TasteTag } from "@/lib/qloo/types";

const WORK_TYPE: Record<WorkKind, string> = {
  movie: "urn:entity:movie",
  tv: "urn:entity:tv_show",
  book: "urn:entity:book",
};

const PERSON_TYPE: Record<PersonKind, string> = {
  person: "urn:entity:person",
  artist: "urn:entity:artist",
};

/**
 * Search the names in a proposal, drop anything that is not that name,
 * then ask insights. Place insights are limited to the place categories.
 */
export async function assembleGraph(
  client: TasteClient,
  prompt: string,
  proposal: Proposal,
  steps: AgentStep[],
): Promise<TasteGraph | null> {
  const found = await confirmAll(client, prompt, proposal, steps);
  if (!found.seeds.length && !found.tags.length && !found.places.length) return null;

  const entityIds = found.seeds.map((seed) => seed.id);
  const tagIds = found.tags.map((tag) => tag.id);
  const placeTagIds = found.placeTags.map((tag) => tag.id);
  const buckets = emptyBuckets();

  const targets: InsightTarget[] = ["urn:entity:artist", "urn:entity:place", "urn:entity:brand", "urn:entity:book", "urn:entity:movie"];
  await Promise.all(
    targets.map(async (filterType) => {
      try {
        const result = await client.insights({
          filterType,
          entityIds,
          tagIds,
          filterTagIds: filterType === "urn:entity:place" ? placeTagIds : undefined,
          location: filterType === "urn:entity:place" ? proposal.city : undefined,
          take: 6,
          timeoutMs: 6500,
        });
        const key = keyFor(filterType);
        buckets[key] = result.entities.filter((entity) => !entityIds.includes(entity.id) && !offVibe(entity, proposal));
      } catch {
        // The client recorded the failure. A place search from the proposal fills an empty venue list.
      }
    }),
  );

  for (const key of Object.keys(buckets) as (keyof typeof buckets)[]) {
    buckets[key] = keepInsightRows(buckets[key]);
  }

  const insightPlaces = buckets.places.filter((place) => placeFits(place, proposal, prompt));
  const places = dedupeByName(insightPlaces.length ? insightPlaces : found.places).slice(0, 4);
  buckets.places = places;
  if (!insightPlaces.length && places.length) {
    steps.push({
      why: "Place insights returned nothing, so the room uses the category search instead of leaving the counter empty.",
      call: "GET /search",
      detail: `types=urn:entity:place; ${proposal.placeQueries.join(", ") || proposal.placeTags.join(", ")}`,
      result: places.map((place) => place.name).join(", "),
    });
  }
  buckets.artists = mergeAffinity([...found.artists, ...buckets.artists.filter((artist) => !offVibe(artist, proposal))]);
  buckets.movies = mergeAffinity([...found.movies, ...buckets.movies]);
  buckets.books = mergeAffinity([...found.books, ...buckets.books]);

  const seedNames = found.seeds.map((seed) => seed.name).join(", ") || "the tag signals";
  for (const row of [
    ["artists", "urn:entity:artist"],
    ["places", "urn:entity:place"],
    ["brands", "urn:entity:brand"],
    ["books", "urn:entity:book"],
    ["movies", "urn:entity:movie"],
  ] as const) {
    const [key, filterType] = row;
    steps.push({
      why:
        key === "places"
          ? `Which places sit next to ${seedNames}. Place results are limited to ${proposal.placeTags.join(", ") || "the place categories"}${proposal.city ? ` in ${proposal.city}` : ""}.`
          : `Which ${key} sit next to ${seedNames}.`,
      call: "GET /v2/insights",
      detail:
        key === "places"
          ? `filter.type=${filterType}; filter.tags; signal.interests.entities${proposal.city ? "; filter.location.query" : ""}`
          : `filter.type=${filterType}; signal.interests.entities; signal.interests.tags`,
      result: buckets[key].map((entity) => entity.name).slice(0, 4).join(", ") || "no rows",
    });
  }

  if (!found.seeds.length && !buckets.artists.length && !places.length && !buckets.books.length && !buckets.movies.length) {
    return null;
  }

  return {
    source: client.mode === "mock" ? "mock" : "qloo",
    synthetic: false,
    seeds: found.seeds,
    ...buckets,
    tags: found.tags,
    signalEntityIds: entityIds,
    signalTagIds: tagIds,
  };
}

async function confirmAll(client: TasteClient, prompt: string, proposal: Proposal, steps: AgentStep[]) {
  const seeds: TasteEntity[] = [];
  const artists: TasteEntity[] = [];
  const movies: TasteEntity[] = [];
  const books: TasteEntity[] = [];
  const rejected: string[] = [];

  const tagQueries = unique([...proposal.placeTags, ...proposal.moodTags]).slice(0, 6);
  const [workHits, personHits, placeBatches, tagRows] = await Promise.all([
    Promise.all(proposal.works.map(async (work) => ({ work, hits: await searchBoth(client, work.name, WORK_TYPE[work.kind]) }))),
    Promise.all(proposal.people.map(async (person) => ({ person, hits: await searchBoth(client, person.name, PERSON_TYPE[person.kind]) }))),
    Promise.all(proposal.placeQueries.map(async (query) => ({ query, hits: await searchSafe(client, query, "urn:entity:place") }))),
    Promise.all(
      tagQueries.map(async (query) => {
        try {
          const found = await client.searchTags(query, 4);
          return found.map((tag) => ({ tag, query }));
        } catch {
          return [];
        }
      }),
    ).then((rows) => rows.flat()),
  ]);
  for (const { work, hits } of workHits) {
    const hit = hits.find((entity) => confirmsName(work.name, entity.name) && typeFits(entity.type, work.kind));
    const missed = hits.map((entity) => entity.name).filter((name) => !confirmsName(work.name, name));
    rejected.push(...missed);
    if (!hit) {
      steps.push({
        why: `Look up “${work.name}” as a ${work.kind}. A hit is kept only when it is that name.`,
        call: "GET /search",
        detail: `query=${work.name}&types=${WORK_TYPE[work.kind]}`,
        result: "no entity kept",
      });
      continue;
    }
    pushUnique(seeds, hit);
    if (work.kind === "movie" || work.kind === "tv") pushUnique(movies, hit);
    if (work.kind === "book") pushUnique(books, hit);
    steps.push({
      why: `“${work.name}” is the work the prompt means. Search hits that are a different name were dropped.`,
      call: "GET /search",
      detail: `query=${work.name}&types=${WORK_TYPE[work.kind]}`,
      result: hit.name,
    });
  }

  for (const { person, hits } of personHits) {
    const hit = hits.find((entity) => confirmsName(person.name, entity.name) && typeFits(entity.type, person.kind));
    if (!hit) continue;
    pushUnique(seeds, hit);
    if (person.kind === "artist" || hit.type.includes("artist")) pushUnique(artists, hit);
    steps.push({
      why: `Confirm “${person.name}” on the taste graph before asking what sits next to the works.`,
      call: "GET /search",
      detail: `query=${person.name}&types=${PERSON_TYPE[person.kind]}`,
      result: hit.name,
    });
  }

  const placeHits = placeBatches.flatMap((row) => row.hits.map((hit) => ({ query: row.query, hit })));
  const places = dedupeByName(
    placeHits
      .map((row) => row.hit)
      .filter((place) => place.type.includes("place") && placeFits(place, proposal, prompt)),
  ).slice(0, 3);
  if (proposal.placeQueries.length) {
    steps.push({
      why: "Search the place kind the prompt means. A venue whose name is only a word from the prompt is not a venue.",
      call: "GET /search",
      detail: `types=urn:entity:place`,
      result: places.map((place) => place.name).join(", ") || "no place kept",
    });
  }

  const tags: TasteTag[] = [];
  const droppedTags: string[] = [];
  for (const row of tagRows) {
    const name = humanizeTagName(row.tag.name);
    if (!tagAllowed(row.tag.name, proposal)) {
      droppedTags.push(name);
      continue;
    }
    if (tags.some((tag) => tag.id === row.tag.id)) continue;
    tags.push({ ...row.tag, name });
    if (tags.length >= 5) break;
  }
  steps.push({
    why: `Keep tags that are the moods ${proposal.moodTags.join(", ") || "named for this prompt"}. Other tag hits are a different vibe.`,
    call: "GET /v2/tags",
    detail: tagQueries.join(", "),
    result: tags.map((tag) => tag.name).join(", ") || "no tag",
  });
  if (droppedTags.length) {
    steps.push({
      why: "These tag hits are not the mood of the prompt.",
      call: "reject_tags",
      detail: proposal.rejectTags.slice(0, 4).join(", ") || "mood filter",
      result: unique(droppedTags).slice(0, 8).join(", "),
    });
  }
  if (rejected.length) {
    steps.push({
      why: "These search hits were a different name from the one we asked for.",
      call: "reject_entities",
      detail: "name match",
      result: unique(rejected).slice(0, 6).join(", "),
    });
  }

  const placeTags = tagRows
    .filter((row) => proposal.placeTags.some((tag) => tag.toLowerCase() === row.query.toLowerCase()))
    .map((row) => row.tag)
    .filter((tag, index, list) => list.findIndex((item) => item.id === tag.id) === index);

  return { seeds: seeds.slice(0, 4), artists, movies, books, places, tags, placeTags };
}

async function searchBoth(client: TasteClient, query: string, types: string): Promise<TasteEntity[]> {
  const [typed, open] = await Promise.all([searchSafe(client, query, types), searchSafe(client, query)]);
  const map = new Map<string, TasteEntity>();
  for (const hit of [...typed, ...open]) if (!map.has(hit.id)) map.set(hit.id, hit);
  return [...map.values()];
}

async function searchSafe(client: TasteClient, query: string, types?: string): Promise<TasteEntity[]> {
  try {
    return await client.search(query, 4, types);
  } catch {
    return [];
  }
}

function typeFits(entityType: string, kind: WorkKind | PersonKind): boolean {
  const type = entityType.toLowerCase();
  if (kind === "movie") return type.includes("movie");
  if (kind === "tv") return type.includes("tv");
  if (kind === "book") return type.includes("book");
  if (kind === "artist") return type.includes("artist") || type.includes("person");
  return type.includes("person") || type.includes("author") || type.includes("director") || type.includes("artist");
}

function pushUnique(list: TasteEntity[], entity: TasteEntity) {
  if (!list.some((item) => item.id === entity.id)) list.push(entity);
}

function mergeAffinity(entities: TasteEntity[]): TasteEntity[] {
  const map = new Map<string, TasteEntity>();
  for (const entity of entities) {
    const current = map.get(entity.id);
    if (!current || (current.affinity == null && entity.affinity != null)) map.set(entity.id, entity);
  }
  return [...map.values()];
}

function emptyBuckets() {
  return {
    artists: [] as TasteEntity[],
    places: [] as TasteEntity[],
    brands: [] as TasteEntity[],
    books: [] as TasteEntity[],
    movies: [] as TasteEntity[],
  };
}

function keyFor(filterType: InsightTarget): "artists" | "places" | "brands" | "books" | "movies" {
  if (filterType === "urn:entity:artist") return "artists";
  if (filterType === "urn:entity:place") return "places";
  if (filterType === "urn:entity:brand") return "brands";
  if (filterType === "urn:entity:book") return "books";
  return "movies";
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    if (value && !out.some((item) => item.toLowerCase() === value.toLowerCase())) out.push(value);
  }
  return out;
}
