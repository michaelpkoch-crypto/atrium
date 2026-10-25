import { describe, expect, it } from "vitest";

import { compileFromPrompt } from "@/lib/agent/orchestrate";
import {
  confirmsName,
  humanizeTagName,
  isLandmark,
  knownProposal,
  placeFits,
  promptEchoPlace,
  tagAllowed,
} from "@/lib/agent/propose";
import { MockTasteClient } from "@/lib/qloo/mock";
import type { TasteEntity } from "@/lib/qloo/types";

const env = { QLOO_MODE: "mock" };

function place(name: string, tags: string[]): TasteEntity {
  return {
    id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    name,
    type: "urn:entity:place",
    description: null,
    imageUrl: null,
    popularity: null,
    affinity: null,
    tags: tags.map((tag) => ({ id: `tag:${tag}`, name: tag, type: "urn:tag:keyword" })),
    explainers: [],
    mock: true,
  };
}

describe("seed proposals for the sample prompts", () => {
  it("names Spirited Away, not a title that merely starts with Studio", () => {
    const proposal = knownProposal("Studio Ghibli bathhouse at dusk");
    expect(proposal?.works.map((work) => work.name)).toEqual(["Spirited Away", "My Neighbor Totoro"]);
    expect(proposal?.people.map((person) => person.name)).toEqual(["Joe Hisaishi", "Hayao Miyazaki"]);
    expect(proposal?.placeQueries).toEqual(["onsen", "sento"]);
    expect(confirmsName("Spirited Away", "Studio 666")).toBe(false);
    expect(confirmsName("Studio Ghibli", "Studio 666")).toBe(false);
    expect(confirmsName("Spirited Away", "Spirited Away")).toBe(true);
    expect(confirmsName("Blade Runner 2049", "Blade Runner")).toBe(false);
    expect(confirmsName("Blade Runner", "Blade Runner 2049")).toBe(false);
    expect(tagAllowed("The haunted house", proposal!)).toBe(false);
    expect(tagAllowed("Collecting vinyl", proposal!)).toBe(false);
    expect(tagAllowed("Bathhouse", proposal!)).toBe(true);
    expect(promptEchoPlace("Bathhouse Studios", "Studio Ghibli bathhouse at dusk")).toBe(true);
    expect(promptEchoPlace("Bathhouse Tea Counter", "Studio Ghibli bathhouse at dusk")).toBe(false);
  });

  it("names the Wes Anderson films and refuses a place called Brunch", () => {
    const proposal = knownProposal("a Wes Anderson brunch");
    expect(proposal?.works.map((work) => work.name)).toEqual(["The Grand Budapest Hotel", "The Royal Tenenbaums"]);
    expect(proposal?.people.map((person) => person.name)).toEqual(["Wes Anderson", "Alexandre Desplat"]);
    expect(proposal?.placeTags).toEqual(expect.arrayContaining(["cafe", "brunch", "pastry"]));
    expect(promptEchoPlace("Brunch", "a Wes Anderson brunch")).toBe(true);
    expect(placeFits(place("Brunch", ["brunch", "cafe"]), proposal!, "a Wes Anderson brunch")).toBe(false);
    expect(placeFits(place("Pink Linen Cafe", ["brunch", "pastry", "cafe"]), proposal!, "a Wes Anderson brunch")).toBe(true);
    expect(humanizeTagName("European_literature:german_literature")).toBe("German Literature");
    expect(tagAllowed("European_literature:german_literature", proposal!)).toBe(false);
  });

  it("names Murakami's novels and a jazz kissa, not a landmark", () => {
    const proposal = knownProposal("reading Murakami on a rainy night");
    expect(proposal?.works.map((work) => `${work.name}:${work.kind}`)).toEqual([
      "Norwegian Wood:book",
      "Kafka on the Shore:book",
    ]);
    expect(proposal?.people.map((person) => person.name)).toContain("Bill Evans");
    expect(proposal?.city).toBe("Tokyo");
    expect(humanizeTagName("American:american_novels")).toBe("American Novels");
    expect(tagAllowed("American:american_novels", proposal!)).toBe(false);
    for (const name of [
      "Gaudí House Museum",
      "Széchenyi Thermal Bath",
      "Park Güell",
      "Westminster Abbey",
      "Hall of Mirrors",
      "St Mark's Campanile",
    ]) {
      expect(isLandmark(name), name).toBe(true);
      expect(placeFits(place(name, ["cafe"]), proposal!, "reading Murakami on a rainy night")).toBe(false);
    }
    expect(placeFits(place("Rain Window Kissaten", ["cafe", "kissaten", "jazz"]), proposal!, "reading Murakami on a rainy night")).toBe(
      true,
    );
  });

  it("keeps Blade Runner and drops brutal death and a mall", () => {
    const proposal = knownProposal("Blade Runner meets a 1970s jazz bar");
    expect(proposal?.works[0]).toEqual({ name: "Blade Runner", kind: "movie" });
    expect(proposal?.people.map((person) => person.name)).toContain("Vangelis");
    expect(tagAllowed("Brutal death", proposal!)).toBe(false);
    expect(placeFits(place("Westfield World Trade Center", ["mall"]), proposal!, "Blade Runner meets a 1970s jazz bar")).toBe(false);
    expect(placeFits(place("Sodium Lamp Bar", ["cocktail", "bar", "jazz"]), proposal!, "Blade Runner meets a 1970s jazz bar")).toBe(true);
  });
});

