import { placeQueries, tagQueriesFor, tokens } from "@/lib/agent/queries";
import type { TasteEntity } from "@/lib/qloo/types";

export type WorkKind = "movie" | "tv" | "book";
export type PersonKind = "person" | "artist";

export type Proposal = {
  works: { name: string; kind: WorkKind }[];
  people: { name: string; kind: PersonKind }[];
  placeQueries: string[];
  placeTags: string[];
  moodTags: string[];
  rejectTags: string[];
  city: string;
  reason: string;
};

const GHIBLI: Proposal = {
  works: [
    { name: "Spirited Away", kind: "movie" },
    { name: "My Neighbor Totoro", kind: "movie" },
  ],
  people: [
    { name: "Joe Hisaishi", kind: "artist" },
    { name: "Hayao Miyazaki", kind: "person" },
  ],
  placeQueries: ["onsen", "sento"],
  placeTags: ["bathhouse", "onsen", "tea"],
  moodTags: ["anime", "ghibli", "dusk", "ambient"],
  rejectTags: ["horror", "haunted", "metal", "punk", "vinyl", "brutal death"],
  city: "",
  reason: "Studio Ghibli means the films. Spirited Away is the bathhouse, Joe Hisaishi is the score.",
};

const BLADE: Proposal = {
  works: [
    { name: "Blade Runner", kind: "movie" },
    { name: "Blade Runner 2049", kind: "movie" },
  ],
  people: [{ name: "Vangelis", kind: "artist" }],
  placeQueries: ["jazz bar", "jazz club"],
  placeTags: ["jazz", "bar", "cocktail"],
  moodTags: ["jazz", "neon", "noir", "night"],
  rejectTags: ["brutal death", "death metal", "gore", "disco", "funk"],
  city: "",
  reason: "Blade Runner is the film. The 1970s half is a jazz bar, not a landmark.",
};

const WES: Proposal = {
  works: [
    { name: "The Grand Budapest Hotel", kind: "movie" },
    { name: "The Royal Tenenbaums", kind: "movie" },
  ],
  people: [
    { name: "Wes Anderson", kind: "person" },
    { name: "Alexandre Desplat", kind: "artist" },
  ],
  placeQueries: ["patisserie", "brunch cafe"],
  placeTags: ["cafe", "brunch", "pastry"],
  moodTags: ["pastel", "symmetry", "brunch"],
  rejectTags: ["punk", "metal", "horror"],
  city: "",
  reason: "Wes Anderson means the films and a pastel cafe, not a place named Brunch.",
};

const MURAKAMI: Proposal = {
  works: [
    { name: "Norwegian Wood", kind: "book" },
    { name: "Kafka on the Shore", kind: "book" },
  ],
  people: [
    { name: "Haruki Murakami", kind: "person" },
    { name: "Bill Evans", kind: "artist" },
  ],
  placeQueries: ["jazz kissa", "kissaten"],
  placeTags: ["cafe", "kissaten"],
  moodTags: ["rain", "jazz", "literature", "night"],
  rejectTags: ["metal", "punk", "horror"],
  city: "Tokyo",
  reason: "Murakami means the novels and a jazz kissa, not a landmark or a thermal bath.",
};

/** Canonical names for the four sample prompts. Other prompts return null. */
export function knownProposal(prompt: string): Proposal | null {
  const text = prompt.toLowerCase();
  if (/ghibli|spirited away|miyazaki|hisaishi/.test(text)) return GHIBLI;
  if (/blade runner/.test(text)) return BLADE;
  if (/wes anderson|grand budapest|tenenbaums/.test(text)) return WES;
  if (/murakami|norwegian wood|kafka on the shore/.test(text)) return MURAKAMI;
  return null;
}

export function genericProposal(prompt: string): Proposal {
  const queries = tokens(prompt).length ? prompt.split(/\s+/).slice(0, 1) : [];
  const names = queries.length ? [prompt.trim()] : [];
  return {
    works: names.slice(0, 1).map((name) => ({ name, kind: "movie" as const })),
    people: [],
    placeQueries: placeQueries(prompt),
    placeTags: ["cafe", "bar"],
    moodTags: tagQueriesFor(prompt, []),
    rejectTags: [],
    city: "",
    reason: "No canonical names were proposed, so the prompt itself was searched.",
  };
}

/**
 * For a sample prompt the canonical names win. The model can still add moods
 * and rejections. For anything else, the model's proposal is the search list.
 */
export function resolveProposal(prompt: string, model: Proposal | null): Proposal {
  const known = knownProposal(prompt);
  if (!known) return clampProposal(model ?? genericProposal(prompt));
  if (!model) return known;
  const rejectTags = unique([...known.rejectTags, ...model.rejectTags.map(clean)]).slice(0, 8);
  const moodTags = unique([...known.moodTags, ...model.moodTags.map(clean)])
    .filter((tag) => !rejectTags.some((reject) => mentions(tag, reject)))
    .slice(0, 6);
  return {
    ...known,
    moodTags,
    rejectTags,
    city: known.city || model.city,
    reason: model.reason.trim() || known.reason,
  };
}

