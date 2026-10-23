import { describe, expect, it } from "vitest";

import { extractQueries, tagQueriesFor } from "@/lib/agent/queries";

describe("prompt queries", () => {
  it("splits a meets-prompt into the two cultural halves", () => {
    const queries = extractQueries("Blade Runner meets a 1970s jazz bar");
    expect(queries).toContain("Blade Runner");
    expect(queries.some((query) => query.toLowerCase().includes("jazz"))).toBe(true);
  });

  it("keeps Murakami and the rainy clause", () => {
    const queries = extractQueries("reading Murakami on a rainy night");
    expect(queries.map((query) => query.toLowerCase())).toContain("murakami");
    expect(tagQueriesFor("reading Murakami on a rainy night", ["Haruki Murakami"])).toEqual(
      expect.arrayContaining(["rainy", "night"]),
    );
  });
});
