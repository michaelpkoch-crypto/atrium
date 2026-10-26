import type { LightBias, PlanId } from "@/lib/atmosphere/families";

export type LightKind = "pendant" | "floor-lamp" | "table-lamp" | "sconce" | "string" | "led-strip" | "lantern" | "neon" | "globe";
export type ObjectKind =
  | "sofa"
  | "chair"
  | "table"
  | "bar"
  | "stool"
  | "plant"
  | "record"
  | "book"
  | "glass"
  | "cup"
  | "bottle"
  | "cake"
  | "tub"
  | "bench"
  | "plinth"
  | "speaker"
  | "textile"
  | "crt"
  | "lava";

export type ObjectRole = "place" | "brand" | "book" | "artist" | "any";

export type Box = { x: number; y: number; w: number; h: number };

export type LightSlot = {
  kind: LightKind;
  x: number;
  y: number;
  x2: number | null;
  prefer: LightBias[];
};

export type ObjectSlot = {
  kind: ObjectKind;
  x: number;
  y: number;
  role: ObjectRole;
};

export type RoomPlan = {
  id: PlanId;
  windowBox: Box;
  posterBox: Box;
  lights: LightSlot[];
  objects: ObjectSlot[];
};

const string = (x: number, x2: number, y: number): LightSlot => ({
  kind: "string",
  x,
  y,
  x2,
  prefer: [],
});

