import { describe, expect, it } from "vitest";

import { QlooClient } from "@/lib/qloo/client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("QlooClient", () => {
  it("calls insights with the hackathon header and query string", async () => {
    const calls: { url: string; headers: Headers }[] = [];
    const client = new QlooClient({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "test-key",
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), headers: new Headers(init?.headers) });
        return jsonResponse({
          success: true,
          results: {
            entities: [
              {
                name: "Example Artist",
                entity_id: "11111111-1111-1111-1111-111111111111",
                subtype: "urn:entity:artist",
                popularity: 0.5,
                query: { affinity: 0.42 },
                properties: {
                  description: "A structural example, not a Qloo record.",
                  tags: [{ id: "urn:tag:genre:music:jazz", name: "Jazz", type: "urn:tag:genre:music" }],
                },
              },
            ],
          },
        });
      },
    });

    const result = await client.insights({
      filterType: "urn:entity:artist",
      entityIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
      tagIds: ["urn:tag:genre:music:jazz"],
      take: 4,
    });

    expect(result.entities[0]?.name).toBe("Example Artist");
    expect(result.entities[0]?.affinity).toBe(0.42);
    expect(result.entities[0]?.tags[0]?.name).toBe("Jazz");
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe("https://hackathon.api.qloo.com/v2/insights");
    expect(url.searchParams.get("filter.type")).toBe("urn:entity:artist");
    expect(url.searchParams.get("signal.interests.entities")).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    expect(url.searchParams.get("signal.interests.tags")).toBe("urn:tag:genre:music:jazz");
    expect(url.searchParams.get("feature.explainability")).toBe("true");
    expect(calls[0].headers.get("X-Api-Key")).toBe("test-key");
    expect(url.search).not.toContain("test-key");
    expect(client.trace[0]?.mocked).toBe(false);
  });

  it("treats a search 404 as no results and does not spend a second call", async () => {
    const paths: string[] = [];
    const client = new QlooClient({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        paths.push(url.search);
        return jsonResponse({ message: "No results" }, 404);
      },
    });

    const rows = await client.search("no such film", 5);
    expect(rows).toEqual([]);
    expect(paths).toHaveLength(1);
    expect(paths[0]).not.toContain("types=");
    expect(client.trace.every((call) => call.path === "/search")).toBe(true);
  });

  it("retries search with types only after a 400", async () => {
    const paths: string[] = [];
    const client = new QlooClient({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "test-key",
      fetchImpl: async (input) => {
        const url = new URL(String(input));
        paths.push(url.search);
        if (!url.searchParams.get("types")) return jsonResponse({ error: { message: "types required" } }, 400);
        return jsonResponse({ success: true, results: { entities: [] } });
      },
    });

    await expect(client.search("paper lantern", 4)).resolves.toEqual([]);
    expect(paths).toHaveLength(2);
    expect(paths[1]).toContain("types=");
  });

  it("encodes search text and refuses ids that could add extra signals", async () => {
    const urls: string[] = [];
    const client = new QlooClient({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "test-key-value",
      fetchImpl: async (input) => {
        urls.push(String(input));
        return jsonResponse({ success: true, results: { entities: [] } });
      },
    });

    await client.search("jazz&take=50&filter.type=urn:entity:place", 3);
    const search = new URL(urls[0]);
    expect(search.searchParams.get("query")).toBe("jazz&take=50&filter.type=urn:entity:place");
    expect(search.searchParams.get("take")).toBe("3");
    expect(search.searchParams.get("filter.type")).toBeNull();

    const result = await client.insights({
      filterType: "urn:entity:artist",
      entityIds: [
        "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa,bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        "cccccccc-cccc-cccc-cccc-cccccccccccc",
      ],
      tagIds: ["urn:tag:genre:music:jazz,urn:tag:injected"],
    });
    expect(result.entities).toEqual([]);
    const insights = new URL(urls[1]);
    expect(insights.searchParams.get("signal.interests.entities")).toBe("cccccccc-cccc-cccc-cccc-cccccccccccc");
    expect(insights.searchParams.get("signal.interests.tags")).toBeNull();
    expect(insights.search).not.toContain("test-key-value");
  });

  it("does not call insights when every id is unsafe, and redacts a key echoed in an error", async () => {
    let calls = 0;
    const client = new QlooClient({
      baseUrl: "https://hackathon.api.qloo.com",
      apiKey: "super-secret-key-value",
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ error: { message: "bad key super-secret-key-value" } }, 401);
      },
    });

    await expect(
      client.insights({
        filterType: "urn:entity:movie",
        entityIds: ["not-a-uuid"],
        tagIds: ["jazz"],
      }),
    ).resolves.toEqual({ entities: [], tags: [] });
    expect(calls).toBe(0);

    await expect(client.search("Blade Runner")).rejects.toThrow(/hackathon\.api\.qloo\.com/);
    await expect(client.search("Blade Runner")).rejects.not.toThrow(/super-secret-key-value/);
  });

  it("explains a 401", async () => {
    const client = new QlooClient({
      baseUrl: "https://api.qloo.com",
      apiKey: "wrong-host",
      fetchImpl: async () => jsonResponse({ message: "No API key found in request" }, 401),
    });
    await expect(client.searchTags("jazz")).rejects.toThrow(/hackathon\.api\.qloo\.com/);
  });
});
