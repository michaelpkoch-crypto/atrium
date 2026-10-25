import { placeQueries, tagQueriesFor, tokens } from "@/lib/agent/queries";
import { matchFamily, type WindowScene } from "@/lib/atmosphere/families";
import type { TasteEntity, TasteTag } from "@/lib/qloo/types";

export type WorkKind = "movie" | "tv" | "book";
export type PersonKind = "person" | "artist";

export type SceneMood = {
  time: "day" | "dusk" | "night";
  weather: "clear" | "rain";
  brightness: "bright" | "dim";
};

export type Proposal = {
  works: { name: string; kind: WorkKind }[];
  people: { name: string; kind: PersonKind }[];
  placeQueries: string[];
  placeTags: string[];
  moodTags: string[];
  rejectTags: string[];
  city: string;
  /** Time of day, weather, and brightness come from the prompt. Qloo colors inside that scene. */
  scene: SceneMood;
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
  scene: { time: "dusk", weather: "clear", brightness: "dim" },
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
  scene: { time: "night", weather: "clear", brightness: "dim" },
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
  rejectTags: ["punk", "metal", "horror", "noir", "brutal", "arabian"],
  city: "",
  scene: { time: "day", weather: "clear", brightness: "bright" },
  reason: "Wes Anderson means the films and a pastel cafe, not a place named Brunch.",
};

const TARANTINO: Proposal = {
  works: [
    { name: "Pulp Fiction", kind: "movie" },
    { name: "Reservoir Dogs", kind: "movie" },
  ],
  people: [
    { name: "Quentin Tarantino", kind: "person" },
    { name: "Ennio Morricone", kind: "artist" },
  ],
  placeQueries: ["diner", "american diner"],
  placeTags: ["diner"],
  moodTags: ["neon", "retro", "crime", "diner"],
  rejectTags: ["brutality", "bathroom", "warehouse", "toaster", "gore"],
  city: "",
  scene: { time: "night", weather: "clear", brightness: "dim" },
  reason: "A 2am Tarantino diner is Pulp Fiction and Reservoir Dogs, chrome and a jukebox, not a bathroom.",
};

const BRIDGERTON: Proposal = {
  works: [
    { name: "Bridgerton", kind: "tv" },
    { name: "Pride and Prejudice", kind: "movie" },
  ],
  people: [{ name: "Vitamin String Quartet", kind: "artist" }],
  placeQueries: ["tea room", "tea house"],
  placeTags: ["tea", "garden"],
  moodTags: ["regency", "romance", "pastel"],
  rejectTags: ["poetry", "horror", "steamy"],
  city: "",
  scene: { time: "day", weather: "clear", brightness: "bright" },
  reason: "Bridgerton is the show. Pride and Prejudice is the 2005 film. Vitamin String Quartet is the pop-cover quartet.",
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
  rejectTags: ["metal", "punk", "horror", "cyberpunk"],
  city: "Tokyo",
  scene: { time: "night", weather: "rain", brightness: "dim" },
  reason: "Murakami means the novels and a jazz kissa, not a landmark or a thermal bath.",
};

/** Canonical names for the four sample prompts. Other prompts return null. */
export function knownProposal(prompt: string): Proposal | null {
  const text = prompt.toLowerCase();
  if (/ghibli|spirited away|miyazaki|hisaishi/.test(text)) return GHIBLI;
  if (/blade runner/.test(text)) return BLADE;
  if (/wes anderson|grand budapest|tenenbaums/.test(text)) return WES;
  if (/murakami|norwegian wood|kafka on the shore/.test(text)) return MURAKAMI;
  if (/tarantino|pulp fiction|reservoir dogs/.test(text)) return TARANTINO;
  if (/bridgerton/.test(text)) return BRIDGERTON;
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
    scene: sceneFromPrompt(prompt),
    reason: "No canonical names were proposed, so the prompt itself was searched.",
  };
}

