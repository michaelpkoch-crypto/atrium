import { knownProposal, sceneFromPrompt, windowForScene } from "@/lib/agent/propose";
import { hashString, hslToHex } from "@/lib/atmosphere/color";
import { PLANS, type ObjectKind } from "@/lib/atmosphere/plans";
import { roomSceneSchema, type Atmosphere, type Citation, type RoomScene } from "@/lib/atmosphere/schema";
import type { PlanId, TextureKind, WindowScene } from "@/lib/atmosphere/families";

export type PlainRoom = {
  source: "model" | "stereotype";
  model: string | null;
  note: string;
  title: string;
  logline: string;
  assumptions: string[];
  artists: string[];
  palette: Pick<Atmosphere["palette"], "primary" | "secondary" | "accent" | "ambient" | "ink">;
  room: RoomScene;
  audio: {
    tempoBpm: number;
    texture: TextureKind;
    description: string;
  };
};

export type Comparison = {
  headline: string;
  /** Three to five differences, each said once. The plain assumption is its own line. */
  headlines: string[];
  qlooAdded: { label: string; detail: string }[];
  qlooScored: { label: string; detail: string }[];
  plainAssumed: string[];
  baselineSource: PlainRoom["source"];
  baselineModel: string | null;
};

/** Bridgerton's audience crossover is the insight. Other prompts do not get this sentence. */
export function audienceLine(prompt: string, artists: { name: string; gap?: boolean }[]): string | null {
  if (!/bridgerton/i.test(prompt)) return null;
  const neighbors = artists.filter((artist) => !artist.gap && !/string quartet|bridgerton/i.test(artist.name));
  const preferredOrder = ["Harry Styles", "Olivia Rodrigo", "Troye Sivan", "Halsey"];
  const preferred = preferredOrder.filter((name) => neighbors.some((artist) => artist.name.toLowerCase() === name.toLowerCase()));
  const names = (preferred.length >= 2 ? preferred : neighbors.map((artist) => artist.name)).slice(0, 2);
  if (names.length < 2) return null;
  return `Qloo: Bridgerton fans lean ${names[0]} and ${names[1]}, so the pad is a string-quartet take on modern pop.`;
}

type Pack = {
  id: string;
  keys: string[];
  plan: PlanId;
  window: WindowScene;
  title: string;
  poster: string;
  logline: string;
  assumptions: string[];
  artists: string[];
  colors: string[];
  objects: { kind: ObjectKind; label: string }[];
  tempo: number;
  texture: TextureKind;
};

