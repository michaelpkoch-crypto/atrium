/** Deterministic color math for the atmosphere compiler. No clock, no randomness. */

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * Math.min(1, Math.max(0, color)))
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function circularMean(votes: { hue: number; weight: number }[]): number {
  let x = 0;
  let y = 0;
  for (const vote of votes) {
    const rad = (vote.hue * Math.PI) / 180;
    x += Math.cos(rad) * vote.weight;
    y += Math.sin(rad) * vote.weight;
  }
  if (x === 0 && y === 0) return 28;
  const degrees = (Math.atan2(y, x) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

export function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Approximate sRGB → CIE xy for a Hue bridge. Good enough to set a room, not a calibration. */
export function rgbToXy(r: number, g: number, b: number): [number, number] {
  const gamma = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = gamma(r);
  const G = gamma(g);
  const B = gamma(b);
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const sum = X + Y + Z || 1;
  return [round(X / sum), round(Y / sum)];
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Mix two #rrggbb colors. Amount 0 stays on `base`; amount 1 is `toward`. */
export function mixHex(base: string, toward: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(base);
  const [r2, g2, b2] = hexToRgb(toward);
  const t = Math.max(0, Math.min(1, amount));
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r1, r2)}${channel(g1, g2)}${channel(b1, b2)}`;
}
