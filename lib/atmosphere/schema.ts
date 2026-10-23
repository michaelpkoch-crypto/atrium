import { z } from "zod";

export const citationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  affinity: z.number().min(0).max(1).nullable(),
  detail: z.string().min(1),
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

export const visualModeSchema = z.enum([
  "rain",
  "neon-grid",
  "symmetry",
  "grain-warm",
  "paper",
  "brutalist",
]);

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
    description: z.string().min(1),
    citation: citationSchema,
  }),
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