const PACKS: Pack[] = [
  {
    id: "blade",
    keys: ["blade", "runner", "cyberpunk", "android"],
    plan: "neon",
    window: "neon-city",
    title: "Neon noir",
    poster: "CYBERPUNK",
    logline: "Cyan rain, a saxophone, and a synthesizer that could belong to anyone.",
    assumptions: [
      "cyan neon and rain on every surface",
      "a saxophone, because the prompt said jazz",
      "one unnamed synthesizer score",
      "a trench coat over a chair",
    ],
    artists: ["an unnamed synth composer", "a session saxophonist"],
    colors: ["#39e7ff", "#ff2bd6", "#7aa2ff", "#143044"],
    objects: [
      { kind: "speaker", label: "Unnamed synth" },
      { kind: "chair", label: "Trench coat" },
      { kind: "glass", label: "Generic whiskey" },
    ],
    tempo: 112,
    texture: "rain",
  },
  {
    id: "ghibli",
    keys: ["ghibli", "spirited", "totoro", "howl", "bathhouse"],
    plan: "symmetry",
    window: "day-pastel",
    title: "Soft anime daylight",
    poster: "GHIBLI VIBES",
    logline: "Bright cel green, a solo piano, and a cute spirit. No specific score, no specific bathhouse.",
    assumptions: ["bright cel-shaded green", "a solo piano", "a cute spirit in the corner", "steam and a wooden bucket"],
    artists: ["a solo piano"],
    colors: ["#7dce7a", "#f2d56b", "#8fd0c6", "#f7e7c1"],
    objects: [
      { kind: "plant", label: "Cute spirit" },
      { kind: "bench", label: "Wooden bucket" },
      { kind: "cup", label: "Generic tea" },
    ],
    tempo: 84,
    texture: "air",
  },
  {
    id: "wes",
    keys: ["wes", "anderson", "budapest"],
    plan: "symmetry",
    window: "day-pastel",
    title: "Pink symmetry",
    poster: "QUIRKY",
    logline: "Millennial pink, perfect symmetry, a macaron, and a café with no name.",
    assumptions: ["millennial pink on every wall", "perfect symmetry", "a macaron", "a generic French café"],
    artists: ["a whimsical orchestra"],
    colors: ["#f2a3b3", "#f7d6dc", "#f2c1c8", "#e7b7c4"],
    objects: [
      { kind: "cake", label: "Macaron" },
      { kind: "table", label: "Unnamed café" },
      { kind: "chair", label: "Centered chair" },
    ],
    tempo: 100,
    texture: "air",
  },
  {
    id: "murakami",
    keys: ["murakami", "norwegian", "kafka"],
    plan: "living",
    window: "rain",
    title: "Rain and a cat",
    poster: "A NOVEL",
    logline: "Blue rain, a lost cat, a well, and a jazz record with no artist on the sleeve.",
    assumptions: ["blue rain on the window", "a lost cat", "a well somewhere offscreen", "whiskey and an unnamed jazz record"],
    artists: ["an unnamed jazz record"],
    colors: ["#4c6e8a", "#1d3344", "#c4a574", "#8aa4b5"],
    objects: [
      { kind: "plant", label: "Lost cat" },
      { kind: "book", label: "A famous novel" },
      { kind: "glass", label: "Whiskey" },
    ],
    tempo: 70,
    texture: "rain",
  },
  {
    id: "jazz",
    keys: ["jazz", "vinyl", "lounge"],
    plan: "lounge",
    window: "night-city",
    title: "Amber jazz bar",
    poster: "JAZZ",
    logline: "A dimmer, a saxophone trio, and whiskey. The bar has no name.",
    assumptions: ["amber light and a saxophone", "whiskey by default", "an unnamed trio", "a bar with no name"],
    artists: ["a saxophone trio"],
    colors: ["#e0a15a", "#8a5a32", "#f0d2a8", "#3a2a22"],
    objects: [
      { kind: "bar", label: "Unnamed bar" },
      { kind: "record", label: "Unnamed trio" },
      { kind: "glass", label: "Whiskey" },
    ],
    tempo: 96,
    texture: "vinyl",
  },
  {
    id: "concrete",
    keys: ["brutalist", "concrete"],
    plan: "brutalist",
    window: "day-concrete",
    title: "Grey concrete",
    poster: "CONCRETE",
    logline: "A grey box, a hard shadow, and black coffee.",
    assumptions: ["grey concrete", "one hard shadow", "black coffee", "nothing on the wall"],
    artists: ["silence, or a drone"],
    colors: ["#b7b1a8", "#8d887f", "#d9d3c8", "#6e6a64"],
    objects: [
      { kind: "plinth", label: "Concrete block" },
      { kind: "chair", label: "Hard chair" },
      { kind: "glass", label: "Black coffee" },
    ],
    tempo: 76,
    texture: "air",
  },
];

const DEFAULT_PACK: Pack = {
  id: "default",
  keys: [],
  plan: "living",
  window: "night-city",
  title: "Moody lounge",
  poster: "AMBIENCE",
  logline: "Warm dim light, a popular playlist, and a candle. Nothing is named.",
  assumptions: ["warm dim light", "a popular playlist", "a candle", "a neutral sofa"],
  artists: ["a popular ambient playlist"],
  colors: ["#c4a574", "#8a7058", "#e6d3b3", "#3a3028"],
  objects: [
    { kind: "sofa", label: "Neutral sofa" },
    { kind: "table", label: "Candle" },
    { kind: "plant", label: "Generic plant" },
  ],
  tempo: 80,
  texture: "air",
};

function baselineCitation(name: string, detail: string, index: number): Citation {
  return {
    id: `baseline:${index}:${hashString(name).toString(16)}`,
    name,
    type: "baseline",
    affinity: null,
    detail,
    tag: null,
  };
}

