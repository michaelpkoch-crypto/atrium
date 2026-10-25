import { describe, expect, it } from "vitest";

import { assembleGraph } from "@/lib/agent/assemble";
import { compileFromPrompt } from "@/lib/agent/orchestrate";
import { pourFor } from "@/lib/atmosphere/drinks";
import { rankInsightArtists } from "@/lib/agent/rank";
import {
  broaderPlaceQueries,
  confirmsName,
  counterRejected,
  humanizeTagName,
  isLandmark,
  knownProposal,
  placeFits,
  promptEchoPlace,
  rankCounterPlaces,
  sceneFromPrompt,
  tagAllowed,
  tagFitsMood,
  tagsForRoom,
} from "@/lib/agent/propose";
import { compareRooms } from "@/lib/atmosphere/baseline";
import { typeLabel } from "@/components/labels";
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
    expect(confirmsName("Pride and Prejudice", "Pride & Prejudice")).toBe(true);
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
    expect(placeFits(place("Sky Garden", ["cocktail", "bar", "nightlife"]), proposal!, "Blade Runner meets a 1970s jazz bar")).toBe(false);
  });

  it("keeps brunch and a tea party in daylight and a 2am diner at night", () => {
    expect(sceneFromPrompt("a Wes Anderson brunch")).toMatchObject({ time: "day", brightness: "bright", weather: "clear" });
    expect(sceneFromPrompt("Bridgerton garden tea party")).toMatchObject({ time: "day", brightness: "bright" });
    expect(sceneFromPrompt("Tarantino road trip diner at 2am").time).toBe("night");
    expect(sceneFromPrompt("reading Murakami on a rainy night")).toMatchObject({ time: "night", weather: "rain" });
    expect(sceneFromPrompt("Studio Ghibli bathhouse at dusk").time).toBe("dusk");
    expect(knownProposal("a Wes Anderson brunch")?.scene.time).toBe("day");
  });

  it("drops tags that fight the prompt and pours from the place", () => {
    const wes = knownProposal("a Wes Anderson brunch")!;
    expect(tagFitsMood("Nordic Noir", wes)).toBe(false);
    expect(tagFitsMood("Scandinavian literature", wes)).toBe(false);
    expect(tagFitsMood("Arabian bath", wes)).toBe(false);
    expect(tagFitsMood("Pastel", wes)).toBe(true);
    const diner = {
      ...wes,
      placeQueries: ["diner"],
      placeTags: ["diner"],
      moodTags: ["noir", "night"],
      rejectTags: ["brutality"],
    };
    expect(tagFitsMood("Bathroom", diner)).toBe(false);
    expect(tagFitsMood("Toaster pastry", diner)).toBe(false);
    expect(tagFitsMood("Abandoned warehouse", diner)).toBe(false);
    expect(tagFitsMood("Brutality", diner)).toBe(false);
    expect(tagFitsMood("Film noir", diner)).toBe(true);
    const murakami = knownProposal("reading Murakami on a rainy night")!;
    expect(tagFitsMood("Brain", murakami)).toBe(false);
    expect(tagFitsMood("Cyberpunk", murakami)).toBe(false);
    expect(tagFitsMood("Brutal death", knownProposal("Blade Runner meets a 1970s jazz bar")!)).toBe(false);
    expect(pourFor("Bathhouse Tea Counter", ["bathhouse", "tea"], "Studio Ghibli bathhouse at dusk")?.name).toBe("Hojicha");
    expect(pourFor("Sky Garden", ["cocktail", "bar"], "Blade Runner meets a 1970s jazz bar")?.name).toBe("Gin martini");
    expect(pourFor("Pink Linen Cafe", ["brunch", "pastry", "cafe"], "a Wes Anderson brunch")?.name).toBe("Grapefruit spritz");
    expect(pourFor("Rain Window Kissaten", ["kissaten", "cafe"], "reading Murakami on a rainy night")?.name).toBe("Whiskey highball");
    expect(pourFor("Mel's Diner", ["diner"], "Tarantino road trip diner at 2am")?.name).toBe("Bottomless coffee");
    expect(pourFor("Garden Tea Room", ["tea", "garden"], "Bridgerton garden tea party")?.name).toBe("Earl Grey");
    expect(pourFor("Igreja de Santa Luzia", ["tea", "garden"], "Bridgerton garden tea party")).toBeNull();
    expect(pourFor("Fuji View Hotel", ["bathhouse", "tea"], "Studio Ghibli bathhouse at dusk")).toBeNull();
    expect(pourFor("Sleepy Hollow", ["diner"], "Tarantino road trip diner at 2am")).toBeNull();
    expect(pourFor("Beyond The Wall", ["tea"], "Bridgerton garden tea party")).toBeNull();
    expect(broaderPlaceQueries(["diner"])).toEqual(expect.arrayContaining(["american diner", "roadside diner"]));
    expect(broaderPlaceQueries(["jazz bar"])).toEqual(expect.arrayContaining(["jazz club", "jazz lounge"]));
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
    expect(result.atmosphere.room.window).toBe("dusk");
    expect(result.atmosphere.room.timeLabel).toBe("Dusk");
    expect(result.baseline.room.timeLabel).toBe("Dusk");
    expect(result.graph.places.map((place) => place.name)).not.toContain("Fuji View Hotel");
    const lightTags = result.atmosphere.room.lights.map((light) => light.citation.tag).filter((tag): tag is string => Boolean(tag));
    expect(new Set(lightTags.map((tag) => tag.toLowerCase())).size).toBe(lightTags.length);
    for (const seed of result.graph.seeds) {
      expect(new Set(seed.tags.map((tag) => tag.toLowerCase())).size).toBe(seed.tags.length);
    }
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    const quoted = compareRooms(
      "Studio Ghibli bathhouse at dusk",
      result.atmosphere,
      { ...result.baseline, assumptions: ["The room is designed for a cute spirit."] },
    );
    expect(quoted.headlines.at(-1)).toBe('The plain reading assumed "the room is designed for a cute spirit".');
    expect(result.comparison.headlines.length).toBeGreaterThanOrEqual(3);
    expect(result.comparison.headlines.length).toBeLessThanOrEqual(5);
    expect(result.comparison.qlooAdded.map((item) => item.detail).join(" ")).not.toMatch(/it assumed/);
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
    expect(result.atmosphere.room.window).toBe("day-pastel");
    expect(result.atmosphere.room.timeLabel).toBe("Day");
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
    expect(result.graph.places.map((place) => place.name)).toContain("The Low Room");
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Sky Garden|Sodium Lamp/);
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Westfield|World Trade/);
    expect(result.graph.tags.map((tag) => tag.name).join(" ")).not.toMatch(/Brutal death|brutal death/);
    expect(result.atmosphere.music.map((row) => row.name)).toContain("Vangelis");
    expect(result.atmosphere.room.plan).toBe("neon");
  });

  it("keeps Hisaishi and drops a film composer who shares no Ghibli tag", async () => {
    const result = await compile("Studio Ghibli bathhouse at dusk");
    expect(result.atmosphere.music.map((row) => row.name)).toContain("Joe Hisaishi");
    expect(result.atmosphere.music.map((row) => row.name)).not.toContain("John Williams");
  });

  it("drops an unrelated singer beside Murakami", async () => {
    const result = await compile("reading Murakami on a rainy night");
    expect(result.atmosphere.music.map((row) => row.name)).toContain("Bill Evans");
    expect(result.atmosphere.music.map((row) => row.name)).not.toContain("Sezen Aksu");
    expect(result.atmosphere.music.map((row) => row.name)).not.toContain("Erkin Gören");
    expect(result.atmosphere.music.map((row) => row.name)).not.toContain("Teoman");
    expect(result.atmosphere.room.timeLabel).toBe(result.baseline.room.timeLabel);
  });

  it("colors a Tarantino diner from neon, retro, and crime", async () => {
    const result = await compile("Tarantino road trip diner at 2am");
    expect(result.graph.seeds.map((seed) => seed.name)).toEqual(
      expect.arrayContaining(["Pulp Fiction", "Reservoir Dogs", "Quentin Tarantino", "Ennio Morricone"]),
    );
    expect(result.graph.places.map((place) => place.name)).toContain("American Diner Dulwich");
    expect(result.graph.places.map((place) => place.name)).toContain("Tom's Restaurant");
    expect(result.graph.places.map((place) => place.name)).not.toContain("Sleepy Hollow");
    expect(result.atmosphere.drinks[0]?.venue).toMatch(/Diner|Restaurant|Veselka/);
    expect(result.atmosphere.drinks.map((drink) => drink.venue).join(" ")).not.toMatch(/Sleepy Hollow/);
    expect(result.atmosphere.drinks.map((drink) => drink.name)).toContain("Bottomless coffee");
    expect(result.atmosphere.room.timeLabel).toBe("Night");
    expect(result.atmosphere.room.plan).toBe("lounge");
    const cited = JSON.stringify(result.atmosphere.room.lights);
    expect(cited).not.toMatch(/had no aesthetic tag/);
    expect(cited).toMatch(/Retro|Crime|Diner|Chrome|Neon/);
    const primary = result.atmosphere.palette.primary;
    const red = Number.parseInt(primary.slice(1, 3), 16);
    const blue = Number.parseInt(primary.slice(5, 7), 16);
    expect(red).toBeGreaterThan(blue);
  });

  it("frames Bridgerton pop neighbors and drops a place named Gården", async () => {
    const result = await compile("Bridgerton garden tea party");
    expect(result.graph.seeds.map((seed) => seed.name)).toEqual(
      expect.arrayContaining(["Bridgerton", "Pride & Prejudice", "Vitamin String Quartet"]),
    );
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Gården/);
    expect(result.graph.places.map((place) => place.name)).toContain("Tea Room Miami");
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Igreja|Beyond The Wall/);
    expect(result.atmosphere.drinks[0]?.venue).toMatch(/Tea Room/);
    expect(result.atmosphere.drinks.map((drink) => drink.name)).toContain("Earl Grey");
    expect(typeLabel("urn:entity:movie", "Pride & Prejudice")).toBe("film (2005)");
    expect(result.baseline.room.timeLabel).toBe("Day");
    expect(result.atmosphere.room.timeLabel).toBe("Day");
    expect(result.atmosphere.audio.description).toBe(
      "Qloo: Bridgerton fans lean Harry Styles and Olivia Rodrigo, so the pad is a string-quartet take on modern pop.",
    );
    expect(result.comparison.headlines[0]).toBe(result.atmosphere.audio.description);
  });
});

