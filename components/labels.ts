export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    "urn:entity:artist": "Artist",
    "urn:entity:place": "Place",
    "urn:entity:brand": "Brand",
    "urn:entity:book": "Book",
    "urn:entity:movie": "Movie",
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
  if (value == null) return "unscored";
  return value.toFixed(2);
}

export function provenanceLine(citation: {
  name: string;
  type: string;
  affinity: number | null;
  tag?: string | null;
}): string {
  const kind = typeLabel(citation.type);
  const affinity = citation.affinity == null ? null : `affinity ${citation.affinity.toFixed(2)}`;
  if (citation.type === "baseline") {
    return ["plain reading", "no Qloo call", citation.name].join(" · ");
  }
  if (citation.tag) {
    return [`from Qloo tag “${citation.tag}”`, affinity, `${kind}: ${citation.name}`].filter(Boolean).join(" · ");
  }
  return [`from Qloo ${kind.toLowerCase()} “${citation.name}”`, affinity].filter(Boolean).join(" · ");
}
