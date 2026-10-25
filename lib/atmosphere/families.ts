import type { VisualMode } from "@/lib/atmosphere/schema";

/**
 * Color, tempo, and texture priors for Qloo tag names.
 * The compiler never scans the user's prompt for these stems.
 * A tag that misses the table still becomes a fixture: its hue is a hash of the tag id.
 */

export type PlanId = "lounge" | "neon" | "rain" | "symmetry" | "bath" | "brutalist" | "living";
export type WindowScene = "night-city" | "dusk" | "rain" | "day-pastel" | "day-concrete" | "neon-city";
export type TextureKind = "rain" | "vinyl" | "water" | "crowd" | "air" | "steam";
export type LightBias = "neon" | "warm" | "cool" | "soft" | "lantern" | "line" | "open";
export type ScaleName = "minor-pentatonic" | "dorian" | "lydian" | "phrygian" | "mixolydian";

export type Family = {
  id: string;
  stems: string[];
  hue: number;
  sat: number;
  plan: PlanId;
  mode: VisualMode;
  window: WindowScene;
  texture: TextureKind;
  tempo: number;
  scale: ScaleName;
  bias: LightBias;
  /** Generic stems (night, japan) vote, but they should not drown a specific tag. */
  priority: number;
};

export const FAMILIES: Family[] = [
  {
    id: "neon",
    stems: ["neon", "noir", "android", "cyber", "cyberpunk", "synth", "synthesizer"],
    hue: 186,
    sat: 72,
    plan: "neon",
    mode: "neon-grid",
    window: "neon-city",
    texture: "air",
    tempo: 108,
    scale: "phrygian",
    bias: "neon",
    priority: 1,
  },
  {
    id: "diner",
    stems: ["diner", "retro", "crime", "chrome", "jukebox", "americana", "pulp"],
    hue: 16,
    sat: 74,
    plan: "lounge",
    mode: "grain-warm",
    window: "night-city",
    texture: "vinyl",
    tempo: 86,
    scale: "mixolydian",
    bias: "neon",
    priority: 1,
  },
  {
    id: "jazz",
    stems: ["jazz", "vinyl", "lounge", "brass", "whiskey", "whisky", "saxophone"],
    hue: 32,
    sat: 64,
    plan: "lounge",
    mode: "grain-warm",
    window: "night-city",
    texture: "vinyl",
    tempo: 92,
    scale: "dorian",
    bias: "warm",
    priority: 1,
  },
  {
    id: "rain",
    stems: ["rain", "rainy", "monsoon", "storm"],
    hue: 214,
    sat: 48,
    plan: "rain",
    mode: "rain",
    window: "rain",
    texture: "rain",
    tempo: 64,
    scale: "minor-pentatonic",
    bias: "cool",
    priority: 1,
  },
  {
    id: "pastel",
    stems: ["pastel", "symmetry", "brunch", "pastry", "pink", "macaron"],
    hue: 348,
    sat: 48,
    plan: "symmetry",
    mode: "symmetry",
    window: "day-pastel",
    texture: "air",
    tempo: 96,
    scale: "lydian",
    bias: "soft",
    priority: 1,
  },
  {
    id: "paper",
    stems: ["literature", "novel", "paper", "poetry"],
    hue: 36,
    sat: 30,
    plan: "rain",
    mode: "paper",
    window: "night-city",
    texture: "air",
    tempo: 60,
    scale: "minor-pentatonic",
    bias: "warm",
    priority: 1,
  },
  {
    id: "bath",
    stems: ["bath", "bathhouse", "onsen", "sento", "ghibli", "anime", "dusk", "steam", "lantern", "hojicha"],
    hue: 156,
    sat: 38,
    plan: "bath",
    mode: "grain-warm",
    window: "dusk",
    texture: "steam",
    tempo: 72,
    scale: "dorian",
    bias: "lantern",
    priority: 1,
  },
  {
    id: "disco",
    stems: ["disco", "funk", "soul"],
    hue: 322,
    sat: 68,
    plan: "lounge",
    mode: "grain-warm",
    window: "night-city",
    texture: "crowd",
    tempo: 118,
    scale: "mixolydian",
    bias: "neon",
    priority: 1,
  },
  {
    id: "concrete",
    stems: ["brutalist", "brutal", "concrete"],
    hue: 28,
    sat: 10,
    plan: "brutalist",
    mode: "brutalist",
    window: "day-concrete",
    texture: "air",
    tempo: 76,
    scale: "mixolydian",
    bias: "line",
    priority: 1,
  },
  {
    id: "electronic",
    stems: ["electronic", "ambient", "techno", "edm", "house", "lo-fi", "lofi"],
    hue: 262,
    sat: 42,
    plan: "neon",
    mode: "neon-grid",
    window: "neon-city",
    texture: "air",
    tempo: 100,
    scale: "phrygian",
    bias: "line",
    priority: 1,
  },
  {
    id: "cafe",
    stems: ["cafe", "coffee", "kissaten", "espresso"],
    hue: 26,
    sat: 42,
    plan: "rain",
    mode: "paper",
    window: "rain",
    texture: "crowd",
    tempo: 78,
    scale: "dorian",
    bias: "warm",
    priority: 0.85,
  },
  {
    id: "bar",
    stems: ["bar", "cocktail", "noodles", "izakaya"],
    hue: 18,
    sat: 56,
    plan: "lounge",
    mode: "grain-warm",
    window: "night-city",
    texture: "crowd",
    tempo: 98,
    scale: "dorian",
    bias: "warm",
    priority: 0.8,
  },
  {
    id: "japan",
    stems: ["japan", "japanese"],
    hue: 222,
    sat: 24,
    plan: "bath",
    mode: "paper",
    window: "dusk",
    texture: "water",
    tempo: 70,
    scale: "minor-pentatonic",
    bias: "lantern",
    priority: 0.5,
  },
  {
    id: "night",
    stems: ["night", "midnight"],
    hue: 230,
    sat: 28,
    plan: "living",
    mode: "paper",
    window: "night-city",
    texture: "air",
    tempo: 68,
    scale: "minor-pentatonic",
    bias: "cool",
    priority: 0.35,
  },
];

export function matchFamily(name: string): Family | null {
  const text = name.toLowerCase();
  const words = new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
  let best: { family: Family; length: number } | null = null;
  for (const family of FAMILIES) {
    for (const stem of family.stems) {
      const hit = words.has(stem) || (stem.length >= 4 && text.includes(stem));
      if (!hit) continue;
      if (!best || stem.length > best.length) best = { family, length: stem.length };
    }
  }
  return best?.family ?? null;
}
