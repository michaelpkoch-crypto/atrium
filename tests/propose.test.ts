import { describe, expect, it } from "vitest";

import { artistSignalIds, assembleGraph } from "@/lib/agent/assemble";
import { compileFromPrompt } from "@/lib/agent/orchestrate";
import { pourFor } from "@/lib/atmosphere/drinks";
import { placeObjectKind } from "@/lib/atmosphere/compile";
import { chipSwatch, chipText } from "@/components/room-canvas";
import { rankInsightArtists } from "@/lib/agent/rank";
import {
  aestheticTag,
  broaderPlaceQueries,
  confirmsName,
  counterRejected,
  humanizeTagName,
  isLandmark,
  chooseSignalTags,
  dedupeByName,
  eraFromPrompt,
  knownProposal,
  placeCity,
  placeFits,
  promptEchoPlace,
  rankCounterPlaces,
  resolveProposal,
  roomKicker,
  sanitizeCity,
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
    expect(pourFor("Los Cubiertos", ["restaurant"], "Studio Ghibli cozy kitchen")?.name).toBe("Hojicha");
    expect(pourFor("Basement Tavern", ["bar"], "A Stranger Things basement in 1985")?.name).toBe("Cola");
    expect(pourFor("Sanctum", ["place"], "a quiet kitchen")?.name).toBe("Tea");
    expect(pourFor("Taberna Tempranillo", ["wine", "tavern"], "a Lord of the Rings tavern")?.name).toBe("Mead");
    expect(pourFor("The Green Dragon", ["pub"], "a neighborhood tavern")?.name).toBe("Ale");
    expect(pourFor("Casa Montaña", ["bodega", "wine"], "an evening out")?.name).toBe("Red wine");
    expect(pourFor("Some Room", ["venue"], "an evening out")?.name).toBe("House pour");
    expect(pourFor("Some Room", ["venue"], "Halloween")?.name).toBe("Blacklight punch");
    expect(pourFor("Some Room", ["venue"], "Christmas morning")?.name).toBe("Mulled wine");
    expect(pourFor("Some Room", ["venue"], "Día de los Muertos")?.name).toBe("Horchata");
    expect(pourFor("Some Room", ["venue"], "Super Bowl party")?.name).toBe("Lager");
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
    expect(result.atmosphere.room.lightScene.name).toBe("Pastel Morning");
    expect(result.atmosphere.room.lightScene.citation.name).not.toMatch(/Desplat|Mothersbaugh/);
    expect(result.atmosphere.audio.description).not.toMatch(/Crime|Discover|Bathtub|Vinyl crackle/);
    const placeCalls = result.trace.filter((call) => call.path === "/v2/insights" && call.query["filter.type"] === "urn:entity:place");
    expect(placeCalls).toHaveLength(1);
    expect(placeCalls[0]?.query["filter.tags"]).toBeUndefined();
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
    expect(placeCall?.query["filter.tags"]).toBeUndefined();
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
    expect(result.atmosphere.room.eraLabel).toBe("1970s");
    expect(result.atmosphere.palette.ambient).toBe("#8a5a32");
    expect(result.baseline.palette.ambient).toBe("#8a5a32");
    const globe = result.atmosphere.room.lights.find((light) => light.kind === "globe");
    expect(globe).toBeTruthy();
    expect(globe?.y).toBeLessThanOrEqual(150);
    expect(result.atmosphere.room.objects.some((object) => object.kind === "rug")).toBe(true);
    expect(result.atmosphere.room.objects.some((object) => object.kind === "bar")).toBe(true);
    expect(result.atmosphere.room.objects.some((object) => object.kind === "record" || object.kind === "speaker")).toBe(true);
    expect(result.atmosphere.room.objects.some((object) => object.kind === "shelf")).toBe(true);
    expect(result.atmosphere.audio.texture).toBe("vinyl");
    expect(result.atmosphere.audio.description).toMatch(/^Era: 1970s, from the prompt\./);
    expect(result.baseline.room.eraLabel).toBe("1970s");
    expect(result.baseline.audio.texture).toBe("vinyl");
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
    expect(result.atmosphere.room.timeLabel).toBe("Night · rain");
    expect(result.baseline.room.timeLabel).toBe("Night · rain");
    const ranked = result.steps.find((step) => step.call === "rank_artists");
    expect(ranked?.detail).toMatch(/music seeds, not the person/);
    expect(ranked?.detail).toMatch(/Ranked after insights/);
    expect(ranked?.result).toMatch(/Bill Evans: kept via seed/);
    expect(ranked?.result).not.toMatch(/Sezen Aksu/);
    const artistCall = result.trace.find((call) => call.path === "/v2/insights" && call.query["filter.type"] === "urn:entity:artist");
    const placeCall = result.trace.find((call) => call.path === "/v2/insights" && call.query["filter.type"] === "urn:entity:place");
    expect(artistCall?.query["signal.interests.entities"]).toBe("mock:artist:bill");
    expect(placeCall?.query["signal.interests.entities"]).toContain("mock:person:haruki-murakami");
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
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Sky Garden|Majorelle/);
    expect(result.atmosphere.room.lightScene.name).toBe("Garden Daylight");
    expect(result.atmosphere.room.lightScene.citation.name).not.toMatch(/Styles|Rodrigo|Vitamin/);
    expect(result.atmosphere.drinks.map((drink) => drink.name)).toContain("Earl Grey");
    expect(typeLabel("urn:entity:movie", "Pride & Prejudice")).toBe("Film (2005)");
    expect(typeLabel("urn:entity:movie", "Spirited Away")).toBe("Film (2001)");
    expect(typeLabel("urn:entity:movie", "Blade Runner 2049")).toBe("Film (2017)");
    expect(typeLabel("urn:entity:movie", "Paper Lantern")).toBe("Film");
    expect(typeLabel("urn:entity:tv_show", "Bridgerton")).toBe("TV");
    expect(result.baseline.room.timeLabel).toBe("Day");
    expect(result.atmosphere.room.timeLabel).toBe("Day");
    expect(result.atmosphere.audio.description).toBe(
      "Qloo: Bridgerton fans lean Harry Styles and Olivia Rodrigo, so the pad is a string-quartet take on modern pop.",
    );
    expect(result.comparison.headlines[0]).toMatch(/^Lights:/);
    expect(result.comparison.headlines[1]).toMatch(/^Sound:/);
    expect(result.comparison.headlines[2]).toMatch(/^Screens:/);
    expect(result.comparison.headlines).toContain(result.atmosphere.audio.description);
  });

  it("drives lights, sound, and screens from a Halloween occasion", async () => {
    expect(knownProposal("Halloween")?.works.map((work) => work.name)).toEqual([
      "Halloween",
      "Hocus Pocus",
      "The Nightmare Before Christmas",
    ]);
    expect(knownProposal("Halloween")?.people.map((person) => person.name)).toEqual(["John Carpenter", "Danny Elfman"]);
    expect(knownProposal("The Nightmare Before Christmas")?.works[0]?.name).toBe("Halloween");
    expect(knownProposal("Christmas morning")?.scene.time).toBe("day");
    expect(knownProposal("Día de los Muertos")?.city).toBe("Mexico City");
    expect(knownProposal("Super Bowl party")?.placeQueries).toContain("sports bar");

    const result = await compile("Halloween");
    expect(result.graph.synthetic).toBe(false);
    expect(result.graph.seeds.map((seed) => seed.name)).toEqual(
      expect.arrayContaining(["Halloween", "Hocus Pocus", "The Nightmare Before Christmas", "John Carpenter", "Danny Elfman"]),
    );
    expect(result.atmosphere.room.lightScene.name).toBe("Blacklight");
    expect(result.atmosphere.room.lightScene.effect).toBe("flicker");
    expect(result.atmosphere.room.lightScene.citation.tag?.toLowerCase()).toMatch(/halloween|horror|spooky/);
    expect(result.atmosphere.audio.beds).toEqual(expect.arrayContaining(["drone", "wind"]));
    expect(result.atmosphere.audio.nowPlaying).toMatch(/Now playing: Blacklight/);
    expect(result.atmosphere.audio.nowPlaying).toMatch(/Carpenter/);
    expect(result.atmosphere.room.displays.map((screen) => screen.title).join(" ")).toMatch(/Halloween|Hocus Pocus|Nightmare/);
    expect(result.atmosphere.drinks[0]?.name).toBe("Blacklight punch");
    expect(result.comparison.headlines[0]).toMatch(/^Lights: Blacklight, from Qloo tag /);
    expect(result.comparison.headlines[1]).toMatch(/^Sound:/);
    expect(result.comparison.headlines[2]).toMatch(/^Screens:/);
    expect(result.baseline.room.lightScene.name).toBe("Orange lights");
    expect([...result.baseline.assumptions, ...result.baseline.artists].join(" ")).not.toMatch(/Carpenter|Elfman/);
    expect(result.atmosphere.palette.ambient).toBe("#241038");
    expect(result.atmosphere.drinks[0]?.gap).toBe(false);
    expect(result.atmosphere.logline).not.toMatch(/no artist|counter stays empty/);
    expect(result.atmosphere.room.lightScene.citation.name).not.toMatch(/Carpenter|Elfman/);
    const cited = result.atmosphere.room.lights.map((light) => `${light.label} ${light.citation.tag ?? ""}`).join(" ");
    expect(cited).not.toMatch(/Sneaking|House of cards|Half a brain|Bathtub/);
  });

  it("compiles Christmas morning as a living room with more than one score", async () => {
    expect(roomKicker("Christmas morning", "rain")).toBe("Morning");
    expect(roomKicker("Christmas evening by the tree", "rain")).toBe("Living room");
    expect(knownProposal("Christmas morning")?.people.map((person) => person.name)).toEqual([
      "John Williams",
      "Vince Guaraldi",
      "Mariah Carey",
    ]);
    const result = await compile("Christmas morning");
    expect(roomKicker("Christmas morning", result.atmosphere.room.plan)).toBe("Morning");
    expect(result.atmosphere.room.lightScene.name).toBe("Candlelight");
    expect(result.graph.seeds.map((seed) => seed.name)).toEqual(
      expect.arrayContaining(["Home Alone", "A Charlie Brown Christmas", "John Williams", "Vince Guaraldi", "Mariah Carey"]),
    );
    expect(result.atmosphere.music.map((row) => row.name).join(" ")).toMatch(/Williams|Guaraldi|Carey/);
    expect(result.atmosphere.drinks[0]?.name).toBe("Mulled wine");
    expect(result.atmosphere.drinks[0]?.gap).toBe(false);
    expect(result.atmosphere.logline).not.toMatch(/counter stays empty|no artist/);
  });

  it("pours Stranger Things at a named Atlanta venue and LOTR mead at a pub", async () => {
    expect(knownProposal("A Stranger Things basement in 1985")?.placeQueries).toEqual(["arcade", "pizza place"]);
    expect(knownProposal("A Stranger Things basement in 1985")?.city).toBe("Atlanta");
    expect(knownProposal("a Lord of the Rings tavern")?.placeQueries).toEqual(["pub", "inn"]);
    const stranger = await compile("A Stranger Things basement in 1985");
    expect(stranger.atmosphere.room.lightScene.name).toBe("CRT Glow");
    expect(stranger.atmosphere.room.eraLabel).toBe("1985");
    expect(roomKicker("A Stranger Things basement in 1985", stranger.atmosphere.room.plan)).toBe("Basement");
    expect(stranger.atmosphere.drinks[0]?.name).toBe("Cola");
    expect(stranger.atmosphere.drinks[0]?.venue).toMatch(/Palace Arcade|Fellini/);
    expect(stranger.graph.places.map((row) => row.name).join(" ")).not.toMatch(/\bTavern\b/);
    expect(stranger.atmosphere.logline).not.toMatch(/counter stays empty/);

    const tavern = await compile("a Lord of the Rings tavern");
    expect(tavern.atmosphere.room.lightScene.name).toBe("Hearthfire");
    expect(tavern.atmosphere.drinks[0]?.name).toBe("Mead");
    expect(tavern.atmosphere.drinks[0]?.venue).toMatch(/Eagle and Child|Trout Inn/);
    expect(tavern.atmosphere.drinks[0]?.gap).toBe(false);
    expect(tavern.atmosphere.room.objects.some((object) => object.kind === "hearth")).toBe(true);
    expect(tavern.graph.artists.map((artist) => artist.name)).toContain("Howard Shore");
    expect(tavern.atmosphere.logline).not.toMatch(/counter stays empty|no artist/);
    expect(roomKicker("a Lord of the Rings tavern", tavern.atmosphere.room.plan)).toBe("Tavern");
  });

  it("pours a cozy Ghibli kitchen from a cafe, not an onsen", async () => {
    const result = await compile("Studio Ghibli cozy kitchen");
    expect(result.graph.places.map((place) => place.name)).toContain("Hearth Kitchen Cafe");
    expect(result.graph.places.map((place) => place.name).join(" ")).not.toMatch(/Onsen|Day Spa|Bathhouse|Fuji View/);
    expect(result.atmosphere.drinks[0]?.venue).toMatch(/Hearth Kitchen/);
    expect(result.atmosphere.room.timeLabel).toBe("Dusk");
    expect(roomKicker("Studio Ghibli cozy kitchen", result.atmosphere.room.plan, result.atmosphere.drinks[0]?.venue)).toBe("Kitchen");
  });
});

