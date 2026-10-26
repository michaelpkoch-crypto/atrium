import { z } from "zod";

export const citationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  affinity: z.number().min(0).max(1).nullable(),
  detail: z.string().min(1),
  /** Tag name that drove the choice, when the fixture is citing a Qloo tag rather than only an entity. */
  tag: z.string().nullable(),
});

const hex = z.string().regex(/^#[0-9a-f]{6}$/);

function httpsArtworkUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && value.length <= 2000;
  } catch {
    return false;
  }
}

const artworkUrl = z.string().max(2000).refine(httpsArtworkUrl, "Artwork image must be an https URL.");

export const visualModeSchema = z.enum(["rain", "neon-grid", "symmetry", "grain-warm", "paper", "brutalist"]);

export const planIdSchema = z.enum(["lounge", "neon", "rain", "symmetry", "bath", "brutalist", "living"]);
export const windowSceneSchema = z.enum(["night-city", "dusk", "rain", "day-pastel", "day-concrete", "neon-city"]);
export const lightKindSchema = z.enum([
  "pendant",
  "floor-lamp",
  "table-lamp",
  "sconce",
  "string",
  "led-strip",
  "lantern",
  "neon",
  "globe",
]);
export const objectKindSchema = z.enum([
  "sofa",
  "chair",
  "table",
  "bar",
  "stool",
  "plant",
  "record",
  "book",
  "glass",
  "cup",
  "bottle",
  "cake",
  "tub",
  "bench",
  "plinth",
  "speaker",
  "textile",
  "crt",
  "lava",
  "jukebox",
  "booth",
  "umbrella",
  "sprite",
  "console",
  "shelf",
  "rug",
  "teapot",
]);
export const textureKindSchema = z.enum(["rain", "vinyl", "water", "crowd", "air", "steam", "tape"]);

const boxSchema = z.object({
  x: z.number().min(0).max(1200),
  y: z.number().min(0).max(760),
  w: z.number().min(1).max(1200),
  h: z.number().min(1).max(760),
});

export const roomLightSchema = z.object({
  id: z.string().min(1),
  kind: lightKindSchema,
  x: z.number().min(0).max(1200),
  y: z.number().min(0).max(760),
  x2: z.number().min(0).max(1200).nullable(),
  color: hex,
  intensity: z.number().min(0).max(1),
  flicker: z.number().min(0).max(1),
  label: z.string().min(1).max(80),
  citation: citationSchema,
});

export const roomObjectSchema = z.object({
  id: z.string().min(1),
  kind: objectKindSchema,
  x: z.number().min(0).max(1200),
  y: z.number().min(0).max(760),
  label: z.string().min(1).max(80),
  citation: citationSchema,
});

export const roomSceneSchema = z.object({
  plan: planIdSchema,
  window: windowSceneSchema,
  timeLabel: z.string().min(1).max(40),
  /** Year or decade taken from the prompt. Absent when the prompt names none. */
  eraLabel: z.string().min(1).max(40).optional(),
  windowBox: boxSchema,
  posterBox: boxSchema,
  lights: z.array(roomLightSchema).min(2).max(8),
  objects: z.array(roomObjectSchema).min(2).max(8),
  display: z.object({
    kicker: z.string().min(1).max(80),
    title: z.string().min(1).max(80),
    subtitle: z.string().min(1).max(160),
    citation: citationSchema,
  }),
});

export const atmosphereSchema = z.object({
  version: z.literal(1),
  prompt: z.string().max(400),
  title: z.string().min(1).max(300),
  logline: z.string().min(1),
  provenance: z.object({
    source: z.enum(["qloo", "mock"]),
    mockLabeled: z.boolean(),
    synthetic: z.boolean(),
    note: z.string().min(1),
  }),
  signals: z.object({
    entityIds: z.array(z.string()),
    tagIds: z.array(z.string()),
  }),
  seeds: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  visual: z.object({
    mode: visualModeSchema,
    artwork: z.object({
      kind: z.enum(["generative", "entity-image"]),
      caption: z.string().min(1),
      imageUrl: artworkUrl.nullable(),
      citation: citationSchema,
    }),
  }),
  palette: z.object({
    primary: hex,
    secondary: hex,
    accent: hex,
    ambient: hex,
    ink: hex,
    reasons: z
      .array(
        z.object({
          role: z.enum(["primary", "secondary", "accent", "ambient"]),
          hex,
          because: z.string().min(1),
          citation: citationSchema,
        }),
      )
      .min(4),
  }),
  audio: z.object({
    tempoBpm: z.number().int().min(48).max(140),
    scale: z.enum(["minor-pentatonic", "dorian", "lydian", "phrygian", "mixolydian"]),
    rootHz: z.number().positive(),
    frequencies: z.array(z.number().positive()).min(4).max(8),
    noise: z.number().min(0).max(1),
    filterHz: z.number().positive(),
    texture: textureKindSchema,
    description: z.string().min(1),
    citation: citationSchema,
    layers: z
      .array(
        z.object({
          id: z.string().min(1),
          role: z.enum(["pad", "texture", "pulse"]),
          label: z.string().min(1),
          citation: citationSchema,
        }),
      )
      .min(3)
      .max(3),
  }),
  room: roomSceneSchema,
  music: z
    .array(
      z.object({
        name: z.string(),
        entityId: z.string(),
        affinity: z.number().nullable(),
        why: z.string().min(1),
        tags: z.array(z.string()),
        gap: z.boolean(),
      }),
    )
    .min(1),
  drinks: z
    .array(
      z.object({
        name: z.string(),
        venue: z.string(),
        venueId: z.string(),
        affinity: z.number().nullable(),
        because: z.string().min(1),
        citation: citationSchema,
        gap: z.boolean(),
      }),
    )
    .min(1),
  decor: z
    .array(
      z.object({
        item: z.string(),
        because: z.string().min(1),
        citation: citationSchema,
      }),
    )
    .min(2),
  reading: z.array(
    z.object({
      name: z.string(),
      entityId: z.string(),
      affinity: z.number().nullable(),
      why: z.string(),
      tags: z.array(z.string()),
    }),
  ),
  pictures: z.array(
    z.object({
      name: z.string(),
      entityId: z.string(),
      affinity: z.number().nullable(),
      why: z.string(),
      tags: z.array(z.string()),
    }),
  ),
});

export type Atmosphere = z.infer<typeof atmosphereSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type VisualMode = z.infer<typeof visualModeSchema>;
export type RoomScene = z.infer<typeof roomSceneSchema>;
export type RoomLight = z.infer<typeof roomLightSchema>;
export type RoomObject = z.infer<typeof roomObjectSchema>;
