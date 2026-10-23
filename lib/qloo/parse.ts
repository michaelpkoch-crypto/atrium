import type { Explainer, TasteEntity, TasteTag } from "@/lib/qloo/types";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function num(value: unknown): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

export function unwrapEntities(body: unknown): unknown[] {
  const root = asRecord(body);
  if (!root) return [];
  if (Array.isArray(root.results)) return root.results;
  if (Array.isArray(root.entities)) return root.entities;
  const results = asRecord(root.results);
  if (results && Array.isArray(results.entities)) return results.entities;
  return [];
}

export function unwrapTags(body: unknown): unknown[] {
  const root = asRecord(body);
  if (!root) return [];
  if (Array.isArray(root.tags)) return root.tags;
  const results = asRecord(root.results);
  if (results && Array.isArray(results.tags)) return results.tags;
  return [];
}

export function normalizeTags(raw: unknown): TasteTag[] {
  if (!Array.isArray(raw)) return [];
  const out: TasteTag[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const record = asRecord(item);
    if (!record) continue;
    const id = clip(record.id, 200) ?? clip(record.tag_id, 200) ?? clip(record.tag_value, 200);
    const name = clip(record.name, 80);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      type: clip(record.subtype, 80) ?? clip(record.type, 80) ?? "urn:tag",
      affinity: num(asRecord(record.query)?.affinity) ?? num(record.affinity),
    });
  }
  return out;
}

function clampScore(value: number): number | null {
  if (value > 1 && value <= 100) return value / 100;
  if (value < 0 || value > 1) return null;
  return value;
}

/** Pull explainability rows out of whatever object shape the Insights API returns. */
export function extractExplainers(query: unknown, signalIds?: string[]): Explainer[] {
  const found = new Map<string, Explainer>();

  const visit = (node: unknown, depth: number) => {
    if (node == null || depth > 7) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const record = asRecord(node);
    if (!record) return;
    const id = clip(record.entity_id, 80) ?? clip(record.id, 80) ?? clip(record.entityId, 80);
    const score = num(record.score) ?? num(record.weight) ?? num(record.affinity) ?? num(record.value);
    if (id && score != null && id.startsWith("urn:") === false) {
      const clamped = clampScore(score);
      if (clamped != null) {
        const previous = found.get(id);
        if (!previous || clamped > previous.score) {
          found.set(id, {
            id,
            name: clip(record.name, 120) ?? id,
            score: clamped,
          });
        }
      }
    }
    for (const value of Object.values(record)) visit(value, depth + 1);
  };

  visit(query, 0);
  let rows = [...found.values()];
  if (signalIds && signalIds.length) {
    const signaled = rows.filter((row) => signalIds.includes(row.id));
    if (signaled.length) rows = signaled;
  }
  return rows.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function entityType(record: Record<string, unknown>): string {
  const subtype = clip(record.subtype, 80);
  if (subtype && subtype !== "urn:entity") return subtype;
  if (Array.isArray(record.types)) {
    for (const item of record.types) {
      const value = clip(item, 80);
      if (value?.startsWith("urn:entity:") && value !== "urn:entity") return value;
    }
  }
  const type = clip(record.type, 80);
  if (type && type !== "urn:entity") return type;
  return subtype || type || "urn:entity";
}

function shortDescription(properties: Record<string, unknown>): string | null {
  if (!Array.isArray(properties.short_descriptions)) return null;
  const rows = properties.short_descriptions
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => item !== null);
  const english = rows.find((row) => {
    const languages = Array.isArray(row.languages) ? row.languages : [];
    return languages.some((language) => typeof language === "string" && language.toLowerCase().startsWith("en"));
  });
  return clip((english ?? rows[0])?.value, 400);
}

/** https only, no userinfo. Anything else is dropped before it can reach an img src. */
export function httpsImageUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2000 || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function imageUrlOf(record: Record<string, unknown>, properties: Record<string, unknown>): string | null {
  const image = properties.image ?? record.image;
  if (typeof image === "string") return httpsImageUrl(image);
  const imageRecord = asRecord(image);
  return imageRecord ? httpsImageUrl(imageRecord.url) : null;
}

export function normalizeEntity(raw: unknown, mock: boolean, signalIds?: string[]): TasteEntity | null {
  const record = asRecord(raw);
  if (!record) return null;
  const id = clip(record.entity_id, 80) ?? clip(record.id, 80);
  const name = clip(record.name, 120);
  if (!id || !name) return null;

  const properties = asRecord(record.properties) ?? {};
  const tags = normalizeTags([
    ...(Array.isArray(properties.tags) ? properties.tags : []),
    ...(Array.isArray(record.tags) ? record.tags : []),
  ]);
  const query = asRecord(record.query);

  return {
    id,
    name,
    type: entityType(record),
    description:
      clip(properties.short_description, 400) ??
      shortDescription(properties) ??
      clip(properties.description, 400) ??
      clip(record.disambiguation, 200) ??
      null,
    imageUrl: imageUrlOf(record, properties),
    popularity: num(record.popularity) ?? num(properties.popularity),
    affinity: (query ? num(query.affinity) : null) ?? num(record.affinity),
    tags,
    explainers: extractExplainers(query, signalIds),
    mock,
  };
}

export function normalizeTag(raw: unknown): TasteTag | null {
  const [tag] = normalizeTags([raw]);
  return tag ?? null;
}

export function qlooErrorMessage(body: unknown, statusText: string): string {
  const record = asRecord(body);
  if (!record) return (statusText || "Qloo request failed").slice(0, 240);
  const nested = asRecord(record.error);
  const listed = Array.isArray(record.errors) ? asRecord(record.errors[0]) : null;
  return (
    clip(nested?.message, 240) ??
    clip(listed?.message, 240) ??
    clip(record.message, 240) ??
    clip(record.error, 240) ??
    (statusText || "Qloo request failed").slice(0, 240)
  );
}
