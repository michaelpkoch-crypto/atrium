const STOP = new Set([
  "a",
  "an",
  "the",
  "on",
  "in",
  "at",
  "of",
  "for",
  "and",
  "with",
  "meets",
  "versus",
  "vs",
  "plus",
  "reading",
  "watching",
  "listening",
  "during",
  "into",
  "from",
  "over",
  "under",
  "about",
  "like",
  "to",
  "my",
  "our",
  "some",
  "that",
  "this",
]);

/** Words we send to `/v2/tags` when they show up in the prompt. They are search queries, not results. */
export const AESTHETIC_TOKENS = [
  "jazz",
  "brunch",
  "rain",
  "rainy",
  "neon",
  "noir",
  "pastel",
  "brutalist",
  "disco",
  "whiskey",
  "whisky",
  "night",
  "cyberpunk",
  "bathhouse",
  "monsoon",
  "vinyl",
  "cocktail",
  "ambient",
  "punk",
  "soul",
  "bossa",
  "opera",
  "metal",
  "lofi",
  "funk",
  "techno",
  "anime",
  "ghibli",
  "samba",
  "house",
] as const;

export function nameScore(query: string, name: string): number {
  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();
  if (!q || !n) return 0;
  if (q === n) return 1;
  if (n.includes(q) || q.includes(n)) return 0.9;
  const qt = tokens(q);
  const nt = tokens(n);
  if (!qt.length || !nt.length) return 0;
  const shared = qt.filter((token) => nt.includes(token)).length;
  return shared / Math.max(qt.length, nt.length);
}

export function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Split a cultural prompt into entity-search queries.
 * Proper names and clauses on either side of "meets" / "on a" stay intact.
 */
export function extractQueries(prompt: string): string[] {
  const full = prompt.trim().replace(/\s+/g, " ");
  const chunks = full.split(
    /\s+(?:meets|versus|vs\.?|plus|with)\s+|\s+and\s+|[,;]|\s+on a\s+|\s+during\s+/i,
  );
  const queries: string[] = [];
  const push = (value: string) => {
    let next = value.trim().replace(/^(?:a|an|the|reading|watching|listening to)\s+/i, "");
    next = next.replace(/[?.!]+$/g, "").trim();
    if (next.length < 3) return;
    if (queries.some((query) => query.toLowerCase() === next.toLowerCase())) return;
    queries.push(next);
  };

  for (const chunk of chunks) push(chunk);
  const caps = full.match(/[A-Z][\p{L}0-9'’]+(?:\s+[A-Z][\p{L}0-9'’]+)*/gu) ?? [];
  for (const name of caps) push(name);

  const specific = queries.filter((query) => query.toLowerCase() !== full.toLowerCase());
  return (specific.length ? specific : queries).slice(0, 5);
}

export function tagQueriesFor(prompt: string, seedNames: string[]): string[] {
  const promptTokens = tokens(prompt);
  const seedTokens = new Set(seedNames.flatMap((name) => tokens(name)));
  const aesthetic = AESTHETIC_TOKENS.filter((word) => promptTokens.includes(word));
  const extra = promptTokens.filter(
    (token) =>
      token.length >= 4 &&
      !STOP.has(token) &&
      !seedTokens.has(token) &&
      !/^\d+$/.test(token) &&
      !aesthetic.includes(token as (typeof AESTHETIC_TOKENS)[number]),
  );
  const unique: string[] = [];
  for (const query of [...aesthetic, ...extra]) {
    if (!unique.includes(query)) unique.push(query);
  }
  return unique.slice(0, 4);
}
