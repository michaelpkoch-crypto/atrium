import { bedPhrase, channelScene, displayEffectFor, lightFlicker, type ScreenKind } from "@/lib/atmosphere/channels";
import { hslToHex, hashString, mixHex } from "@/lib/atmosphere/color";
import { audienceLine } from "@/lib/atmosphere/baseline";
import { fallbackPour, pourFor } from "@/lib/atmosphere/drinks";
import { eraAmbient, eraChipLabel, eraCitation, forceGlobe, gradeHex } from "@/lib/atmosphere/era";
import { matchFamily, type Family, type LightBias, type PlanId, type ScaleName, type TextureKind, type WindowScene } from "@/lib/atmosphere/families";
import { aestheticTag, bareCategoryPlace, eraFromPrompt, labelForScene, offThemePlace, sceneFromPrompt, type Era, type SceneMood } from "@/lib/agent/propose";
import { PLANS, type ObjectKind, type ObjectRole, type ObjectSlot } from "@/lib/atmosphere/plans";
import { atmosphereSchema, type Atmosphere, type Citation, type VisualMode } from "@/lib/atmosphere/schema";
import type { TasteEntity, TasteGraph, TasteTag } from "@/lib/qloo/types";

type Signal = {
  key: string;
  tag: string | null;
  entity: TasteEntity;
  weight: number;
  hue: number;
  sat: number;
  family: Family | null;
  bias: LightBias;
  affinity: number | null;
};

const ROOTS = [110, 130.81, 146.83, 164.81, 196];
const RATIOS: Record<ScaleName, number[]> = {
  "minor-pentatonic": [1, 6 / 5, 4 / 3, 3 / 2, 9 / 5],
  dorian: [1, 9 / 8, 4 / 3, 3 / 2, 5 / 3],
  lydian: [1, 9 / 8, 5 / 4, 3 / 2, 7 / 4],
  phrygian: [1, 16 / 15, 4 / 3, 3 / 2, 9 / 5],
  mixolydian: [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3],
};

const TEXTURE_LABEL: Record<TextureKind, string> = {
  rain: "Rain on the glass",
  vinyl: "Vinyl crackle",
  water: "Water",
  crowd: "Room murmur",
  air: "Room tone",
  steam: "Steam",
  tape: "Tape hiss",
};

const NOISE: Record<TextureKind, number> = {
  rain: 0.55,
  vinyl: 0.34,
  water: 0.36,
  crowd: 0.42,
  air: 0.12,
  steam: 0.38,
  tape: 0.22,
};

const FILTER: Record<TextureKind, number> = {
  rain: 2400,
  vinyl: 1800,
  water: 700,
  crowd: 640,
  air: 900,
  steam: 1100,
  tape: 3400,
};

function dedupe(entities: TasteEntity[]): TasteEntity[] {
  const map = new Map<string, TasteEntity>();
  for (const entity of entities) {
    const current = map.get(entity.id);
    if (!current || (entity.affinity ?? -1) > (current.affinity ?? -1)) map.set(entity.id, entity);
  }
  const seen = new Set<string>();
  const out: TasteEntity[] = [];
  for (const entity of map.values()) {
    const key = entity.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(entity);
  }
  return out;
}

function byAffinity(a: TasteEntity, b: TasteEntity): number {
  return (b.affinity ?? -1) - (a.affinity ?? -1) || a.id.localeCompare(b.id);
}

function weightOf(entity: TasteEntity, seedIds: Set<string>): number {
  if (seedIds.has(entity.id)) return 0.92;
  if (entity.affinity != null) return 0.35 + clamp01(entity.affinity) * 0.65;
  return 0.4;
}

function clamp01(value: number): number {
  if (value > 1 && value <= 100) return value / 100;
  return Math.max(0, Math.min(1, value));
}

function clampAffinity(value: number | null | undefined): number | null {
  if (value == null || Number.isNaN(value)) return null;
  return clamp01(value);
}

export function cite(entity: TasteEntity, detail: string, tag?: string | null): Citation {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    affinity: clampAffinity(entity.affinity),
    detail,
    tag: tag ?? null,
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
  const from = seeds
    .map((seed) => seed.name)
    .slice(0, 3)
    .join(", ");
  const affinity = entity.affinity == null ? null : clamp01(entity.affinity).toFixed(2);
  if (affinity == null) {
    return from
      ? `Cross-domain row from ${from} via signal.interests.entities.`
      : `From the tag signals passed to /v2/insights.`;
  }
  return from
    ? `Cross-domain affinity ${affinity} from ${from} via signal.interests.entities.`
    : `Affinity ${affinity} from the tag signals passed to /v2/insights.`;
}