describe("place insight budget", () => {
  it("waits 15 seconds for places and 6 seconds for artists", async () => {
    const calls: { filterType: string; timeoutMs?: number }[] = [];
    const pulp: TasteEntity = {
      id: "pulp",
      name: "Pulp Fiction",
      type: "urn:entity:movie",
      description: null,
      imageUrl: null,
      popularity: null,
      affinity: null,
      tags: [{ id: "tag:crime", name: "Crime", type: "urn:tag" }],
      explainers: [],
      mock: true,
    };
    await assembleGraph(
      {
        mode: "mock",
        trace: [],
        async search(query: string) {
          return query === "Pulp Fiction" ? [pulp] : [];
        },
        async searchTags() {
          return [];
        },
        async insights(args) {
          calls.push({ filterType: args.filterType, timeoutMs: args.timeoutMs });
          return { entities: [], tags: [] };
        },
      },
      "Tarantino road trip diner at 2am",
      knownProposal("Tarantino road trip diner at 2am")!,
      [],
    );
    expect(calls.find((call) => call.filterType === "urn:entity:place")?.timeoutMs).toBe(15_000);
    expect(calls.find((call) => call.filterType === "urn:entity:artist")?.timeoutMs).toBe(6_000);
  });
});

describe("artist and counter filters", () => {
  function artist(name: string, tags: string[], affinity: number): TasteEntity {
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      type: "urn:entity:artist",
      description: null,
      imageUrl: null,
      popularity: null,
      affinity,
      tags: tags.map((tag) => ({ id: `tag:${tag}`, name: tag, type: "urn:tag:keyword" })),
      explainers: [],
      mock: true,
    };
  }

  it("keeps a shared genre and drops turkish pop, including a pianist substring", () => {
    const proposal = knownProposal("reading Murakami on a rainy night")!;
    const bill = artist("Bill Evans", ["Jazz", "Piano", "Night"], 0.72);
    const ranked = rankInsightArtists(
      [
        bill,
        artist("Erkin Gören", ["Pop", "Turkish", "Night"], 0.9),
        artist("Teoman", ["Funk", "Singer"], 0.88),
        artist("Ahmad Jamal", ["Jazz", "Piano"], 0.7),
        artist("Studio Pianist", ["Pianist"], 0.95),
      ],
      [bill],
      proposal,
      "reading Murakami on a rainy night",
    );
    expect(ranked.map((row) => row.name)).toEqual(["Bill Evans", "Ahmad Jamal"]);
  });

  it("still keeps a mood match and the Bridgerton audience pair", () => {
    const wes = knownProposal("a Wes Anderson brunch")!;
    const mark = rankInsightArtists(
      [artist("Mark Mothersbaugh", ["Symmetry", "Electronic"], 0.8)],
      [artist("Alexandre Desplat", ["Symmetry"], 0.9)],
      wes,
      "a Wes Anderson brunch",
    );
    expect(mark.map((row) => row.name)).toContain("Mark Mothersbaugh");

    const bridgerton = knownProposal("Bridgerton garden tea party")!;
    const audience = rankInsightArtists(
      [
        artist("Vitamin String Quartet", ["Pastel"], 0.74),
        artist("Harry Styles", ["Funk"], 0.93),
        artist("Olivia Rodrigo", ["Funk"], 0.91),
        artist("Troye Sivan", ["Funk"], 0.9),
      ],
      [artist("Vitamin String Quartet", ["Pastel"], 0.74)],
      bridgerton,
      "Bridgerton garden tea party",
    );
    expect(audience.map((row) => row.name)).toEqual(["Vitamin String Quartet", "Harry Styles", "Olivia Rodrigo"]);
  });

  it("ranks a diner above a church, a hotel, and a fiction set", () => {
    const diner = knownProposal("Tarantino road trip diner at 2am")!;
    const places = rankCounterPlaces(
      [
        place("Sleepy Hollow", ["diner"]),
        place("Tom's Restaurant", ["diner"]),
        place("Applejack Diner", ["diner"]),
        place("Veselka", ["restaurant"]),
      ].map((row, index) => ({ ...row, affinity: 1 - index * 0.1 })),
      diner,
    );
    expect(places.map((row) => row.name)).toEqual(["Tom's Restaurant", "Applejack Diner", "Veselka"]);
    expect(counterRejected("Igreja de Santa Luzia")).toBe(true);
    expect(counterRejected("Fuji View Hotel")).toBe(true);
    expect(counterRejected("Beyond The Wall")).toBe(true);

    const tea = knownProposal("Bridgerton garden tea party")!;
    const rooms = rankCounterPlaces(
      [place("Igreja de Santa Luzia", ["tea"]), place("Beyond The Wall", ["tea", "garden"]), place("Tea Room Miami", ["tea"])],
      tea,
    );
    expect(rooms.map((row) => row.name)).toEqual(["Tea Room Miami"]);
  });

  it("collapses repeated tag names in a seed", () => {
    const proposal = knownProposal("Studio Ghibli bathhouse at dusk")!;
    const tags = tagsForRoom(
      [
        { id: "a", name: "Bathhouse", type: "urn:tag" },
        { id: "b", name: "Anime", type: "urn:tag" },
        { id: "c", name: "Bathhouse", type: "urn:tag" },
        { id: "d", name: "Anime", type: "urn:tag" },
      ],
      proposal,
    );
    expect(tags.map((tag) => tag.name)).toEqual(["Bathhouse", "Anime"]);
  });
});

describe("sparse seed tags", () => {
  it("keeps neon and crime when the mood phrase has no color prior", () => {
    const proposal = knownProposal("a Wes Anderson brunch")!;
    const tags = tagsForRoom(
      [
        { id: "1", name: "Moody cinematic lighting", type: "urn:tag" },
        { id: "2", name: "Neon", type: "urn:tag" },
        { id: "3", name: "Crime", type: "urn:tag" },
        { id: "4", name: "Bathroom", type: "urn:tag" },
      ],
      { ...proposal, moodTags: ["moody cinematic lighting"], rejectTags: ["bathroom"], placeTags: [], placeQueries: [] },
    );
    expect(tags.map((tag) => tag.name)).toEqual(expect.arrayContaining(["Neon", "Crime"]));
    expect(tags.map((tag) => tag.name)).not.toContain("Bathroom");
  });
});
