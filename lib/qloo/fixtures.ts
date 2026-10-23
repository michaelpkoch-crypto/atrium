/**
 * Synthetic taste graph used only when QLOO_API_KEY is absent.
 * These rows are original fixtures. They are not cached Qloo responses,
 * and every id is prefixed `mock:` so it cannot be confused with a Qloo UUID.
 */

export type FixtureTag = {
  id: string;
  name: string;
  type: string;
  aliases: string[];
};

export type Fixture = {
  id: string;
  name: string;
  type: string;
  description: string;
  aliases: string[];
  popularity: number;
  tags: { id: string; name: string; type: string }[];
  affinityTo: Record<string, number>;
};

const FIXTURE_NOTE =
  "Synthetic fixture standing in for a Qloo entity. Not a live taste-graph record.";

function tag(slug: string, name: string, aliases: string[] = []): FixtureTag {
  return {
    id: `mock:tag:${slug}`,
    name,
    type: "urn:tag:keyword",
    aliases: [slug, name.toLowerCase(), ...aliases],
  };
}

export const FIXTURE_TAGS: FixtureTag[] = [
  tag("jazz", "Jazz"),
  tag("vinyl", "Vinyl"),
  tag("whiskey", "Whiskey", ["whisky"]),
  tag("lounge", "Lounge"),
  tag("neon", "Neon"),
  tag("rain", "Rain", ["rainy", "monsoon"]),
  tag("noir", "Noir"),
  tag("android", "Android"),
  tag("night", "Night"),
  tag("pastel", "Pastel"),
  tag("symmetry", "Symmetry"),
  tag("brunch", "Brunch"),
  tag("pastry", "Pastry"),
  tag("cafe", "Cafe", ["coffee"]),
  tag("literature", "Literature"),
  tag("novel", "Novel"),
  tag("japan", "Japan"),
  tag("kissaten", "Kissaten"),
  tag("cocktail", "Cocktail"),
  tag("bar", "Bar"),
  tag("noodles", "Noodles"),
  tag("disco", "Disco"),
  tag("funk", "Funk"),
  tag("bathhouse", "Bathhouse"),
  tag("tea", "Tea"),
  tag("dusk", "Dusk"),
  tag("anime", "Anime"),
  tag("ghibli", "Ghibli"),
  tag("brutalist", "Brutalist"),
  tag("concrete", "Concrete"),
  tag("fashion", "Fashion"),
  tag("electronic", "Electronic"),
  tag("ambient", "Ambient"),
  tag("synthesizer", "Synthesizer"),
];

const T = Object.fromEntries(FIXTURE_TAGS.map((item) => [item.id.replace("mock:tag:", ""), item])) as Record<
  string,
  FixtureTag
>;

function tags(...slugs: string[]) {
  return slugs.map((slug) => {
    const found = T[slug];
    if (!found) throw new Error(`Unknown fixture tag ${slug}`);
    return { id: found.id, name: found.name, type: found.type };
  });
}

function row(
  id: string,
  name: string,
  type: string,
  aliases: string[],
  tagSlugs: string[],
  affinityTo: Record<string, number>,
  popularity: number,
): Fixture {
  return {
    id,
    name,
    type,
    description: FIXTURE_NOTE,
    aliases,
    popularity,
    tags: tags(...tagSlugs),
    affinityTo,
  };
}

const BLADE = "mock:movie:blade-runner";
const WES = "mock:person:wes-anderson";
const MURAKAMI = "mock:person:haruki-murakami";
const GHIBLI = "mock:movie:spirited-away";
const CONCRETE = "mock:place:concrete-canteen";

