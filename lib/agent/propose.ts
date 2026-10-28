import { placeQueries, tagQueriesFor, tokens } from "@/lib/agent/queries";
import { FAMILIES, type WindowScene } from "@/lib/atmosphere/families";
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

const HALLOWEEN: Proposal = {
  works: [
    { name: "Halloween", kind: "movie" },
    { name: "Hocus Pocus", kind: "movie" },
    { name: "The Nightmare Before Christmas", kind: "movie" },
  ],
  people: [
    { name: "John Carpenter", kind: "artist" },
    { name: "Danny Elfman", kind: "artist" },
  ],
  placeQueries: ["haunted house", "pumpkin patch", "cocktail bar"],
  placeTags: ["halloween", "bar"],
  moodTags: ["horror", "spooky", "halloween"],
  rejectTags: ["jazz", "pastel", "brunch"],
  city: "",
  scene: { time: "night", weather: "clear", brightness: "dim" },
  reason: "Halloween means the films and the scores: Halloween, Hocus Pocus, The Nightmare Before Christmas, John Carpenter, Danny Elfman.",
};

const CHRISTMAS: Proposal = {
  works: [
    { name: "Home Alone", kind: "movie" },
    { name: "A Charlie Brown Christmas", kind: "tv" },
    { name: "It's a Wonderful Life", kind: "movie" },
  ],
  people: [
    { name: "John Williams", kind: "artist" },
    { name: "Vince Guaraldi", kind: "artist" },
    { name: "Mariah Carey", kind: "artist" },
  ],
  placeQueries: ["holiday market"],
  placeTags: ["christmas", "holiday"],
  moodTags: ["christmas", "holiday"],
  rejectTags: ["horror", "noir"],
  city: "",
  scene: { time: "day", weather: "clear", brightness: "bright" },
  reason: "Christmas morning means Home Alone, A Charlie Brown Christmas, It's a Wonderful Life, John Williams, Vince Guaraldi, and Mariah Carey.",
};

const MUERTOS: Proposal = {
  works: [
    { name: "Coco", kind: "movie" },
    { name: "The Book of Life", kind: "movie" },
  ],
  people: [{ name: "Michael Giacchino", kind: "artist" }],
  placeQueries: ["marigold market"],
  placeTags: ["marigold", "folk"],
  moodTags: ["marigold", "folk"],
  rejectTags: ["horror", "noir"],
  city: "Mexico City",
  scene: { time: "dusk", weather: "clear", brightness: "dim" },
  reason: "Día de los Muertos means Coco, The Book of Life, and Michael Giacchino, near Mexico City.",
};

