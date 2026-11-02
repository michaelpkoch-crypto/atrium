import { describe, expect, it } from "vitest";

import { compileAtmosphere } from "@/lib/atmosphere/compile";
import { atmosphereSchema } from "@/lib/atmosphere/schema";
import type { TasteEntity, TasteGraph } from "@/lib/qloo/types";

function entity(
  id: string,
  name: string,
  type: string,
  tagNames: string[],
  affinity: number | null = null,
): TasteEntity {
  return {
    id,
    name,
    type,
    description: null,
    imageUrl: null,
    popularity: 0.5,
    affinity,
    tags: tagNames.map((tag) => ({ id: `tag:${tag}`, name: tag, type: "urn:tag:keyword" })),
    explainers: [],
    mock: false,
  };
}

function graph(partial: Partial<TasteGraph> & Pick<TasteGraph, "seeds">): TasteGraph {
  return {
    source: "qloo",
    synthetic: false,
    artists: [],
    places: [],
    brands: [],
    books: [],
    movies: [],
    tags: [],
    signalEntityIds: partial.seeds.map((seed) => seed.id),
    signalTagIds: [],
    ...partial,
  };
}

function citationIds(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) citationIds(item, found);
    return found;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string" && typeof record.detail === "string" && "affinity" in record) {
    found.push(record.id);
  }
  for (const item of Object.values(record)) citationIds(item, found);
  return found;
}

describe("atmosphere compiler", () => {
  const seed = entity("seed-1", "Seed Film", "urn:entity:movie", ["Neon"]);
  const artist = entity("artist-1", "Unique Quartz Trio", "urn:entity:artist", ["Jazz"], 0.81);

  it("is deterministic and schema-valid", () => {
    const input = graph({ seeds: [seed], artists: [artist] });
    const first = compileAtmosphere("Seed Film in a jazz bar", input);
    const second = compileAtmosphere("Seed Film in a jazz bar", input);
    expect(first).toEqual(second);
    expect(atmosphereSchema.parse(first)).toEqual(first);
  });

  it("plays the artists from the graph instead of a fixed playlist", () => {
    const room = compileAtmosphere("anything", graph({ seeds: [seed], artists: [artist] }));
    expect(room.music.map((track) => track.name)).toContain("Unique Quartz Trio");
    expect(room.provenance.source).toBe("qloo");
    expect(room.provenance.mockLabeled).toBe(false);

    const other = entity("artist-2", "Paper Lantern Duo", "urn:entity:artist", ["Tea"], 0.4);
    const next = compileAtmosphere("anything", graph({ seeds: [seed], artists: [other] }));
    expect(next.music.map((track) => track.name)).toContain("Paper Lantern Duo");
    expect(next.music.map((track) => track.name)).not.toContain("Unique Quartz Trio");
  });

  it("cites only entities that were in the graph", () => {
    const place = entity("place-1", "North Counter", "urn:entity:place", ["Whiskey"], 0.7);
    const input = graph({ seeds: [seed], artists: [artist], places: [place] });
    const room = compileAtmosphere("Seed Film", input);
    const allowed = new Set([seed.id, artist.id, place.id, ...input.tags.map((tag) => tag.id)]);
    for (const id of citationIds(room)) expect(allowed.has(id)).toBe(true);
    expect(room.decor.length).toBeGreaterThanOrEqual(2);
    expect(room.drinks[0]?.venue).toBe("North Counter");
  });

  it("keeps a tea room ahead of a higher-affinity cocktail bar", () => {
    const show = entity("show-1", "Bridgerton", "urn:entity:tv_show", ["Romance"]);
    const teaRoom = entity("place-tea", "Tea Room - Siena", "urn:entity:place", ["tea", "tea room"], 0.4);
    const sky = entity("place-sky", "Sky Garden", "urn:entity:place", ["cocktail", "bar"], 0.92);
    const room = compileAtmosphere(
      "Bridgerton garden tea party",
      graph({ seeds: [show], places: [teaRoom, sky] }),
    );
    expect(room.drinks[0]?.venue).toBe("Tea Room - Siena");
    expect(room.drinks[0]?.name).toBe("Earl Grey");
    expect(room.room.objects.some((object) => object.kind === "rug")).toBe(true);
    expect(room.room.objects.some((object) => object.kind === "teapot" || object.kind === "cake")).toBe(true);
  });

  it("keeps a Qloo image on the screen and drops anything that is not https", () => {
    const pictured = entity("film-pic", "Halloween", "urn:entity:movie", ["Horror"]);
    pictured.imageUrl = "https://images.example.test/halloween.jpg";
    const room = compileAtmosphere("Halloween", graph({ seeds: [pictured] }));
    expect(room.room.lightScene.name).toBe("Blacklight");
    expect(room.room.displays.some((screen) => screen.imageUrl === "https://images.example.test/halloween.jpg")).toBe(true);
    expect(room.room.displays.find((screen) => screen.imageUrl)?.citation.detail).toMatch(/image Qloo returned/);

    const insecure = entity("film-http", "Hocus Pocus", "urn:entity:movie", ["Horror"]);
    insecure.imageUrl = "http://images.example.test/plain.jpg";
    const fallback = compileAtmosphere("Halloween", graph({ seeds: [insecure] }));
    expect(fallback.room.displays.every((screen) => screen.imageUrl == null)).toBe(true);
  });

  it("grades a 1970s room amber and hangs a globe", () => {
    const film = entity("film-1", "Blade Runner", "urn:entity:movie", ["Jazz", "Noir"]);
    const room = compileAtmosphere("Blade Runner meets a 1970s jazz bar", graph({ seeds: [film] }));
    expect(room.palette.ambient).toBe("#8a5a32");
    expect(room.room.lights.some((light) => light.kind === "globe" && light.y <= 150)).toBe(true);
    expect(room.room.eraLabel).toBe("1970s");
  });
});
