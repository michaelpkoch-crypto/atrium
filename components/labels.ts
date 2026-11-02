const FILM_YEARS: { test: RegExp; year: string }[] = [
  { test: /blade runner 2049/i, year: "2017" },
  { test: /blade runner/i, year: "1982" },
  { test: /pride\s*(&|and)\s*prejudice/i, year: "2005" },
  { test: /spirited away/i, year: "2001" },
  { test: /my neighbor totoro|tonari no totoro/i, year: "1988" },
  { test: /grand budapest/i, year: "2014" },
  { test: /royal tenenbaums/i, year: "2001" },
  { test: /pulp fiction/i, year: "1994" },
  { test: /reservoir dogs/i, year: "1992" },
];

export function typeLabel(type: string, name?: string): string {
  if (type.includes("movie")) {
    const year = name ? FILM_YEARS.find((row) => row.test.test(name))?.year : undefined;
    return year ? `Film (${year})` : "Film";
  }
  const labels: Record<string, string> = {
    "urn:entity:artist": "Artist",
    "urn:entity:place": "Place",
    "urn:entity:brand": "Brand",
    "urn:entity:book": "Book",
    "urn:entity:movie": "Film",
    "urn:entity:person": "Person",
    "urn:entity:tv_show": "TV",
    "urn:entity:podcast": "Podcast",
    "urn:entity:destination": "Destination",
    "urn:tag": "Tag",
    baseline: "Assumption",
  };
  return labels[type] ?? type.replace(/^urn:entity:/, "").replace(/^urn:tag:/, "tag ");
}

export function affinityText(value: number | null | undefined): string {
  if (value == null) return "";
  return value.toFixed(2);
}

export function provenanceLine(citation: {
  name: string;
  type: string;
  affinity: number | null;
  tag?: string | null;
}): string {
  const kind = typeLabel(citation.type, citation.name);
  const affinity = citation.affinity == null ? null : `affinity ${citation.affinity.toFixed(2)}`;
  if (citation.type === "baseline") {
    return ["plain reading", "no Qloo call", citation.name].join(" · ");
  }
  if (citation.tag) {
    return [`from Qloo tag “${citation.tag}”`, affinity, `${kind}: ${citation.name}`].filter(Boolean).join(" · ");
  }
  return [`from Qloo ${kind} “${citation.name}”`, affinity].filter(Boolean).join(" · ");
}
