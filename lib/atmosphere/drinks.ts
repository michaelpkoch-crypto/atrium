import { counterRejected } from "@/lib/agent/propose";

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

const CAN_SERVE =
  /\b(diner|eatery|grill|restaurant|bistro|cafe|coffee|espresso|kissaten|kissa|bar|pub|lounge|tea\s*room|tearoom|tea\s*house|teahouse|bathhouse|onsen|sento|patisserie|bakery|pastry|brunch)\b/i;

/**
 * The pour comes from the place. The prompt fills in only when that place is a venue
 * that can serve a drink. A church or a hotel does not pour Earl Grey.
 */
export function pourFor(
  placeName: string,
  tagNames: string[],
  prompt: string,
): { name: string; key: string; from: "place" | "prompt" } | null {
  if (counterRejected(placeName)) return null;
  const blob = `${placeName} ${tagNames.join(" ")}`;
  const fromPlace = match(blob);
  if (fromPlace) return { ...fromPlace, from: "place" };
  if (!CAN_SERVE.test(blob)) return null;
  const fromPrompt = match(prompt);
  return fromPrompt ? { ...fromPrompt, from: "prompt" } : null;
}

function match(text: string): { name: string; key: string } | null {
  const blob = text.toLowerCase();
  const found = RULES.find((rule) => rule.test.test(blob));
  return found ? { name: found.name, key: found.key } : null;
}
