import { humanizeTagName, type Proposal } from "@/lib/agent/propose";
import { nameScore, placeQueries, tagAccepts, tokens } from "@/lib/agent/queries";
import type { TasteClient, TasteEntity, TasteTag } from "@/lib/qloo/types";

export type SeedCandidate = {
  entity: TasteEntity;
  score: number;
  query: string;
  typed: "movie" | "place" | "open";
};

export function chooseSeeds(candidates: SeedCandidate[], modelIds: string[]): { seeds: TasteEntity[]; notes: string[] } {
  const byId = new Map(candidates.map((candidate) => [candidate.entity.id, candidate]));
  const notes: string[] = [];
  let selected = modelIds.map((id) => byId.get(id)).filter((candidate): candidate is SeedCandidate => Boolean(candidate));
  const unknown = modelIds.filter((id) => !byId.has(id));
  if (unknown.length) notes.push(`Ignored ${unknown.length} id${unknown.length === 1 ? "" : "s"} that were not in the search results.`);

  if (!selected.length) {
    selected = deterministicSeeds(candidates);
    if (modelIds.length) notes.push("None of the model's ids were in the search results, so the closest names were kept.");
  }

  const dropped: string[] = [];
  const added: SeedCandidate[] = [];
  for (const query of new Set(selected.map((candidate) => candidate.query))) {
    const credits = selected.filter((candidate) => candidate.query === query && isCredit(candidate.entity.type) && candidate.score >= 0.8);
    if (!credits.length) continue;
    const movies = candidates
      .filter((candidate) => candidate.query === query && candidate.typed === "movie" && isWork(candidate.entity.type))
      .sort((a, b) => b.score - a.score || (b.entity.popularity ?? 0) - (a.entity.popularity ?? 0) || a.entity.name.localeCompare(b.entity.name));
    if (!movies.length) continue;
    for (const credit of credits) {
      selected = selected.filter((candidate) => candidate.entity.id !== credit.entity.id);
      dropped.push(`${credit.entity.name} (${shortType(credit.entity.type)})`);
    }
    if (!selected.some((candidate) => candidate.entity.id === movies[0].entity.id)) added.push(movies[0]);
  }

  const merged = dedupe([...added, ...selected]).slice(0, 3);
  if (dropped.length) {
    notes.push(`Dropped ${dropped.join(", ")}: a film or show was in the typed movie search for that same name.`);
  }
  if (added.length) notes.push(`Kept ${added.map((candidate) => candidate.entity.name).join(", ")} from the movie search.`);
  return { seeds: merged.map((candidate) => candidate.entity), notes };
}

export function chooseTags(
  found: { tag: TasteTag; query: string }[],
  modelIds: string[],
): { tags: TasteTag[]; rejected: { name: string; why: string }[] } {
  const rejected: { name: string; why: string }[] = [];
  const unique: { tag: TasteTag; query: string }[] = [];
  for (const row of found) {
    if (!tagAccepts(row.query, row.tag.name)) {
      rejected.push({
        name: row.tag.name,
        why: `“${row.tag.name}” does not match “${row.query}”. Phonetic neighbors are not the word in the prompt.`,
      });
      continue;
    }
    if (unique.some((item) => item.tag.id === row.tag.id)) continue;
    unique.push(row);
  }

  if (!modelIds.length) return { tags: unique.slice(0, 4).map((row) => row.tag), rejected };

  const picked = unique.filter((row) => modelIds.includes(row.tag.id));
  for (const id of modelIds) {
    const row = found.find((item) => item.tag.id === id);
    if (!row) continue;
    if (!tagAccepts(row.query, row.tag.name)) {
      rejected.push({
        name: row.tag.name,
        why: `The model asked for “${row.tag.name}” on the query “${row.query}”. That match was rejected.`,
      });
    }
  }
  for (const row of unique) {
    if (modelIds.includes(row.tag.id)) continue;
    rejected.push({ name: row.tag.name, why: "The model left this tag out." });
  }
  return { tags: picked.slice(0, 4).map((row) => row.tag), rejected };
}

/**
 * When the prompt names a place, drop insight rows that share none of those words.
 * Arc de Triomphe does not survive a "jazz bar" prompt. An empty list tells the caller to search again.
 */
export function relevantPlaces(prompt: string, places: TasteEntity[]): TasteEntity[] {
  const queries = placeQueries(prompt);
  if (!queries.length || !places.length) return places;
  const needles = [...new Set(queries.flatMap((query) => tokens(query)).filter((token) => token.length >= 3))];
  if (!needles.length) return places;
  return places.filter((place) => {
    if (queries.some((query) => nameScore(query, place.name) >= 0.34)) return true;
    const blob = tokens(`${place.name} ${place.tags.map((tag) => tag.name).join(" ")}`);
    return needles.some((token) => blob.includes(token));
  });
}

