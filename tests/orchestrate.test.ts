import { describe, expect, it } from "vitest";

function collectCitationIds(value: unknown, found: string[] = []): string[] {
  if (!value || typeof value !== "object") return found;
  if (Array.isArray(value)) {
    for (const item of value) collectCitationIds(item, found);
    return found;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id === "string" && typeof record.detail === "string" && "affinity" in record) {
    found.push(record.id);
  }
  for (const item of Object.values(record)) collectCitationIds(item, found);
  return found;
}

import { PromptError } from "@/lib/agent/errors";
import { compileFromPrompt } from "@/lib/agent/orchestrate";
import { EXAMPLE_PROMPTS } from "@/lib/examples";
import { QlooClient } from "@/lib/qloo/client";
import { MockTasteClient } from "@/lib/qloo/mock";
import type { QlooTraceCall, TasteClient, TasteEntity } from "@/lib/qloo/types";

const env = { QLOO_MODE: "mock" };

async function compile(prompt: string) {
  return compileFromPrompt(prompt, { client: new MockTasteClient(), env, allowLlm: false });
}

describe("mock orchestrator", () => {
  it("compiles every example prompt from the fixture graph and labels it mock", async () => {
    for (const prompt of EXAMPLE_PROMPTS) {
      const result = await compile(prompt);
      expect(result.atmosphere.provenance.mockLabeled).toBe(true);
      expect(result.atmosphere.provenance.note).toContain("MOCK");
      expect(result.graph.synthetic).toBe(false);
      expect(result.trace.some((call) => call.path === "/v2/insights" && call.mocked)).toBe(true);
      expect(result.trace.every((call) => call.mocked)).toBe(true);
      expect(JSON.stringify(result.trace)).not.toContain("QLOO_API_KEY");
      const allowed = new Set(
        [
          result.graph.seeds,
          result.graph.artists,
          result.graph.places,
          result.graph.brands,
          result.graph.books,
          result.graph.movies,
        ]
          .flat()
          .map((row) => row.id)
          .concat(result.graph.tags.map((tag) => tag.id)),
      );
      for (const id of collectCitationIds(result.atmosphere)) {
        expect(allowed.has(id), `${prompt} cited missing id ${id}`).toBe(true);
      }
    }
  });

  it("blends Blade Runner with jazz affinities", async () => {
    const result = await compile("Blade Runner meets a 1970s jazz bar");
    const names = [
      ...result.graph.seeds.map((row) => row.name),
      ...result.graph.artists.map((row) => row.name),
      ...result.graph.places.map((row) => row.name),
    ];
    expect(names).toContain("Blade Runner");
    expect(names).toContain("Vangelis");
    expect(names.some((name) => ["Miles Davis", "Alice Coltrane", "Bill Evans", "The Low Room"].includes(name))).toBe(
      true,
    );
    expect(result.atmosphere.visual.mode).not.toBe("symmetry");
  });

  it("turns Wes Anderson into a symmetrical brunch room", async () => {
    const result = await compile("a Wes Anderson brunch");
    expect(result.graph.seeds.map((seed) => seed.name)).toContain("Wes Anderson");
    expect(result.atmosphere.visual.mode).toBe("symmetry");
    expect(result.atmosphere.drinks.some((drink) => drink.venue === "Pink Linen Cafe")).toBe(true);
    expect(result.graph.movies.map((movie) => movie.name)).toContain("The Grand Budapest Hotel");
  });

  it("puts a Murakami book on the table", async () => {
    const result = await compile("reading Murakami on a rainy night");
    expect(result.graph.seeds.map((seed) => seed.name)).toContain("Haruki Murakami");
    expect(result.atmosphere.reading.map((book) => book.name)).toEqual(
      expect.arrayContaining(["Norwegian Wood"]),
    );
    expect(["rain", "paper"]).toContain(result.atmosphere.visual.mode);
  });

  it("labels a synthetic graph when nothing matches", async () => {
    const result = await compile("chartreuse submarine quilt");
    expect(result.graph.synthetic).toBe(true);
    expect(result.atmosphere.provenance.note).toContain("MOCK");
    expect(result.atmosphere.provenance.synthetic).toBe(true);
  });

  it("keeps the mock label on non-English and emoji prompts", async () => {
    const result = await compile("雨の夜に村上春樹 ☔️");
    expect(result.atmosphere.provenance.source).toBe("mock");
    expect(result.atmosphere.provenance.note).toContain("MOCK");
    expect(result.atmosphere.title).not.toBe("Untitled motif");
    expect(result.warnings).toEqual([]);
  });

  it("keeps the top live hit when the prompt and the name use different scripts", async () => {
    const seed: TasteEntity = {
      id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      name: "Haruki Murakami",
      type: "urn:entity:person",
      description: null,
      imageUrl: null,
      popularity: 0.8,
      affinity: null,
      tags: [],
      explainers: [],
      mock: false,
    };
    const client: TasteClient = {
      mode: "live",
      trace: [],
      async search() {
        this.trace.push(call("/search", 200, 1));
        return [seed];
      },
      async searchTags() {
        return [];
      },
      async insights() {
        this.trace.push(call("/v2/insights", 200, 0));
        return { entities: [], tags: [] };
      },
    };
    const result = await compileFromPrompt("雨の夜に村上春樹", {
      client,
      allowLlm: false,
      env: { QLOO_MODE: "live", QLOO_API_KEY: "live-key-value" },
    });
    expect(result.graph.seeds.map((item) => item.name)).toContain("Haruki Murakami");
    expect(result.atmosphere.provenance.source).toBe("qloo");
    expect(result.atmosphere.provenance.note).not.toContain("MOCK");
  });

  it("rejects an empty prompt and a very long one", async () => {
    await expect(compile("   ")).rejects.toBeInstanceOf(PromptError);
    await expect(compile("neon ".repeat(90))).rejects.toThrow(/400/);
  });

  it("strips control characters before the prompt is stored", async () => {
    const result = await compile("Blade\u0000 Runner meets jazz");
    expect(result.atmosphere.prompt).toBe("Blade Runner meets jazz");
    expect(result.atmosphere.provenance.note).toContain("MOCK");
  });

  it("does not relabel a rejected live key as mock data", async () => {
    const client = new QlooClient({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "super-secret-key-value",
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: { message: "bad key super-secret-key-value" } }), { status: 401 }),
    });
    let message = "";
    try {
      await compileFromPrompt("Blade Runner", {
        client,
        allowLlm: false,
        env: { QLOO_MODE: "live", QLOO_API_KEY: "super-secret-key-value" },
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/hackathon\.api\.qloo\.com/);
    expect(message).not.toContain("super-secret-key-value");
  });

  it("warns when live insights fail and still refuses to call the room mock", async () => {
    const seed: TasteEntity = {
      id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      name: "Blade Runner",
      type: "urn:entity:movie",
      description: null,
      imageUrl: null,
      popularity: 0.9,
      affinity: null,
      tags: [],
      explainers: [],
      mock: false,
      matchScore: 1,
    };
    const client: TasteClient = {
      mode: "live",
      trace: [],
      async search() {
        this.trace.push(call("/search", 200, 1));
        return [seed];
      },
      async searchTags() {
        this.trace.push(call("/v2/tags", 200, 0));
        return [];
      },
      async insights() {
        this.trace.push({ ...call("/v2/insights", 500, 0), error: "upstream failed sk-test-secret-value" });
        throw new Error("upstream failed sk-test-secret-value");
      },
    };

    const result = await compileFromPrompt("Blade Runner", {
      client,
      allowLlm: false,
      env: { QLOO_MODE: "live", QLOO_API_KEY: "live-key-value" },
    });
    expect(result.atmosphere.provenance.source).toBe("qloo");
    expect(result.atmosphere.provenance.note).not.toContain("MOCK");
    expect(result.warnings[0]).toMatch(/still live data/);
    expect(JSON.stringify(result)).not.toContain("sk-test-secret-value");
  });
});

function call(path: QlooTraceCall["path"], status: number, resultCount: number): QlooTraceCall {
  return { method: "GET", path, query: { query: "Blade Runner" }, status, resultCount, mocked: false };
}
