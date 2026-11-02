import type { Era } from "@/lib/agent/propose";
import { mixHex } from "@/lib/atmosphere/color";
import type { Citation } from "@/lib/atmosphere/schema";

/** 1970s leans amber. 1980s alternates CRT cyan and neon magenta. */
export function gradeHex(hex: string, era: Era | null, index: number): string {
  if (!era || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  if (era.decade === "1970s") return mixHex(hex, "#e39a45", 0.72);
  const toward = index % 2 === 0 ? "#39e7ff" : "#ff2bd6";
  return mixHex(hex, toward, 0.4);
}

/** A near-black wall mixed a little toward amber still reads as black. 1970s starts mid-amber. */
export function eraAmbient(era: Era | null, fallback: string): string {
  if (era?.decade === "1970s") return "#8a5a32";
  return fallback;
}

/** The ceiling gets a globe even when the plan filled a floor lamp before a pendant. */
export function forceGlobe(lights: { kind: string; y: number }[], era: Era | null): void {
  if (era?.decade !== "1970s" || !lights.length) return;
  const globe =
    lights.find((light) => light.kind === "pendant") ??
    lights.find((light) => light.kind !== "string" && light.kind !== "led-strip") ??
    lights[0];
  globe.kind = "globe";
  if (globe.y > 150) globe.y = 118;
}

export function eraChipLabel(era: Era): string {
  return `Era: ${era.label}, from the prompt`;
}

export function eraCitation(era: Era): Citation {
  return {
    id: "prompt-era",
    name: "Prompt",
    type: "baseline",
    affinity: null,
    detail: `Era: ${era.label}, from the prompt. Not a Qloo entity.`,
    tag: null,
  };
}
