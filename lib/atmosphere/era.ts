import type { Era } from "@/lib/agent/propose";
import { mixHex } from "@/lib/atmosphere/color";
import type { Citation } from "@/lib/atmosphere/schema";

/** 1970s leans amber. 1980s alternates CRT cyan and neon magenta. */
export function gradeHex(hex: string, era: Era | null, index: number): string {
  if (!era || !/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const toward = era.decade === "1970s" ? "#c56a2d" : index % 2 === 0 ? "#39e7ff" : "#ff2bd6";
  return mixHex(hex, toward, era.decade === "1970s" ? 0.5 : 0.4);
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