/** Time, place, and generic music words are not a shared genre. Classical, jazz, and piano are. */
const NOT_SHARED = new Set([
  "music",
  "musician",
  "artist",
  "song",
  "songs",
  "album",
  "band",
  "soundtrack",
  "score",
  "film",
  "movie",
  "cinema",
  "composer",
  "orchestra",
  "pop",
  "rock",
  "singer",
  "vocal",
  "vocals",
  "instrumental",
  "theme",
  "english",
  "american",
  "turkish",
  "japan",
  "japanese",
  "french",
  "british",
  "italian",
  "night",
  "day",
  "dusk",
  "rain",
  "live",
  "male",
  "female",
  "vinyl",
  "novel",
  "indie",
]);

/**
 * Seed artists stay. A neighbor stays only with an exact genre or mood token in common
 * (jazz, piano, ambient, classical, symmetry). A shorter list is better than Turkish pop
 * after Bill Evans. Bridgerton still keeps its two audience crossovers.
 */
export function rankInsightArtists(artists: TasteEntity[], seeds: TasteEntity[], proposal: Proposal, prompt: string): TasteEntity[] {
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const wanted = new Set([...seeds.flatMap(sharedTokens), ...proposal.moodTags.flatMap((tag) => sharedTokensFrom(tag))]);
  const anchored = artists.filter((artist) => seedIds.has(artist.id));
  const scored = artists
    .filter((artist) => !seedIds.has(artist.id))
    .map((artist) => {
      const overlap = sharedTokens(artist).filter((token) => wanted.has(token)).length;
      return { artist, overlap, affinity: artist.affinity ?? 0 };
    });
  const aligned = scored
    .filter((row) => row.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || b.affinity - a.affinity || a.artist.name.localeCompare(b.artist.name));
  const surprises = scored
    .filter((row) => row.overlap === 0 && row.affinity >= 0.84)
    .sort((a, b) => b.affinity - a.affinity || a.artist.name.localeCompare(b.artist.name));
  const audience = /bridgerton/i.test(prompt) && surprises.length >= 2 ? surprises.slice(0, 2) : [];
  const picked: TasteEntity[] = [];
  for (const artist of [...anchored, ...aligned.map((row) => row.artist), ...audience.map((row) => row.artist)]) {
    if (picked.some((item) => item.id === artist.id)) continue;
    picked.push(artist);
    if (picked.length >= 4) break;
  }
  return picked;
}

function sharedTokens(entity: TasteEntity): string[] {
  return entity.tags.flatMap((tag) => sharedTokensFrom(tag.name));
}

function sharedTokensFrom(name: string): string[] {
  const out: string[] = [];
  for (const token of tokens(humanizeTagName(name))) {
    if (token.length <= 3 || NOT_SHARED.has(token)) continue;
    out.push(token);
  }
  return out;
}

export function keepInsightRows(entities: TasteEntity[]): TasteEntity[] {
  const strong = entities.some((entity) => (entity.affinity ?? 0) >= 0.55);
  if (!strong) return entities.slice(0, 6);
  return entities.filter((entity) => entity.affinity == null || entity.affinity >= 0.25).slice(0, 6);
}

export async function rescuePlaces(
  client: TasteClient,
  prompt: string,
  places: TasteEntity[],
): Promise<{ places: TasteEntity[]; note: string | null }> {
  if (places.length) return { places, note: null };
  const queries = placeQueries(prompt);
  if (!queries.length) return { places, note: null };
  const batches = await Promise.all(
    queries.map(async (query) => {
      try {
        return await client.search(query, 5, "urn:entity:place");
      } catch {
        return [];
      }
    }),
  );
  const ranked = batches
    .flat()
    .filter((entity) => entity.type.includes("place"))
    .map((entity) => ({
      entity,
      score: Math.max(entity.matchScore ?? 0, ...queries.map((query) => nameScore(query, entity.name))),
    }))
    .filter((row) => row.score >= 0.34)
    .sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
  const unique: TasteEntity[] = [];
  for (const row of ranked) {
    if (unique.some((item) => item.id === row.entity.id)) continue;
    unique.push(row.entity);
    if (unique.length >= 2) break;
  }
  if (!unique.length) return { places, note: null };
  return {
    places: unique,
    note: `Insights returned no place, so a place search kept ${unique.map((place) => place.name).join(", ")}.`,
  };
}

function deterministicSeeds(candidates: SeedCandidate[]): SeedCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.entity.name.localeCompare(b.entity.name));
  const preferred = sorted.filter(
    (candidate) => isWork(candidate.entity.type) || /book|person|place/.test(candidate.entity.type),
  );
  return (preferred.length ? preferred : sorted).slice(0, 3);
}

function isCredit(type: string): boolean {
  return type.includes("artist") || type.includes("brand");
}

function isWork(type: string): boolean {
  return type.includes("movie") || type.includes("tv");
}

function shortType(type: string): string {
  return type.replace("urn:entity:", "");
}

function dedupe(rows: SeedCandidate[]): SeedCandidate[] {
  const map = new Map<string, SeedCandidate>();
  for (const row of rows) if (!map.has(row.entity.id)) map.set(row.entity.id, row);
  return [...map.values()];
}
