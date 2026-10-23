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
  };
  return labels[type] ?? type.replace(/^urn:entity:/, "").replace(/^urn:tag:/, "tag ");
}

export function affinityText(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toFixed(2);
}
