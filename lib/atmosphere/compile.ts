import { hslToHex, circularMean, hashString, hueDistance } from "@/lib/atmosphere/color";
import { atmosphereSchema, type Atmosphere, type Citation, type VisualMode } from "@/lib/atmosphere/schema";
import type { TasteEntity, TasteGraph } from "@/lib/qloo/types";

type HueVote = {
  hue: number;
  sat: number;
  weight: number;
  label: string;
  citation: Citation;
};

type ModeVote = { mode: VisualMode; weight: number; citation: Citation };

const HUE_LEXICON: { keys: string[]; hue: number; sat: number; label: string }[] = [
  { keys: ["jazz", "brass", "vinyl", "whiskey", "whisky", "lounge"], hue: 32, sat: 62, label: "amber brass" },
  { keys: ["neon", "android", "noir", "synthesizer"], hue: 186, sat: 70, label: "sodium cyan" },
  { keys: ["rain", "rainy", "monsoon"], hue: 214, sat: 42, label: "rain blue" },
  { keys: ["pastel", "symmetry", "brunch", "pastry", "pink"], hue: 348, sat: 48, label: "pastry pink" },
  { keys: ["literature", "novel", "paper"], hue: 38, sat: 26, label: "lamp paper" },
  { keys: ["disco", "funk"], hue: 322, sat: 68, label: "mirror magenta" },
  { keys: ["brutalist", "concrete"], hue: 28, sat: 8, label: "board-formed concrete" },
  { keys: ["bathhouse", "tea", "ghibli", "anime", "dusk"], hue: 156, sat: 34, label: "bathhouse green" },
  { keys: ["japan", "kissaten"], hue: 228, sat: 24, label: "indigo cloth" },
  { keys: ["electronic", "ambient"], hue: 262, sat: 36, label: "violet air" },
];

const MODE_LEXICON: { mode: VisualMode; keys: string[] }[] = [
  { mode: "rain", keys: ["rain", "rainy", "monsoon", "storm"] },
  { mode: "neon-grid", keys: ["neon", "android", "noir", "synthesizer", "techno"] },
  { mode: "symmetry", keys: ["symmetry", "pastel", "brunch", "pastry"] },
  { mode: "grain-warm", keys: ["jazz", "vinyl", "whiskey", "whisky", "lounge", "disco", "funk"] },
  { mode: "paper", keys: ["literature", "novel", "paper"] },
  { mode: "brutalist", keys: ["brutalist", "concrete"] },
];

const MODE_SCALE: Record<VisualMode, Atmosphere["audio"]["scale"]> = {
  rain: "minor-pentatonic",
  "neon-grid": "phrygian",
  symmetry: "lydian",
  "grain-warm": "dorian",
  paper: "minor-pentatonic",
  brutalist: "mixolydian",
};

const TEMPO_HINTS: { keys: string[]; bpm: number }[] = [
  { keys: ["ambient", "rain", "literature", "novel", "tea", "bathhouse"], bpm: 66 },
  { keys: ["jazz", "vinyl", "lounge", "brunch"], bpm: 92 },
  { keys: ["disco", "funk"], bpm: 118 },
  { keys: ["neon", "android", "noir", "electronic"], bpm: 102 },
  { keys: ["brutalist", "concrete"], bpm: 76 },
];

const DRINK_RULES: { keys: string[]; name: string }[] = [
  { keys: ["kissaten", "whiskey", "whisky"], name: "Whiskey highball" },
  { keys: ["whiskey", "whisky", "jazz", "lounge", "vinyl"], name: "Rye old fashioned" },
  { keys: ["brunch", "pastry", "pastel"], name: "Grapefruit spritz" },
  { keys: ["cafe", "coffee", "tea"], name: "Cardamom cortado" },
  { keys: ["disco", "funk"], name: "Campari soda" },
  { keys: ["noodles"], name: "Cold barley tea" },
  { keys: ["cocktail", "bar"], name: "Smoked mezcal soda" },
  { keys: ["bathhouse", "tea", "ghibli"], name: "Hojicha" },
  { keys: ["brutalist", "concrete"], name: "Black coffee" },
];

