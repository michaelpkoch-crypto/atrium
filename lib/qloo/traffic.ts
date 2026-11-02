/**
 * One process shares a short queue and a day-long memory of successful Qloo reads.
 * The hackathon API answers 429 when a compile fires every search and insight at once.
 * Nothing here is a Qloo payload checked into the repo. The cache lives in the instance.
 */

const LIMIT = 2;
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 240;

type Entry = { expires: number; body: unknown };

let active = 0;
let holdUntil = 0;
const waiters: Array<() => void> = [];
const cache = new Map<string, Entry>();

export function resetQlooTraffic(): void {
  active = 0;
  holdUntil = 0;
  waiters.splice(0, waiters.length);
  cache.clear();
}

export function cacheKey(path: string, query: Record<string, string>): string {
  const keys = Object.keys(query).sort();
  return `${path}?${keys.map((key) => `${key}=${query[key]}`).join("&")}`;
}

export function readQlooCache(key: string): unknown | undefined {
  const found = cache.get(key);
  if (!found) return undefined;
  if (found.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Refresh recency so a hot room stays in the LRU.
  cache.delete(key);
  cache.set(key, found);
  return found.body;
}

export function writeQlooCache(key: string, body: unknown): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { expires: Date.now() + TTL_MS, body });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** Pause every new call. Used after a 429 so the queue does not stampede the retry. */
export function holdQloo(ms: number): void {
  const wait = Math.max(0, Math.min(ms, 5_000));
  holdUntil = Math.max(holdUntil, Date.now() + wait);
}

export async function withQlooSlot<T>(run: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await run();
  } finally {
    release();
  }
}

async function acquire(): Promise<void> {
  while (true) {
    const hold = holdUntil - Date.now();
    if (hold > 0) {
      await sleep(hold);
      continue;
    }
    if (active < LIMIT) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
}

function release(): void {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function backoffMs(attempt: number, retryAfter: string | null): number {
  const header = retryAfterMs(retryAfter);
  if (header != null) return Math.min(header, 5_000);
  const base = Math.min(4_000, 350 * 2 ** attempt);
  return base + Math.floor(Math.random() * 200);
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds > 120 ? seconds : seconds * 1000);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return null;
  return Math.max(0, date - Date.now());
}
