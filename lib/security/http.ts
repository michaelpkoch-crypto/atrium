import { redactSecrets } from "@/lib/security/redact";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const buckets = new Map<string, number[]>();

export function resetRateLimits(): void {
  buckets.clear();
}

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): { ok: true } | { ok: false; retryAfterSeconds: number } {
  const recent = (buckets.get(key) ?? []).filter((stamp) => now - stamp < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    const retryAfterSeconds = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }
  recent.push(now);
  buckets.set(key, recent);
  if (buckets.size > 4000) {
    for (const [name, stamps] of buckets) {
      if (stamps.every((stamp) => now - stamp >= windowMs)) buckets.delete(name);
    }
  }
  return { ok: true };
}

export function clientIp(request: Request): string {
  const real = request.headers.get("x-real-ip")?.split(",")[0]?.trim();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = (real || forwarded || "unknown").replace(/[^\w.:]/g, "").slice(0, 64);
  return candidate || "unknown";
}

export function rateLimitResponse(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
  globalLimit?: number,
): Response | null {
  const ip = clientIp(request);
  const local = consumeRateLimit(`${scope}:${ip}`, limit, windowMs);
  if (!local.ok) return tooMany(local.retryAfterSeconds);
  if (globalLimit) {
    const global = consumeRateLimit(`${scope}:all`, globalLimit, windowMs);
    if (!global.ok) return tooMany(global.retryAfterSeconds);
  }
  return null;
}

function tooMany(retryAfterSeconds: number): Response {
  return Response.json(
    { error: "Too many requests from this network. Wait and try again." },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
  );
}

export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && Number.isFinite(Number(declared)) && Number(declared) > maxBytes) {
    throw new HttpError("Request body is too large.", 413);
  }
  if (!request.body) throw new HttpError("Expected a JSON body.", 400);

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError("Request body is too large.", 413);
    }
    chunks.push(value);
  }

  const text = new TextDecoder().decode(concatBytes(chunks));
  if (!text.trim()) throw new HttpError("Expected a JSON body.", 400);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError("Expected a JSON body.", 400);
  }
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export function publicErrorMessage(error: unknown, secrets: string[]): string {
  if (error instanceof HttpError) return error.message;
  const message = error instanceof Error ? error.message : "Request failed.";
  return redactSecrets(message, secrets);
}
