import { createHash, timingSafeEqual } from "node:crypto";

/** Compare two secrets without leaking which byte differed. */
export function tokensMatch(provided: string, expected: string): boolean {
  const hash = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(hash(provided), hash(expected));
}
