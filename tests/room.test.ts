import { describe, expect, it } from "vitest";

import { compileFromPrompt } from "@/lib/agent/orchestrate";
import { compileAtmosphere } from "@/lib/atmosphere/compile";
import type { TasteGraph } from "@/lib/qloo/types";
import { MockTasteClient } from "@/lib/qloo/mock";

const env = { QLOO_MODE: "mock" };

async function compile(prompt: string) {
  return compileFromPrompt(prompt, { client: new MockTasteClient(), env, allowLlm: false });
}

describe("qloo room", () => {
  it("does not repeat a title when a tag echoes the entity", () => {
    const graph: TasteGraph = {
      source: "qloo",
      synthetic: false,
      seeds: [
        {
          id: "song-1",
          name: "Studio Ghibli Songs",
          type: "urn:entity:artist",
          description: null,
          imageUrl: "https://example.com/concert.jpg",
          popularity: 0.4,
          affinity: null,
          tags: [{ id: "tag:songs", name: "Studio Ghibli Songs", type: "urn:tag:keyword" }],
          explainers: [],
          mock: false,
        },
      ],
      artists: [],
      places: [],
      brands: [],
      books: [],
      movies: [],
      tags: [{ id: "tag:songs", name: "Studio Ghibli Songs", type: "urn:tag:keyword" }],
      signalEntityIds: ["song-1"],
      signalTagIds: ["tag:songs"],
    };
    const room = compileAtmosphere("Studio Ghibli bathhouse at dusk", graph);
    expect(room.title.toLowerCase()).not.toMatch(/studio ghibli songs\s*[×·]\s*studio ghibli songs/);
    expect(room.logline).not.toContain("—");
    expect(room.logline).not.toContain("IOSYS");
    expect(room.visual.artwork.kind).toBe("generative");
    expect(room.visual.artwork.imageUrl).toBeNull();
    expect(room.room.lights.length).toBeGreaterThanOrEqual(2);
  });

  it("makes the four example prompts into different rooms, with a plain reading that lacks the graph", async () => {
    const ghibli = await compile("Studio Ghibli bathhouse at dusk");
    const blade = await compile("Blade Runner meets a 1970s jazz bar");
    const wes = await compile("a Wes Anderson brunch");
    const murakami = await compile("reading Murakami on a rainy night");

    expect(ghibli.atmosphere.room.plan).toBe("bath");
    expect(ghibli.atmosphere.room.window).toBe("dusk");
    expect(blade.atmosphere.room.plan).toBe("neon");
    expect(wes.atmosphere.room.plan).toBe("symmetry");
    expect(murakami.atmosphere.room.window).toBe("rain");
    expect(new Set([ghibli.atmosphere.room.plan, blade.atmosphere.room.plan, wes.atmosphere.room.plan, murakami.atmosphere.room.plan]).size).toBeGreaterThan(1);

    expect(ghibli.atmosphere.title.toLowerCase()).not.toContain("×");
    expect(ghibli.atmosphere.logline).not.toContain("—");
    expect(ghibli.comparison.qlooAdded.map((item) => item.label)).toEqual(expect.arrayContaining(["Joe Hisaishi", "Spirited Away"]));
    expect(ghibli.baseline.assumptions.join(" ")).not.toContain("Joe Hisaishi");
    expect(ghibli.baseline.room.plan).not.toBe(ghibli.atmosphere.room.plan);
    expect(ghibli.steps.some((step) => step.call === "GET /v2/insights")).toBe(true);
    expect(ghibli.atmosphere.audio.layers.map((layer) => layer.role)).toEqual(["pad", "texture", "pulse"]);
    expect(blade.atmosphere.music.map((row) => row.name)).toContain("Vangelis");
    expect(blade.comparison.headline.length).toBeGreaterThan(10);

    const ghibliColors = new Set(ghibli.atmosphere.room.lights.map((light) => light.color));
    expect(ghibliColors.size).toBeGreaterThan(1);
    const bladeLabels = blade.atmosphere.room.lights.map((light) => light.label.toLowerCase()).join(" ");
    expect(bladeLabels).toMatch(/jazz|vinyl|lounge|whiskey|whisky/);
    expect(ghibli.atmosphere.room.objects.some((object) => object.label === "Spirited Away" && object.kind === "cup")).toBe(false);
    expect(ghibli.atmosphere.audio.description.toLowerCase()).toContain("steam");
  });
});
