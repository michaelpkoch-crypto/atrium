import type { Era } from "@/lib/agent/propose";
import { eraFromPrompt } from "@/lib/agent/propose";

export const LIGHT_EFFECTS = ["flicker", "pulse", "lightning", "candle", "neon"] as const;
export const SOUND_BEDS = ["wind", "creak", "thunder", "rain", "murmur", "vinyl", "fire", "drone", "chime"] as const;
export const DISPLAY_EFFECTS = ["glitch", "ghost", "static", "scanline", "kanji", "portrait", "menu"] as const;

export type LightEffect = (typeof LIGHT_EFFECTS)[number];
export type SoundBed = (typeof SOUND_BEDS)[number];
export type DisplayEffect = (typeof DISPLAY_EFFECTS)[number];
export type ScreenKind = "screen" | "frame" | "marquee";

export type ChannelScene = {
  name: string;
  effect: LightEffect;
  /** Three stops: key light, glow, accent. */
  colors: [string, string, string];
  beds: SoundBed[];
  displayEffect: DisplayEffect;
  /** Tag names that can cite this scene. The first one present on an entity wins. */
  tags: string[];
};

const BLACKLIGHT: ChannelScene = {
  name: "Blacklight",
  effect: "flicker",
  colors: ["#6d28d9", "#f5f3ff", "#39ff88"],
  beds: ["drone", "wind", "creak"],
  displayEffect: "glitch",
  tags: ["horror", "spooky", "halloween"],
};

const CANDLELIGHT: ChannelScene = {
  name: "Candlelight",
  effect: "candle",
  colors: ["#e7c27a", "#f4efe6", "#7a1e1e"],
  beds: ["fire", "chime"],
  displayEffect: "portrait",
  tags: ["christmas", "holiday"],
};

const MARIGOLD: ChannelScene = {
  name: "Marigold",
  effect: "candle",
  colors: ["#e39a45", "#f4efe6", "#c23b22"],
  beds: ["wind", "chime"],
  displayEffect: "portrait",
  tags: ["marigold", "folk", "ofrenda"],
};

const STADIUM: ChannelScene = {
  name: "Stadium",
  effect: "pulse",
  colors: ["#f4efe6", "#c23b22", "#1d4e89"],
  beds: ["murmur", "thunder"],
  displayEffect: "menu",
  tags: ["football", "sports", "party"],
};

const AMBER: ChannelScene = {
  name: "Amber",
  effect: "candle",
  colors: ["#e39a45", "#f6e2c4", "#c56a2d"],
  beds: ["vinyl", "fire"],
  displayEffect: "portrait",
  tags: ["jazz", "vinyl", "lounge"],
};

const EIGHTIES: ChannelScene = {
  name: "Neon",
  effect: "neon",
  colors: ["#39e7ff", "#ff2bd6", "#f4efe6"],
  beds: ["murmur", "chime"],
  displayEffect: "scanline",
  tags: ["neon", "retro"],
};

const STORM: ChannelScene = {
  name: "Storm",
  effect: "lightning",
  colors: ["#7aa2ff", "#d7e6f4", "#1a2433"],
  beds: ["rain", "thunder", "wind"],
  displayEffect: "static",
  tags: ["rain", "storm"],
};

const LOUNGE: ChannelScene = {
  name: "Lounge",
  effect: "flicker",
  colors: ["#e7c27a", "#c56a2d", "#f4efe6"],
  beds: ["vinyl", "murmur"],
  displayEffect: "portrait",
  tags: ["jazz", "vinyl", "lounge", "whiskey"],
};

const GARDEN: ChannelScene = {
  name: "Garden",
  effect: "pulse",
  colors: ["#f2b7c4", "#f7c3a0", "#7dce7a"],
  beds: ["chime", "murmur"],
  displayEffect: "portrait",
  tags: ["tea", "pastel", "garden", "brunch"],
};

