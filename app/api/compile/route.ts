import { connection } from "next/server";

import { NoTasteMatch, PromptError } from "@/lib/agent/errors";
import { compileFromPrompt } from "@/lib/agent/orchestrate";
import { readConfig } from "@/lib/config";
import { dispatchAtmosphere } from "@/lib/dispatch/lights";
import { HttpError, publicErrorMessage, rateLimitResponse, readJsonBody } from "@/lib/security/http";

const WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  await connection();
  const limited = rateLimitResponse(request, "compile", 12, WINDOW_MS, 80);
  if (limited) return limited;

  try {
    const body = await readJsonBody(request, 8_000);
    const prompt = body && typeof body === "object" && "prompt" in body ? (body as { prompt: unknown }).prompt : "";
    if (typeof prompt !== "string") throw new PromptError("Prompt must be text.");

    const result = await compileFromPrompt(prompt);
    const config = readConfig();
    const dispatchResult =
      config.dispatch.auto && config.dispatch.configured
        ? await dispatchAtmosphere(result.atmosphere, config)
        : null;

    return Response.json({
      ...result,
      dispatch: { ...result.dispatchPlan, result: dispatchResult },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
    }
    const message = publicErrorMessage(error, secretsFromEnv());
    const status = error instanceof PromptError ? 400 : error instanceof NoTasteMatch ? 422 : 502;
    return Response.json({ error: message }, { status });
  }
}

function secretsFromEnv(): string[] {
  try {
    const config = readConfig();
    return [config.qlooKey, config.llm?.apiKey ?? "", config.dispatch.haToken, config.dispatch.hueUsername, config.dispatch.webhookUrl];
  } catch {
    return [];
  }
}