function namedColor(value: string, index: number): string {
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  const table: Record<string, string> = {
    cyan: "#39e7ff",
    blue: "#4c6e8a",
    pink: "#f2a3b3",
    red: "#d45d5d",
    green: "#7dce7a",
    amber: "#e0a15a",
    gold: "#e0b15a",
    purple: "#8b6bb5",
    magenta: "#ff2bd6",
    orange: "#e07a3d",
    yellow: "#f2d56b",
    white: "#f4efe6",
    black: "#1a1614",
    grey: "#8d887f",
    gray: "#8d887f",
  };
  for (const [name, hex] of Object.entries(table)) {
    if (trimmed.includes(name)) return hex;
  }
  return hslToHex(hashString(`${trimmed}:${index}`) % 360, 48, 52);
}

export function sceneFromPlain(args: {
  plan: PlanId;
  window: WindowScene;
  poster: string;
  kicker: string;
  subtitle: string;
  colors: string[];
  objects: { kind: ObjectKind; label: string }[];
  assumptions: string[];
}): RoomScene {
  const plan = PLANS[args.plan];
  const day = args.window === "day-pastel" || args.window === "day-concrete";
  const lights = plan.lights.slice(0, Math.max(3, Math.min(plan.lights.length, args.colors.length + 1))).map((slot, index) => {
    const assumption = args.assumptions[index % args.assumptions.length] ?? "a generic fixture";
    return {
      id: `plain-light-${index}-${slot.kind}`,
      kind: slot.kind,
      x: slot.x,
      y: slot.y,
      x2: slot.x2,
      color: namedColor(args.colors[index % args.colors.length] ?? "#c4a574", index),
      intensity: 0.72,
      flicker: slot.kind === "neon" ? 0.7 : 0.08,
      label: assumption.slice(0, 80),
      citation: baselineCitation(assumption, "Plain reading. This fixture was not chosen from a Qloo entity or tag.", index),
    };
  });
  const objects = args.objects.slice(0, plan.objects.length).map((object, index) => {
    const slot = plan.objects[index];
    return {
      id: `plain-object-${index}-${object.kind}`,
      kind: object.kind,
      x: slot?.x ?? 400 + index * 80,
      y: slot?.y ?? 520,
      label: object.label.slice(0, 80),
      citation: baselineCitation(object.label, "Plain reading. This object was not chosen from a Qloo entity.", 20 + index),
    };
  });
  while (objects.length < 2) {
    const slot = plan.objects[objects.length];
    objects.push({
      id: `plain-object-fill-${objects.length}`,
      kind: slot?.kind ?? "table",
      x: slot?.x ?? 480,
      y: slot?.y ?? 520,
      label: "Generic object",
      citation: baselineCitation("Generic object", "Plain reading. No Qloo entity was consulted.", 40 + objects.length),
    });
  }
  return roomSceneSchema.parse({
    plan: args.plan,
    window: args.window,
    timeLabel: day ? "Day" : args.window === "dusk" ? "Dusk" : args.window === "rain" ? "Rain" : "Night",
    windowBox: plan.windowBox,
    posterBox: plan.posterBox,
    lights,
    objects,
    display: {
      kicker: args.kicker.slice(0, 80),
      title: args.poster.slice(0, 80),
      subtitle: args.subtitle.slice(0, 160),
      citation: baselineCitation(args.poster, "Plain reading. The wall text is a cliché, not a Qloo entity.", 8),
    },
  });
}

function paletteFor(room: RoomScene, window: WindowScene): PlainRoom["palette"] {
  const day = window === "day-pastel" || window === "day-concrete";
  return {
    primary: room.lights[0].color,
    secondary: room.lights[1]?.color ?? room.lights[0].color,
    accent: room.lights[2]?.color ?? room.lights[0].color,
    ambient: day ? "#f3eadf" : "#120f0d",
    ink: day ? "#241c18" : "#f4efe6",
  };
}

