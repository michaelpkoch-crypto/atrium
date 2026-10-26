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

/**
 * Genres and aesthetic moods that can keep a neighbor. Literature, lyrical, modal,
 * pop, rock, and singer-songwriter are not in this set: a stamped Jazz tag still
 * has to come from the music seed, not from the novelist.
 */
const COUNTABLE = new Set([
  "jazz",
  "piano",
  "ambient",
  "classical",
  "electronic",
  "funk",
  "disco",
  "soul",
  "blues",
  "bossa",
  "techno",
  "house",
  "opera",
  "samba",
  "synth",
  "synthesizer",
  "hiphop",
  "lofi",
  "symmetry",
  "pastel",
  "neon",
  "noir",
  "retro",
  "crime",
  "anime",
  "ghibli",
  "regency",
  "romance",
  "chrome",
  "brunch",
  "diner",
  "bathhouse",
  "steam",
  "hojicha",
]);

export type ArtistRankRow = {
  name: string;
  kept: boolean;
  via: string;
};

/**
 * Seed artists stay. A neighbor stays when an allowlisted token overlaps the music
 * seeds, the person seeds, or the mood. If explainability names a person and not
 * the music seed, the overlap has to be that person's own token (symmetry on Wes).
 * Jazz on a Turkish singer whose only explainer is Murakami is dropped. Bridgerton
 * still keeps its two audience crossovers. This runs on the rows insights returned,
 * including rows served from the cache.
 */
export function rankInsightArtists(
  artists: TasteEntity[],
  seeds: TasteEntity[],
  proposal: Proposal,
  prompt: string,
): { artists: TasteEntity[]; report: ArtistRankRow[] } {
  const musicIds = new Set(seeds.filter((seed) => seed.type.includes("artist")).map((seed) => seed.id));
  const personIds = new Set(seeds.filter((seed) => seed.type.includes("person")).map((seed) => seed.id));
  const personTokens = new Map(seeds.filter((seed) => personIds.has(seed.id)).map((seed) => [seed.id, new Set(countableTokens(seed))]));
  const wanted = new Set([
    ...seeds.filter((seed) => musicIds.has(seed.id) || personIds.has(seed.id)).flatMap(countableTokens),
    ...proposal.moodTags.flatMap((tag) => countableFrom(tag)),
  ]);
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const anchored = artists.filter((artist) => seedIds.has(artist.id));
  const scored = artists
    .filter((artist) => !seedIds.has(artist.id))
    .map((artist) => ({
      artist,
      overlap: countableTokens(artist).filter((token) => wanted.has(token)),
      affinity: artist.affinity ?? 0,
    }));
  const aligned = scored
    .filter((row) => row.overlap.length > 0)
    .map((row) => ({ ...row, decision: attribute(row.artist, row.overlap, seeds, musicIds, personIds, personTokens) }))
    .sort((a, b) => Number(b.decision.keep) - Number(a.decision.keep) || b.overlap.length - a.overlap.length || b.affinity - a.affinity || a.artist.name.localeCompare(b.artist.name));
  const surprises = scored
    .filter((row) => row.overlap.length === 0 && row.affinity >= 0.84)
    .sort((a, b) => b.affinity - a.affinity || a.artist.name.localeCompare(b.artist.name));
  const audience = /bridgerton/i.test(prompt) && surprises.length >= 2 ? surprises.slice(0, 2) : [];
  const audienceIds = new Set(audience.map((row) => row.artist.id));

  const picked: TasteEntity[] = [];
  const report: ArtistRankRow[] = [];
  const dropped: ArtistRankRow[] = [];
  const take = (artist: TasteEntity, via: string, kept: boolean) => {
    const row = { name: artist.name, kept, via };
    if (!kept) {
      dropped.push(row);
      return;
    }
    if (picked.some((item) => item.id === artist.id)) return;
    if (picked.length >= 4) {
      dropped.push({ name: artist.name, kept: false, via });
      return;
    }
    picked.push(artist);
    report.push(row);
  };

  for (const artist of anchored) take(artist, "seed", true);
  for (const row of aligned) {
    if (row.decision.keep) take(row.artist, row.decision.via, true);
    else dropped.push({ name: row.artist.name, kept: false, via: row.decision.via });
  }
  for (const row of audience) take(row.artist, "audience crossover", true);
  for (const row of scored) {
    if (picked.some((item) => item.id === row.artist.id) || audienceIds.has(row.artist.id)) continue;
    if (dropped.some((item) => item.name === row.artist.name)) continue;
    dropped.push({ name: row.artist.name, kept: false, via: "no shared genre" });
  }
  return { artists: picked, report: [...report, ...dropped] };
}

function attribute(
  artist: TasteEntity,
  overlap: string[],
  seeds: TasteEntity[],
  musicIds: Set<string>,
  personIds: Set<string>,
  personTokens: Map<string, Set<string>>,
): { keep: boolean; via: string } {
  const listed = overlap.slice(0, 3).join(", ");
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const explained = artist.explainers
    .filter((row) => seedIds.has(row.id))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const token = overlap[0] ?? listed;
  if (!explained.length) return { keep: true, via: `${token} from the music seeds` };
  const top = explained[0].score;
  const music = explained.filter((row) => musicIds.has(row.id) && row.score >= top - 0.05);
  if (music.length) return { keep: true, via: `${token} from ${music[0].name}` };
  const people = explained.filter((row) => personIds.has(row.id) && row.score >= top - 0.05);
  if (people.length) {
    const matched = people.find((person) => overlap.some((item) => personTokens.get(person.id)?.has(item)));
    if (matched) return { keep: true, via: `${token} from ${matched.name}` };
    return { keep: false, via: `${token} from ${people[0].name}, not a music seed` };
  }
  return { keep: true, via: `${token} from ${explained[0].name}` };
}

function countableTokens(entity: TasteEntity): string[] {
  return unique(entity.tags.flatMap((tag) => countableFrom(tag.name)));
}

function countableFrom(name: string): string[] {
  return tokens(humanizeTagName(name)).filter((token) => COUNTABLE.has(token));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
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