/** Daytime prompts stay bright even if a tag or a model guess says night. */
export function sceneFromPrompt(prompt: string): SceneMood {
  const text = prompt.toLowerCase();
  const rain = /\b(rain|rainy|storm|monsoon|drizzle)\b/.test(text);
  const day = /\b(brunch|tea party|garden party|garden tea|picnic|daytime|morning|lunch|afternoon)\b/.test(text);
  const dusk = /\b(dusk|sunset|twilight|golden hour)\b/.test(text);
  const night = /\b(night|midnight|2\s*am|after hours|neon)\b/.test(text);
  if (day && !/\b(2\s*am|midnight)\b/.test(text)) {
    return { time: "day", weather: "clear", brightness: "bright" };
  }
  if (/\b(2\s*am|midnight)\b/.test(text) || (night && !dusk)) {
    return { time: "night", weather: rain ? "rain" : "clear", brightness: "dim" };
  }
  if (dusk) return { time: "dusk", weather: rain ? "rain" : "clear", brightness: "dim" };
  if (rain) return { time: "night", weather: "rain", brightness: "dim" };
  return { time: "night", weather: "clear", brightness: "dim" };
}

/** The word on both rooms. Rain is the weather label; day, dusk, and night come from the prompt. */
export function labelForScene(scene: SceneMood): "Day" | "Dusk" | "Rain" | "Night" {
  if (scene.time === "day") return "Day";
  if (scene.time === "dusk") return "Dusk";
  if (scene.weather === "rain") return "Rain";
  return "Night";
}

/** Plain-room window for the same clock. The Qloo room may still use a neon city at night. */
export function windowForScene(scene: SceneMood): WindowScene {
  if (scene.time === "day") return "day-pastel";
  if (scene.time === "dusk") return "dusk";
  if (scene.weather === "rain") return "rain";
  return "night-city";
}

export function resolveScene(prompt: string, model: SceneMood | null): SceneMood {
  const inferred = sceneFromPrompt(prompt);
  const text = prompt.toLowerCase();
  if (/\b(brunch|tea party|garden party|garden tea|picnic|daytime)\b/.test(text)) return inferred;
  if (/\b(2\s*am|midnight)\b/.test(text)) return inferred;
  if (!model) return inferred;
  const time = model.time === "day" || model.time === "dusk" || model.time === "night" ? model.time : inferred.time;
  const weather = inferred.weather === "rain" || model.weather === "rain" ? "rain" : "clear";
  const brightness = time === "day" ? "bright" : model.brightness === "bright" ? "bright" : "dim";
  return { time, weather, brightness };
}

/**
 * For a sample prompt the canonical names win. The model can still add moods
 * and rejections. For anything else, the model's proposal is the search list.
 */