function collectSignals(pool: TasteEntity[], tags: TasteTag[], seedIds: Set<string>): Signal[] {
  const best = new Map<string, Signal>();
  const consider = (entity: TasteEntity, tag: { id: string; name: string } | null, affinity: number | null) => {
    const family = tag ? matchFamily(tag.name) : matchFamily(entity.name);
    const lead = seedIds.has(entity.id) ? 1.15 : 1;
    const priority = family?.priority ?? 0.82;
    const weight = weightOf(entity, seedIds) * lead * priority;
    const key = tag ? `tag:${tag.id}` : `entity:${entity.id}`;
    const jitterKey = tag?.id ?? entity.id;
    const hue = family
      ? (family.hue + (hashString(jitterKey) % 36) - 18 + 360) % 360
      : hashString(jitterKey) % 360;
    const sat = family ? clamp(family.sat + ((hashString(`${jitterKey}:sat`) % 13) - 6), 22, 88) : 42;
    const signal: Signal = {
      key,
      tag: tag?.name ?? null,
      entity,
      weight,
      hue,
      sat,
      family,
      bias: family?.bias ?? "open",
      affinity: clampAffinity(affinity ?? entity.affinity),
    };
    const previous = best.get(key);
    if (!previous || signal.weight > previous.weight || (signal.weight === previous.weight && signal.entity.id < previous.entity.id)) {
      best.set(key, signal);
    }
  };

  for (const entity of pool) {
    const aesthetic = entity.tags.filter((tag) => aestheticTag(tag.name));
    if (!aesthetic.length) consider(entity, null, entity.affinity);
    for (const tag of aesthetic) consider(entity, tag, entity.affinity);
  }
  for (const tag of tags) {
    if (!aestheticTag(tag.name)) continue;
    const host = pool.find((entity) => entity.tags.some((item) => item.id === tag.id)) ?? pool[0];
    if (host) consider(host, tag, tag.affinity ?? host.affinity);
  }

  return [...best.values()].sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key));
}

function isSetting(signal: Signal, seedIds: Set<string>): boolean {
  if (seedIds.has(signal.entity.id)) return true;
  const type = signal.entity.type;
  return type.includes("place") || type.includes("book") || type.includes("movie") || type.includes("tv");
}

function windowFor(scene: SceneMood, family: Family | null): WindowScene {
  if (scene.time === "day") return family?.plan === "brutalist" ? "day-concrete" : "day-pastel";
  if (scene.time === "dusk") return "dusk";
  if (scene.weather === "rain") return "rain";
  if (family?.id === "neon" || family?.window === "neon-city") return "neon-city";
  return "night-city";
}

function dominantFamily(signals: Signal[]): Family | null {
  const scores = new Map<string, { family: Family; score: number }>();
  for (const signal of signals) {
    if (!signal.family) continue;
    const current = scores.get(signal.family.id);
    const score = (current?.score ?? 0) + signal.weight;
    scores.set(signal.family.id, { family: signal.family, score });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score || a.family.id.localeCompare(b.family.id))[0]?.family ?? null;
}

function signalDetail(signal: Signal, fixture: string): string {
  const score = signal.affinity == null ? "" : ` (affinity ${signal.affinity.toFixed(2)})`;
  if (signal.tag && signal.family) {
    return `Qloo tag “${signal.tag}” on ${signal.entity.name}${score} colors this ${fixture}.`;
  }
  if (signal.tag) {
    return `Qloo tag “${signal.tag}” on ${signal.entity.name}${score} colors this ${fixture}.`;
  }
  return `${signal.entity.name}${score} colors this ${fixture}.`;
}

/** A tub is a bathhouse. A restaurant, even in a Ghibli room, stays a table. */
export function placeObjectKind(entity: { name: string; tags: { name: string }[] }, fallback: ObjectKind): ObjectKind {
  const blob = `${entity.name} ${entity.tags.map((tag) => tag.name).join(" ")}`;
  if (/\b(onsen|sento|bathhouse|bath house|hot spring|day spa)\b/i.test(blob)) return "tub";
  if (/\b(bar|tavern|pub|lounge|cantina)\b/i.test(blob)) return "bar";
  const family = entity.tags.map((tag) => matchFamily(tag.name)?.id).find(Boolean);
  if (family === "concrete") return "plinth";
  if (family === "jazz" || family === "bar" || family === "disco") return "bar";
  if (family === "pastel" || family === "cafe" || family === "rain" || family === "paper") return "table";
  if (fallback === "tub") return "table";
  return fallback;
}

function brandKind(entity: TasteEntity, fallback: ObjectKind): ObjectKind {
  const family = entity.tags.map((tag) => matchFamily(tag.name)?.id).find(Boolean);
  if (family === "jazz" || family === "disco") return "record";
  if (family === "bar" || family === "cafe") return "bottle";
  if (family === "pastel") return "textile";
  if (entity.tags.some((tag) => /fashion/i.test(tag.name))) return "textile";
  return fallback;
}

function kindFor(entity: TasteEntity, slot: ObjectSlot): ObjectKind {
  if (slot.role === "place") return placeObjectKind(entity, slot.kind);
  if (slot.role === "brand") return brandKind(entity, slot.kind);
  if (slot.role === "book") return "book";
  if (slot.role === "artist" || entity.type.includes("artist")) return "record";
  return slot.kind;
}

function anyCandidates(pool: TasteEntity[], artists: TasteEntity[], brands: TasteEntity[], books: TasteEntity[], skipId: string): TasteEntity[] {
  const preferred = dedupe([...artists, ...brands, ...books]);
  const rest = pool.filter((entity) => !preferred.some((item) => item.id === entity.id));
  const ordered = [...preferred, ...rest];
  const held = ordered.filter((entity) => entity.id !== skipId);
  return held.length ? held : ordered;
}

function prettyKind(kind: string): string {
  return kind.replace(/-/g, " ");
}

