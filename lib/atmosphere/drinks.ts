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
  { test: /\b(mead|hobbit)\b/, name: "Mead", key: "mead" },
  { test: /\b(tavern|taberna|alehouse|pub|\bale\b)/, name: "Ale", key: "ale" },
  { test: /\b(bodega|wine bar|vinoteca|wine)\b/, name: "Red wine", key: "wine" },
];

/**
 * The pour comes from the place when its name or tags name a drink.
 * Otherwise the prompt picks one: a kitchen is tea or hojicha, a 1980s basement is cola.
 * Any place that is not a church, hotel, landmark, or fiction set still pours.
 */
export function pourFor(
  placeName: string,
  tagNames: string[],
  prompt: string,
): { name: string; key: string; from: "place" | "prompt" } | null {
  if (counterRejected(placeName)) return null;
  const prompted = promptDrink(prompt);
  if (prompted) return { ...prompted, from: "prompt" };
  const blob = `${placeName} ${tagNames.join(" ")}`;
  const fromPlace = match(blob);
  if (fromPlace) return { ...fromPlace, from: "place" };
  const fromPrompt = match(prompt);
  if (fromPrompt) return { ...fromPrompt, from: "prompt" };
  return { name: "House pour", key: "house", from: "prompt" };
}

function promptDrink(prompt: string): { name: string; key: string } | null {
  const text = prompt.toLowerCase();
  if (/\b(mead|lord of the rings|lotr|middle-earth|middle earth|hobbit|tolkien)\b/.test(text)) {
    return { name: "Mead", key: "mead" };
  }
  if (/\bkitchen\b/.test(text)) {
    if (/ghibli|hisaishi|spirited|miyazaki|totoro/.test(text)) return { name: "Hojicha", key: "kitchen" };
    return { name: "Tea", key: "kitchen" };
  }
  if (/\bbasement\b/.test(text) || /\b198\d\b/.test(text) || /\b(1980s|80s|eighties)\b/.test(text)) {
    return { name: "Cola", key: "soda" };
  }
  if (/\b(tavern|taberna|alehouse)\b/.test(text)) return { name: "Ale", key: "ale" };
  return null;
}

function match(text: string): { name: string; key: string } | null {
  const blob = text.toLowerCase();
  const found = RULES.find((rule) => rule.test.test(blob));
  return found ? { name: found.name, key: found.key } : null;
}
