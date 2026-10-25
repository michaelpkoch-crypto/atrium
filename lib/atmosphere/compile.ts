import { hslToHex, hashString } from "@/lib/atmosphere/color";
import { matchFamily, type Family, type LightBias, type PlanId, type ScaleName, type TextureKind, type WindowScene } from "@/lib/atmosphere/families";
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

const TIME_LABEL: Record<WindowScene, string> = {
  "night-city": "Night",
  dusk: "Dusk",
  rain: "Rain",
  "day-pastel": "Day",
  "day-concrete": "Day",
  "neon-city": "Night",
};

const TEXTURE_LABEL: Record<TextureKind, string> = {
  rain: "Rain on the glass",
  vinyl: "Vinyl crackle",
  water: "Water",
  crowd: "Room murmur",
  air: "Room tone",
  steam: "Steam",
};

const NOISE: Record<TextureKind, number> = {
  rain: 0.55,
  vinyl: 0.34,
  water: 0.36,
  crowd: 0.42,
  air: 0.12,
  steam: 0.38,
};

const FILTER: Record<TextureKind, number> = {
  rain: 2400,
  vinyl: 1800,
  water: 700,
  crowd: 640,
  air: 900,
  steam: 1100,
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

function entityText(entity: TasteEntity): { text: string; words: Set<string> } {
  const text = `${entity.name} ${entity.tags.map((tag) => tag.name).join(" ")}`.toLowerCase();
  return { text, words: tokenSet(text) };
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
    if (!entity.tags.length) consider(entity, null, entity.affinity);
    for (const tag of entity.tags) consider(entity, tag, entity.affinity);
  }
  for (const tag of tags) {
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
    return `Qloo tag “${signal.tag}” on ${signal.entity.name}${score} had no color prior, so this ${fixture} takes its hue from the tag id.`;
  }
  return `${signal.entity.name}${score} had no aesthetic tag, so this ${fixture} takes its hue from the entity id.`;
}

function placeKind(entity: TasteEntity, fallback: ObjectKind): ObjectKind {
  const family = entity.tags.map((tag) => matchFamily(tag.name)?.id).find(Boolean);
  if (family === "bath") return "tub";
  if (family === "concrete") return "plinth";
  if (family === "jazz" || family === "bar" || family === "disco") return "bar";
  if (family === "pastel") return "table";
  if (family === "cafe" || family === "rain" || family === "paper") return "table";
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
  if (slot.role === "place") return placeKind(entity, slot.kind);
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

export function compileAtmosphere(prompt: string, graph: TasteGraph): Atmosphere {
  const seeds = dedupe(graph.seeds).sort(byAffinity);
  const seedIds = new Set(seeds.map((seed) => seed.id));
  const artists = dedupe(graph.artists).sort(byAffinity);
  const places = dedupe(graph.places).sort(byAffinity);
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
  const planId: PlanId = family?.plan ?? "living";
  const plan = PLANS[planId];
  const rainy = shell.some((signal) => signal.family?.id === "rain" && signal.weight >= 0.75);
  const window: WindowScene = rainy ? "rain" : (family?.window ?? "night-city");
  const mode: VisualMode =
    family?.mode ??
    (["grain-warm", "paper", "rain", "neon-grid", "symmetry", "brutalist"] as const)[hashString(anchor.id) % 6];
  const day = window === "day-pastel" || window === "day-concrete";

  const openSlots = plan.lights.map((slot, index) => ({ slot, index, used: false }));
  const draft: { weight: number; light: Atmosphere["room"]["lights"][number] }[] = [];
  const remaining = [...signals];
  const usedFamilies = new Set<string>();
  while (draft.length < plan.lights.length && remaining.length) {
    const diverse = remaining.findIndex((signal) => signal.family != null && !usedFamilies.has(signal.family.id));
    const signal = remaining.splice(diverse >= 0 ? diverse : 0, 1)[0];
    if (signal.family) usedFamilies.add(signal.family.id);
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
    const citation = cite(lead.entity, `Second ${prettyKind(kind)} from the same Qloo row, because the graph only offered one signal.`, lead.tag);
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
        label: (lead.tag ?? lead.entity.name).slice(0, 80),
        citation,
      },
    });
  }

  const lights = draft
    .sort((a, b) => b.weight - a.weight || a.light.id.localeCompare(b.light.id))
    .map((item) => item.light)
    .slice(0, 8);

  const heroHue = lead?.hue ?? hashString(anchor.id) % 360;
  const heroSat = lead?.sat ?? 40;
  const primary = lights[0].color;
  const secondary = lights[1]?.color ?? hslToHex((heroHue + 22) % 360, heroSat * 0.7, day ? 62 : 64);
  const accent = lights.find((light) => light.color !== primary)?.color ?? hslToHex((heroHue + 48) % 360, heroSat, 50);
  const ambient = hslToHex(heroHue, heroSat * (day ? 0.28 : 0.42), day ? (window === "day-concrete" ? 58 : 78) : 13);
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
        because: day
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

  const textureSignal = signals.find((signal) => signal.family && signal.family.texture !== "air") ?? lead;
  const texture: TextureKind = textureSignal?.family?.texture ?? "air";
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
  const textureCitation = textureSignal
    ? cite(textureSignal.entity, signalDetail(textureSignal, TEXTURE_LABEL[texture].toLowerCase()), textureSignal.tag)
    : tempoCitation;
  if (textureSignal) textureCitation.affinity = textureSignal.affinity;

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

  const drinks = places.slice(0, 3).map((place) => {
    const { text, words } = entityText(place);
    let best: { name: string; hits: number; key: string } | null = null;
    for (const rule of DRINK_RULES) {
      const hit = rule.keys.find((key) => matches(text, words, key));
      const hits = rule.keys.filter((key) => matches(text, words, key)).length;
      if (hit && hits > 0 && (!best || hits > best.hits)) best = { name: rule.name, hits, key: hit };
    }
    const name = best?.name ?? `House pour at ${place.name}`;
    const because = best
      ? `${best.hits} tag${best.hits === 1 ? "" : "s"} on ${place.name}, including “${best.key}”, selected ${name}.`
      : `No pour rule matched the tags on ${place.name}, so the venue itself is the recommendation.`;
    return {
      name,
      venue: place.name,
      venueId: place.id,
      affinity: clampAffinity(place.affinity),
      because,
      citation: cite(place, because, best?.key ?? place.tags[0]?.name ?? null),
      gap: false,
    };
  });
  if (!drinks.length) {
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

  const decor = objects.slice(0, 4).map((object) => ({
    item: `${prettyKind(object.kind)} · ${object.label}`.slice(0, 180),
    because: object.citation.detail,
    citation: object.citation,
  }));

  const artist = music.find((row) => !row.gap);
  const place = drinks.find((row) => !row.gap);
  const hero = lights[0];
  const heroSource = hero.citation.tag ? `the Qloo tag “${hero.citation.tag}” on ${hero.citation.name}` : hero.citation.name;
  const logline = [
    `The ${prettyKind(hero.kind)} takes its color from ${heroSource}.`,
    artist ? `${artist.name} sets the tempo at ${tempo} BPM.` : `Qloo returned no artist, so the tempo stays with ${hero.citation.name}.`,
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
      description: audioDescription(texture, scale, tempo, textureCitation, tempoCitation),
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
      timeLabel: TIME_LABEL[window],
      windowBox: plan.windowBox,
      posterBox: plan.posterBox,
      lights,
      objects: objects.slice(0, 6),
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