export const FIXTURES: Fixture[] = [
  row(BLADE, "Blade Runner", "urn:entity:movie", ["blade runner"], ["neon", "noir", "android"], {}, 0.96),
  row(
    "mock:book:androids",
    "Do Androids Dream of Electric Sheep?",
    "urn:entity:book",
    ["do androids dream of electric sheep", "androids"],
    ["novel", "android", "noir"],
    { [BLADE]: 0.9 },
    0.74,
  ),
  row(
    "mock:artist:vangelis",
    "Vangelis",
    "urn:entity:artist",
    ["vangelis"],
    ["electronic", "ambient", "synthesizer", "neon"],
    { [BLADE]: 0.93 },
    0.81,
  ),
  row(
    "mock:artist:eno",
    "Brian Eno",
    "urn:entity:artist",
    ["brian eno"],
    ["ambient", "electronic"],
    { [BLADE]: 0.61 },
    0.77,
  ),
  row(
    "mock:artist:tangerine",
    "Tangerine Dream",
    "urn:entity:artist",
    ["tangerine dream"],
    ["electronic", "synthesizer", "noir"],
    { [BLADE]: 0.58 },
    0.66,
  ),
  row(
    "mock:place:sodium-lamp",
    "Sodium Lamp Bar",
    "urn:entity:place",
    ["sodium lamp bar"],
    ["cocktail", "bar", "whiskey", "neon"],
    { [BLADE]: 0.84 },
    0.52,
  ),
  row(
    "mock:place:night-market",
    "Night Market Counter",
    "urn:entity:place",
    ["night market counter"],
    ["noodles", "neon"],
    { [BLADE]: 0.73 },
    0.48,
  ),
  row(
    "mock:brand:issey",
    "Issey Miyake",
    "urn:entity:brand",
    ["issey miyake"],
    ["fashion", "noir", "japan"],
    { [BLADE]: 0.57 },
    0.7,
  ),

  row(
    "mock:artist:miles",
    "Miles Davis",
    "urn:entity:artist",
    ["miles davis"],
    ["jazz", "vinyl", "lounge"],
    {},
    0.95,
  ),
  row(
    "mock:artist:alice",
    "Alice Coltrane",
    "urn:entity:artist",
    ["alice coltrane"],
    ["jazz", "ambient", "vinyl"],
    {},
    0.8,
  ),
  row(
    "mock:artist:bill",
    "Bill Evans",
    "urn:entity:artist",
    ["bill evans"],
    ["jazz", "vinyl", "night"],
    { [MURAKAMI]: 0.72 },
    0.78,
  ),
  row(
    "mock:place:low-room",
    "The Low Room",
    "urn:entity:place",
    ["the low room"],
    ["jazz", "cocktail", "whiskey", "vinyl", "lounge", "bar"],
    {},
    0.5,
  ),
  row(
    "mock:brand:blue-note",
    "Blue Note",
    "urn:entity:brand",
    ["blue note"],
    ["jazz", "vinyl"],
    {},
    0.69,
  ),

  row(
    WES,
    "Wes Anderson",
    "urn:entity:person",
    ["wes anderson"],
    ["symmetry", "pastel"],
    {},
    0.9,
  ),
  row(
    "mock:movie:budapest",
    "The Grand Budapest Hotel",
    "urn:entity:movie",
    ["the grand budapest hotel", "grand budapest hotel", "grand budapest"],
    ["symmetry", "pastel"],
    { [WES]: 0.94 },
    0.88,
  ),
  row(
    "mock:artist:mothersbaugh",
    "Mark Mothersbaugh",
    "urn:entity:artist",
    ["mark mothersbaugh"],
    ["symmetry", "electronic"],
    { [WES]: 0.8 },
    0.63,
  ),
  row(
    "mock:artist:desplat",
    "Alexandre Desplat",
    "urn:entity:artist",
    ["alexandre desplat"],
    ["symmetry", "pastel"],
    { [WES]: 0.76 },
    0.71,
  ),
  row(
    "mock:place:pink-linen",
    "Pink Linen Cafe",
    "urn:entity:place",
    ["pink linen cafe"],
    ["brunch", "pastry", "cafe", "pastel", "symmetry"],
    { [WES]: 0.87 },
    0.46,
  ),
  row(
    "mock:brand:marimekko",
    "Marimekko",
    "urn:entity:brand",
    ["marimekko"],
    ["fashion", "pastel", "symmetry"],
    { [WES]: 0.64 },
    0.6,
  ),

  row(
    MURAKAMI,
    "Haruki Murakami",
    "urn:entity:person",
    ["haruki murakami", "murakami"],
    ["literature", "japan", "rain", "night"],
    {},
    0.93,
  ),
  row(
    "mock:book:norwegian-wood",
    "Norwegian Wood",
    "urn:entity:book",
    ["norwegian wood"],
    ["novel", "literature", "night"],
    { [MURAKAMI]: 0.92 },
    0.84,
  ),
  row(
    "mock:book:kafka-shore",
    "Kafka on the Shore",
    "urn:entity:book",
    ["kafka on the shore"],
    ["novel", "literature", "rain", "night"],
    { [MURAKAMI]: 0.86 },
    0.8,
  ),
  row(
    "mock:place:kissaten",
    "Rain Window Kissaten",
    "urn:entity:place",
    ["rain window kissaten"],
    ["cafe", "whiskey", "bar", "rain", "night", "kissaten", "japan"],
    { [MURAKAMI]: 0.9 },
    0.44,
  ),
  row(
    "mock:brand:suntory",
    "Suntory",
    "urn:entity:brand",
    ["suntory"],
    ["whiskey", "japan"],
    { [MURAKAMI]: 0.67 },
    0.75,
  ),

  row(
    GHIBLI,
    "Spirited Away",
    "urn:entity:movie",
    ["spirited away", "studio ghibli", "ghibli"],
    ["anime", "ghibli", "bathhouse", "dusk", "tea"],
    {},
    0.97,
  ),
  row(
    "mock:artist:hisaishi",
    "Joe Hisaishi",
    "urn:entity:artist",
    ["joe hisaishi"],
    ["anime", "ghibli", "ambient"],
    { [GHIBLI]: 0.95 },
    0.83,
  ),
  row(
    "mock:place:bathhouse-tea",
    "Bathhouse Tea Counter",
    "urn:entity:place",
    ["bathhouse tea counter"],
    ["bathhouse", "tea", "dusk", "japan"],
    { [GHIBLI]: 0.82 },
    0.41,
  ),

  row(
    "mock:artist:donna",
    "Donna Summer",
    "urn:entity:artist",
    ["donna summer"],
    ["disco", "funk"],
    {},
    0.86,
  ),
  row(
    "mock:artist:chic",
    "Chic",
    "urn:entity:artist",
    ["chic"],
    ["disco", "funk"],
    {},
    0.74,
  ),
  row(
    "mock:place:mirror-ball",
    "Mirror Ball Supper Club",
    "urn:entity:place",
    ["mirror ball supper club"],
    ["disco", "funk", "cocktail", "bar"],
    {},
    0.49,
  ),

  row(
    CONCRETE,
    "Concrete Canteen",
    "urn:entity:place",
    ["concrete canteen"],
    ["brutalist", "concrete", "cafe"],
    {},
    0.37,
  ),
];

// Jazz and disco entities are reached through tag signals (mock:tag:jazz, mock:tag:disco),
// not through hardcoded prompt aliases. Blade Runner's neighbors use affinityTo.