export function confirmsName(query: string, name: string): boolean {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q || !n) return false;
  if (q === n) return true;
  const qt = tokens(q);
  const nt = tokens(n);
  if (qt.length < 2 || !qt.every((token) => nt.includes(token))) return false;
  const extra = nt.filter((token) => !qt.includes(token));
  return extra.every((token) => token === "the");
}

const GENERIC_PLACE = new Set([
  "studio",
  "studios",
  "house",
  "room",
  "bar",
  "cafe",
  "club",
  "shop",
  "place",
  "the",
  "and",
  "counter",
]);

/** A place whose only distinctive word is a word from the prompt ("Brunch", "Bathhouse Studios"). */
export function promptEchoPlace(name: string, prompt: string): boolean {
  const distinctive = tokens(name).filter((token) => token.length > 2 && !GENERIC_PLACE.has(token));
  if (!distinctive.length) return true;
  const promptTokens = new Set(tokens(prompt));
  return distinctive.every((token) => promptTokens.has(token));
}

const LANDMARK =
  /\b(museum|abbey|cathedral|basilica|campanile|monument|palace|mall|world trade|güell|guell|gaudi|gaudí|chapel|castle|bridge|thermal)\b|hall of mirrors/i;

export function isLandmark(name: string): boolean {
  return LANDMARK.test(name);
}

const GENERIC_CATEGORY = new Set(["cafe", "bar", "club", "shop", "place", "restaurant", "venue", "counter", "room"]);

export function placeFits(place: TasteEntity, proposal: Proposal, prompt: string): boolean {
  if (promptEchoPlace(place.name, prompt) || isLandmark(place.name)) return false;
  const blob = `${place.name} ${place.tags.map((tag) => humanizeTagName(tag.name)).join(" ")}`;
  const categories = [...proposal.placeTags, ...proposal.placeQueries].map(clean).filter(Boolean);
  if (!categories.length) return true;
  const specific = categories.filter((category) =>
    tokens(category).some((token) => token.length > 3 && !GENERIC_CATEGORY.has(token)),
  );
  const wanted = specific.length ? specific : categories;
  return wanted.some(
    (category) => mentions(blob, category) || tokens(category).every((token) => token.length > 3 && tokens(blob).includes(token)),
  );
}

export function offVibe(entity: TasteEntity, proposal: Proposal): boolean {
  const blob = `${entity.name} ${entity.tags.map((tag) => humanizeTagName(tag.name)).join(" ")}`;
  const rejected = proposal.rejectTags.some((reject) => mentions(blob, reject));
  if (!rejected) return false;
  return !proposal.moodTags.some((mood) => mentions(blob, mood));
}

/** A tag is kept only when it is one of the moods or place categories the proposal named. */
export function tagAllowed(name: string, proposal: Proposal): boolean {
  const human = humanizeTagName(name);
  if (proposal.rejectTags.some((reject) => mentions(human, reject) || mentions(name, reject))) return false;
  const allowed = [...proposal.moodTags, ...proposal.placeTags];
  if (!allowed.length) return true;
  return allowed.some((mood) => moodMatch(human, mood));
}

export function humanizeTagName(name: string): string {
  const raw = name.trim();
  if (!raw) return raw;
  const key = raw.includes(":") ? (raw.split(":").pop() ?? raw) : raw;
  const keyed = key.includes("_") || raw.includes(":") || /^[a-z0-9_]+$/.test(raw);
  if (!keyed) return raw;
  const words = key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!words) return raw;
  return words.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

export function dedupeByName<T extends { id: string; name: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(row.id) || seen.has(key)) continue;
    seen.add(row.id);
    seen.add(key);
    out.push(row);
  }
  return out;
}

function moodMatch(tagName: string, mood: string): boolean {
  if (tagName.toLowerCase() === mood.toLowerCase()) return true;
  const nt = tokens(tagName);
  const mt = tokens(mood);
  if (!mt.length || !mt.every((token) => nt.includes(token))) return false;
  return nt.every((token) => mt.includes(token));
}

function mentions(haystack: string, needle: string): boolean {
  const text = haystack.toLowerCase();
  const term = needle.toLowerCase().trim();
  if (!term) return false;
  if (term.includes(" ")) return text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values.map(clean).filter(Boolean)) {
    if (!out.some((item) => item.toLowerCase() === value.toLowerCase())) out.push(value);
  }
  return out;
}

function clampProposal(proposal: Proposal): Proposal {
  return {
    works: proposal.works.filter((work) => work.name.trim()).slice(0, 3),
    people: proposal.people.filter((person) => person.name.trim()).slice(0, 3),
    placeQueries: unique(proposal.placeQueries).slice(0, 3),
    placeTags: unique(proposal.placeTags).slice(0, 4),
    moodTags: unique(proposal.moodTags).slice(0, 6),
    rejectTags: unique(proposal.rejectTags).slice(0, 8),
    city: proposal.city.trim(),
    reason: proposal.reason.trim() || "The model named the works this prompt refers to.",
  };
}