describe("place insight budget", () => {
  it("waits 8 seconds for places and 6 seconds for artists", async () => {
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
    expect(calls.find((call) => call.filterType === "urn:entity:place")?.timeoutMs).toBe(4_000);
    expect(calls.find((call) => call.filterType === "urn:entity:artist")?.timeoutMs).toBe(5_000);
  });

  it("does not retry a timed-out place call and does not send filter.tags", async () => {
    const calls: { filterType: string; timeoutMs?: number; location?: string; filterTagIds?: string[]; tagIds?: string[] }[] = [];
    const film: TasteEntity = {
      id: "budapest",
      name: "The Grand Budapest Hotel",
      type: "urn:entity:movie",
      description: null,
      imageUrl: null,
      popularity: null,
      affinity: null,
      tags: [{ id: "tag:pastel", name: "Pastel", type: "urn:tag" }],
      explainers: [],
      mock: true,
    };
    await assembleGraph(
      {
        mode: "mock",
        trace: [],
        async search(query: string) {
          return query === "The Grand Budapest Hotel" ? [film] : [];
        },
        async searchTags() {
          return [];
        },
        async insights(args) {
          calls.push({
            filterType: args.filterType,
            timeoutMs: args.timeoutMs,
            location: args.location,
            filterTagIds: args.filterTagIds,
            tagIds: args.tagIds,
          });
          if (args.filterType === "urn:entity:place") throw new Error("timeout");
          return { entities: [], tags: [] };
        },
      },
      "a Wes Anderson brunch",
      { ...knownProposal("a Wes Anderson brunch")!, city: "Paris" },
      [],
    );
    const places = calls.filter((call) => call.filterType === "urn:entity:place");
    expect(places).toHaveLength(1);
    expect(places[0]?.timeoutMs).toBe(4_000);
    expect(places[0]?.location).toBe("Paris");
    expect(places[0]?.filterTagIds ?? []).toEqual([]);
    expect(places[0]?.tagIds ?? []).toEqual([]);
  });

  it("signals artist insights from mood tags when no music seed was confirmed", async () => {
    const calls: { filterType: string; entityIds: string[]; tagIds: string[] }[] = [];
    const carpenter: TasteEntity = {
      id: "carpenter",
      name: "John Carpenter",
      type: "urn:entity:artist",
      description: null,
      imageUrl: null,
      popularity: null,
      affinity: 0.7,
      tags: [{ id: "tag:horror", name: "Horror", type: "urn:tag" }],
      explainers: [],
      mock: true,
    };
    const film: TasteEntity = {
      id: "halloween-film",
      name: "Halloween",
      type: "urn:entity:movie",
      description: null,
      imageUrl: null,
      popularity: null,
      affinity: null,
      tags: [{ id: "tag:horror", name: "Horror", type: "urn:tag" }],
      explainers: [],
      mock: true,
    };
    const graph = await assembleGraph(
      {
        mode: "mock",
        trace: [],
        async search(query: string) {
          if (query === "Halloween") return [film];
          return [];
        },
        async searchTags(query: string) {
          if (query === "horror") return [{ id: "tag:horror", name: "Horror", type: "urn:tag" }];
          return [];
        },
        async insights(args) {
          calls.push({ filterType: args.filterType, entityIds: args.entityIds, tagIds: args.tagIds });
          if (args.filterType === "urn:entity:artist" && args.tagIds.length) return { entities: [carpenter], tags: [] };
          return { entities: [], tags: [] };
        },
      },
      "Halloween",
      knownProposal("Halloween")!,
      [],
    );
    expect(graph?.artists.map((artist) => artist.name)).toContain("John Carpenter");
    const tagged = calls.find((call) => call.filterType === "urn:entity:artist" && call.tagIds.length > 0);
    expect(tagged?.entityIds).toEqual([]);
    expect(tagged?.tagIds).toContain("tag:horror");
  });
});