const GARDEN_DAYLIGHT: ChannelScene = {
  name: "Garden Daylight",
  effect: "pulse",
  colors: ["#f4efe6", "#f2b7c4", "#7dce7a"],
  beds: ["chime", "murmur"],
  displayEffect: "portrait",
  tags: ["regency", "romance", "pastel", "garden", "tea"],
};

const PASTEL_MORNING: ChannelScene = {
  name: "Pastel Morning",
  effect: "pulse",
  colors: ["#f7c3d0", "#f4efe6", "#f7c3a0"],
  beds: ["chime", "murmur"],
  displayEffect: "portrait",
  tags: ["pastel", "brunch", "symmetry"],
};

const HEARTHFIRE: ChannelScene = {
  name: "Hearthfire",
  effect: "candle",
  colors: ["#e07a2f", "#e7c27a", "#5c4033"],
  beds: ["fire", "murmur"],
  displayEffect: "portrait",
  tags: ["fire", "fantasy", "hearth"],
};

const CRT_GLOW: ChannelScene = {
  name: "CRT Glow",
  effect: "neon",
  colors: ["#39e7ff", "#ff2bd6", "#141820"],
  beds: ["murmur", "drone"],
  displayEffect: "scanline",
  tags: ["neon", "retro"],
};

const NEON_NOIR: ChannelScene = {
  name: "Neon noir",
  effect: "neon",
  colors: ["#39e7ff", "#ff2bd6", "#141820"],
  beds: ["rain", "murmur"],
  displayEffect: "scanline",
  tags: ["neon", "noir"],
};

const LANTERN: ChannelScene = {
  name: "Lantern",
  effect: "candle",
  colors: ["#e7a15a", "#f6d7a2", "#5d6a52"],
  beds: ["wind", "chime"],
  displayEffect: "portrait",
  tags: ["bathhouse", "anime", "dusk"],
};

const DINER: ChannelScene = {
  name: "Diner",
  effect: "neon",
  colors: ["#e07a2f", "#f4efe6", "#c23b22"],
  beds: ["murmur", "vinyl"],
  displayEffect: "menu",
  tags: ["diner", "retro", "chrome"],
};

const NIGHT: ChannelScene = {
  name: "Night",
  effect: "pulse",
  colors: ["#c4a574", "#8a7058", "#f4efe6"],
  beds: ["murmur"],
  displayEffect: "portrait",
  tags: ["night"],
};

/** The Qloo room's lighting, beds, and screen treatment. Occasion prompts win, then era, then tags. */
export function channelScene(prompt: string, tagNames: string[], era: Era | null = eraFromPrompt(prompt)): ChannelScene {
  const text = prompt.toLowerCase();
  if (/halloween|hocus pocus|nightmare before christmas/.test(text)) return BLACKLIGHT;
  if (/christmas/.test(text)) return CANDLELIGHT;
  if (/d[ií]a de los muertos|dia de los muertos|muertos|ofrenda/.test(text)) return MARIGOLD;
  if (/super bowl|halftime/.test(text)) return STADIUM;
  if (/bridgerton|regency|tea party|garden tea/.test(text)) return GARDEN_DAYLIGHT;
  if (/wes anderson|grand budapest|tenenbaums/.test(text) || (/\bbrunch\b/.test(text) && /\b(pastel|wes)\b/.test(text))) return PASTEL_MORNING;
  if (/\b(lord of the rings|lotr|middle-earth|middle earth|hobbit|tolkien|hearthfire)\b/.test(text)) return HEARTHFIRE;
  if (/stranger things|upside down/.test(text)) return CRT_GLOW;
  if (era?.decade === "1970s") return AMBER;
  if (era?.decade === "1980s") return EIGHTIES;
  if (/\b(rain|rainy|storm|drizzle)\b/.test(text)) return STORM;
  const tags = tagNames.join(" ").toLowerCase();
  if (/horror|spooky|halloween/.test(tags)) return BLACKLIGHT;
  if (/christmas|holiday/.test(tags)) return CANDLELIGHT;
  if (/football|sports/.test(tags)) return STADIUM;
  if (/\b(fire|hearth|fantasy)\b/.test(tags)) return HEARTHFIRE;
  if (/\b(jazz|vinyl|lounge|whiskey|whisky)\b/.test(tags)) return LOUNGE;
  if (/\bregency\b/.test(tags)) return GARDEN_DAYLIGHT;
  if (/\b(pastel|brunch)\b/.test(tags)) return PASTEL_MORNING;
  if (/\b(tea|garden)\b/.test(tags)) return GARDEN;
  if (/bathhouse|onsen|anime|ghibli/.test(tags)) return LANTERN;
  if (/\bdiner\b|chrome/.test(tags)) return DINER;
  if (/neon|noir/.test(tags)) return NEON_NOIR;
  if (/\brain\b/.test(tags)) return STORM;
  return NIGHT;
}