const DECOR_RULES: { keys: string[]; item: string }[] = [
  { keys: ["neon", "android", "noir"], item: "A sodium-vapor tube along the window mullion" },
  { keys: ["jazz", "vinyl", "lounge"], item: "A walnut hi-fi with the dust cover left off" },
  { keys: ["whiskey", "whisky", "bar", "cocktail"], item: "A short heavy glass and a single large cube" },
  { keys: ["symmetry", "pastel", "brunch", "pastry"], item: "Pink linen, centered, and a cake stand with one cake" },
  { keys: ["literature", "novel", "paper"], item: "A lamp pool no wider than the open book" },
  { keys: ["rain", "rainy"], item: "A window that stays in the frame" },
  { keys: ["bathhouse", "tea", "ghibli", "anime"], item: "Steam, a cedar slat, and one paper lantern" },
  { keys: ["disco", "funk"], item: "A mirror ball hung low enough to touch" },
  { keys: ["brutalist", "concrete"], item: "A board-formed plinth doing the job of a table" },
  { keys: ["noodles", "japan", "kissaten"], item: "A noren in the doorway and nothing else on the wall" },
  { keys: ["fashion", "pastel"], item: "One textile, hung flat, instead of a poster" },
];

const MODE_FILL: Record<VisualMode, [string, string]> = {
  rain: ["The sill is wide enough for a glass", "Nothing bright sits higher than the lamp"],
  "neon-grid": ["The horizon line stays at eye level", "Reflections are allowed; daylight is not"],
  symmetry: ["Objects only appear in pairs", "The chair faces the center of the table"],
  "grain-warm": ["The dimmer stops at the color of the booth", "A second chair is there if someone stays"],
  paper: ["The rest of the room is darker than the page", "The chair does not face the window"],
  brutalist: ["Nothing is on the wall that is not structural", "The floor is the same material as the table"],
};

const ROOTS = [110, 130.81, 146.83, 164.81, 196];
const RATIOS: Record<Atmosphere["audio"]["scale"], number[]> = {
  "minor-pentatonic": [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5],
  dorian: [1, 9 / 8, 4 / 3, 3 / 2, 5 / 3],
  lydian: [1, 9 / 8, 5 / 4, 3 / 2, 7 / 4],
  phrygian: [1, 16 / 15, 4 / 3, 3 / 2, 9 / 5],
  mixolydian: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3],
};

function tokenSet(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

function matches(text: string, words: Set<string>, key: string): boolean {
  if (key.includes(" ")) return text.includes(key);
  return words.has(key);
}

function dedupe(entities: TasteEntity[]): TasteEntity[] {
  const map = new Map<string, TasteEntity>();
  for (const entity of entities) {
    const current = map.get(entity.id);
    if (!current || (entity.affinity ?? -1) > (current.affinity ?? -1)) map.set(entity.id, entity);
  }
  return [...map.values()];
}

function byAffinity(a: TasteEntity, b: TasteEntity): number {
  return (b.affinity ?? -1) - (a.affinity ?? -1) || a.id.localeCompare(b.id);
}

function weightOf(entity: TasteEntity, seedIds: Set<string>): number {
  if (seedIds.has(entity.id)) return 0.92;
  if (entity.affinity != null) return 0.35 + entity.affinity * 0.65;
  return 0.4;
}

function cite(entity: TasteEntity, detail: string): Citation {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    affinity: entity.affinity,
    detail,
  };
}

export function affinityWhy(entity: TasteEntity, seeds: TasteEntity[]): string {
  if (entity.explainers.length) {
    const parts = entity.explainers.slice(0, 3).map((item) => {
      const seed = seeds.find((candidate) => candidate.id === item.id);
      const name = seed?.name ?? item.name;
      return `${name} (${item.score.toFixed(2)})`;
    });
    return `Qloo explainability credits ${parts.join(", ")}.`;
  }
  const affinity = entity.affinity == null ? "unscored" : entity.affinity.toFixed(2);
  const from = seeds.map((seed) => seed.name).slice(0, 3).join(", ");
  return from
    ? `Cross-domain affinity ${affinity} from ${from} via signal.interests.entities.`
    : `Affinity ${affinity} from the tag signals passed to /v2/insights.`;
}

function entityText(entity: TasteEntity): { text: string; words: Set<string> } {
  const text = `${entity.name} ${entity.tags.map((tag) => tag.name).join(" ")}`.toLowerCase();
  return { text, words: tokenSet(text) };
}