export const PLANS: Record<PlanId, RoomPlan> = {
  lounge: {
    id: "lounge",
    windowBox: { x: 860, y: 72, w: 250, h: 188 },
    posterBox: { x: 64, y: 78, w: 176, h: 248 },
    lights: [
      { kind: "pendant", x: 560, y: 148, x2: null, prefer: ["warm", "lantern", "soft"] },
      { kind: "neon", x: 300, y: 128, x2: null, prefer: ["neon"] },
      { kind: "floor-lamp", x: 250, y: 430, x2: null, prefer: ["warm", "cool"] },
      string(70, 1120, 40),
      { kind: "table-lamp", x: 700, y: 392, x2: null, prefer: ["warm", "soft"] },
      { kind: "led-strip", x: 500, y: 470, x2: 980, prefer: ["line", "neon"] },
    ],
    objects: [
      { kind: "bar", x: 640, y: 548, role: "place" },
      { kind: "record", x: 210, y: 468, role: "artist" },
      { kind: "bottle", x: 760, y: 500, role: "brand" },
      { kind: "stool", x: 500, y: 560, role: "any" },
    ],
  },
  neon: {
    id: "neon",
    windowBox: { x: 64, y: 58, w: 430, h: 236 },
    posterBox: { x: 980, y: 78, w: 160, h: 230 },
    lights: [
      { kind: "neon", x: 760, y: 150, x2: null, prefer: ["neon"] },
      { kind: "led-strip", x: 48, y: 478, x2: 1152, prefer: ["line", "neon"] },
      { kind: "pendant", x: 620, y: 124, x2: null, prefer: ["neon", "cool", "line"] },
      { kind: "sconce", x: 930, y: 168, x2: null, prefer: ["neon", "cool"] },
      { kind: "floor-lamp", x: 200, y: 440, x2: null, prefer: ["warm", "soft"] },
      string(90, 1100, 36),
    ],
    objects: [
      { kind: "table", x: 680, y: 540, role: "place" },
      { kind: "speaker", x: 160, y: 500, role: "artist" },
      { kind: "bottle", x: 820, y: 500, role: "brand" },
      { kind: "sofa", x: 360, y: 560, role: "any" },
    ],
  },
  rain: {
    id: "rain",
    windowBox: { x: 52, y: 46, w: 400, h: 268 },
    posterBox: { x: 980, y: 72, w: 156, h: 220 },
    lights: [
      { kind: "table-lamp", x: 730, y: 372, x2: null, prefer: ["warm", "soft", "cool"] },
      { kind: "floor-lamp", x: 500, y: 430, x2: null, prefer: ["cool", "warm"] },
      { kind: "pendant", x: 820, y: 128, x2: null, prefer: ["cool", "warm", "lantern"] },
      { kind: "sconce", x: 920, y: 160, x2: null, prefer: ["cool", "line"] },
    ],
    objects: [
      { kind: "table", x: 700, y: 530, role: "place" },
      { kind: "chair", x: 540, y: 545, role: "any" },
      { kind: "book", x: 760, y: 490, role: "book" },
      { kind: "bottle", x: 860, y: 500, role: "brand" },
    ],
  },
  symmetry: {
    id: "symmetry",
    windowBox: { x: 450, y: 48, w: 300, h: 188 },
    posterBox: { x: 96, y: 70, w: 200, h: 250 },
    lights: [
      { kind: "pendant", x: 500, y: 118, x2: null, prefer: ["soft", "warm"] },
      { kind: "pendant", x: 700, y: 118, x2: null, prefer: ["soft", "warm"] },
      { kind: "table-lamp", x: 600, y: 360, x2: null, prefer: ["soft", "warm"] },
      string(140, 1060, 34),
      { kind: "sconce", x: 980, y: 150, x2: null, prefer: ["soft", "cool"] },
    ],
    objects: [
      { kind: "table", x: 600, y: 545, role: "place" },
      { kind: "chair", x: 430, y: 555, role: "any" },
      { kind: "cake", x: 600, y: 500, role: "brand" },
      { kind: "textile", x: 1020, y: 430, role: "any" },
    ],
  },
  bath: {
    id: "bath",
    windowBox: { x: 150, y: 78, w: 560, h: 176 },
    posterBox: { x: 990, y: 64, w: 150, h: 280 },
    lights: [
      { kind: "lantern", x: 280, y: 156, x2: null, prefer: ["lantern", "warm", "soft"] },
      { kind: "lantern", x: 540, y: 142, x2: null, prefer: ["lantern", "warm"] },
      string(80, 1100, 40),
      { kind: "pendant", x: 820, y: 150, x2: null, prefer: ["warm", "soft", "cool"] },
      { kind: "table-lamp", x: 760, y: 400, x2: null, prefer: ["warm", "lantern"] },
    ],
    objects: [
      { kind: "tub", x: 380, y: 575, role: "place" },
      { kind: "cup", x: 720, y: 500, role: "brand" },
      { kind: "bench", x: 180, y: 555, role: "any" },
      { kind: "plant", x: 900, y: 530, role: "book" },
    ],
  },
  brutalist: {
    id: "brutalist",
    windowBox: { x: 72, y: 64, w: 132, h: 300 },
    posterBox: { x: 860, y: 120, w: 230, h: 150 },
    lights: [
      { kind: "led-strip", x: 280, y: 472, x2: 1000, prefer: ["line", "cool", "neon"] },
      { kind: "pendant", x: 620, y: 128, x2: null, prefer: ["line", "cool", "warm"] },
      { kind: "sconce", x: 360, y: 170, x2: null, prefer: ["cool", "line"] },
    ],
    objects: [
      { kind: "plinth", x: 560, y: 555, role: "place" },
      { kind: "chair", x: 780, y: 545, role: "any" },
      { kind: "book", x: 600, y: 490, role: "book" },
    ],
  },
  living: {
    id: "living",
    windowBox: { x: 72, y: 68, w: 300, h: 210 },
    posterBox: { x: 900, y: 76, w: 190, h: 246 },
    lights: [
      { kind: "pendant", x: 500, y: 140, x2: null, prefer: ["warm", "soft", "cool", "lantern"] },
      { kind: "floor-lamp", x: 180, y: 430, x2: null, prefer: ["warm", "cool"] },
      { kind: "table-lamp", x: 700, y: 384, x2: null, prefer: ["warm", "soft"] },
      string(80, 1120, 40),
      { kind: "sconce", x: 820, y: 160, x2: null, prefer: ["cool", "neon", "line"] },
    ],
    objects: [
      { kind: "sofa", x: 360, y: 560, role: "place" },
      { kind: "table", x: 680, y: 540, role: "any" },
      { kind: "plant", x: 1040, y: 530, role: "brand" },
      { kind: "book", x: 720, y: 490, role: "book" },
    ],
  },
};