describe("mock rooms from canonical seeds", () => {
  async function compile(prompt: string) {
    return compileFromPrompt(prompt, { client: new MockTasteClient(), env, allowLlm: false });
  }

  it("compiles the Ghibli bathhouse from Spirited Away and Joe Hisaishi", async () => {
    const result = await compile("Studio Ghibli bathhouse at dusk");
    const names = result.graph.seeds.map((seed) => seed.name);
    expect(names).toEqual(expect.arrayContaining(["Spirited Away", "Joe Hisaishi"]));
    expect(names.join(" ")).not.toMatch(/Studio 666|Slipknot|Pantera/);
    expect(result.graph.places.map((place) => place.name)).toContain("Bathhouse Tea Counter");
    expect(result.atmosphere.drinks.map((drink) => drink.name)).toEqual(["Hojicha"]);
    expect(result.atmosphere.title).not.toMatch(/Studio 666|Bathhouse Studios/);
    expect(result.atmosphere.room.plan).toBe("bath");
    expect(result.comparison.headline).toMatch(/Qloo adds .+ The plain reading did not name them/);
    expect(result.comparison.qlooAdded.map((item) => item.label)).toEqual(expect.arrayContaining(["Joe Hisaishi", "Spirited Away"]));
    expect(result.steps[0]?.call).toBe("propose_seeds");
  });

  it("compiles Wes Anderson from the films and Pink Linen, not a place named Brunch", async () => {
    const result = await compile("a Wes Anderson brunch");
    const names = [
      ...result.graph.seeds.map((seed) => seed.name),
      ...result.graph.artists.map((artist) => artist.name),
      ...result.graph.movies.map((movie) => movie.name),
    ];
    expect(names).toEqual(expect.arrayContaining(["The Grand Budapest Hotel", "Wes Anderson", "Alexandre Desplat"]));
    expect(result.graph.artists.map((artist) => artist.name)).toContain("Mark Mothersbaugh");
    expect(result.graph.places.map((place) => place.name)).toEqual(["Pink Linen Cafe"]);
    expect(result.atmosphere.drinks.map((drink) => drink.name)).not.toContain("Cardamom cortado");
    expect(result.atmosphere.visual.mode).toBe("symmetry");
  });

  it("compiles Murakami from the novels and a kissaten in Tokyo", async () => {
    const result = await compile("reading Murakami on a rainy night");
    expect(result.graph.seeds.map((seed) => seed.name)).toEqual(
      expect.arrayContaining(["Norwegian Wood", "Kafka on the Shore", "Haruki Murakami", "Bill Evans"]),
    );
    expect(result.graph.places.map((place) => place.name)).toEqual(["Rain Window Kissaten"]);
    expect(result.atmosphere.drinks.map((drink) => drink.venue).join(" ")).not.toMatch(/Gaudí|Abbey|Güell|Campanile/);
    expect(result.atmosphere.room.window).toBe("rain");
    const placeCall = result.trace.find((call) => call.path === "/v2/insights" && call.query["filter.type"] === "urn:entity:place");
    expect(placeCall?.query["filter.location.query"]).toBe("Tokyo");
    expect(placeCall?.query["filter.tags"]).toBeTruthy();
    expect(result.graph.tags.map((tag) => tag.name).join(" ")).not.toMatch(/_|:/);
  });

  it("compiles Blade Runner beside a jazz bar, without brutal death", async () => {
    const result = await compile("Blade Runner meets a 1970s jazz bar");
    const names = [...result.graph.seeds.map((seed) => seed.name), ...result.graph.artists.map((artist) => artist.name)];
    expect(names).toEqual(expect.arrayContaining(["Blade Runner", "Vangelis"]));
    expect(result.graph.places.map((place) => place.name)).toEqual(expect.arrayContaining(["Sodium Lamp Bar", "The Low Room"]));
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Westfield|World Trade/);
    expect(result.graph.tags.map((tag) => tag.name).join(" ")).not.toMatch(/Brutal death|brutal death/);
    expect(result.atmosphere.music.map((row) => row.name)).toContain("Vangelis");
    expect(result.atmosphere.room.plan).toBe("neon");
  });
});
