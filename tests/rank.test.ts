import { describe, expect, it } from "vitest";

import { tagAccepts } from "@/lib/agent/queries";
import { chooseSeeds, chooseTags, relevantPlaces } from "@/lib/agent/rank";
import type { TasteEntity, TasteTag } from "@/lib/qloo/types";

function entity(id: string, name: string, type: string, tags: TasteTag[] = []): TasteEntity {
  return {
    id,
    name,
    type,
    description: null,
    imageUrl: null,
    popularity: 0.5,
    affinity: null,
    tags,
    explainers: [],
    mock: true,
  };
}

describe("candidate ranking", () => {
  it("rejects phonetic tag neighbors and keeps the word that was asked", () => {
    expect(tagAccepts("bathhouse", "Bach House")).toBe(false);
    expect(tagAccepts("bathhouse", "Bass House")).toBe(false);
    expect(tagAccepts("dusk", "Desk")).toBe(false);
    expect(tagAccepts("dusk", "Duck")).toBe(false);
    expect(tagAccepts("dusk", "Boat House")).toBe(false);
    expect(tagAccepts("bathhouse", "Bathhouse")).toBe(true);
    expect(tagAccepts("rainy", "Rain")).toBe(true);
    expect(tagAccepts("jazz", "Jazz")).toBe(true);

    const bach: TasteTag = { id: "tag-bach", name: "Bach House", type: "urn:tag" };
    const bath: TasteTag = { id: "tag-bath", name: "Bathhouse", type: "urn:tag" };
    const picked = chooseTags(
      [
        { tag: bach, query: "bathhouse" },
        { tag: bath, query: "bathhouse" },
      ],
      ["tag-bach", "tag-bath"],
    );
    expect(picked.tags.map((tag) => tag.name)).toEqual(["Bathhouse"]);
    expect(picked.rejected.some((row) => row.name === "Bach House")).toBe(true);
  });

  it("keeps the film when an artist only shares the studio name", () => {
    const artist = entity("artist", "Studio Ghibli", "urn:entity:artist");
    const film = entity("film", "Spirited Away", "urn:entity:movie");
    const picked = chooseSeeds(
      [
        { entity: artist, score: 0.96, query: "Studio Ghibli", typed: "open" },
        { entity: film, score: 0.4, query: "Studio Ghibli", typed: "movie" },
      ],
      [artist.id],
    );
    expect(picked.seeds.map((seed) => seed.name)).toEqual(["Spirited Away"]);
    expect(picked.notes.join(" ")).toMatch(/Dropped Studio Ghibli/);
  });

  it("keeps a person when the prompt names that person", () => {
    const person = entity("person", "Wes Anderson", "urn:entity:person");
    const film = entity("film", "The Grand Budapest Hotel", "urn:entity:movie");
    const picked = chooseSeeds(
      [
        { entity: person, score: 1, query: "Wes Anderson", typed: "open" },
        { entity: film, score: 0.5, query: "Wes Anderson", typed: "movie" },
      ],
      [person.id],
    );
    expect(picked.seeds.map((seed) => seed.name)).toContain("Wes Anderson");
    expect(picked.seeds.map((seed) => seed.name)).not.toContain("The Grand Budapest Hotel");
  });

  it("drops a monument that shares no words with the place phrase", () => {
    const monument = entity("arc", "Arc de Triomphe", "urn:entity:place");
    const bar = entity("bar", "The Jazz Bar", "urn:entity:place", [
      { id: "jazz", name: "Jazz", type: "urn:tag" },
      { id: "bar", name: "Bar", type: "urn:tag" },
    ]);
    const kept = relevantPlaces("Blade Runner meets a 1970s jazz bar", [monument, bar]);
    expect(kept.map((place) => place.name)).toEqual(["The Jazz Bar"]);
  });
});