function overlaps(a: string, b: string): boolean {
  const left = a.toLowerCase().trim();
  const right = b.toLowerCase().trim();
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

const MAX_OBJECTS = 8;

const FURNITURE: Record<string, { x: number; y: number }> = {
  rug: { x: 640, y: 688 },
  teapot: { x: 860, y: 500 },
  bottle: { x: 900, y: 505 },
  record: { x: 230, y: 530 },
  shelf: { x: 430, y: 430 },
  umbrella: { x: 1040, y: 545 },
  sprite: { x: 980, y: 560 },
  jukebox: { x: 180, y: 500 },
  booth: { x: 1040, y: 580 },
  cake: { x: 760, y: 490 },
  console: { x: 300, y: 520 },
  plant: { x: 1080, y: 545 },
  stool: { x: 520, y: 590 },
  hearth: { x: 390, y: 640 },
};

function roomTitle(seeds: TasteEntity[], tags: TasteTag[], anchor: TasteEntity): string {
  const parts: string[] = [];
  const push = (name: string) => {
    const clean = name.trim();
    if (!clean || parts.some((part) => overlaps(part, clean))) return;
    parts.push(clean);
  };
  for (const seed of seeds.slice(0, 3)) push(seed.name);
  const ranked = [...tags].sort((a, b) => (b.affinity ?? -1) - (a.affinity ?? -1) || a.name.localeCompare(b.name));
  for (const tag of ranked) {
    if (parts.length >= 2) break;
    push(tag.name);
  }
  if (!parts.length) push(anchor.name);
  if (parts.length <= 1) return (parts[0] || anchor.name).slice(0, 120);
  return `${parts[0]} · ${parts[1]}`.slice(0, 180);
}

function spotFor(kind: string, taken: { x: number; y: number; kind: string }[]): { x: number; y: number } {
  const base = FURNITURE[kind] ?? { x: 600, y: 540 };
  if (kind === "rug") return base;
  for (let step = 0; step < 6; step += 1) {
    const x = Math.max(90, Math.min(1110, base.x + step * 80));
    const crowded = taken.some((object) => {
      if (object.kind === "rug") return false;
      const dx = object.x - x;
      const dy = object.y - base.y;
      return dx * dx + dy * dy < 70 * 70;
    });
    if (!crowded) return { x, y: base.y };
  }
  return base;
}

function propHost(prop: ObjectKind, pool: TasteEntity[], fallback: TasteEntity): TasteEntity {
  const test =
    prop === "umbrella"
      ? /rain|storm/i
      : prop === "sprite"
        ? /anime|ghibli|totoro|spirit/i
        : prop === "jukebox" || prop === "booth"
          ? /diner|retro|jukebox|chrome/i
          : prop === "cake" || prop === "teapot"
            ? /tea|pastel|brunch|garden/i
            : /./;
  return pool.find((entity) => test.test(entity.name) || entity.tags.some((tag) => test.test(tag.name))) ?? fallback;
}

/** Cited extras so the floor is a room: a rug, a counter vessel, the lead artist, the seed work, and a prop from the prompt. */
function inhabitRoom(
  objects: Atmosphere["room"]["objects"],
  args: {
    prompt: string;
    era: Era | null;
    drinkName: string;
    place: TasteEntity | null;
    artist: TasteEntity | null;
    work: TasteEntity | null;
    pool: TasteEntity[];
    hero: Citation;
    anchor: TasteEntity;
  },
): void {
  const text = args.prompt.toLowerCase();
  const add = (kind: ObjectKind, label: string, citation: Citation) => {
    if (objects.length >= MAX_OBJECTS) return;
    if (objects.some((object) => object.kind === kind)) return;
    const at = spotFor(kind, objects);
    objects.push({
      id: `object-room-${kind}`,
      kind,
      x: at.x,
      y: at.y,
      label: label.slice(0, 80),
      citation,
    });
  };

  add("rug", "Rug", {
    ...args.hero,
    detail: `The rug takes its color from ${args.hero.tag ? `the tag “${args.hero.tag}” on ` : ""}${args.hero.name}.`,
  });

  const tea = /tea|hojicha|earl grey/.test(args.drinkName.toLowerCase());
  if (args.place && tea) {
    add(
      "teapot",
      args.place.name,
      cite(args.place, `${args.place.name} sets out ${args.drinkName}.`, "tea"),
    );
  } else if (args.drinkName && !objects.some((object) => object.kind === "bottle" || object.kind === "bar" || object.kind === "cup")) {
    const host = args.place ?? args.anchor;
    add("bottle", args.place?.name ?? args.drinkName, cite(host, `${host.name} stocks the counter with ${args.drinkName}.`, null));
  }

  if (/\b(fire|fireplace|hearth|tavern|alehouse|lotr|lord of the rings|hobbit|tolkien|middle-earth|middle earth)\b/.test(text)) {
    const host = args.work ?? args.anchor;
    const tag = host.tags.find((item) => aestheticTag(item.name))?.name ?? null;
    add("hearth", "Fireplace", cite(host, `${host.name} sets a hearth. The prompt is a fire or a tavern.`, tag));
  }

  if (args.artist && !objects.some((object) => object.kind === "record" || object.kind === "speaker")) {
    add(
      "record",
      args.artist.name,
      cite(args.artist, `${args.artist.name} is on the record player.`, args.artist.tags[0]?.name ?? null),
    );
  }

  if (args.era?.decade === "1980s") {
    const host = args.work ?? args.anchor;
    add("console", host.name, cite(host, `${host.name} sits with the console because the prompt says ${args.era.label}.`, host.tags[0]?.name ?? null));
  }
  if (/\bdiner\b/.test(text)) {
    const host = propHost("jukebox", args.pool, args.work ?? args.anchor);
    add("jukebox", host.name, cite(host, `${host.name} is the jukebox, from a diner tag.`, host.tags[0]?.name ?? null));
    add("booth", host.name, cite(host, `${host.name} is the booth, from a diner tag.`, host.tags[0]?.name ?? null));
  }
  if (/tea party|afternoon tea|garden tea/.test(text)) {
    const host = propHost("cake", args.pool, args.place ?? args.anchor);
    add("cake", host.name, cite(host, `${host.name} is the tiered stand for the tea party.`, host.tags[0]?.name ?? "tea"));
  }
  if (/ghibli|anime|totoro|spirited|miyazaki/.test(text)) {
    const host = propHost("sprite", args.pool, args.work ?? args.anchor);
    add("sprite", host.name, cite(host, `${host.name} brings the soot sprites.`, host.tags[0]?.name ?? null));
  }
  if (/\b(rain|rainy|storm|drizzle)\b/.test(text)) {
    const host = propHost("umbrella", args.pool, args.anchor);
    add("umbrella", host.name, cite(host, `${host.name} puts an umbrella by the door. The prompt says rain.`, host.tags[0]?.name ?? null));
  }
  if (args.work && !objects.some((object) => object.kind === "book" || object.kind === "shelf")) {
    add("shelf", args.work.name, cite(args.work, `${args.work.name} is on the shelf.`, args.work.tags[0]?.name ?? null));
  }
  if (!objects.some((object) => object.kind === "plant" || object.kind === "sprite")) {
    add("plant", args.anchor.name, cite(args.anchor, `${args.anchor.name} is the plant in the corner.`, args.anchor.tags[0]?.name ?? null));
  }
  if (args.place && objects.some((object) => object.kind === "bar") && !objects.some((object) => object.kind === "stool")) {
    add("stool", args.place.name, cite(args.place, `${args.place.name} has a stool at the counter.`, null));
  }

  objects.sort((a, b) => Number(a.kind !== "rug") - Number(b.kind !== "rug"));
}

function hostForChannel(tags: string[], pool: TasteEntity[], anchor: TasteEntity): TasteEntity {
  const wanted = new Set(tags.map((tag) => tag.toLowerCase()));
  const carries = (entity: TasteEntity) =>
    entity.tags.some((tag) => wanted.has(tag.name.toLowerCase()) && aestheticTag(tag.name));
  const rank = (entity: TasteEntity) => {
    if (/movie|tv_show|book|place/.test(entity.type)) return 0;
    if (/artist|person/.test(entity.type)) return 2;
    return 1;
  };
  const found = pool.filter(carries).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  if (found[0]) return found[0];
  return pool.find((entity) => !/artist|person/.test(entity.type)) ?? anchor;
}

function safeImage(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function buildDisplays(entities: TasteEntity[], channel: ReturnType<typeof channelScene>): Atmosphere["room"]["displays"] {
  const picked: TasteEntity[] = [];
  const ordered = [...entities.filter((entity) => entity.imageUrl), ...entities.filter((entity) => !entity.imageUrl)];
  for (const entity of ordered) {
    if (!entity || picked.some((item) => item.id === entity.id)) continue;
    picked.push(entity);
    if (picked.length === 3) break;
  }
  const kinds: ScreenKind[] = ["screen", "frame", "marquee"];
  const slides = picked.length ? picked : entities.filter(Boolean).slice(0, 1);
  return slides.slice(0, 3).map((entity, index) => {
    const kind = kinds[index] ?? "screen";
    const imageUrl = safeImage(entity.imageUrl);
    return {
      id: `screen-${index}-${kind}`,
      kind,
      title: entity.name.slice(0, 80),
      imageUrl,
      effect: displayEffectFor(channel, kind),
      citation: cite(
        entity,
        imageUrl
          ? `${entity.name} is on the ${kind}. The picture is the image Qloo returned.`
          : `${entity.name} is on the ${kind}. Qloo returned no image, so the screen is drawn type.`,
        entity.tags[0]?.name ?? null,
      ),
    };
  });
}

function nowPlayingLine(
  sceneName: string,
  beds: ReturnType<typeof channelScene>["beds"],
  rows: { name: string; gap: boolean }[],
  citation: Citation,
): string {
  const names = rows.filter((row) => !row.gap).map((row) => row.name).slice(0, 3);
  const inspired = names.length
    ? `inspired by ${names.join(", ")}`
    : citation.tag
      ? `from the Qloo tag ${citation.tag} on ${citation.name}`
      : `from ${citation.name}`;
  return `Now playing: ${sceneName}, ${bedPhrase(beds)}, ${inspired}`.slice(0, 220);
}

export function compileAtmosphere(prompt: string, graph: TasteGraph): Atmosphere {
  const seeds = dedupe(graph.seeds);
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const artists = dedupe(graph.artists).sort((a, b) => {
    const aSeed = seedIds.has(a.id) ? 1 : 0;
    const bSeed = seedIds.has(b.id) ? 1 : 0;
    if (aSeed !== bSeed) return bSeed - aSeed;
    return byAffinity(a, b);
  });
  // Counter rank is category fit, then affinity. Sorting again by affinity puts a cocktail bar ahead of a tea room.
  const places = dedupe(graph.places).filter((place) => !offThemePlace(place.name) && !bareCategoryPlace(place.name));
  const brands = dedupe(graph.brands).sort(byAffinity);
  const books = dedupe([...graph.books, ...seeds.filter((seed) => seed.type.includes("book"))]).sort(byAffinity);
  const movies = dedupe(graph.movies)
    .filter((movie) => !seedIds.has(movie.id))
    .sort(byAffinity);
  const pool = dedupe([...seeds, ...artists, ...places, ...brands, ...books, ...movies]);
  if (!pool.length) {
    throw new Error("Cannot compile an atmosphere without Qloo entities or tags to cite.");
  }

  const anchor = pool.slice().sort(byAffinity)[0];
  const signals = collectSignals(pool, graph.tags, seedIds);
  const shell = signals.filter((signal) => isSetting(signal, seedIds));
  const family = dominantFamily(shell.some((signal) => signal.family) ? shell : signals);
  const scene = graph.scene ?? sceneFromPrompt(prompt);
  const planId: PlanId = scene.time === "day" && family?.plan === "neon" ? "living" : (family?.plan ?? "living");
  const plan = PLANS[planId];
  const window = windowFor(scene, family);
  const mode: VisualMode =
    scene.time === "day"
      ? family?.mode === "symmetry"
        ? "symmetry"
        : "paper"
      : (family?.mode ??
        (["grain-warm", "paper", "rain", "neon-grid", "symmetry", "brutalist"] as const)[hashString(anchor.id) % 6]);
  const day = labelForScene(scene) === "Day";

  const openSlots = plan.lights.map((slot, index) => ({ slot, index, used: false }));
  const draft: { weight: number; light: Atmosphere["room"]["lights"][number] }[] = [];
  const remaining = [...signals];
  const usedFamilies = new Set<string>();
  const usedTags = new Set<string>();
  while (draft.length < plan.lights.length && remaining.length) {
    const unused = (signal: Signal) => !signal.tag || !usedTags.has(signal.tag.toLowerCase());
    const diverse = remaining.findIndex((signal) => unused(signal) && signal.family != null && !usedFamilies.has(signal.family.id));
    const fresh = remaining.findIndex(unused);
    if (fresh < 0) break;
    const signal = remaining.splice(diverse >= 0 ? diverse : fresh, 1)[0];
    if (signal.family) usedFamilies.add(signal.family.id);
    if (signal.tag) usedTags.add(signal.tag.toLowerCase());
    const preferred = openSlots.find((slot) => !slot.used && (slot.slot.prefer.length === 0 || slot.slot.prefer.includes(signal.bias)));
    const any = openSlots.find((slot) => !slot.used);
    const chosen = preferred ?? any;
    if (!chosen) break;
    chosen.used = true;
    const fixture = prettyKind(chosen.slot.kind);
    const citation = cite(
      signal.entity,
      signalDetail(signal, fixture),
      signal.tag,
    );
    citation.affinity = signal.affinity;
    draft.push({
      weight: signal.weight,
      light: {
        id: `light-${chosen.index}-${chosen.slot.kind}`,
        kind: chosen.slot.kind,
        x: chosen.slot.x,
        y: chosen.slot.y,
        x2: chosen.slot.x2,
        color: hslToHex(signal.hue, signal.sat, clamp((day ? 48 : 56) + ((hashString(signal.key) % 9) - 4), 40, 64)),
        intensity: clamp(0.38 + signal.weight * 0.4, 0.32, 1),
        flicker: signal.bias === "neon" ? 0.8 : signal.bias === "lantern" ? 0.42 : 0.1,
        label: (signal.tag ?? signal.entity.name).slice(0, 80),
        citation,
      },
    });
  }

  const lead = signals[0];
  while (draft.length < 2 && lead) {
    const slot = openSlots.find((item) => !item.used) ?? openSlots[draft.length % openSlots.length];
    if (slot) slot.used = true;
    const kind = slot?.slot.kind ?? "pendant";
    const nextTag = lead.entity.tags.map((tag) => tag.name).find((name) => aestheticTag(name) && !usedTags.has(name.toLowerCase())) ?? null;
    if (nextTag) usedTags.add(nextTag.toLowerCase());
    const citation = cite(
      lead.entity,
      nextTag
        ? `Second ${prettyKind(kind)} from ${lead.entity.name}, cited from “${nextTag}”.`
        : `Second ${prettyKind(kind)} from ${lead.entity.name}, because the graph only offered one signal.`,
      nextTag,
    );
    citation.affinity = lead.affinity;
    draft.push({
      weight: lead.weight * 0.5,
      light: {
        id: `light-fill-${draft.length}-${kind}`,
        kind,
        x: slot?.slot.x ?? 480,
        y: slot?.slot.y ?? 160,
        x2: slot?.slot.x2 ?? null,
        color: hslToHex((lead.hue + 28) % 360, Math.max(18, lead.sat - 10), day ? 46 : 42),
        intensity: 0.4,
        flicker: 0.08,
        label: (nextTag ?? lead.entity.name).slice(0, 80),
        citation,
      },
    });
  }

  const era = eraFromPrompt(prompt);
  const lights = draft
    .sort((a, b) => b.weight - a.weight || a.light.id.localeCompare(b.light.id))
    .map((item) => item.light)
    .slice(0, 8)
    .map((light, index) => ({ ...light, color: gradeHex(light.color, era, index) }));
  forceGlobe(lights, era);
  const channel = channelScene(prompt, [...graph.tags, ...pool.flatMap((entity) => entity.tags)].map((tag) => tag.name), era);
  const lightHost = hostForChannel(channel.tags, pool, anchor);
  const lightTag = lightHost.tags.find((tag) => channel.tags.some((name) => tag.name.toLowerCase() === name.toLowerCase())) ?? null;
  const lightCitation = cite(
    lightHost,
    lightTag
      ? `${channel.name} comes from the Qloo tag “${lightTag.name}” on ${lightHost.name}.`
      : `${channel.name} comes from ${lightHost.name}.`,
    lightTag?.name ?? null,
  );
  const lightMix = channel.name === "Blacklight" || channel.name === "Amber" ? 0.78 : 0.62;
  for (const [index, light] of lights.entries()) {
    light.color = mixHex(light.color, channel.colors[index % channel.colors.length], lightMix);
    light.flicker = light.kind === "string" || light.kind === "led-strip" ? light.flicker : lightFlicker(channel.effect);
  }

  const heroHue = lead?.hue ?? hashString(anchor.id) % 360;
  const heroSat = lead?.sat ?? 40;
  const primary = lights[0].color;
  const secondary = lights[1]?.color ?? hslToHex((heroHue + 22) % 360, heroSat * 0.7, day ? 62 : 64);
  const accent = lights.find((light) => light.color !== primary)?.color ?? hslToHex((heroHue + 48) % 360, heroSat, 50);
  let ambient = eraAmbient(
    era,
    gradeHex(hslToHex(heroHue, heroSat * (day ? 0.28 : 0.42), day ? (window === "day-concrete" ? 58 : 78) : 13), era, 3),
  );
  if (era?.decade !== "1970s") {
    if (channel.name === "Blacklight") ambient = "#241038";
    else if (channel.name === "Marigold") ambient = "#3a1d14";
    else if (channel.name === "Stadium") ambient = "#10203f";
  }
  const ink = day ? "#241c18" : "#f4efe6";
  const heroCitation = lights[0].citation;

  const palette = {
    primary,
    secondary,
    accent,
    ambient,
    ink,
    reasons: [
      {
        role: "primary" as const,
        hex: primary,
        because: `${heroCitation.name} supplies the primary stop${heroCitation.tag ? ` through the tag “${heroCitation.tag}”` : ""}.`,
        citation: heroCitation,
      },
      {
        role: "secondary" as const,
        hex: secondary,
        because: `${lights[1]?.citation.name ?? heroCitation.name} supplies the next light, so the room is not one bulb.`,
        citation: lights[1]?.citation ?? heroCitation,
      },
      {
        role: "accent" as const,
        hex: accent,
        because: "The accent is another Qloo row in this room, kept distinct from the primary stop.",
        citation: lights.find((light) => light.color === accent)?.citation ?? heroCitation,
      },
      {
        role: "ambient" as const,
        hex: ambient,
        because:
          era?.decade === "1970s"
            ? "The prompt says the 1970s, so the wall is amber and the ceiling light is a globe."
            : day
              ? "Daylight windows lift the wall so the fixtures read as color, not as the only light."
              : "The wall is the primary hue, dropped so the fixtures have somewhere to land.",
        citation: heroCitation,
      },
    ],
  };

  const displayEntity =
    seeds.find((seed) => seed.type.includes("movie") || seed.type.includes("tv")) ||
    movies[0] ||
    seeds.find((seed) => !seed.type.includes("book")) ||
    books[0] ||
    artists[0] ||
    anchor;
  const usedEntities = new Set<string>();
  const buckets: Record<ObjectRole, TasteEntity[]> = {
    place: places,
    brand: brands,
    book: books,
    artist: artists,
    any: anyCandidates(pool, artists, brands, books, displayEntity.id),
  };
  const objects: Atmosphere["room"]["objects"] = [];
  const take = (role: ObjectRole): TasteEntity | null => {
    return buckets[role].find((entity) => !usedEntities.has(entity.id)) ?? null;
  };
  for (const slot of plan.objects) {
    const entity = take(slot.role);
    if (!entity) continue;
    usedEntities.add(entity.id);
    const kind = kindFor(entity, slot);
    const tag = entity.tags[0]?.name ?? null;
    const because = `${entity.name} is a Qloo ${entity.type.replace("urn:entity:", "")} in this graph, so the room holds it as a ${prettyKind(kind)}.`;
    objects.push({
      id: `object-${objects.length}-${kind}`,
      kind,
      x: slot.x,
      y: slot.y,
      label: entity.name.slice(0, 80),
      citation: cite(entity, because, tag),
    });
  }
  const fallbackKinds: ObjectKind[] = ["table", "speaker"];
  while (objects.length < 2) {
    const kind = fallbackKinds[objects.length] ?? "table";
    const slot = plan.objects[objects.length];
    const because = `${anchor.name} is the only Qloo row available for this ${prettyKind(kind)}.`;
    objects.push({
      id: `object-fill-${objects.length}-${kind}`,
      kind,
      x: slot?.x ?? 420 + objects.length * 80,
      y: slot?.y ?? 520,
      label: anchor.name.slice(0, 80),
      citation: cite(anchor, because, anchor.tags[0]?.name ?? null),
    });
  }
  if (era?.decade === "1980s") {
    const citation = eraCitation(era);
    const crt = {
      id: "object-era-crt",
      kind: "crt" as const,
      x: 180,
      y: 470,
      label: eraChipLabel(era).slice(0, 80),
      citation,
    };
    if (objects.length < MAX_OBJECTS) objects.push(crt);
    if (objects.length < MAX_OBJECTS) {
      objects.push({
        id: "object-era-lava",
        kind: "lava",
        x: 1040,
        y: 500,
        label: "Lava lamp",
        citation,
      });
    }
  }

  const displayTag = displayEntity.tags[0]?.name ?? null;
  const displayKind = displayEntity.type.replace("urn:entity:", "").replace("urn:tag:", "tag");
  const displayCitation = cite(
    displayEntity,
    `${displayEntity.name} is on the wall because it is the work, the seed, or the strongest picture in the Qloo graph. The panel is drawn type, not an entity photo.`,
    displayTag,
  );
  const affinityBit = displayCitation.affinity == null ? "from the prompt" : `affinity ${displayCitation.affinity.toFixed(2)}`;
  const display = {
    kicker: `Qloo ${displayKind}`.slice(0, 80),
    title: displayEntity.name.slice(0, 80),
    subtitle: `${affinityBit}${displayTag ? ` · tag ${displayTag}` : ""}`.slice(0, 160),
    citation: displayCitation,
  };

  const textured = signals.filter((signal) => signal.family && signal.family.texture !== "air");
  const textureSignal =
    textured.find((signal) => signal.family?.texture === "steam" && /bath|steam|tea|hojicha/i.test(signal.tag ?? signal.entity.name)) ??
    textured[0] ??
    lead;
  let texture: TextureKind = textureSignal?.family?.texture ?? "air";
  if (scene.weather === "rain" && scene.time !== "day") texture = "rain";
  else if (scene.time === "day" && (texture === "rain" || texture === "steam")) texture = "air";
  if (era?.decade === "1970s") texture = "vinyl";
  if (era?.decade === "1980s") texture = "tape";
  const timed = signals.filter((signal) => signal.family);
  const tempo = timed.length
    ? clamp(
        Math.round(timed.reduce((sum, signal) => sum + signal.family!.tempo * signal.weight, 0) / timed.reduce((sum, signal) => sum + signal.weight, 0)),
        48,
        140,
      )
    : clamp(72 + (hashString(anchor.id) % 18), 48, 140);
  const tempoSignal = timed.slice().sort((a, b) => b.weight - a.weight || a.key.localeCompare(b.key))[0] ?? lead;
  const scale: ScaleName = tempoSignal?.family?.scale ?? "dorian";
  const tempoCitation = tempoSignal
    ? cite(tempoSignal.entity, signalDetail(tempoSignal, "pulse"), tempoSignal.tag)
    : cite(anchor, `Tempo falls back to ${anchor.name}.`, null);
  if (tempoSignal) tempoCitation.affinity = tempoSignal.affinity;
  let textureCitation = textureSignal
    ? cite(textureSignal.entity, signalDetail(textureSignal, TEXTURE_LABEL[texture].toLowerCase()), textureSignal.tag)
    : tempoCitation;
  if (textureSignal && !era) textureCitation.affinity = textureSignal.affinity;
  if (era) textureCitation = eraCitation(era);

  const root = ROOTS[hashString((artists[0] ?? anchor).id) % ROOTS.length];
  const frequencies = [round2(root / 2), ...RATIOS[scale].map((ratio) => round2(root * ratio))].slice(0, 6);
  const music = artists.slice(0, 4).map((artist) => ({
    name: artist.name,
    entityId: artist.id,
    affinity: clampAffinity(artist.affinity),
    why: affinityWhy(artist, seeds),
    tags: artist.tags.map((tag) => tag.name),
    gap: false,
  }));
  if (!music.length) {
    music.push({
      name: "No artist returned",
      entityId: anchor.id,
      affinity: null,
      why: `Qloo returned no urn:entity:artist rows for these signals, so the bed has no name to follow. The pulse still cites ${anchor.name}.`,
      tags: [],
      gap: true,
    });
  }

  const drinks: Atmosphere["drinks"] = [];
  const drinkNames = new Set<string>();
  for (const place of places.slice(0, 4)) {
    const best = pourFor(place.name, place.tags.map((tag) => tag.name), prompt);
    if (!best) continue;
    const nameKey = best.name.toLowerCase();
    if (drinkNames.has(nameKey)) continue;
    drinkNames.add(nameKey);
    const because =
      best.from === "place"
        ? `The tags on ${place.name} include “${best.key}”, so the counter pours ${best.name}.`
        : best.key === "house"
          ? `${place.name} is a venue, so the counter serves a house pour.`
          : `The prompt asks for ${best.key}, so the counter pours ${best.name}.`;
    drinks.push({
      name: best.name,
      venue: place.name,
      venueId: place.id,
      affinity: clampAffinity(place.affinity),
      because,
      citation: cite(place, because, best.key),
      gap: false,
    });
    if (drinks.length >= 3) break;
  }
  if (!drinks.length) {
    const fallback = fallbackPour(prompt);
    if (fallback) {
      const because = `Qloo returned no venue, so the counter pours ${fallback.name}. The pour follows the prompt.`;
      drinks.push({
        name: fallback.name,
        venue: fallback.venue,
        venueId: anchor.id,
        affinity: null,
        because,
        citation: cite(anchor, because, fallback.key),
        gap: false,
      });
    } else {
      const because = "Qloo returned no place, so the counter stays empty.";
      drinks.push({
        name: "Counter unset",
        venue: "Place search returned nothing",
        venueId: anchor.id,
        affinity: null,
        because,
        citation: cite(anchor, because, null),
        gap: true,
      });
    }
  }

  const poured = drinks.find((row) => !row.gap);
  inhabitRoom(objects, {
    prompt,
    era,
    drinkName: poured?.name ?? "",
    place: places[0] ?? null,
    artist: artists[0] ?? null,
    work:
      seeds.find((seed) => seed.type.includes("movie") || seed.type.includes("tv") || seed.type.includes("book")) ??
      movies[0] ??
      books[0] ??
      null,
    pool,
    hero: heroCitation,
    anchor,
  });

  const decor = objects.slice(0, 6).map((object) => ({
    item: `${prettyKind(object.kind)} · ${object.label}`.slice(0, 180),
    because: object.citation.detail,
    citation: object.citation,
  }));

  const heard = audienceLine(prompt, music) ?? audioDescription(texture, scale, tempo, textureCitation, tempoCitation);
  const description = era ? `Era: ${era.label}, from the prompt. ${heard}` : heard;
  const artist = music.find((row) => !row.gap);
  const place = drinks.find((row) => !row.gap);
  const heroSource = lightCitation.tag ? `the Qloo tag “${lightCitation.tag}” on ${lightCitation.name}` : lightCitation.name;
  const logline = [
    `${channel.name} takes its color from ${heroSource}.`,
    artist ? `${artist.name} sets the tempo at ${tempo} BPM.` : `Qloo returned no artist, so the tempo stays with ${lightCitation.name}.`,
    place ? `${place.venue} sets the counter.` : `Qloo returned no place, so the counter stays empty.`,
  ].join(" ");

  const safePrompt = prompt.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 400);
  const note = graph.synthetic
    ? "MOCK TASTE GRAPH. No fixture matched this prompt, so Atrium synthesized a labeled stand-in from the prompt text. These are not Qloo records. Set QLOO_API_KEY to compile from the live taste graph."
    : graph.source === "mock"
      ? "MOCK TASTE GRAPH. Entities and affinities are local fixtures, not responses from hackathon.api.qloo.com. Set QLOO_API_KEY to switch this room to live Qloo."
      : "Live Qloo taste graph. Search, tag, and insights calls ran against the hackathon API, and every choice below cites one of those entities.";

  const atmosphere: Atmosphere = {
    version: 1,
    prompt: safePrompt,
    title: roomTitle(seeds, graph.tags, anchor),
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
    visual: {
      mode,
      artwork: {
        kind: "generative",
        caption: display.title,
        imageUrl: null,
        citation: display.citation,
      },
    },
    palette,
    audio: {
      tempoBpm: tempo,
      scale,
      rootHz: root,
      frequencies,
      noise: NOISE[texture],
      filterHz: FILTER[texture],
      texture,
      beds: channel.beds.slice(0, 3),
      nowPlaying: nowPlayingLine(channel.name, channel.beds, music, lightCitation),
      description,
      citation: tempoCitation,
      layers: [
        { id: "pad", role: "pad", label: `${scale.replace("-", " ")} pad`, citation: tempoCitation },
        { id: "texture", role: "texture", label: TEXTURE_LABEL[texture], citation: textureCitation },
        { id: "pulse", role: "pulse", label: `${tempo} BPM pulse`, citation: tempoCitation },
      ],
    },
    room: {
      plan: planId,
      window,
      timeLabel: labelForScene(scene),
      ...(era ? { eraLabel: era.label } : {}),
      lightScene: {
        name: channel.name,
        effect: channel.effect,
        colors: channel.colors,
        citation: lightCitation,
      },
      displays: buildDisplays(
        [...seeds, ...artists, ...movies, ...books, anchor],
        channel,
      ),
      windowBox: plan.windowBox,
      posterBox: plan.posterBox,
      lights,
      objects: objects.slice(0, MAX_OBJECTS),
      display,
    },
    music,
    drinks,
    decor,
    reading: books.slice(0, 4).map((book) => ({
      name: book.name,
      entityId: book.id,
      affinity: clampAffinity(book.affinity),
      why: seedIds.has(book.id) ? "Resolved from the prompt as a seed entity." : affinityWhy(book, seeds),
      tags: book.tags.map((tag) => tag.name),
    })),
    pictures: movies.slice(0, 4).map((movie) => ({
      name: movie.name,
      entityId: movie.id,
      affinity: clampAffinity(movie.affinity),
      why: affinityWhy(movie, seeds),
      tags: movie.tags.map((tag) => tag.name),
    })),
  };

  return atmosphereSchema.parse(atmosphere);
}

function audioDescription(
  texture: TextureKind,
  scale: ScaleName,
  tempo: number,
  textureCitation: Citation,
  tempoCitation: Citation,
): string {
  const pad = scale.replace("-", " ");
  const textureName = textureCitation.tag ?? textureCitation.name;
  const tempoName = tempoCitation.tag ?? tempoCitation.name;
  if (textureName === tempoName) {
    return `${TEXTURE_LABEL[texture]} under a ${pad} pad at ${tempo} BPM, cited from ${tempoName}.`;
  }
  return `${TEXTURE_LABEL[texture]} from ${textureName}, under a ${pad} pad at ${tempo} BPM from ${tempoName}.`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