function pickPack(prompt: string): Pack {
  const text = prompt.toLowerCase();
  const ranked = PACKS.map((pack) => ({
    pack,
    score: pack.keys.reduce((sum, key) => sum + (text.includes(key) ? 1 : 0), 0),
  }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.pack.id.localeCompare(b.pack.id));
  return ranked[0]?.pack ?? DEFAULT_PACK;
}

export function stereotypeBaseline(prompt: string, note?: string): PlainRoom {
  const pack = pickPack(prompt);
  const window = windowForScene(knownProposal(prompt)?.scene ?? sceneFromPrompt(prompt));
  const room = sceneFromPlain({
    plan: pack.plan,
    window,
    poster: pack.poster,
    kicker: "Plain reading",
    subtitle: "No taste graph",
    colors: pack.colors,
    objects: pack.objects,
    assumptions: pack.assumptions,
  });
  return {
    source: "stereotype",
    model: null,
    note: note ?? "A fixed cliché of the words in the prompt. No taste graph, and no model call.",
    title: pack.title,
    logline: pack.logline,
    assumptions: pack.assumptions,
    artists: pack.artists,
    palette: paletteFor(room, window),
    room,
    audio: {
      tempoBpm: pack.tempo,
      texture: pack.texture,
      description: `${pack.texture} bed at ${pack.tempo} BPM, invented from the prompt with no Qloo artist.`,
    },
  };
}

const WINDOW_PLAN: Record<WindowScene, PlanId> = {
  "neon-city": "neon",
  rain: "rain",
  dusk: "bath",
  "day-pastel": "symmetry",
  "day-concrete": "brutalist",
  "night-city": "lounge",
};

export function plainRoomFromModel(args: {
  model: string;
  title: string;
  logline: string;
  assumptions: string[];
  colors: string[];
  objects: string[];
  artists: string[];
  tempoBpm: number;
  texture: TextureKind;
  window: WindowScene;
}): PlainRoom {
  const assumptions = args.assumptions.map((item) => clip(item, 140)).filter(Boolean).slice(0, 6);
  const safeAssumptions = assumptions.length ? assumptions : ["a generic mood"];
  const objects = args.objects
    .map((label) => ({ kind: guessKind(label), label: clip(label, 80) }))
    .filter((item) => item.label)
    .slice(0, 4);
  while (objects.length < 2) objects.push({ kind: "table", label: "Generic object" });
  const room = sceneFromPlain({
    plan: WINDOW_PLAN[args.window],
    window: args.window,
    poster: clip(args.title, 40) || "MOOD",
    kicker: "Plain model",
    subtitle: "No Qloo tools",
    colors: args.colors.length ? args.colors : ["#c4a574", "#8a7058"],
    objects,
    assumptions: safeAssumptions,
  });
  const tempo = Math.max(48, Math.min(140, Math.round(args.tempoBpm) || 80));
  return {
    source: "model",
    model: args.model,
    note: `Written by ${args.model} from the prompt alone. This call had no Qloo tools.`,
    title: clip(args.title, 80) || "Plain reading",
    logline: clip(args.logline, 280) || "A generic room from the prompt, with no taste graph.",
    assumptions: safeAssumptions,
    artists: args.artists.map((artist) => clip(artist, 80)).filter(Boolean).slice(0, 4),
    palette: paletteFor(room, args.window),
    room,
    audio: {
      tempoBpm: tempo,
      texture: args.texture,
      description: `${args.texture} bed at ${tempo} BPM, written by the model with no Qloo artist.`,
    },
  };
}

function guessKind(label: string): ObjectKind {
  const text = label.toLowerCase();
  if (/sax|record|vinyl|piano|speaker/.test(text)) return "record";
  if (/bar|counter/.test(text)) return "bar";
  if (/book|novel/.test(text)) return "book";
  if (/cat|plant|spirit|flower/.test(text)) return "plant";
  if (/cake|macaron|pastry/.test(text)) return "cake";
  if (/coffee|tea|cup/.test(text)) return "cup";
  if (/whiskey|whisky|glass|drink|wine/.test(text)) return "glass";
  if (/bottle/.test(text)) return "bottle";
  if (/chair|coat/.test(text)) return "chair";
  if (/sofa|couch/.test(text)) return "sofa";
  if (/bath|tub|bucket/.test(text)) return "tub";
  if (/bench/.test(text)) return "bench";
  if (/concrete|plinth|block/.test(text)) return "plinth";
  return "table";
}

function assumptionPhrase(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim().replace(/[.?!]+$/g, "");
  if (!text) text = "a generic mood";
  text = text.charAt(0).toLowerCase() + text.slice(1);
  return `The plain reading assumed "${text}".`;
}

function clip(value: string, max: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function mentioned(name: string, blob: string): boolean {
  const needle = name.toLowerCase().trim();
  if (needle.length < 3) return false;
  return blob.toLowerCase().includes(needle);
}

export function compareRooms(prompt: string, atmosphere: Atmosphere, plain: PlainRoom): Comparison {
  const blob = [plain.title, plain.logline, ...plain.assumptions, ...plain.artists, ...plain.room.objects.map((item) => item.label), plain.room.display.title]
    .join(" \n ");
  const added: { label: string; detail: string }[] = [];
  const scored: { label: string; detail: string }[] = [];
  const push = (name: string, detail: string) => {
    if (!name || name.startsWith("No ")) return;
    if (mentioned(name, prompt)) return;
    const row = { label: name, detail };
    if (mentioned(name, blob)) {
      if (!scored.some((item) => item.label === name)) scored.push(row);
      return;
    }
    if (!added.some((item) => item.label === name)) added.push(row);
  };

  const addedDetail = (kind: string, affinity: number | null) => {
    const score = affinity == null ? "Kept after Qloo confirmed the name" : `Qloo affinity ${affinity.toFixed(2)}`;
    return `${kind}. ${score}.`;
  };
  for (const drink of atmosphere.drinks) {
    if (drink.gap) continue;
    push(drink.venue, addedDetail(`Place that sets the counter, pouring ${drink.name}`, drink.affinity));
  }
  for (const seed of atmosphere.seeds) push(seed.name, addedDetail("Work or person confirmed by /search", null));
  for (const artist of atmosphere.music) {
    if (artist.gap) continue;
    push(artist.name, addedDetail("Artist sitting next to the confirmed seeds", artist.affinity));
  }
  for (const book of atmosphere.reading) push(book.name, addedDetail("Book on the table", book.affinity));
  for (const movie of atmosphere.pictures) push(movie.name, addedDetail("Picture on the wall", movie.affinity));
  for (const light of atmosphere.room.lights) {
    if (!light.citation.tag) continue;
    push(light.citation.tag, `Tag on ${light.citation.name} sets a ${light.kind.replace("-", " ")}`);
  }

  const qlooAdded = added.slice(0, 6);
  const qlooScored = scored.slice(0, 3);
  const assumption = assumptionPhrase(plain.assumptions[0] ?? "a generic mood");
  const headlines: string[] = [];
  const audience = audienceLine(
    prompt,
    atmosphere.music.map((row) => ({ name: row.name, gap: row.gap })),
  );
  if (audience) headlines.push(audience);
  const drink = atmosphere.drinks.find((row) => !row.gap);
  if (drink && !mentioned(drink.venue, prompt)) headlines.push(`${drink.venue} pours ${drink.name}.`);
  const tempoArtist = atmosphere.music.find((row) => !row.gap);
  if (tempoArtist && !mentioned(tempoArtist.name, prompt)) {
    headlines.push(`${tempoArtist.name} sets the tempo at ${atmosphere.audio.tempoBpm} BPM.`);
  }
  const missed = qlooAdded.find((item) => item.label !== drink?.venue && item.label !== tempoArtist?.name);
  if (missed) headlines.push(`${missed.label} is in the room. The plain reading did not name it.`);
  const lamp = atmosphere.room.lights.find((light) => light.citation.tag)?.citation.tag;
  if (lamp && headlines.length < 4) headlines.push(`${lamp} colors the lamps.`);
  const lines = [...headlines.slice(0, 4), assumption];

  return {
    headline: lines[0] ?? assumption,
    headlines: lines.slice(0, 5),
    qlooAdded,
    qlooScored,
    plainAssumed: plain.assumptions,
    baselineSource: plain.source,
    baselineModel: plain.model,
  };
}