describe("artist and counter filters", () => {
  function artist(
    name: string,
    tags: string[],
    affinity: number,
    explainers: TasteEntity["explainers"] = [],
    type = "urn:entity:artist",
  ): TasteEntity {
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name,
      type,
      description: null,
      imageUrl: null,
      popularity: null,
      affinity,
      tags: tags.map((tag) => ({ id: `tag:${tag}`, name: tag, type: "urn:tag:keyword" })),
      explainers,
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
    expect(ranked.artists.map((row) => row.name)).toEqual(["Bill Evans", "Ahmad Jamal"]);
    expect(ranked.report.find((row) => row.name === "Ahmad Jamal")?.via).toMatch(/jazz/);
  });

  it("drops a jazz tag whose affinity is the novelist, not Bill Evans", () => {
    const proposal = knownProposal("reading Murakami on a rainy night")!;
    const bill = artist("Bill Evans", ["Jazz", "Piano", "Modal Jazz", "Lyrical"], 0.72);
    const murakami = artist("Haruki Murakami", ["Literature", "Japan", "Rain", "Night"], 0.9, [], "urn:entity:person");
    const ranked = rankInsightArtists(
      [
        bill,
        artist("Sezen Aksu", ["Jazz", "Literature", "Lyrical", "Pop"], 0.9, [{ id: murakami.id, name: murakami.name, score: 0.9 }]),
        artist("Ahmad Jamal", ["Jazz", "Piano"], 0.7, [{ id: bill.id, name: bill.name, score: 0.7 }]),
        artist("Erkin Gören", ["Singer-songwriter", "Rock"], 0.88, [{ id: murakami.id, name: murakami.name, score: 0.88 }]),
      ],
      [bill, murakami],
      proposal,
      "reading Murakami on a rainy night",
    );
    expect(ranked.artists.map((row) => row.name)).toEqual(["Bill Evans", "Ahmad Jamal"]);
    expect(ranked.report.find((row) => row.name === "Sezen Aksu")).toMatchObject({
      kept: false,
      via: "jazz from Haruki Murakami, not a music seed",
    });
    expect(ranked.report.find((row) => row.name === "Ahmad Jamal")?.via).toBe("jazz from Bill Evans");
    const opaque = rankInsightArtists(
      [artist("Ahmad Jamal", ["Jazz", "Piano"], 0.7, [{ id: bill.id, name: "EE57C132-AAAA-BBBB-CCCC-DDDDEEEEFFFF", score: 0.7 }])],
      [bill],
      proposal,
      "reading Murakami on a rainy night",
    );
    expect(opaque.report.find((row) => row.name === "Ahmad Jamal")?.via).toBe("jazz from Bill Evans");
    expect(ranked.report.find((row) => row.name === "Erkin Gören")?.via).toBe("no shared genre");
  });

  it("still keeps a mood match and the Bridgerton audience pair", () => {
    const wes = knownProposal("a Wes Anderson brunch")!;
    const desplat = artist("Alexandre Desplat", ["Symmetry"], 0.9);
    const wesPerson = artist("Wes Anderson", ["Symmetry", "Pastel"], 0.9, [], "urn:entity:person");
    const mark = rankInsightArtists(
      [artist("Mark Mothersbaugh", ["Symmetry", "Electronic"], 0.8, [{ id: wesPerson.id, name: wesPerson.name, score: 0.8 }])],
      [desplat, wesPerson],
      wes,
      "a Wes Anderson brunch",
    );
    expect(mark.artists.map((row) => row.name)).toContain("Mark Mothersbaugh");
    expect(mark.report.find((row) => row.name === "Mark Mothersbaugh")?.via).toMatch(/symmetry/);

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
    expect(audience.artists.map((row) => row.name)).toEqual(["Vitamin String Quartet", "Harry Styles", "Olivia Rodrigo"]);
    expect(audience.report.find((row) => row.name === "Harry Styles")?.via).toBe("audience crossover");
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
    const rankedTea = rankCounterPlaces(
      [
        { ...place("Sky Garden", ["cocktail", "bar", "nightlife"]), affinity: 0.92 },
        { ...place("Tea Room - Siena", ["tea", "tea room"]), affinity: 0.4 },
      ],
      tea,
    );
    expect(rankedTea[0]?.name).toBe("Tea Room - Siena");
  });

  it("titles the room from the prompt and prefers a kitchen counter to an onsen", () => {
    expect(roomKicker("Studio Ghibli bathhouse at dusk", "bath", "Bathhouse Tea Counter")).toBe("Bath");
    expect(roomKicker("a cozy Ghibli kitchen", "bath", "Onsen Hot Pools & Day Spa")).toBe("Kitchen");
    expect(roomKicker("Bridgerton garden tea party", "symmetry", "Tea Room Miami")).toBe("Tea party");
    expect(roomKicker("Tarantino road trip diner at 2am", "lounge", "Tom's Restaurant")).toBe("Diner");
    expect(roomKicker("reading Murakami on a rainy night", "rain", "Rain Window Kissaten")).toBe("Kissaten");
    expect(roomKicker("A Stranger Things basement in 1985", "lounge")).toBe("Basement");
    expect(roomKicker("a Lord of the Rings tavern", "lounge")).toBe("Tavern");
    expect(resolveProposal("A Stranger Things basement in 1985", null).placeQueries).toEqual(["arcade", "pizza place"]);
    expect(resolveProposal("A Stranger Things basement in 1985", null).city).toBe("Atlanta");
    expect(resolveProposal("a Lord of the Rings tavern", null).city).toBe("Oxford");
    expect(placeCity("Tarantino road trip diner at 2am")).toBe("Los Angeles");
    expect(placeCity("Día de los Muertos")).toBe("Mexico City");
    expect(placeCity("a quiet kitchen")).toBeNull();
    expect(sanitizeCity("a Wes Anderson brunch", "Madrid")).toBe("");
    expect(sanitizeCity("a weekend in Madrid", "Madrid")).toBe("Madrid");
    expect(knownProposal("Blade Runner meets a 1970s jazz bar")?.city).toBe("Los Angeles");
    expect(eraFromPrompt("Blade Runner meets a 1970s jazz bar")).toEqual({ label: "1970s", decade: "1970s" });
    expect(eraFromPrompt("A Stranger Things basement in 1985")).toEqual({ label: "1985", decade: "1980s" });
    expect(eraFromPrompt("reading Murakami on a rainy night")).toBeNull();
    const kitchen = knownProposal("Studio Ghibli cozy kitchen")!;
    expect(kitchen.placeQueries).toEqual(["cafe", "tea house", "coffee shop"]);
    expect(kitchen.placeQueries.join(" ")).not.toMatch(/onsen|sento/);
  });

  it("folds patisserie and drops a bare category when a specific place exists", () => {
    const folded = dedupeByName([
      place("Pâtisserie", ["pastry"]),
      place("Patisserie", ["pastry"]),
    ]);
    expect(folded).toHaveLength(1);
    const brunch = knownProposal("a Wes Anderson brunch")!;
    const kept = rankCounterPlaces(
      [place("Patisserie", ["pastry", "brunch"]), place("Pâtisserie", ["pastry"]), place("Pink Linen Cafe", ["brunch", "cafe"])],
      brunch,
    );
    expect(kept.map((row) => row.name)).toEqual(["Pink Linen Cafe"]);
    const diner = knownProposal("Tarantino road trip diner at 2am")!;
    const counters = rankCounterPlaces(
      [place("American Diner", ["diner"]), place("American Diner Dulwich", ["diner"]), place("Tom's Restaurant", ["restaurant"])],
      diner,
    );
    expect(counters.map((row) => row.name)).not.toContain("American Diner");
    expect(counters.map((row) => row.name)).toEqual(expect.arrayContaining(["American Diner Dulwich", "Tom's Restaurant"]));
    const kitchen = knownProposal("Studio Ghibli cozy kitchen")!;
    const poured = rankCounterPlaces(
      [
        place("Los Cubiertos", ["restaurant"]),
        place("Restaurante Los Pajaritos", ["restaurant"]),
        place("Sanctum", ["place"]),
        place("Igreja de Santa Luzia", ["restaurant"]),
      ].map((row, index) => ({ ...row, affinity: 0.9 - index * 0.05 })),
      kitchen,
    );
    expect(poured.map((row) => row.name)[0]).toBe("Los Cubiertos");
    expect(poured.map((row) => row.name)).not.toContain("Igreja de Santa Luzia");
    expect(poured.map((row) => row.name)).not.toContain("Sanctum");
    expect(rankCounterPlaces([place("Sanctum", ["place"])], kitchen).map((row) => row.name)).toEqual(["Sanctum"]);
    expect(rankCounterPlaces([place("Tavern", ["bar"])], knownProposal("a Lord of the Rings tavern")!).map((row) => row.name)).toEqual([]);
    expect(placeFits(place("Sky Garden", ["garden", "tea"]), knownProposal("Bridgerton garden tea party")!, "Bridgerton garden tea party")).toBe(false);
    expect(placeFits(place("Jardin Majorelle", ["garden"]), knownProposal("Bridgerton garden tea party")!, "Bridgerton garden tea party")).toBe(false);
    expect(confirmsName("John Carpenter", "John Carpenter (composer)", true)).toBe(true);
    expect(confirmsName("Halloween", "Halloween III")).toBe(false);
    expect(placeObjectKind({ name: "Los Cubiertos", tags: [{ name: "Restaurant" }, { name: "Anime" }] }, "tub")).toBe("table");
    expect(placeObjectKind({ name: "Bathhouse Tea Counter", tags: [{ name: "Bathhouse" }] }, "tub")).toBe("tub");
    expect(placeObjectKind({ name: "Basement Tavern", tags: [{ name: "Bar" }] }, "tub")).toBe("bar");
    expect(chipText("The atmosphere is tense and amber")).toBe("The atmosphere is");
    expect(chipText("Stranger Things Basement 1985")).toBe("Stranger Things");
    expect(chipText("Era: 1985, from the prompt")).toBe("Era: 1985, from the prompt");
    expect(chipSwatch("#3a2a22", "#e6d3b3")).not.toBe("#3a2a22");
    const bill = artist("Bill Evans", ["Jazz"], 0.7);
    const person = artist("Haruki Murakami", ["Literature"], 0.9, [], "urn:entity:person");
    const show = artist("Bridgerton", ["Regency"], 0.9, [], "urn:entity:tv_show");
    expect(artistSignalIds([bill, person])).toEqual([bill.id]);
    expect(artistSignalIds([bill, person, show])).toEqual([bill.id, show.id]);
  });

  it("keeps one tag when a query returns Jazz three times", () => {
    const proposal = knownProposal("reading Murakami on a rainy night")!;
    const chosen = chooseSignalTags(
      [
        { query: "jazz", tag: { id: "1", name: "Jazz", type: "urn:tag" } },
        { query: "jazz", tag: { id: "2", name: "Modal Jazz", type: "urn:tag" } },
        { query: "jazz", tag: { id: "3", name: "Piano Jazz", type: "urn:tag" } },
        { query: "rain", tag: { id: "4", name: "Rain", type: "urn:tag" } },
      ],
      proposal,
    );
    expect(chosen.tags.map((tag) => tag.name)).toEqual(["Jazz", "Rain"]);
    expect(chosen.dropped).not.toContain("Jazz");
    const duplicated = chooseSignalTags(
      [
        ...[
          { query: "jazz", tag: { id: "1", name: "Jazz", type: "urn:tag" } },
          { query: "jazz", tag: { id: "9", name: "Jazz", type: "urn:tag" } },
          { query: "literature", tag: { id: "5", name: "Literature", type: "urn:tag" } },
        ],
      ],
      proposal,
    );
    expect(duplicated.tags.map((tag) => tag.name)).toEqual(expect.arrayContaining(["Jazz", "Literature"]));
    expect(duplicated.dropped).not.toContain("Jazz");
    expect(duplicated.dropped).not.toContain("Literature");
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
  it("drops plot tags and tags that do not fit the mood", () => {
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
    expect(tags.map((tag) => tag.name)).not.toContain("Neon");
    expect(tags.map((tag) => tag.name)).not.toContain("Crime");
    expect(tags.map((tag) => tag.name)).not.toContain("Bathroom");
    const halloween = knownProposal("Halloween")!;
    const kept = tagsForRoom(
      [
        { id: "h", name: "Horror", type: "urn:tag" },
        { id: "s", name: "Sneaking out of the house", type: "urn:tag" },
        { id: "c", name: "House of cards", type: "urn:tag" },
        { id: "b", name: "Half a brain", type: "urn:tag" },
        { id: "t", name: "Bathtub", type: "urn:tag" },
      ],
      halloween,
    );
    expect(kept.map((tag) => tag.name)).toEqual(["Horror"]);
    expect(aestheticTag("Bathtub")).toBe(false);
    expect(aestheticTag("Horror")).toBe(true);
  });
});
