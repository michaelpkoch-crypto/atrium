import { connection } from "next/server";

import { atmosphereSchema } from "@/lib/atmosphere/schema";
import { readConfig } from "@/lib/config";
import { dispatchAtmosphere } from "@/lib/dispatch/lights";
import { HttpError, rateLimitResponse, readJsonBody } from "@/lib/security/http";

const WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  await connection();
  const limited = rateLimitResponse(request, "dispatch", 30, WINDOW_MS, 120);
  if (limited) return limited;

  try {
    const body = await readJsonBody(request, 64_000);
    const candidate =
      body && typeof body === "object" && "atmosphere" in body ? (body as { atmosphere: unknown }).atmosphere : body;
    const parsed = atmosphereSchema.safeParse(candidate);
    if (!parsed.success) {
      return Response.json({ error: "Atmosphere JSON did not match the compiler schema." }, { status: 400 });
    }

    const result = await dispatchAtmosphere(parsed.data, readConfig());
    return Response.json(result);
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
    }
    return Response.json({ error: "Dispatch failed." }, { status: 502 });
  }
}