const SUPER_BOWL: Proposal = {
  works: [{ name: "Super Bowl", kind: "tv" }],
  people: [],
  placeQueries: ["sports bar"],
  placeTags: ["football", "sports"],
  moodTags: ["football", "sports", "party"],
  rejectTags: ["horror", "jazz"],
  city: "",
  scene: { time: "night", weather: "clear", brightness: "bright" },
  reason: "A Super Bowl party means the broadcast and a sports bar. The city changes with the host, so none is pinned.",
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
  city: "Los Angeles",
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
  city: "Los Angeles",
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

const STRANGER: Proposal = {
  works: [{ name: "Stranger Things", kind: "tv" }],
  people: [
    { name: "Kyle Dixon", kind: "artist" },
    { name: "Michael Stein", kind: "artist" },
  ],
  placeQueries: ["arcade", "pizza place"],
  placeTags: ["arcade", "retro"],
  moodTags: ["neon", "retro"],
  rejectTags: ["tavern", "jazz"],
  city: "Atlanta",
  scene: { time: "night", weather: "clear", brightness: "dim" },
  reason: "Stranger Things means the show, Kyle Dixon, Michael Stein, and a named arcade or pizza place in Atlanta. The basement is the room, not a venue called Tavern.",
};

const LOTR: Proposal = {
  works: [{ name: "The Lord of the Rings", kind: "movie" }],
  people: [{ name: "Howard Shore", kind: "artist" }],
  placeQueries: ["pub", "inn"],
  placeTags: ["pub"],
  moodTags: ["fantasy", "fire", "hearth"],
  rejectTags: ["neon", "diner"],
  city: "Oxford",
  scene: { time: "night", weather: "clear", brightness: "dim" },
  reason: "A Lord of the Rings tavern means the film, Howard Shore, and a pub that pours mead. A place named only Tavern is not a venue.",
};

type StatedRoom = { label: string; queries: string[]; tags: string[] };

const STATED_ROOMS: { test: RegExp; room: StatedRoom }[] = [
  { test: /\b(bathhouse|onsen|sento|hot spring|day spa)\b/i, room: { label: "Bath", queries: ["onsen", "sento"], tags: ["bathhouse", "onsen", "tea"] } },
  { test: /\b(tea party|garden tea|afternoon tea)\b/i, room: { label: "Tea party", queries: ["tea room", "tea house"], tags: ["tea", "garden"] } },
  { test: /\b(tea room|tea house|tearoom)\b/i, room: { label: "Tea room", queries: ["tea room", "tea house"], tags: ["tea"] } },
  { test: /\bkitchen\b/i, room: { label: "Kitchen", queries: ["cafe", "tea house", "coffee shop"], tags: ["cafe", "tea", "kitchen"] } },
  { test: /\bdiner\b/i, room: { label: "Diner", queries: ["diner", "american diner"], tags: ["diner"] } },
  { test: /\b(jazz bar|jazz club|jazz lounge)\b/i, room: { label: "Bar", queries: ["jazz bar", "jazz club"], tags: ["jazz", "bar"] } },
  { test: /\bbasement\b/i, room: { label: "Basement", queries: ["tavern", "basement bar"], tags: ["bar", "tavern"] } },
  { test: /\b(tavern|alehouse)\b/i, room: { label: "Tavern", queries: ["tavern", "inn"], tags: ["tavern", "pub"] } },
  { test: /\bbar\b/i, room: { label: "Bar", queries: ["bar", "jazz bar"], tags: ["bar", "jazz"] } },
  { test: /\b(reading nook|nook)\b/i, room: { label: "Reading nook", queries: ["cafe", "kissaten"], tags: ["cafe", "kissaten"] } },
  { test: /\b(brunch|patisserie|pastry)\b/i, room: { label: "Café", queries: ["patisserie", "brunch cafe"], tags: ["cafe", "brunch", "pastry"] } },
  { test: /\b(kissaten|jazz kissa)\b/i, room: { label: "Kissaten", queries: ["kissaten", "jazz kissa"], tags: ["cafe", "kissaten"] } },
  { test: /\bgarden\b/i, room: { label: "Garden", queries: ["tea room", "garden cafe"], tags: ["tea", "garden"] } },
];

/** The room the prompt actually names. Onsen is not implied by a kitchen. */
export function statedRoom(prompt: string): StatedRoom | null {
  return STATED_ROOMS.find((row) => row.test.test(prompt))?.room ?? null;
}

/**
 * The word above the title. The prompt's room wins. A place category is the fallback.
 * The floor-plan id (bath, lounge) is not a title.
 */
export function roomKicker(prompt: string, plan: string, placeHint = ""): string {
  const text = prompt.toLowerCase();
  const stated = statedRoom(prompt);
  if (stated) return stated.label;
  if (/christmas/.test(text) && /\bmorning\b/.test(text)) return "Morning";
  if (/christmas/.test(text)) return "Living room";
  const blob = fold(`${placeHint} ${plan}`).toLowerCase();
  if (/\b(kissaten|kissa)\b/.test(blob)) return "Kissaten";
  if (/\bdiner\b/.test(blob)) return "Diner";
  if (/\b(tea room|tea house|tearoom)\b/.test(blob)) return "Tea room";
  if (/\b(onsen|bathhouse|sento)\b/.test(blob)) return "Bath";
  if (/\b(cafe|coffee)\b/.test(blob)) return "Café";
  if (/\bbar\b/.test(blob)) return "Bar";
  if (plan === "bath") return "Bath";
  if (plan === "lounge") return "Lounge";
  if (plan === "neon") return "Night";
  if (plan === "symmetry") return "Day";
  if (plan === "rain" && /\b(rain|rainy|storm|drizzle)\b/.test(text)) return "Rain";
  if (plan === "brutalist") return "Concrete";
  return "Room";
}

/** Canonical names for the sample prompts. A stated room replaces the default venue. */
export function knownProposal(prompt: string): Proposal | null {
  const text = prompt.toLowerCase();
  let base: Proposal | null = null;
  if (/halloween|hocus pocus|nightmare before christmas/.test(text)) base = HALLOWEEN;
  else if (/christmas/.test(text)) base = CHRISTMAS;
  else if (/d[ií]a de los muertos|dia de los muertos|muertos|ofrenda/.test(text)) base = MUERTOS;
  else if (/super bowl|halftime/.test(text)) base = SUPER_BOWL;
  else if (/stranger things|upside down/.test(text)) base = STRANGER;
  else if (/\b(lord of the rings|lotr|middle-earth|middle earth|hobbit|tolkien)\b/.test(text)) base = LOTR;
  else if (/ghibli|spirited away|miyazaki|hisaishi/.test(text)) base = GHIBLI;
  else if (/blade runner/.test(text)) base = BLADE;
  else if (/wes anderson|grand budapest|tenenbaums/.test(text)) base = WES;
  else if (/murakami|norwegian wood|kafka on the shore/.test(text)) base = MURAKAMI;
  else if (/tarantino|pulp fiction|reservoir dogs/.test(text)) base = TARANTINO;
  else if (/bridgerton/.test(text)) base = BRIDGERTON;
  if (!base) return null;
  const room = statedRoom(prompt);
  const proposal =
    !room || (base.placeQueries.length && (room.label === "Basement" || room.label === "Tavern"))
      ? base
      : { ...base, placeQueries: room.queries, placeTags: room.tags };
  return { ...proposal, city: sanitizeCity(prompt, proposal.city) };
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

/** Time of day, with weather after it. A rainy night is "Night · rain", not just "Rain". */
export function labelForScene(scene: SceneMood): string {
  const time = scene.time === "day" ? "Day" : scene.time === "dusk" ? "Dusk" : "Night";
  if (scene.weather === "rain" && scene.time !== "day") return `${time} · rain`;
  return time;
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
export type Era = { label: string; decade: "1970s" | "1980s" };

/** A year or a decade the prompt states. This is not a Qloo tag. */
export function eraFromPrompt(prompt: string): Era | null {
  const year = prompt.match(/\b(19[78]\d)\b/);
  if (year) {
    const value = Number(year[1]);
    if (value >= 1970 && value <= 1979) return { label: year[1], decade: "1970s" };
    if (value >= 1980 && value <= 1989) return { label: year[1], decade: "1980s" };
  }
  if (/\b(1970s|70s|seventies)\b/i.test(prompt)) return { label: "1970s", decade: "1970s" };
  if (/\b(1980s|80s|eighties)\b/i.test(prompt)) return { label: "1980s", decade: "1980s" };
  return null;
}

/**
 * A place the venues should actually be near.
 * Empty when the prompt does not point at a real city. Madrid is not the default.
 */
export function placeCity(prompt: string): string | null {
  const text = prompt.toLowerCase();
  if (/\broad[\s-]?trip\b/.test(text)) return null;
  if (/d[ií]a de los muertos|dia de los muertos|muertos|ofrenda/.test(text)) return "Mexico City";
  if (/stranger things/.test(text)) return "Atlanta";
  if (/\b(lord of the rings|lotr|middle-earth|middle earth|hobbit|tolkien)\b/.test(text)) return "Oxford";
  if (/\b(tarantino|pulp fiction|reservoir dogs)\b/.test(text)) return "Los Angeles";
  if (/blade runner/.test(text)) return "Los Angeles";
  if (/murakami|norwegian wood|kafka on the shore/.test(text)) return "Tokyo";
  return null;
}

const UNSOLICITED_CITY = /\b(madrid|spain|españa|espana)\b/i;

/** Franchise cities win. Madrid or Spain is dropped unless the prompt says them. */
export function sanitizeCity(prompt: string, city: string): string {
  if (/\broad[\s-]?trip\b/i.test(prompt)) return "";
  const fitted = placeCity(prompt);
  if (fitted) return fitted;
  const trimmed = city.trim();
  if (!trimmed) return "";
  if (UNSOLICITED_CITY.test(trimmed) && !UNSOLICITED_CITY.test(prompt)) return "";
  return trimmed.slice(0, 80);
}

export function proposalSummary(proposal: Proposal): string {
  const names = [...proposal.works.map((work) => work.name), ...proposal.people.map((person) => person.name)];
  const where = proposal.city.trim() || "no location";
  return `${names.filter(Boolean).join(", ")}; place ${where}`;
}

export function resolveProposal(prompt: string, model: Proposal | null): Proposal {
  const known = knownProposal(prompt);
  if (!known) {
    const base = clampProposal(model ?? genericProposal(prompt));
    const room = statedRoom(prompt);
    return {
      ...base,
      placeQueries: room?.queries ?? base.placeQueries,
      placeTags: room?.tags ?? base.placeTags,
      city: sanitizeCity(prompt, base.city),
      scene: resolveScene(prompt, model?.scene ?? null),
    };
  }
  if (!model) return { ...known, city: sanitizeCity(prompt, known.city) };
  const rejectTags = unique([...known.rejectTags, ...model.rejectTags.map(clean)]).slice(0, 8);
  const moodTags = unique([...known.moodTags, ...model.moodTags.map(clean)])
    .filter((tag) => !rejectTags.some((reject) => mentions(tag, reject)))
    .slice(0, 6);
  return {
    ...known,
    moodTags,
    rejectTags,
    city: sanitizeCity(prompt, known.city || model.city),
    reason: model.reason.trim() || known.reason,
  };
}

const NAME_STOP = new Set(["the", "a", "an", "and", "of"]);

export function confirmsName(query: string, name: string, loose = false): boolean {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q || !n) return false;
  if (q === n) return true;
  const qt = tokens(q).filter((token) => !NAME_STOP.has(token));
  const nt = tokens(n).filter((token) => !NAME_STOP.has(token));
  if (!qt.length || !qt.every((token) => nt.includes(token))) return false;
  if (!loose && qt.length < 2) return false;
  const extra = nt.filter((token) => !qt.includes(token));
  if (extra.length === 0) return true;
  if (!loose) return false;
  return nt.join(" ").startsWith(qt.join(" "));
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

const BARE_CATEGORY = new Set([
  "patisserie",
  "pastry",
  "cafe",
  "coffee",
  "diner",
  "american",
  "restaurant",
  "tea",
  "room",
  "bar",
  "jazz",
  "kissaten",
  "bakery",
  "brunch",
  "shop",
  "kitchen",
  "house",
  "tavern",
  "pub",
  "inn",
  "alehouse",
  "arcade",
]);

/** "Patisserie" or "American Diner" is the category, not a venue. A longer name is specific. */
export function bareCategoryPlace(name: string): boolean {
  const parts = tokens(fold(name)).filter((token) => token !== "the" && token !== "a" && token !== "an");
  return parts.length > 0 && parts.length <= 2 && parts.every((token) => BARE_CATEGORY.has(token));
}

const POURER =
  /\b(restaurantes?|restaurants?|cafes?|coffee|bars?|taverns?|cantinas?|bistros?|diners?|pubs?|lounges?|kitchens?|eateries|grills?)\b/i;

const OFF_THEME_PLACE = /\bsky garden\b|\bmajorelle\b|\bjardin majorelle\b/i;

/** Sky Garden and Jardin Majorelle read as tourist gardens, not a Bridgerton tea. */
export function offThemePlace(name: string): boolean {
  return OFF_THEME_PLACE.test(name);
}

function counterScore(place: TasteEntity, services: Service[]): number {
  if (counterRejected(place.name) || offThemePlace(place.name)) return -1;
  if (!services.includes("bath") && /\b(onsen|sento|bathhouse|bath house|day spa|hot spring)\b/i.test(fold(place.name))) return -1;
  const name = fold(place.name);
  const tags = fold(place.tags.map((tag) => humanizeTagName(tag.name)).join(" "));
  let score = 0;
  for (const service of services) {
    if (SERVICE_NAME[service].test(name)) score += 5;
    else if (SERVICE_TAG[service].test(tags)) score += 2;
  }
  if (score > 0) return score;
  if (!services.length || POURER.test(name) || POURER.test(tags)) return 1;
  return 0;
}

/**
 * The counter is the place that can actually serve the prompt.
 * A diner name outranks a landmark that merely carried the diner tag.
 * When nothing matches the room category, the best non-excluded venue still pours.
 * A church, a hotel, or an unwanted onsen stays at -1 and is left out.
 */
export function rankCounterPlaces(places: TasteEntity[], proposal: Proposal): TasteEntity[] {
  const services = wantedServices(proposal);
  const scored = places.map((place) => ({ place, score: counterScore(place, services) }));
  const positive = scored.filter((row) => row.score > 0);
  const ranked = (positive.length ? positive : scored.filter((row) => row.score >= 0)).sort(
    (a, b) => b.score - a.score || (b.place.affinity ?? -1) - (a.place.affinity ?? -1) || a.place.name.localeCompare(b.place.name),
  );
  const unique = dedupeByName(ranked.map((row) => row.place));
  return unique.filter((place) => !bareCategoryPlace(place.name));
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
  "cocktail bar": ["cocktail lounge", "haunted house"],
  "haunted house": ["pumpkin patch", "cocktail bar"],
  "pumpkin patch": ["haunted house", "cocktail bar"],
  pub: ["inn", "public house"],
  inn: ["pub"],
  arcade: ["pizza place", "diner"],
  "pizza place": ["arcade", "pizzeria"],
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
  if (promptEchoPlace(place.name, prompt) || isLandmark(place.name) || genericVenueName(place.name) || offThemePlace(place.name)) return false;
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

const AESTHETIC = new Set<string>([
  ...FAMILIES.flatMap((family) => family.stems),
  "horror",
  "spooky",
  "halloween",
  "christmas",
  "holiday",
  "football",
  "sports",
  "party",
  "folk",
  "marigold",
  "ofrenda",
  "hearth",
  "fire",
  "fantasy",
  "regency",
  "romance",
  "tavern",
  "pub",
  "arcade",
  "pizza",
  "retro",
  "soundtrack",
  "score",
]);

const AESTHETIC_STOP = new Set(["the", "a", "an", "and", "of", "on", "in", "out", "to", "for"]);

/**
 * A fixture tag has to be a short mood or aesthetic word.
 * "Horror" stays. "Sneaking out of the house", "Bathtub", and "Half a brain" do not.
 */
export function aestheticTag(name: string): boolean {
  const human = humanizeTagName(name).toLowerCase().trim();
  if (!human) return false;
  if (AESTHETIC.has(human)) return true;
  const words = tokens(human).filter((word) => word.length > 1 && !AESTHETIC_STOP.has(word));
  if (!words.length || words.length > 3) return false;
  return words.every((word) => AESTHETIC.has(word));
}

/**
 * Tags that may color a lamp. The tag has to fit the prompt's mood and be an aesthetic word.
 * A plot sentence that happens to contain "house" or "bath" is left out.
 */
export function tagsForRoom(tags: TasteTag[], proposal: Proposal): TasteTag[] {
  const kept = tags.filter((tag) => tagFitsMood(tag.name, proposal) && aestheticTag(tag.name));
  return uniqueTags(kept).slice(0, 8);
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
    const key = fold(row.name).toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (!key || seen.has(row.id) || seen.has(key)) continue;
    seen.add(row.id);
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** One tag per search query, then one per name. "Jazz" four times becomes one Jazz. */
export function chooseSignalTags(rows: { tag: TasteTag; query: string }[], proposal: Proposal): { tags: TasteTag[]; dropped: string[] } {
  const dropped: string[] = [];
  const grouped = new Map<string, { tag: TasteTag; query: string }[]>();
  for (const row of rows) {
    const name = humanizeTagName(row.tag.name);
    if (!tagAllowed(row.tag.name, proposal)) {
      dropped.push(name);
      continue;
    }
    const key = row.query.toLowerCase();
    const list = grouped.get(key) ?? [];
    list.push({ ...row, tag: { ...row.tag, name } });
    grouped.set(key, list);
  }
  const picked: TasteTag[] = [];
  for (const [query, list] of grouped) {
    const exact = list.find((row) => fold(row.tag.name).toLowerCase() === query);
    const chosen = exact ?? list.slice().sort((a, b) => a.tag.name.length - b.tag.name.length || a.tag.name.localeCompare(b.tag.name))[0];
    if (!chosen) continue;
    const nameKey = fold(chosen.tag.name).toLowerCase();
    if (picked.some((tag) => fold(tag.name).toLowerCase() === nameKey)) {
      dropped.push(chosen.tag.name);
      continue;
    }
    picked.push(chosen.tag);
    for (const extra of list) {
      if (extra.tag.id !== chosen.tag.id) dropped.push(extra.tag.name);
    }
    if (picked.length >= 4) break;
  }
  const keptNames = new Set(picked.map((tag) => fold(tag.name).toLowerCase()));
  return { tags: picked, dropped: dropped.filter((name) => !keptNames.has(fold(name).toLowerCase())) };
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
