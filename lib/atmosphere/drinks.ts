const RULES: { test: RegExp; name: string; key: string }[] = [
  { test: /onsen|sento|bathhouse|hojicha/, name: "Hojicha", key: "bathhouse" },
  { test: /kissaten|\bkissa\b/, name: "Whiskey highball", key: "kissaten" },
  { test: /\bdiner\b|milkshake|roadside/, name: "Bottomless coffee", key: "diner" },
  { test: /tea party|earl grey|afternoon tea|tea room|tea house|garden tea/, name: "Earl Grey", key: "tea" },
  { test: /patisserie|pastry|brunch|macaron/, name: "Grapefruit spritz", key: "brunch" },
  { test: /\bsake\b|izakaya/, name: "Sake", key: "sake" },
  { test: /\bjazz\b|whisky|whiskey|lounge/, name: "Rye old fashioned", key: "jazz" },
  { test: /cocktail|sky bar|martini|rooftop/, name: "Gin martini", key: "cocktail" },
  { test: /\btea\b/, name: "Earl Grey", key: "tea" },
  { test: /\bcafe\b|coffee|espresso/, name: "Filter coffee", key: "cafe" },
];

/** The pour comes from the place's own tags. The prompt is only a fallback when the place has none. */
export function pourFor(
  placeName: string,
  tagNames: string[],
  prompt: string,
): { name: string; key: string; from: "place" | "prompt" } | null {
  const fromPlace = match(`${placeName} ${tagNames.join(" ")}`);
  if (fromPlace) return { ...fromPlace, from: "place" };
  const fromPrompt = match(prompt);
  return fromPrompt ? { ...fromPrompt, from: "prompt" } : null;
}

function match(text: string): { name: string; key: string } | null {
  const blob = text.toLowerCase();
  const found = RULES.find((rule) => rule.test.test(blob));
  return found ? { name: found.name, key: found.key } : null;
}
