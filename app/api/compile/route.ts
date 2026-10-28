import { connection } from "next/server";

import { NoTasteMatch, PromptError } from "@/lib/agent/errors";
import { compileFromPrompt } from "@/lib/agent/orchestrate";
import { readConfig } from "@/lib/config";
import { dispatchAtmosphere } from "@/lib/dispatch/lights";
import { HttpError, publicErrorMessage, rateLimitResponse, readJsonBody } from "@/lib/security/http";

const WINDOW_MS = 10 * 60_000;

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const limited = rateLimitResponse(request, "compile", 30, WINDOW_MS, 150);
  if (limited) return limited;

  let prompt = "";
  let debug = false;
  try {
    const url = new URL(request.url);
    debug = url.searchParams.get("debug") === "1";
    const body = await readJsonBody(request, 8_000);
    prompt = body && typeof body === "object" && "prompt" in body ? String((body as { prompt: unknown }).prompt ?? "") : "";
    if (body && typeof body === "object" && "debug" in body && (body as { debug: unknown }).debug === true) debug = true;
    if (typeof (body as { prompt?: unknown } | null)?.prompt !== "string") throw new PromptError("Prompt must be text.");
  } catch (error) {
    return errorResponse(error);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };
      try {
        send({ type: "status", message: "Starting the taste graph and the plain reading." });
        const result = await compileFromPrompt(prompt, {
          debug,
          onStatus: (message) => send({ type: "status", message }),
        });
        const config = readConfig();
        const dispatchResult =
          config.dispatch.auto && config.dispatch.configured && config.dispatch.mode !== "govee"
            ? await dispatchAtmosphere(result.atmosphere, config)
            : null;
        send({
          type: "result",
          result: {
            ...result,
            dispatch: { ...result.dispatchPlan, result: dispatchResult },
          },
        });
      } catch (error) {
        const message = publicErrorMessage(error, secretsFromEnv());
        const status = error instanceof PromptError ? 400 : error instanceof NoTasteMatch ? 422 : 502;
        console.error("[atrium] compile failed:", message);
        send({ type: "error", error: message, status });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status, headers: error.headers });
  }
  const message = publicErrorMessage(error, secretsFromEnv());
  const status = error instanceof PromptError ? 400 : error instanceof NoTasteMatch ? 422 : 502;
  console.error("[atrium] compile failed:", message);
  return Response.json({ error: message }, { status });
}

function secretsFromEnv(): string[] {
  try {
    const config = readConfig();
    return [config.qlooKey, config.llm?.apiKey ?? "", config.dispatch.haToken, config.dispatch.hueUsername, config.dispatch.webhookUrl];
  } catch {
    return [];
  }
}