/** The plain reading stays a cliché. It does not borrow the Qloo scene name. */
export function plainChannel(prompt: string): ChannelScene {
  const text = prompt.toLowerCase();
  if (/halloween|hocus pocus|nightmare before christmas/.test(text)) {
    return { name: "Orange lights", effect: "pulse", colors: ["#e07a2f", "#1a120c", "#f4efe6"], beds: ["wind"], displayEffect: "static", tags: [] };
  }
  if (/christmas/.test(text)) {
    return { name: "Tinsel", effect: "pulse", colors: ["#7a1e1e", "#e7c27a", "#f4efe6"], beds: ["chime"], displayEffect: "portrait", tags: [] };
  }
  if (/muertos|ofrenda/.test(text)) {
    return { name: "Paper flowers", effect: "pulse", colors: ["#e39a45", "#c23b22", "#f4efe6"], beds: ["wind"], displayEffect: "portrait", tags: [] };
  }
  if (/super bowl|halftime/.test(text)) {
    return { name: "Snack table", effect: "pulse", colors: ["#1d4e89", "#c23b22", "#f4efe6"], beds: ["murmur"], displayEffect: "menu", tags: [] };
  }
  return { name: "Room tone", effect: "pulse", colors: ["#c4a574", "#8a7058", "#f4efe6"], beds: ["murmur"], displayEffect: "portrait", tags: [] };
}

export function displayEffectFor(scene: ChannelScene, kind: ScreenKind): DisplayEffect {
  if (scene.name === "Blacklight") return kind === "screen" ? "glitch" : kind === "frame" ? "ghost" : "static";
  if (scene.name === "Neon noir" || scene.name === "Neon" || scene.name === "CRT Glow") return kind === "frame" ? "kanji" : "scanline";
  if (
    scene.name === "Garden" ||
    scene.name === "Garden Daylight" ||
    scene.name === "Pastel Morning" ||
    scene.name === "Hearthfire" ||
    scene.name === "Candlelight" ||
    scene.name === "Marigold" ||
    scene.name === "Lantern" ||
    scene.name === "Amber"
  ) {
    return "portrait";
  }
  if (scene.name === "Stadium" || scene.name === "Diner") return "menu";
  return scene.displayEffect;
}

const BED_LABEL: Record<SoundBed, string> = {
  wind: "whispering wind",
  creak: "a creak",
  thunder: "distant thunder",
  rain: "rain",
  murmur: "room murmur",
  vinyl: "vinyl crackle",
  fire: "a crackling fire",
  drone: "a dissonant drone",
  chime: "a chime",
};

export function bedPhrase(beds: SoundBed[]): string {
  const labels = beds.map((bed) => BED_LABEL[bed]);
  if (labels.length <= 1) return labels[0] ?? "a room tone";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function lightFlicker(effect: LightEffect): number {
  if (effect === "flicker") return 0.82;
  if (effect === "lightning") return 0.9;
  if (effect === "neon") return 0.66;
  if (effect === "candle") return 0.36;
  return 0.12;
}
