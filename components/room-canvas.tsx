"use client";

import { useId, useState, type ReactNode } from "react";

import { hexToRgb, mixHex } from "@/lib/atmosphere/color";
import type { RoomLight, RoomObject, RoomScene } from "@/lib/atmosphere/schema";
import type { WindowScene } from "@/lib/atmosphere/families";
import { provenanceLine } from "@/components/labels";

type Palette = {
  primary: string;
  secondary: string;
  accent: string;
  ambient: string;
  ink: string;
};

function tint(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const channel = (value: number) => Math.round(value + (255 - value) * amount).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const channel = (value: number) => Math.round(value * (1 - amount)).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function wrap(value: string, size: number, lines: number): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > size && current) {
      out.push(current);
      current = word;
      if (out.length === lines) break;
    } else {
      current = next;
    }
  }
  if (current && out.length < lines) out.push(current);
  if (out.length === lines && words.join(" ").length > out.join(" ").length) {
    out[lines - 1] = `${out[lines - 1].slice(0, Math.max(0, size - 1))}…`;
  }
  return out;
}

export function RoomFrame({
  scene,
  palette,
  tempoBpm,
  interactive = true,
  label,
}: {
  scene: RoomScene;
  palette: Palette;
  tempoBpm: number;
  interactive?: boolean;
  label: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const day = scene.timeLabel === "Day";
  const selectedLight = scene.lights.find((light) => light.id === selected);
  const selectedObject = scene.objects.find((object) => object.id === selected);
  const selectedDisplay = selected === "display" ? scene.display : null;
  const eraChip =
    selected === "era" && scene.eraLabel
      ? {
          title: `Era: ${scene.eraLabel}, from the prompt`,
          citation: {
            id: "prompt-era",
            name: "Prompt",
            type: "baseline",
            affinity: null,
            detail: `Era: ${scene.eraLabel}, from the prompt. Not a Qloo entity.`,
            tag: null,
          },
        }
      : null;
  const chip = selectedLight
    ? { title: chipText(selectedLight.label), citation: selectedLight.citation }
    : selectedObject
      ? { title: chipText(selectedObject.label), citation: selectedObject.citation }
      : selectedDisplay
        ? { title: chipText(selectedDisplay.title), citation: selectedDisplay.citation }
        : eraChip;

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <figure
        className="relative overflow-hidden rounded-xl border border-white/10"
        style={{ background: day ? tint(palette.ambient, 0.04) : shade(palette.ambient, 0.2), ["--room-pulse" as string]: `${Math.max(0.55, 60 / tempoBpm)}s` }}
      >
        <RoomSvg
          scene={scene}
          palette={palette}
          label={label}
          selected={selected}
          interactive={interactive}
          onSelect={(id) => setSelected((current) => (current === id ? null : id))}
          onClear={() => setSelected(null)}
        />
        {interactive && chip ? (
          <figcaption className="absolute inset-x-2 bottom-2 z-10 rounded-lg border border-white/15 bg-black/80 p-2.5 text-left shadow-lg backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium text-white">{chip.title}</p>
              <button type="button" className="text-xs text-white/70" onClick={() => setSelected(null)} aria-label="Close provenance">
                Close
              </button>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-white/85">{provenanceLine(chip.citation)}</p>
          </figcaption>
        ) : null}
      </figure>
      {interactive ? (
        <div className="relative min-w-0">
          <div className="no-scrollbar flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1" aria-label="Room fixtures">
            {fixtureChips(scene, palette).map((chip) => (
              <ChipButton
                key={chip.id}
                pressed={selected === chip.id}
                onClick={() => setSelected((current) => (current === chip.id ? null : chip.id))}
                swatch={chip.swatch}
                text={chip.text}
              />
            ))}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0c0b0a] to-transparent" />
        </div>
      ) : null}
    </div>
  );
}

export function chipText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (/^era:/i.test(clean)) return clean.slice(0, 40);
  const words = clean.split(" ").slice(0, 3);
  while (words.length > 1 && words.join(" ").length > 22) words.pop();
  const label = words.join(" ");
  return label.length > 22 ? `${label.slice(0, 21)}…` : label;
}

export function chipSwatch(swatch: string, fallback: string): string {
  const hex = /^#[0-9a-fA-F]{6}$/.test(swatch) ? swatch : /^#[0-9a-fA-F]{6}$/.test(fallback) ? fallback : "#e6d3b3";
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  if (r + g + b < 200) return mixHex(hex, "#e6d3b3", 0.62);
  return hex;
}