export function resolveProposal(prompt: string, model: Proposal | null): Proposal {
  const known = knownProposal(prompt);
  if (!known) {
    const base = clampProposal(model ?? genericProposal(prompt));
    return { ...base, scene: resolveScene(prompt, model?.scene ?? null) };
  }
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

const NAME_STOP = new Set(["the", "a", "an", "and", "of"]);

export function confirmsName(query: string, name: string): boolean {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q || !n) return false;
  if (q === n) return true;
  const qt = tokens(q).filter((token) => !NAME_STOP.has(token));
  const nt = tokens(n);
  if (qt.length < 2 || !qt.every((token) => nt.includes(token))) return false;
  const extra = nt.filter((token) => !qt.includes(token) && !NAME_STOP.has(token));
  return extra.length === 0;
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

function fold(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

const GENERIC_VENUE = new Set(["garden", "garten", "jardin", "giardino"]);

/** "Gården" is just Garden. A venue whose whole name is a category word is not a place. */
export function genericVenueName(name: string): boolean {
  const parts = tokens(fold(name)).filter((token) => !NAME_STOP.has(token));
  return parts.length > 0 && parts.every((token) => GENERIC_VENUE.has(token));
}

/** A place whose only distinctive word is a word from the prompt ("Brunch", "Bathhouse Studios"). */
export function promptEchoPlace(name: string, prompt: string): boolean {
  const distinctive = tokens(fold(name)).filter((token) => token.length > 2 && !GENERIC_PLACE.has(token));
  if (!distinctive.length) return true;
  const promptTokens = new Set(tokens(fold(prompt)));
  return distinctive.every((token) => promptTokens.has(token));
}

const LANDMARK =
  /\b(museum|abbey|cathedral|basilica|campanile|monument|palace|mall|world trade|güell|guell|gaudi|gaudí|chapel|castle|bridge|thermal)\b|hall of mirrors/i;

export function isLandmark(name: string): boolean {
  return LANDMARK.test(name);
}

const RELIGIOUS =
  /\b(church|chapel|cathedral|basilica|mosque|temple|shrine|synagogue|abbey|monastery|parish|igreja|iglesia|eglise|duomo|cemetery|graveyard)\b/i;
const LODGING = /\b(hotel|resort|hostel|motel)\b/i;
const FICTION_VENUE =
  /\b(sleepy hollow|beyond the wall|hogwarts|diagon alley|rivendell|westeros|gotham|mordor|narnia|winterfell)\b/i;

/** A church, a hotel, a landmark, or a fiction set does not pour the drink. */
export function counterRejected(name: string): boolean {
  const text = fold(name);
  return isLandmark(name) || isLandmark(text) || RELIGIOUS.test(text) || LODGING.test(text) || FICTION_VENUE.test(text);
}

type Service = "diner" | "restaurant" | "tea" | "cafe" | "bar" | "bath" | "bakery";

const SERVICE_NAME: Record<Service, RegExp> = {
  diner: /\b(diner|eatery|grill)\b/i,
  restaurant: /\b(restaurant|bistro|trattoria|tavern)\b/i,
  tea: /\b(tea\s*rooms?|tearooms?|tea\s*houses?|teahouses?)\b/i,
  cafe: /\b(cafes?|coffee|espresso|kissaten|kissa)\b/i,
  bar: /\b(bars?|pubs?|lounges?)\b/i,
  bath: /\b(bath\s*houses?|bathhouses?|onsens?|sento)\b/i,
  bakery: /\b(patisseries?|bakeries|bakery|pastries|pastry|brunch)\b/i,
};

const SERVICE_TAG: Record<Service, RegExp> = {
  diner: /\b(diner|eatery|grill)\b/i,
  restaurant: /\b(restaurant|bistro|trattoria)\b/i,
  tea: /\b(tea|tearoom|teahouse)\b/i,
  cafe: /\b(cafe|coffee|espresso|kissaten|kissa)\b/i,
  bar: /\b(bar|pub|lounge|jazz)\b/i,
  bath: /\b(bathhouse|onsen|sento)\b/i,
  bakery: /\b(patisserie|bakery|pastry|brunch)\b/i,
};

function wantedServices(proposal: Proposal): Service[] {
  const blob = [...proposal.placeQueries, ...proposal.placeTags].join(" ").toLowerCase();
  const out: Service[] = [];
  const add = (service: Service) => {
    if (!out.includes(service)) out.push(service);
  };
  if (/\bdiner\b/.test(blob)) {
    add("diner");
    add("restaurant");
  }
  if (/tea/.test(blob)) add("tea");
  if (/kissaten|kissa|cafe|coffee/.test(blob)) add("cafe");
  if (/\bbar\b|jazz|lounge|pub/.test(blob)) add("bar");
  if (/bath|onsen|sento/.test(blob)) add("bath");
  if (/patisserie|brunch|pastry|bakery/.test(blob)) add("bakery");
  return out;
}

function counterScore(place: TasteEntity, services: Service[]): number {
  if (counterRejected(place.name)) return -1;
  if (!services.length) return 1;
  const name = fold(place.name);
  const tags = fold(place.tags.map((tag) => humanizeTagName(tag.name)).join(" "));
  let score = 0;
  for (const service of services) {
    if (SERVICE_NAME[service].test(name)) score += 5;
    else if (SERVICE_TAG[service].test(tags)) score += 2;
  }
  return score;
}

/**
 * The counter is the place that can actually serve the prompt.
 * A diner name outranks a landmark that merely carried the diner tag.
 * Score 0 is dropped: fewer venues, not a church.
 */
export function rankCounterPlaces(places: TasteEntity[], proposal: Proposal): TasteEntity[] {
  const services = wantedServices(proposal);
  const ranked = places
    .map((place) => ({ place, score: counterScore(place, services) }))
    .filter((row) => row.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || (b.place.affinity ?? -1) - (a.place.affinity ?? -1) || a.place.name.localeCompare(b.place.name),
    );
  return dedupeByName(ranked.map((row) => row.place));
}

const GENERIC_CATEGORY = new Set([
  "cafe",
  "bar",
  "club",
  "shop",
  "place",
  "restaurant",
  "venue",
  "counter",
  "room",
  "cocktail",
  "nightlife",
  "sky",
  "rooftop",
]);

const PLACE_SYNONYMS: Record<string, string[]> = {
  "jazz bar": ["jazz club", "jazz lounge"],
  "jazz club": ["jazz lounge", "jazz bar"],
  "jazz lounge": ["jazz bar", "jazz club"],
  onsen: ["bathhouse", "sento"],
  sento: ["bathhouse", "onsen"],
  bathhouse: ["onsen", "sento"],
  patisserie: ["bakery", "brunch cafe"],
  "brunch cafe": ["patisserie", "bakery"],
  diner: ["american diner", "roadside diner"],
  "jazz kissa": ["kissaten", "jazz cafe"],
  kissaten: ["jazz kissa", "coffee shop"],
  "tea room": ["tea house", "garden cafe"],
  "tea house": ["tea room", "garden cafe"],
  garden: ["tea room", "garden cafe"],
};

/** Tried only after the specific place search and place insights come back empty. */
export function broaderPlaceQueries(queries: string[]): string[] {
  const seen = new Set(queries.map((query) => query.toLowerCase()));
  const extra: string[] = [];
  for (const query of queries) {
    const direct = PLACE_SYNONYMS[query.toLowerCase()] ?? [];
    const tokenHit = tokens(query).flatMap((token) => PLACE_SYNONYMS[token] ?? []);
    for (const next of [...direct, ...tokenHit]) {
      if (seen.has(next.toLowerCase())) continue;
      seen.add(next.toLowerCase());
      extra.push(next);
    }
  }
  return extra.slice(0, 3);
}

export function placeFits(place: TasteEntity, proposal: Proposal, prompt: string): boolean {
  if (promptEchoPlace(place.name, prompt) || isLandmark(place.name) || genericVenueName(place.name)) return false;
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

/**
 * Entity tags drive the lamps. A tag stays only when it shares a word with the
 * mood or the place kind. Nordic Noir does not survive a pastel brunch.
 */
export function tagFitsMood(name: string, proposal: Proposal): boolean {
  const human = humanizeTagName(name);
  if (proposal.rejectTags.some((reject) => mentions(human, reject) || mentions(name, reject))) return false;
  const allowed = [...proposal.moodTags, ...proposal.placeTags, ...proposal.placeQueries];
  if (!allowed.length) return true;
  return allowed.some((mood) => moodMatch(human, mood) || tokens(mood).some((token) => token.length > 3 && tokens(human).includes(token)));
}

/**
 * Tags that may color a lamp. Mood matches stay. When those matches have no color prior,
 * the entity's own aesthetic tags (neon, retro, crime) are kept so the room is not a hashed blue.
 * Rejected vibes never come back.
 */
export function tagsForRoom(tags: TasteTag[], proposal: Proposal): TasteTag[] {
  const kept = tags.filter((tag) => tagFitsMood(tag.name, proposal));
  const picked = kept.some((tag) => matchFamily(tag.name))
    ? kept
    : [
        ...kept,
        ...tags.filter((tag) => !kept.some((item) => item.id === tag.id) && !rejectedTag(tag.name, proposal) && matchFamily(tag.name)),
      ];
  return uniqueTags(picked).slice(0, 8);
}

function uniqueTags(tags: TasteTag[]): TasteTag[] {
  const seen = new Set<string>();
  const out: TasteTag[] = [];
  for (const tag of tags) {
    const key = humanizeTagName(tag.name).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

function rejectedTag(name: string, proposal: Proposal): boolean {
  const human = humanizeTagName(name);
  return proposal.rejectTags.some((reject) => mentions(human, reject) || mentions(name, reject));
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
    scene: proposal.scene ?? sceneFromPrompt(""),
    reason: proposal.reason.trim() || "The model named the works this prompt refers to.",
  };
}