export function compileAtmosphere(prompt: string, graph: TasteGraph): Atmosphere {
  const seeds = dedupe(graph.seeds).sort(byAffinity);
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const artists = dedupe(graph.artists).sort(byAffinity);
  const places = dedupe(graph.places).sort(byAffinity);
  const brands = dedupe(graph.brands).sort(byAffinity);
  const books = dedupe([...graph.books, ...seeds.filter((seed) => seed.type.includes("book"))]).sort(byAffinity);
  const movies = dedupe(graph.movies).filter((movie) => !seedIds.has(movie.id)).sort(byAffinity);
  const pool = dedupe([...seeds, ...artists, ...places, ...brands, ...books, ...movies]);
  if (!pool.length) {
    throw new Error("Cannot compile an atmosphere without Qloo entities or tags to cite.");
  }

  const anchor = pool.slice().sort(byAffinity)[0];
  const hueVotes: HueVote[] = [];
  const modeVotes: ModeVote[] = [];
  const tempoVotes: { bpm: number; weight: number; citation: Citation }[] = [];

  for (const entity of pool) {
    const weight = weightOf(entity, seedIds);
    const { text, words } = entityText(entity);
    for (const row of HUE_LEXICON) {
      const hit = row.keys.find((key) => matches(text, words, key));
      if (!hit) continue;
      hueVotes.push({
        hue: row.hue,
        sat: row.sat,
        weight,
        label: row.label,
        citation: cite(entity, `Tag or name “${hit}” on ${entity.name} maps to ${row.label}.`),
      });
    }
    for (const row of MODE_LEXICON) {
      const hit = row.keys.find((key) => matches(text, words, key));
      if (!hit) continue;
      modeVotes.push({
        mode: row.mode,
        weight,
        citation: cite(entity, `“${hit}” on ${entity.name} selected the ${row.mode} room.`),
      });
    }
    for (const row of TEMPO_HINTS) {
      const hit = row.keys.find((key) => matches(text, words, key));
      if (!hit) continue;
      tempoVotes.push({
        bpm: row.bpm,
        weight,
        citation: cite(entity, `“${hit}” on ${entity.name} sets the pulse near ${row.bpm} BPM.`),
      });
    }
  }

  if (!hueVotes.length) {
    const hue = hashString(anchor.id) % 360;
    hueVotes.push({
      hue,
      sat: 46,
      weight: 1,
      label: "entity hash",
      citation: cite(
        anchor,
        `No aesthetic tag matched the palette lexicon. The hue is a stable hash of ${anchor.name} (${anchor.id}).`,
      ),
    });
  }

  hueVotes.sort((a, b) => b.weight - a.weight || a.citation.id.localeCompare(b.citation.id) || a.label.localeCompare(b.label));
  const primaryHue = circularMean(hueVotes.map((vote) => ({ hue: vote.hue, weight: vote.weight })));
  const primarySat = clamp(
    hueVotes.reduce((sum, vote) => sum + vote.sat * vote.weight, 0) /
      hueVotes.reduce((sum, vote) => sum + vote.weight, 0),
    22,
    74,
  );
  const accentVote =
    hueVotes.find((vote) => hueDistance(vote.hue, primaryHue) > 36) ??
    hueVotes[Math.min(1, hueVotes.length - 1)];
  const mode = pickMode(modeVotes, anchor);
  const ambientLight = mode === "symmetry" ? 78 : mode === "paper" ? 20 : mode === "brutalist" ? 24 : 12;
  const ink = ambientLight > 50 ? "#241c18" : "#f4efe6";

  const primary = hslToHex(primaryHue, primarySat, mode === "symmetry" ? 62 : 48);
  const secondary = hslToHex((primaryHue + 22) % 360, primarySat * 0.72, mode === "symmetry" ? 78 : 64);
  const accent = hslToHex(accentVote.hue, Math.min(78, accentVote.sat + 6), mode === "symmetry" ? 46 : 58);
  const ambient = hslToHex(primaryHue, primarySat * 0.45, ambientLight);

  const paletteCitation = hueVotes[0].citation;
  const reasons = [
    {
      role: "primary" as const,
      hex: primary,
      because: `${paletteCitation.name} pulled the blend toward ${hueVotes[0].label}.`,
      citation: paletteCitation,
    },
    {
      role: "secondary" as const,
      hex: secondary,
      because: "Secondary sits 22° off the blended hue so the wall and the lamp are not the same paint.",
      citation: paletteCitation,
    },
    {
      role: "accent" as const,
      hex: accent,
      because: `${accentVote.citation.name} holds the opposing stop (${accentVote.label}).`,
      citation: accentVote.citation,
    },
    {
      role: "ambient" as const,
      hex: ambient,
      because: "Ambient is that hue, dropped so the brighter stops have somewhere to sit.",
      citation: paletteCitation,
    },
  ];

  const tempo = tempoVotes.length
    ? clamp(
        Math.round(
          tempoVotes.reduce((sum, vote) => sum + vote.bpm * vote.weight, 0) /
            tempoVotes.reduce((sum, vote) => sum + vote.weight, 0),
        ),
        48,
        140,
      )
    : clamp(72 + (hashString(anchor.id) % 18), 48, 140);
  const tempoCitation = tempoVotes.sort((a, b) => b.weight - a.weight || a.citation.id.localeCompare(b.citation.id))[0]
    ?.citation ?? cite(anchor, `Tempo falls back to a hash of ${anchor.name} because no tempo tag matched.`);
  const scale = MODE_SCALE[mode];
  const root = ROOTS[hashString((artists[0] ?? anchor).id) % ROOTS.length];
  const frequencies = [round2(root / 2), ...RATIOS[scale].map((ratio) => round2(root * ratio))].slice(0, 6);
  const noise = mode === "rain" || mode === "neon-grid" ? 0.42 : mode === "grain-warm" ? 0.3 : 0.16;
  const filterHz = mode === "neon-grid" ? 1680 : mode === "paper" ? 640 : mode === "symmetry" ? 1240 : 920;

  const music = artists.slice(0, 4).map((artist) => ({
    name: artist.name,
    entityId: artist.id,
    affinity: artist.affinity,
    why: affinityWhy(artist, seeds),
    tags: artist.tags.map((tag) => tag.name),
    gap: false,
  }));
  if (!music.length) {
    music.push({
      name: "No artist affinities",
      entityId: anchor.id,
      affinity: null,
      why: `Qloo returned no urn:entity:artist rows for these signals, so there is no playlist. The texture still follows ${anchor.name}.`,
      tags: [],
      gap: true,
    });
  }

  const drinks = places.slice(0, 3).map((place) => {
    const { text, words } = entityText(place);
    let best: { name: string; hits: number } | null = null;
    for (const rule of DRINK_RULES) {
      const hits = rule.keys.filter((key) => matches(text, words, key)).length;
      if (hits > 0 && (!best || hits > best.hits)) best = { name: rule.name, hits };
    }
    const name = best?.name ?? `House pour at ${place.name}`;
    const because = best
      ? `${best.hits} tag${best.hits === 1 ? "" : "s"} on ${place.name} selected ${name}.`
      : `No drink rule matched ${place.name}, so the venue itself is the recommendation.`;
    return {
      name,
      venue: place.name,
      venueId: place.id,
      affinity: place.affinity,
      because,
      citation: cite(place, because),
      gap: false,
    };
  });
  if (!drinks.length) {
    const because = "Qloo returned no urn:entity:place rows, so the bar is unset.";
    drinks.push({
      name: "No bar affinities",
      venue: "—",
      venueId: anchor.id,
      affinity: null,
      because,
      citation: cite(anchor, because),
      gap: true,
    });
  }

  const decor: Atmosphere["decor"] = [];
  const seenDecor = new Set<string>();
  const pushDecor = (item: string, because: string, citation: Citation) => {
    if (seenDecor.has(item) || decor.length >= 4) return;
    seenDecor.add(item);
    decor.push({ item, because, citation });
  };

  for (const brand of brands.slice(0, 2)) {
    const because = `${brand.name} is a brand affinity, so it is in the room as an object rather than a logo wall.`;
    const article = /^[aeiou]/i.test(brand.name) ? "An" : "A";
    pushDecor(`${article} ${brand.name} object, used once`, because, cite(brand, because));
  }
  for (const entity of pool) {
    const { text, words } = entityText(entity);
    for (const rule of DECOR_RULES) {
      const hit = rule.keys.find((key) => matches(text, words, key));
      if (!hit) continue;
      const because = `“${hit}” on ${entity.name} selected this object.`;
      pushDecor(rule.item, because, cite(entity, because));
    }
  }
  const modeCitation = modeVotes.sort((a, b) => b.weight - a.weight || a.citation.id.localeCompare(b.citation.id))[0]
    ?.citation ?? cite(anchor, `Room mode fell back from ${anchor.name}.`);
  for (const line of MODE_FILL[mode]) {
    pushDecor(line, `Filled from the ${mode} room, which was chosen by ${modeCitation.name}.`, modeCitation);
  }

  const imageEntity = pool.filter((entity) => entity.imageUrl).sort(byAffinity)[0];
  const artwork = imageEntity?.imageUrl
    ? {
        kind: "entity-image" as const,
        caption: imageEntity.name,
        imageUrl: imageEntity.imageUrl,
        citation: cite(imageEntity, `Image URL from the Qloo entity record for ${imageEntity.name}.`),
      }
    : {
        kind: "generative" as const,
        caption: `Generative ${mode} field colored by ${modeCitation.name}.`,
        imageUrl: null,
        citation: modeCitation,
      };

  const safePrompt = prompt.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  const titleNames = seeds.map((seed) => seed.name).slice(0, 2);
  const tagName = graph.tags
    .map((tag) => tag.name)
    .find((name) => !titleNames.some((titleName) => titleName.toLowerCase().includes(name.toLowerCase())));
  const title =
    titleNames.length === 2
      ? `${titleNames[0]} × ${titleNames[1]}`
      : titleNames.length === 1 && tagName
        ? `${titleNames[0]} × ${tagName}`
        : titleNames[0] || anchor.name;
  const seedList = seeds.map((seed) => seed.name).join(", ") || "tag signals only";
  const logline = `“${safePrompt}” resolved to ${seedList}. Light follows ${paletteCitation.name}; the bar follows ${drinks[0]?.venue ?? "no place"}; the pulse follows ${tempoCitation.name}.`;

  const note = graph.synthetic
    ? "MOCK TASTE GRAPH. No fixture matched this prompt, so Atrium synthesized a labeled stand-in from the prompt text. These are not Qloo records. Set QLOO_API_KEY to compile from the live taste graph."
    : graph.source === "mock"
      ? "MOCK TASTE GRAPH. Entities and affinities are local fixtures, not responses from hackathon.api.qloo.com. Set QLOO_API_KEY to switch this room to live Qloo."
      : "Live Qloo taste graph. Search, tag, and insights calls ran against the hackathon API, and every choice below cites one of those entities.";

  const atmosphere: Atmosphere = {
    version: 1,
    prompt: safePrompt,
    title: title.slice(0, 300),
    logline,
    provenance: {
      source: graph.source === "mock" ? "mock" : "qloo",
      mockLabeled: graph.source === "mock",
      synthetic: graph.synthetic,
      note,
    },
    signals: {
      entityIds: [...graph.signalEntityIds],
      tagIds: [...graph.signalTagIds],
    },
    seeds: seeds.map((seed) => ({
      id: seed.id,
      name: seed.name,
      type: seed.type,
      tags: seed.tags.map((tag) => tag.name),
    })),
    visual: { mode, artwork },
    palette: { primary, secondary, accent, ambient, ink, reasons },
    audio: {
      tempoBpm: tempo,
      scale,
      rootHz: root,
      frequencies,
      noise,
      filterHz,
      description: `${scale.replace("-", " ")} pad at ${tempo} BPM, rooted near ${root} Hz, cited from ${tempoCitation.name}.`,
      citation: tempoCitation,
    },
    music,
    drinks,
    decor: decor.slice(0, 4),
    reading: books.slice(0, 4).map((book) => ({
      name: book.name,
      entityId: book.id,
      affinity: book.affinity,
      why: seedIds.has(book.id) ? "Resolved from the prompt as a seed entity." : affinityWhy(book, seeds),
      tags: book.tags.map((tag) => tag.name),
    })),
    pictures: movies.slice(0, 4).map((movie) => ({
      name: movie.name,
      entityId: movie.id,
      affinity: movie.affinity,
      why: affinityWhy(movie, seeds),
      tags: movie.tags.map((tag) => tag.name),
    })),
  };

  return atmosphereSchema.parse(atmosphere);
}

function pickMode(votes: ModeVote[], anchor: TasteEntity): VisualMode {
  if (!votes.length) {
    const order: VisualMode[] = ["grain-warm", "paper", "rain", "neon-grid", "symmetry", "brutalist"];
    return order[hashString(anchor.id) % order.length];
  }
  return votes.slice().sort((a, b) => b.weight - a.weight || a.mode.localeCompare(b.mode) || a.citation.id.localeCompare(b.citation.id))[0]
    .mode;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
