const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TAG_ID = /^urn:tag:[A-Za-z0-9][A-Za-z0-9_.:-]{0,180}$/;

export function sanitizeSearchQuery(value: string, max = 120): string {
  return value
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Comma-separated insight signals. Only UUID entity ids, so one value cannot add another. */
export function sanitizeEntityIds(ids: string[], max = 8): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!UUID.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

export function sanitizeTagIds(ids: string[], max = 8): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!TAG_ID.test(id) || out.includes(id)) continue;
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}
