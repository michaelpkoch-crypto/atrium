import { describe, expect, it } from "vitest";

import { normalizeEntity, normalizeTag, qlooErrorMessage, unwrapEntities, unwrapTags } from "@/lib/qloo/parse";

const insightsBody = {
  success: true,
  results: {
    entities: [
      {
        name: "Paper Lantern Trio",
        entity_id: "11111111-1111-4111-8111-111111111111",
        type: "urn:entity",
        subtype: "urn:entity:artist",
        popularity: 0.42,
        properties: {
          short_description: "Fictional trio used to test the parser.",
          short_descriptions: [{ value: "A longer line that should lose to the short one.", languages: ["en"] }],
          image: { url: "https://images.example.test/lantern.jpg" },
          tags: [{ tag_id: "urn:tag:genre:music:chamber", name: "Chamber", subtype: "urn:tag:genre:music" }],
        },
        query: {
          affinity: 0.81,
          explainability: {
            entities: [{ entity_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Seed Film", score: 0.63 }],
          },
        },
      },
      { popularity: 0.2 },
      { name: "Missing an id" },
      null,
    ],
  },
};

describe("Qloo response parser", () => {
  it("reads an insights entity, including explainability, and drops partial rows", () => {
    const rows = unwrapEntities(insightsBody).map((row) => normalizeEntity(row, false));
    const kept = rows.filter((row) => row !== null);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      name: "Paper Lantern Trio",
      type: "urn:entity:artist",
      description: "Fictional trio used to test the parser.",
      imageUrl: "https://images.example.test/lantern.jpg",
      affinity: 0.81,
    });
    expect(kept[0]?.tags[0]).toMatchObject({ id: "urn:tag:genre:music:chamber", name: "Chamber" });
    expect(kept[0]?.explainers[0]).toMatchObject({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Seed Film",
      score: 0.63,
    });
  });

  it("reads explainability outside query and does not treat the row as its own explainer", () => {
    const entity = normalizeEntity(
      {
        name: "Sezen Aksu",
        entity_id: "33333333-3333-4333-8333-333333333333",
        subtype: "urn:entity:artist",
        affinity: 0.9,
        explainability: {
          entities: [{ entity_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Haruki Murakami", score: 0.9 }],
        },
      },
      false,
    );
    expect(entity?.explainers).toEqual([{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Haruki Murakami", score: 0.9 }]);
  });

  it("reads a search hit that uses types[] and refuses non-https images", () => {
    const [row] = unwrapEntities({
      results: [
        {
          name: "North\u0000 Station",
          entity_id: "22222222-2222-4222-8222-222222222222",
          type: "urn:entity",
          types: ["urn:entity:place"],
          disambiguation: "Fictional station",
          properties: { image: "javascript:alert(1)" },
        },
      ],
    });
    const entity = normalizeEntity(row, false);
    expect(entity).toMatchObject({
      name: "North Station",
      type: "urn:entity:place",
      description: "Fictional station",
      imageUrl: null,
    });

    expect(normalizeEntity({ name: "Http", entity_id: "id-1", properties: { image: { url: "http://images.example.test/a.jpg" } } }, false)?.imageUrl).toBeNull();
    expect(
      normalizeEntity(
        { name: "Userinfo", entity_id: "id-2", properties: { image: "https://user:pass@images.example.test/a.jpg" } },
        false,
      )?.imageUrl,
    ).toBeNull();
    expect(
      normalizeEntity({ name: "String image", entity_id: "id-3", properties: { image: "https://images.example.test/a.jpg" } }, false)
        ?.imageUrl,
    ).toBe("https://images.example.test/a.jpg");
  });

  it("reads a tags payload and falls back to short_descriptions", () => {
    const [tag] = unwrapTags({
      success: true,
      results: {
        tags: [
          {
            tag_id: "urn:tag:keyword:media:paper_lantern",
            name: "Paper Lantern",
            types: ["urn:entity:movie"],
            subtype: "urn:tag:keyword:media",
            tag_value: "urn:tag:keyword:media:paper_lantern",
            query: { affinity: 0.2 },
          },
        ],
      },
    }).map((row) => normalizeTag(row));
    expect(tag).toMatchObject({
      id: "urn:tag:keyword:media:paper_lantern",
      name: "Paper Lantern",
      type: "urn:tag:keyword:media",
      affinity: 0.2,
    });

    const described = normalizeEntity(
      {
        name: "Quiet Edition",
        entity_id: "id-4",
        properties: { short_descriptions: [{ value: "Only the list was filled in.", languages: ["ja"] }] },
      },
      false,
    );
    expect(described?.description).toBe("Only the list was filled in.");
  });

  it("returns empty collections and a short error message without throwing", () => {
    expect(unwrapEntities(null)).toEqual([]);
    expect(unwrapEntities({})).toEqual([]);
    expect(unwrapEntities({ success: true, results: { entities: [] } })).toEqual([]);
    expect(unwrapTags({ results: {} })).toEqual([]);
    expect(() => normalizeEntity({ results: { entities: [null, "nope", { name: 4 }] } }, false)).not.toThrow();
    expect(qlooErrorMessage({ error: { message: "bad filter" } }, "Bad Request")).toBe("bad filter");
    expect(qlooErrorMessage({ errors: [{ message: "missing type" }] }, "")).toBe("missing type");
    expect(qlooErrorMessage(null, "Nope")).toBe("Nope");
    expect(qlooErrorMessage({ message: "x".repeat(500) }, "")?.length).toBeLessThanOrEqual(240);
  });
});