function fixtureChips(scene: RoomScene, palette: Palette): { id: string; text: string; swatch: string }[] {
  const chips: { id: string; text: string; swatch: string }[] = [];
  const seen = new Set<string>();
  const push = (id: string, text: string, swatch: string) => {
    const label = chipText(text);
    const key = label.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    chips.push({ id, text: label, swatch: chipSwatch(swatch, palette.accent) });
  };
  if (scene.eraLabel) push("era", `Era: ${scene.eraLabel}, from the prompt`, palette.accent);
  push("display", scene.display.title, palette.accent);
  for (const light of scene.lights) push(light.id, light.label, light.color);
  for (const object of scene.objects) push(object.id, object.label, palette.secondary);
  return chips;
}

function ChipButton({
  pressed,
  onClick,
  swatch,
  text,
}: {
  pressed: boolean;
  onClick: () => void;
  swatch: string;
  text: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-left text-[11px] ${pressed ? "border-white/70 bg-white/15 text-white" : "border-white/15 bg-white/5 text-white/80"}`}
    >
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: swatch }} />
      <span className={text.toLowerCase().startsWith("era:") ? "max-w-48 truncate" : "max-w-28 truncate"}>{text}</span>
    </button>
  );
}

function RoomSvg({
  scene,
  palette,
  label,
  selected,
  interactive,
  onSelect,
  onClear,
}: {
  scene: RoomScene;
  palette: Palette;
  label: string;
  selected: string | null;
  interactive: boolean;
  onSelect: (id: string) => void;
  onClear: () => void;
}) {
  const uid = useId().replace(/:/g, "");
  const day = scene.timeLabel === "Day";
  const wallTop = day ? tint(palette.ambient, 0.06) : tint(palette.ambient, 0.34);
  const wallBottom = day ? shade(palette.ambient, 0.08) : tint(palette.ambient, 0.08);
  const floor = day ? shade(palette.ambient, 0.22) : shade(palette.primary, 0.72);
  const floorFront = day ? shade(palette.ambient, 0.32) : shade(palette.primary, 0.55);
  const wood = day ? "#6a5346" : "#3a2a22";

  return (
    <svg viewBox="0 0 1200 760" className="aspect-[5/4] w-full max-w-full overflow-hidden sm:aspect-[16/10]" role="img" aria-label={label} onClick={onClear}>
      <defs>
        <linearGradient id={`${uid}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={wallTop} />
          <stop offset="1" stopColor={wallBottom} />
        </linearGradient>
        <linearGradient id={`${uid}-floor`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={floor} />
          <stop offset="1" stopColor={floorFront} />
        </linearGradient>
        <filter id={`${uid}-grain`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <filter id={`${uid}-bloom`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <linearGradient id={`${uid}-ceiling`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity={day ? 0.12 : 0.42} />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${uid}-vignette`} cx="50%" cy="42%" r="68%">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={day ? 0.22 : 0.48} />
        </radialGradient>
        <clipPath id={`${uid}-win`}>
          <rect x={scene.windowBox.x} y={scene.windowBox.y} width={scene.windowBox.w} height={scene.windowBox.h} rx="2" />
        </clipPath>
        {scene.lights.map((light) => (
          <radialGradient key={light.id} id={`${uid}-${light.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={light.color} stopOpacity={0.28 + light.intensity * 0.6} />
            <stop offset="0.45" stopColor={light.color} stopOpacity={0.12 + light.intensity * 0.2} />
            <stop offset="1" stopColor={light.color} stopOpacity="0" />
          </radialGradient>
        ))}
        {scene.lights.map((light) => (
          <linearGradient key={`cone-${light.id}`} id={`${uid}-cone-${light.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={light.color} stopOpacity={0.55 + light.intensity * 0.3} />
            <stop offset="1" stopColor={light.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      <rect width="1200" height="500" fill={`url(#${uid}-wall)`} />
      {eighties(scene.eraLabel) ? <WoodPanel /> : null}
      <rect width="1200" height="180" fill={`url(#${uid}-ceiling)`} />
      <rect width="1200" height="500" filter={`url(#${uid}-grain)`} opacity={day ? 0.05 : 0.12} />
      <rect width="1200" height="26" fill="#000" opacity={day ? 0.08 : 0.38} />
      <polygon points="0,500 1200,500 1200,760 0,760" fill={`url(#${uid}-floor)`} />
      {Array.from({ length: 8 }, (_, index) => (
        <line key={index} x1={index * 160} y1="500" x2={index * 190 - 80} y2="760" stroke={wood} strokeOpacity={day ? 0.25 : 0.35} />
      ))}

      <WindowView uid={uid} scene={scene.window} box={scene.windowBox} accent={palette.accent} />
      <Poster box={scene.posterBox} display={scene.display} palette={palette} day={day} selected={selected === "display"} />
      {interactive ? (
        <Hit id="display" label={`Display, ${scene.display.title}`} selected={selected === "display"} onSelect={onSelect}>
          <rect x={scene.posterBox.x} y={scene.posterBox.y} width={scene.posterBox.w} height={scene.posterBox.h} fill="transparent" />
        </Hit>
      ) : null}

      {scene.lights.map((light) => (
        <LightCone key={`cone-${light.id}`} uid={uid} light={light} />
      ))}
      {scene.lights.map((light) => (
        <Glow key={`glow-${light.id}`} uid={uid} light={light} />
      ))}
      <FloorSheen lights={scene.lights} />

      {scene.objects.map((object) => (
        <Piece key={object.id} object={object} palette={palette} day={day} selected={selected === object.id} interactive={interactive} onSelect={onSelect} />
      ))}
      {scene.lights.map((light) => (
        <Fixture key={light.id} light={light} selected={selected === light.id} interactive={interactive} onSelect={onSelect} />
      ))}
      <AtmosphereBits scene={scene} />

      <rect y="488" width="1200" height="14" fill="#000" opacity={day ? 0.12 : 0.45} />
      <text x="28" y="478" fill={day ? "#3a312c" : "#f4efe6"} opacity="0.7" fontSize="18" fontFamily="ui-monospace, monospace">
        {scene.timeLabel}
      </text>
      <rect width="1200" height="760" fill={`url(#${uid}-vignette)`} pointerEvents="none" />
    </svg>
  );
}

function Hit({
  id,
  label,
  selected,
  onSelect,
  children,
}: {
  id: string;
  label: string;
  selected: boolean;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-pressed={selected}
      className="cursor-pointer"
      onClick={(event) => {
        event.stopPropagation();
        onSelect(id);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(id);
        }
      }}
    >
      {children}
    </g>
  );
}

function Glow({ uid, light }: { uid: string; light: RoomLight }) {
  const wide = light.kind === "string" || light.kind === "led-strip";
  const cx = wide && light.x2 ? (light.x + light.x2) / 2 : light.x;
  const rx = wide && light.x2 ? Math.abs(light.x2 - light.x) / 2 : 70 + light.intensity * 80;
  const ry = wide ? 36 + light.intensity * 20 : 50 + light.intensity * 40;
  return (
    <ellipse
      cx={cx}
      cy={light.y + (light.kind === "led-strip" ? 8 : 28)}
      rx={rx}
      ry={ry}
      fill={`url(#${uid}-${light.id})`}
      filter={`url(#${uid}-bloom)`}
      className={light.flicker > 0.5 ? "room-flicker" : "room-pulse"}
    />
  );
}

function LightCone({ uid, light }: { uid: string; light: RoomLight }) {
  if (light.kind === "string" || light.kind === "led-strip") return null;
  const spread = 64 + light.intensity * 110;
  const floorY = 620;
  return (
    <polygon
      points={`${light.x},${light.y + 8} ${light.x - spread},${floorY} ${light.x + spread},${floorY}`}
      fill={`url(#${uid}-cone-${light.id})`}
      className={light.flicker > 0.5 ? "room-flicker" : "room-pulse"}
      pointerEvents="none"
    />
  );
}

function FloorSheen({ lights }: { lights: RoomLight[] }) {
  return (
    <g pointerEvents="none">
      <ellipse cx="600" cy="690" rx="480" ry="26" fill="#fff" opacity="0.05" />
      {lights.map((light) => {
        const x = light.x2 != null ? (light.x + light.x2) / 2 : light.x;
        const wide = light.kind === "string" || light.kind === "led-strip";
        return (
          <ellipse
            key={light.id}
            cx={x}
            cy={628}
            rx={wide ? 120 : 34 + light.intensity * 28}
            ry={wide ? 10 : 7}
            fill={light.color}
            opacity={0.28 + light.intensity * 0.22}
          />
        );
      })}
    </g>
  );
}

function AtmosphereBits({ scene }: { scene: RoomScene }) {
  const day = scene.window === "day-pastel" || scene.window === "day-concrete";
  const rain = !day && (scene.window === "rain" || scene.window === "neon-city" || scene.plan === "neon");
  const steam = !day && (scene.plan === "bath" || scene.window === "dusk");
  return (
    <g pointerEvents="none">
      {rain ? <RainRoom /> : <Dust />}
      {steam ? <Steam x={scene.plan === "bath" ? 380 : 520} y={500} /> : null}
    </g>
  );
}

function Dust() {
  return (
    <g>
      {Array.from({ length: 16 }, (_, index) => (
        <circle
          key={index}
          className="room-mote"
          cx={70 + ((index * 83) % 1060)}
          cy={90 + ((index * 47) % 380)}
          r={index % 4 === 0 ? 3.4 : 1.8}
          fill="#f6f1e8"
          opacity="0.8"
          style={{ animationDelay: `${(index % 8) * 0.45}s` }}
        />
      ))}
    </g>
  );
}

function RainRoom() {
  return (
    <g opacity="0.4">
      {Array.from({ length: 24 }, (_, index) => (
        <line
          key={index}
          className="room-rain"
          x1={30 + index * 50}
          y1={24 + (index % 5) * 16}
          x2={16 + index * 50}
          y2={78 + (index % 5) * 16}
          stroke="#d7e6f4"
          strokeWidth="1.4"
          style={{ animationDelay: `${(index % 6) * 0.15}s` }}
        />
      ))}
    </g>
  );
}

function WindowView({
  uid,
  scene,
  box,
  accent,
}: {
  uid: string;
  scene: WindowScene;
  box: RoomScene["windowBox"];
  accent: string;
}) {
  return (
    <g>
      <rect x={box.x - 10} y={box.y - 10} width={box.w + 20} height={box.h + 24} rx="3" fill="#1c1612" />
      <g clipPath={`url(#${uid}-win)`}>
        <Sky scene={scene} box={box} accent={accent} />
      </g>
      <line x1={box.x + box.w / 2} y1={box.y} x2={box.x + box.w / 2} y2={box.y + box.h} stroke="#1c1612" strokeWidth="6" />
      <line x1={box.x} y1={box.y + box.h / 2} x2={box.x + box.w} y2={box.y + box.h / 2} stroke="#1c1612" strokeWidth="6" />
      <rect x={box.x - 14} y={box.y + box.h} width={box.w + 28} height="12" fill="#2a221c" />
    </g>
  );
}

function Sky({ scene, box, accent }: { scene: WindowScene; box: RoomScene["windowBox"]; accent: string }) {
  if (scene === "dusk") {
    return (
      <>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#e7a15a" />
        <rect x={box.x} y={box.y + box.h * 0.45} width={box.w} height={box.h * 0.55} fill="#c46b5a" />
        <circle cx={box.x + box.w * 0.72} cy={box.y + box.h * 0.62} r={Math.min(36, box.h * 0.18)} fill="#f6d7a2" />
        <g className="room-parallax">
          <path d={`M${box.x} ${box.y + box.h} L${box.x + box.w * 0.2} ${box.y + box.h * 0.62} L${box.x + box.w * 0.45} ${box.y + box.h} Z`} fill="#5d6a52" />
          <path d={`M${box.x + box.w * 0.35} ${box.y + box.h} L${box.x + box.w * 0.62} ${box.y + box.h * 0.5} L${box.x + box.w} ${box.y + box.h} Z`} fill="#3e4a3c" />
        </g>
      </>
    );
  }
  if (scene === "day-pastel") {
    return (
      <>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#f4d7c4" />
        <circle cx={box.x + box.w * 0.5} cy={box.y + 48} r="26" fill="#fff4d2" />
        <g className="room-parallax">
          <rect x={box.x + box.w * 0.3} y={box.y + box.h * 0.42} width={box.w * 0.4} height={box.h * 0.58} fill="#f2b7c4" />
          <polygon points={`${box.x + box.w * 0.3},${box.y + box.h * 0.42} ${box.x + box.w * 0.5},${box.y + box.h * 0.22} ${box.x + box.w * 0.7},${box.y + box.h * 0.42}`} fill="#f7c3a0" />
        </g>
      </>
    );
  }
  if (scene === "day-concrete") {
    return (
      <>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#c5c0b6" />
        <g className="room-parallax">
          <rect x={box.x + 18} y={box.y + box.h * 0.35} width={box.w - 36} height={box.h * 0.65} fill="#8e8a84" />
          <rect x={box.x + 28} y={box.y + box.h * 0.48} width="14" height="18" fill="#d9d4cc" />
          <rect x={box.x + 52} y={box.y + box.h * 0.48} width="14" height="18" fill="#d9d4cc" />
        </g>
      </>
    );
  }
  if (scene === "rain") {
    return (
      <>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#243246" />
        <rect className="room-parallax" x={box.x} y={box.y + box.h * 0.62} width={box.w} height={box.h * 0.38} fill="#1a2433" />
        {Array.from({ length: 14 }, (_, index) => (
          <line
            key={index}
            className="room-rain"
            x1={box.x + ((index * 37) % box.w)}
            y1={box.y + (index % 5) * 12}
            x2={box.x + ((index * 37) % box.w) - 8}
            y2={box.y + 36 + (index % 5) * 12}
            stroke="#d5e2ee"
            strokeWidth="2"
            opacity="0.75"
          />
        ))}
      </>
    );
  }
  if (scene === "neon-city") {
    return (
      <>
        <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#0d1524" />
        <rect x={box.x} y={box.y + box.h * 0.72} width={box.w} height="3" fill={accent} opacity="0.85" />
        <g className="room-parallax">
          {Array.from({ length: 6 }, (_, index) => (
            <rect key={index} x={box.x + 16 + index * (box.w / 7)} y={box.y + 30 + (index % 3) * 18} width={18} height={box.h * 0.62 - (index % 3) * 16} fill={index % 2 ? "#123" : "#1a2740"} stroke={accent} strokeOpacity="0.45" />
          ))}
        </g>
      </>
    );
  }
  return (
    <>
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="#141a28" />
      <circle cx={box.x + box.w * 0.78} cy={box.y + 36} r="10" fill="#f4efe6" opacity="0.85" />
      <g className="room-parallax">
        {Array.from({ length: 5 }, (_, index) => (
          <rect key={index} x={box.x + 20 + index * (box.w / 6)} y={box.y + box.h * 0.4} width={box.w / 8} height={box.h * 0.6} fill="#0c1018" />
        ))}
      </g>
      {Array.from({ length: 8 }, (_, index) => (
        <rect key={`w${index}`} x={box.x + 28 + (index % 5) * (box.w / 6)} y={box.y + box.h * 0.5 + Math.floor(index / 5) * 22} width="6" height="8" fill="#e7c27a" opacity="0.8" />
      ))}
    </>
  );
}

function Poster({
  box,
  display,
  palette,
  day,
  selected,
}: {
  box: RoomScene["posterBox"];
  display: RoomScene["display"];
  palette: Palette;
  day: boolean;
  selected: boolean;
}) {
  const lines = wrap(display.title, Math.max(8, Math.floor(box.w / 16)), 3);
  const paper = day ? "#f7f1e8" : "#16130f";
  const ink = day ? "#241c18" : "#f4efe6";
  return (
    <g>
      <rect x={box.x - 8} y={box.y - 8} width={box.w + 16} height={box.h + 16} fill={day ? "#fff" : "#0c0b0a"} stroke={selected ? "#fff" : palette.accent} strokeWidth={selected ? 4 : 2} />
      <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={paper} />
      <rect x={box.x} y={box.y} width={box.w} height="10" fill={palette.primary} />
      <rect x={box.x} y={box.y + box.h - 28} width={box.w} height="28" fill={palette.accent} opacity="0.85" />
      <text x={box.x + 12} y={box.y + 32} fill={ink} opacity="0.6" fontSize="12" fontFamily="ui-monospace, monospace">
        {display.kicker.slice(0, 22)}
      </text>
      {lines.map((line, index) => (
        <text key={line} x={box.x + 12} y={box.y + 70 + index * 34} fill={ink} fontSize={lines.length > 2 ? 22 : 28} fontFamily="Georgia, serif">
          {line}
        </text>
      ))}
    </g>
  );
}

function Fixture({
  light,
  selected,
  interactive,
  onSelect,
}: {
  light: RoomLight;
  selected: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  const body = (
    <g className={light.kind === "string" ? "room-drift" : undefined}>
      <LightShape light={light} />
      {selected ? <circle cx={light.x2 ? (light.x + light.x2) / 2 : light.x} cy={light.y} r="18" fill="none" stroke="#fff" strokeWidth="2" /> : null}
    </g>
  );
  if (!interactive) return body;
  return (
    <Hit id={light.id} label={`${light.kind}, ${light.label}`} selected={selected} onSelect={onSelect}>
      {body}
      <rect x={Math.min(light.x, light.x2 ?? light.x) - 20} y={light.y - 30} width={Math.abs((light.x2 ?? light.x) - light.x) + 40} height="70" fill="transparent" />
    </Hit>
  );
}

function LightShape({ light }: { light: RoomLight }) {
  if (light.kind === "string" && light.x2) {
    const span = light.x2 - light.x;
    return (
      <g>
        <path d={`M${light.x} ${light.y} Q ${(light.x + light.x2) / 2} ${light.y + 18} ${light.x2} ${light.y}`} fill="none" stroke={light.color} strokeWidth="2" />
        {Array.from({ length: 8 }, (_, index) => {
          const x = light.x + (span * (index + 0.5)) / 8;
          return <circle key={index} cx={x} cy={light.y + 8} r="5" fill={light.color} />;
        })}
      </g>
    );
  }
  if (light.kind === "led-strip" && light.x2) {
    return <rect x={light.x} y={light.y} width={light.x2 - light.x} height="6" rx="3" fill={light.color} />;
  }
  if (light.kind === "neon") {
    return (
      <g>
        <rect x={light.x - 46} y={light.y - 16} width="92" height="32" rx="8" fill="none" stroke={light.color} strokeWidth="4" />
        <text x={light.x} y={light.y + 5} textAnchor="middle" fill={light.color} fontSize="12" fontFamily="ui-monospace, monospace">
          {light.label.slice(0, 8)}
        </text>
      </g>
    );
  }
  if (light.kind === "lantern") {
    return (
      <g>
        <line x1={light.x} y1="26" x2={light.x} y2={light.y - 22} stroke={light.color} strokeWidth="2" />
        <rect x={light.x - 16} y={light.y - 22} width="32" height="40" rx="4" fill={light.color} opacity="0.9" />
        <line x1={light.x - 16} y1={light.y - 8} x2={light.x + 16} y2={light.y - 8} stroke="#1a120c" strokeOpacity="0.4" />
        <line x1={light.x - 16} y1={light.y + 4} x2={light.x + 16} y2={light.y + 4} stroke="#1a120c" strokeOpacity="0.4" />
      </g>
    );
  }
  if (light.kind === "floor-lamp") {
    return (
      <g>
        <line x1={light.x} y1={light.y} x2={light.x} y2="500" stroke="#cfc4b4" strokeWidth="3" />
        <polygon points={`${light.x - 22},${light.y + 8} ${light.x},${light.y - 28} ${light.x + 22},${light.y + 8}`} fill={light.color} />
      </g>
    );
  }
  if (light.kind === "table-lamp") {
    return (
      <g>
        <rect x={light.x - 8} y={light.y + 8} width="16" height="10" fill="#cfc4b4" />
        <polygon points={`${light.x - 20},${light.y + 8} ${light.x},${light.y - 20} ${light.x + 20},${light.y + 8}`} fill={light.color} />
      </g>
    );
  }
  if (light.kind === "sconce") {
    return (
      <g>
        <rect x={light.x - 4} y={light.y - 4} width="18" height="8" fill="#cfc4b4" />
        <path d={`M${light.x} ${light.y} A 18 18 0 0 1 ${light.x + 22} ${light.y + 16}`} fill="none" stroke={light.color} strokeWidth="6" />
      </g>
    );
  }
  if (light.kind === "globe") {
    return (
      <g>
        <line x1={light.x} y1="26" x2={light.x} y2={light.y - 22} stroke="#d9d0c4" strokeWidth="2" />
        <circle cx={light.x} cy={light.y} r="22" fill={light.color} />
        <circle cx={light.x - 6} cy={light.y - 6} r="6" fill="#fff" opacity="0.35" />
      </g>
    );
  }
  return (
    <g>
      <line x1={light.x} y1="26" x2={light.x} y2={light.y - 16} stroke="#d9d0c4" strokeWidth="2" />
      <polygon points={`${light.x - 26},${light.y + 10} ${light.x},${light.y - 18} ${light.x + 26},${light.y + 10}`} fill={light.color} />
      <ellipse cx={light.x} cy={light.y + 12} rx="16" ry="5" fill={light.color} opacity="0.85" />
    </g>
  );
}

function eighties(label: string | undefined): boolean {
  return Boolean(label && (/^198\d$/.test(label) || label === "1980s"));
}

function WoodPanel() {
  return (
    <g opacity="0.8">
      {Array.from({ length: 9 }, (_, index) => (
        <rect key={index} x={36 + index * 130} y="36" width="14" height="450" fill="#a56b3c" />
      ))}
    </g>
  );
}

function Piece({
  object,
  palette,
  day,
  selected,
  interactive,
  onSelect,
}: {
  object: RoomObject;
  palette: Palette;
  day: boolean;
  selected: boolean;
  interactive: boolean;
  onSelect: (id: string) => void;
}) {
  const fill = day ? "#3d322c" : "#221912";
  const body = (
    <g>
      <ObjectShape kind={object.kind} x={object.x} y={object.y} fill={fill} accent={palette.accent} />
      {selected ? <circle cx={object.x} cy={object.y - 30} r="26" fill="none" stroke="#fff" strokeWidth="2" /> : null}
    </g>
  );
  if (!interactive) return body;
  return (
    <Hit id={object.id} label={`${object.kind}, ${object.label}`} selected={selected} onSelect={onSelect}>
      {body}
      <rect x={object.x - 40} y={object.y - 70} width="80" height="80" fill="transparent" />
    </Hit>
  );
}

function ObjectShape({ kind, x, y, fill, accent }: { kind: RoomObject["kind"]; x: number; y: number; fill: string; accent: string }) {
  if (kind === "bar") {
    return (
      <g>
        <rect x={x - 96} y={y - 18} width="14" height="46" rx="2" fill={shade(fill, 0.15)} />
        <rect x={x + 82} y={y - 18} width="14" height="46" rx="2" fill={shade(fill, 0.15)} />
        <path d={`M${x - 98} ${y - 52} Q ${x} ${y - 36} ${x + 98} ${y - 52} L${x + 92} ${y - 28} L${x - 92} ${y - 28} Z`} fill={fill} />
        <rect x={x - 86} y={y - 28} width="172" height="34" fill={shade(fill, 0.25)} />
        <rect x={x - 70} y={y - 44} width="10" height="16" rx="2" fill={accent} opacity="0.85" />
        <rect x={x - 52} y={y - 48} width="8" height="20" rx="2" fill="#d9efe8" opacity="0.7" />
        <line x1={x - 78} y1={y + 10} x2={x + 78} y2={y + 10} stroke={accent} strokeWidth="3" />
      </g>
    );
  }
  if (kind === "sofa") {
    return (
      <g>
        <path d={`M${x - 86} ${y - 18} Q ${x} ${y - 8} ${x + 86} ${y - 18} L${x + 78} ${y + 8} L${x - 78} ${y + 8} Z`} fill={shade(fill, 0.2)} />
        <rect x={x - 78} y={y - 52} width="156" height="40" rx="16" fill={fill} />
        <rect x={x - 96} y={y - 70} width="26" height="58" rx="10" fill={fill} />
        <rect x={x + 70} y={y - 70} width="26" height="58" rx="10" fill={fill} />
        <rect x={x - 48} y={y - 46} width="40" height="22" rx="8" fill={accent} opacity="0.55" />
        <rect x={x + 8} y={y - 46} width="40" height="22" rx="8" fill={accent} opacity="0.35" />
      </g>
    );
  }
  if (kind === "chair" || kind === "stool") {
    return (
      <g>
        <ellipse cx={x} cy={y - 28} rx="24" ry="10" fill={fill} />
        {kind === "chair" ? (
          <path d={`M${x - 22} ${y - 36} Q ${x - 18} ${y - 78} ${x - 4} ${y - 74} L${x - 8} ${y - 36} Z`} fill={fill} />
        ) : (
          <circle cx={x} cy={y - 30} r="6" fill={accent} opacity="0.6" />
        )}
        <line x1={x - 16} y1={y - 20} x2={x - 22} y2={y + 4} stroke={fill} strokeWidth="3" />
        <line x1={x + 16} y1={y - 20} x2={x + 22} y2={y + 4} stroke={fill} strokeWidth="3" />
        <line x1={x - 10} y1={y - 18} x2={x - 8} y2={y + 2} stroke={fill} strokeWidth="3" />
        <line x1={x + 10} y1={y - 18} x2={x + 8} y2={y + 2} stroke={fill} strokeWidth="3" />
      </g>
    );
  }
  if (kind === "tub") {
    return (
      <g>
        <path d={`M${x - 86} ${y - 8} Q ${x} ${y + 28} ${x + 86} ${y - 8} L${x + 74} ${y - 28} Q ${x} ${y - 8} ${x - 74} ${y - 28} Z`} fill={fill} />
        <ellipse cx={x} cy={y - 24} rx="70" ry="20" fill={shade(fill, 0.1)} />
        <ellipse cx={x} cy={y - 28} rx="58" ry="14" fill={accent} opacity="0.55" />
        <ellipse cx={x - 16} cy={y - 32} rx="18" ry="5" fill="#fff" opacity="0.28" />
        <rect x={x + 48} y={y - 58} width="8" height="28" rx="3" fill="#d9d0c4" />
      </g>
    );
  }
  if (kind === "bench") {
    return <rect x={x - 70} y={y - 22} width="140" height="14" rx="3" fill={fill} />;
  }
  if (kind === "plinth") {
    return <polygon points={`${x - 50},${y} ${x - 36},${y - 48} ${x + 36},${y - 48} ${x + 50},${y}`} fill={fill} />;
  }
  if (kind === "table") {
    return (
      <g>
        <rect x={x - 54} y={y - 28} width="108" height="10" rx="2" fill={fill} />
        <line x1={x - 40} y1={y - 18} x2={x - 46} y2={y} stroke={fill} strokeWidth="4" />
        <line x1={x + 40} y1={y - 18} x2={x + 46} y2={y} stroke={fill} strokeWidth="4" />
      </g>
    );
  }
  if (kind === "book") {
    return (
      <g>
        <rect x={x - 18} y={y - 14} width="36" height="10" fill={accent} />
        <rect x={x - 16} y={y - 22} width="32" height="10" fill="#f4efe6" />
      </g>
    );
  }
  if (kind === "record" || kind === "speaker") {
    return (
      <g>
        <rect x={x - 22} y={y - 36} width="44" height="36" rx="4" fill={fill} />
        <circle cx={x} cy={y - 18} r="10" fill="none" stroke={accent} strokeWidth="3" />
      </g>
    );
  }
  if (kind === "bottle" || kind === "glass" || kind === "cup") {
    return (
      <g>
        <path d={`M${x - 8} ${y - 28} L${x - 12} ${y} L${x + 12} ${y} L${x + 8} ${y - 28} Z`} fill={kind === "bottle" ? accent : "#d9efe8"} opacity="0.9" />
        {kind === "bottle" ? <rect x={x - 3} y={y - 40} width="6" height="12" fill={accent} /> : null}
      </g>
    );
  }
  if (kind === "cake") {
    return (
      <g>
        <rect x={x - 16} y={y - 20} width="32" height="16" rx="4" fill={accent} />
        <circle cx={x} cy={y - 22} r="3" fill="#fff" />
      </g>
    );
  }
  if (kind === "textile") {
    return <rect x={x - 18} y={y - 70} width="36" height="64" fill={accent} opacity="0.85" />;
  }
  if (kind === "crt") {
    return (
      <g>
        <rect x={x - 36} y={y - 48} width="72" height="52" rx="4" fill={fill} />
        <rect x={x - 26} y={y - 40} width="52" height="32" fill={accent} />
        <rect x={x - 16} y={y + 4} width="32" height="8" fill={fill} />
      </g>
    );
  }
  if (kind === "lava") {
    return (
      <g>
        <rect x={x - 10} y={y - 8} width="20" height="8" rx="1" fill={fill} />
        <rect x={x - 8} y={y - 52} width="16" height="44" rx="8" fill={accent} opacity="0.9" />
        <circle cx={x} cy={y - 40} r="4" fill="#ffb703" />
        <circle cx={x} cy={y - 26} r="3" fill="#fb8500" />
        <rect x={x - 10} y={y - 58} width="20" height="8" rx="1" fill={fill} />
      </g>
    );
  }
  if (kind === "plant") {
    return (
      <g>
        <rect x={x - 10} y={y - 16} width="20" height="16" fill={fill} />
        <circle cx={x} cy={y - 30} r="16" fill="#3f6b45" />
        <circle cx={x - 12} cy={y - 22} r="10" fill="#4d7d52" />
      </g>
    );
  }
  return <rect x={x - 20} y={y - 20} width="40" height="20" fill={fill} />;
}

function Steam({ x, y }: { x: number; y: number }) {
  return (
    <g className="room-steam" opacity="0.7">
      <ellipse cx={x} cy={y} rx="22" ry="10" fill="#f4efe6" />
      <ellipse cx={x + 28} cy={y - 16} rx="16" ry="8" fill="#f4efe6" />
      <ellipse cx={x - 20} cy={y - 10} rx="14" ry="7" fill="#f4efe6" />
      <ellipse cx={x + 8} cy={y - 28} rx="10" ry="6" fill="#f4efe6" />
    </g>
  );
}
