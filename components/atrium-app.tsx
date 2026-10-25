"use client";

import { useEffect, useRef, useState } from "react";

import { AudioDesk } from "@/components/audio-desk";
import { Dossier, type RoomPayload } from "@/components/dossier";
import { PromptDock } from "@/components/prompt-dock";
import { RoomFrame } from "@/components/room-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { roomKicker } from "@/lib/agent/propose";
import { EXAMPLE_PROMPTS } from "@/lib/examples";
import { PLANS } from "@/lib/atmosphere/plans";
import type { RoomScene } from "@/lib/atmosphere/schema";

type Status = {
  qlooMode: "live" | "mock";
  qlooHost: string;
  llm: { provider: string; model: string } | null;
  dispatch: { mode: string; auto: boolean; configured: boolean };
};

type View = "qloo" | "plain";

const IDLE_PALETTE = {
  primary: "#c4a574",
  secondary: "#8a7058",
  accent: "#e6d3b3",
  ambient: "#161310",
  ink: "#f4efe6",
};

const idleCitation = {
  id: "idle",
  name: "Atrium",
  type: "baseline",
  affinity: null,
  detail: "The room is empty until a prompt is compiled.",
  tag: null,
};

const IDLE_SCENE: RoomScene = {
  plan: "living",
  window: "night-city",
  timeLabel: "Night",
  windowBox: PLANS.living.windowBox,
  posterBox: PLANS.living.posterBox,
  lights: [
    {
      id: "idle-pendant",
      kind: "pendant",
      x: 500,
      y: 150,
      x2: null,
      color: "#c4a574",
      intensity: 0.45,
      flicker: 0.08,
      label: "Waiting",
      citation: idleCitation,
    },
    {
      id: "idle-string",
      kind: "string",
      x: 80,
      y: 42,
      x2: 1120,
      color: "#e6d3b3",
      intensity: 0.28,
      flicker: 0.05,
      label: "Waiting",
      citation: idleCitation,
    },
  ],
  objects: [
    { id: "idle-sofa", kind: "sofa", x: 360, y: 560, label: "Empty sofa", citation: idleCitation },
    { id: "idle-table", kind: "table", x: 680, y: 540, label: "Empty table", citation: idleCitation },
  ],
  display: {
    kicker: "Atrium",
    title: "Name a taste",
    subtitle: "Qloo furnishes the room",
    citation: idleCitation,
  },
};

export function AtriumApp() {
  const [prompt, setPrompt] = useState<string>(EXAMPLE_PROMPTS[0]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoomPayload | null>(null);
  const [roomPrompt, setRoomPrompt] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [view, setView] = useState<View>("qloo");
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/status")
      .then((response) => response.json())
      .then((body: Status) => {
        if (!cancelled && (body?.qlooMode === "live" || body?.qlooMode === "mock")) setStatus(body);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function compile(nextPrompt: string) {
    setLoading(true);
    setError(null);
    setView("qloo");
    setProgress("Starting the taste graph and the plain reading.");
    const debug = new URLSearchParams(window.location.search).get("debug") === "1";
    try {
      const response = await fetch(debug ? "/api/compile?debug=1" : "/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, debug }),
      });
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = (await response.json()) as { error?: string };
        setError(body.error ?? "The room could not be compiled.");
        return;
      }
      if (!response.body) {
        setError("The compiler returned an empty response.");
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let received = false;
      const take = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line) as {
          type?: string;
          message?: string;
          error?: string;
          result?: RoomPayload;
        };
        if (event.type === "status" && event.message) setProgress(event.message);
        if (event.type === "error") {
          setError(event.error ?? "The room could not be compiled.");
          received = true;
        }
        if (event.type === "result" && event.result) {
          setResult(event.result);
          setRoomPrompt(nextPrompt);
          received = true;
        }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) take(line);
      }
      if (buffer.trim()) take(buffer);
      if (!received) setError("The compiler ended before a room came back.");
    } catch {
      setError("The compiler could not be reached.");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  async function sendLights() {
    if (!result) return;
    setDispatching(true);
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atmosphere: result.atmosphere }),
      });
      const dispatchResult = await response.json();
      setResult({
        ...result,
        dispatch: { ...result.dispatch, result: dispatchResult },
      });
    } catch {
      setResult({
        ...result,
        dispatch: {
          ...result.dispatch,
          result: {
            dispatched: false,
            mode: result.dispatch.mode,
            reason: "The dispatch request failed before it left the browser.",
            preview: {},
          },
        },
      });
    } finally {
      setDispatching(false);
    }
  }

  const atmosphere = result?.atmosphere;
  const plain = result?.baseline;
  const mock = atmosphere ? atmosphere.provenance.source === "mock" : status ? status.qlooMode !== "live" : null;
  const showPlain = view === "plain" && plain;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#0c0b0a] text-[#f4efe6]">
      <div id="prompt-bar" className="z-40 shrink-0 border-b border-white/10 bg-[#0c0b0a]">
        <header className="flex items-center justify-between gap-3 px-4 pt-2 pb-1 sm:px-6">
          <div>
            <p className="font-display text-2xl tracking-tight sm:text-3xl">Atrium</p>
            <p className="font-mono text-[10px] tracking-[0.18em] text-white/55 uppercase">Taste graph, then the room · MIT License</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status?.llm ? (
              <Badge variant="outline" className="border-white/30 bg-white/10 text-[#f4efe6]">
                Agent · {status.llm.model}
              </Badge>
            ) : null}
            {mock == null ? null : (
              <Badge
                variant="outline"
                className={mock ? "border-amber-200/70 bg-amber-200/15 text-amber-50" : "border-emerald-200/50 bg-emerald-200/10 text-emerald-50"}
              >
                {mock ? "Mock fixture" : "Live Qloo"}
              </Badge>
            )}
          </div>
        </header>
        <div className="px-4 pb-3 sm:px-6">
          <PromptDock prompt={prompt} loading={loading} hasRoom={Boolean(result)} onPrompt={setPrompt} onSubmit={compile} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto xl:grid xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <main className="min-w-0 space-y-4 px-4 py-4 sm:px-6">
          <div
            className={result ? "grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2" : undefined}
            onTouchStart={(event) => {
              touchX.current = event.changedTouches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              if (!result || touchX.current == null) return;
              const dx = (event.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
              if (dx > 48) setView("qloo");
              if (dx < -48) setView("plain");
            }}
          >
            {atmosphere && plain ? (
              <>
                <div className={view === "plain" ? "hidden min-w-0 lg:block" : "min-w-0"}>
                  <p className="mb-1 font-mono text-[10px] tracking-[0.16em] text-emerald-100/80 uppercase">Atrium · Qloo</p>
                  <RoomFrame
                    key={`qloo-${atmosphere.title}`}
                    scene={atmosphere.room}
                    palette={atmosphere.palette}
                    tempoBpm={atmosphere.audio.tempoBpm}
                    label={atmosphere.title}
                  />
                </div>
                <div className={view === "qloo" ? "hidden min-w-0 lg:block" : "min-w-0"}>
                  <p className="mb-1 font-mono text-[10px] tracking-[0.16em] text-white/50 uppercase">Plain reading</p>
                  <RoomFrame
                    key={`plain-${plain.title}`}
                    scene={plain.room}
                    palette={plain.palette}
                    tempoBpm={plain.audio.tempoBpm}
                    label={`Plain reading of ${plain.title}`}
                  />
                </div>
              </>
            ) : (
              <RoomFrame scene={IDLE_SCENE} palette={IDLE_PALETTE} tempoBpm={72} interactive={false} label="Empty Atrium room" />
            )}
            {loading ? (
              <p className="mt-2 text-xs text-white/70" role="status">
                {progress ??
                  (status?.llm
                    ? `${status.llm.model} is choosing the Qloo lookups. A second call, with no tools, is writing the plain room.`
                    : "Asking Qloo, then drafting the plain reading beside it.")}
              </p>
            ) : null}
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-white/50 uppercase">
              {showPlain
                ? "Plain reading"
                : atmosphere
                  ? roomKicker(roomPrompt ?? prompt, atmosphere.room.plan, atmosphere.drinks[0]?.venue ?? "")
                  : "Empty room"}
            </p>
            <h1 className="font-display text-3xl leading-tight sm:text-4xl">
              {showPlain && plain ? plain.title : atmosphere ? atmosphere.title : "Name a mood by what it tastes like."}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
              {showPlain && plain
                ? plain.logline
                : atmosphere
                  ? atmosphere.logline
                  : "Atrium asks Qloo which artists, places, brands, and tags sit next to that taste, then builds the lamps, the glass, and the sound from those rows."}
            </p>
          </div>

          {error ? (
            <p role="alert" className="border border-red-300/40 bg-red-950/40 p-3 text-sm text-red-100">
              {error}
            </p>
          ) : null}

          {result ? (
            <>
              <div className="flex gap-2 lg:hidden" role="tablist" aria-label="Room source">
                <Button type="button" variant={view === "qloo" ? "default" : "outline"} className="h-10 flex-1" onClick={() => setView("qloo")}>
                  Atrium
                </Button>
                <Button type="button" variant={view === "plain" ? "default" : "outline"} className="h-10 flex-1" onClick={() => setView("plain")}>
                  Plain LLM
                </Button>
              </div>
              <p className="text-[11px] text-white/45 lg:hidden">Swipe the room to switch. On a wide screen both rooms stay side by side.</p>
              <Comparison result={result} view={view} onView={setView} />
            </>
          ) : null}

          <div className="flex flex-col gap-4 border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-start sm:justify-between">
            <AudioDesk
              texture={showPlain ? null : (atmosphere?.audio ?? null)}
              inspiredBy={showPlain ? [] : (atmosphere?.music.filter((row) => !row.gap).map((row) => row.name) ?? [])}
              empty={showPlain ? "The plain reading has no cited bed. Sound belongs to the Qloo room." : undefined}
            />
            <div className="max-w-sm space-y-2">
              <Button
                type="button"
                variant="outline"
                disabled={!atmosphere || dispatching}
                onClick={sendLights}
                className="h-10 border-white/20 bg-transparent text-white hover:bg-white/10"
              >
                {dispatching ? "Sending…" : "Send to my real lights"}
              </Button>
              <p className="text-xs leading-5 text-white/60">
                {result
                  ? dispatchCopy(result)
                  : "Hue, Home Assistant, or a webhook. Off until you opt in, so a hosted demo never touches a lamp by accident."}
              </p>
            </div>
          </div>

          {result ? <AgentTrace result={result} /> : null}
        </main>

        <aside className="border-t border-white/10 xl:sticky xl:top-0 xl:max-h-full xl:overflow-y-auto xl:border-t-0 xl:border-l">
          <Dossier result={result} error={error} loading={loading} dispatching={dispatching} onDispatch={sendLights} />
        </aside>
      </div>
    </div>
  );
}

function Comparison({
  result,
  view,
  onView,
}: {
  result: RoomPayload;
  view: View;
  onView: (view: View) => void;
}) {
  const { comparison, baseline } = result;
  return (
    <section className="grid gap-3 border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-2">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-mono text-[10px] tracking-[0.16em] text-emerald-100/80 uppercase">What Qloo added vs plain</h2>
          <button type="button" className="text-[11px] text-white/60 underline-offset-2 hover:underline lg:hidden" onClick={() => onView(view === "qloo" ? "plain" : "qloo")}>
            {view === "qloo" ? "See plain room" : "See Atrium"}
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {comparison.headlines.map((line) => (
            <li key={line} className="font-display text-lg leading-snug text-white sm:text-xl">
              {line}
            </li>
          ))}
        </ul>
        <details className="mt-3">
          <summary className="cursor-pointer font-mono text-[10px] tracking-[0.16em] text-white/50 uppercase">Every row</summary>
          <ul className="mt-2 space-y-1">
            {comparison.qlooAdded.map((item) => (
              <li key={item.label} className="text-xs leading-5 text-white/75">
                <span className="text-white">{item.label}.</span> {item.detail}
              </li>
            ))}
            {comparison.qlooScored.map((item) => (
              <li key={item.label} className="text-xs leading-5 text-white/75">
                <span className="text-white">{item.label}.</span> {item.detail} The plain reading also reached for this name.
              </li>
            ))}
          </ul>
        </details>
      </div>
      <div>
        <h2 className="font-mono text-[10px] tracking-[0.16em] text-white/55 uppercase">What the plain reading assumed</h2>
        <ul className="mt-2 space-y-1">
          {comparison.plainAssumed.map((item) => (
            <li key={item} className="text-xs leading-5 text-white/75">
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] leading-4 text-white/50">{baseline.note}</p>
      </div>
    </section>
  );
}

function AgentTrace({ result }: { result: RoomPayload }) {
  const diagnostics = result.diagnostics;
  const planner =
    result.agent.kind === "llm" && result.agent.model
      ? `${result.agent.model} ranked the Qloo candidates. Insights then ran in parallel.`
      : diagnostics?.modelError
        ? "The model did not rank the candidates. The room used the closest search hits."
        : "Fixed order: search, then tags, then cross-domain insights.";
  return (
    <section className="border border-white/10 p-3">
      <h2 className="font-mono text-[10px] tracking-[0.16em] text-white/55 uppercase">How Qloo was asked</h2>
      <p className="mt-1 text-xs text-white/70">
        Compiled in {(result.elapsedMs / 1000).toFixed(1)}s. {planner}
      </p>
      {diagnostics?.choice?.reason ? <p className="mt-1 text-xs text-white/75">{diagnostics.choice.reason}</p> : null}
      {result.agent.fallback ? <p className="mt-1 text-xs text-amber-100/80">{result.agent.fallback}</p> : null}
      <ol className="mt-3 space-y-2">
        {result.steps.slice(0, 8).map((step, index) => (
          <li key={`${step.call}-${index}`} className="text-xs leading-5 text-white/75">
            <span className="font-mono text-[10px] text-white/45">{step.call}</span> {step.why}{" "}
            <span className="text-white/90">{step.result}</span>
          </li>
        ))}
      </ol>
      {result.steps.length > 8 ? (
        <details className="mt-2 text-xs text-white/60">
          <summary className="cursor-pointer">Rest of the trace</summary>
          <ol className="mt-2 space-y-2" start={9}>
            {result.steps.slice(8).map((step, index) => (
              <li key={`${step.call}-more-${index}`}>
                <span className="font-mono text-[10px] text-white/45">{step.call}</span> {step.why} {step.result}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {diagnostics ? (
        <details className="mt-3 text-xs text-white/60">
          <summary className="cursor-pointer">Debug trace</summary>
          <div className="mt-2 space-y-2">
            {diagnostics.rejected.length ? (
              <ul className="space-y-1">
                {diagnostics.rejected.slice(0, 12).map((row) => (
                  <li key={`${row.name}-${row.why}`}>
                    <span className="text-white/80">{row.name}.</span> {row.why}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No tag candidates were rejected.</p>
            )}
            <pre className="max-h-64 overflow-auto border border-white/10 p-2 text-[10px] leading-4 text-white/70">
              {JSON.stringify(
                {
                  elapsedMs: result.elapsedMs,
                  choice: diagnostics.choice,
                  modelError: diagnostics.modelError,
                  plainError: diagnostics.plainError,
                  candidates: diagnostics.candidates,
                  artistRank: result.steps.find((step) => step.call === "rank_artists") ?? null,
                  calls: result.trace.map((call) => ({
                    path: call.path,
                    query: call.query,
                    status: call.status,
                    cached: call.cached ?? false,
                    resultCount: call.resultCount,
                    error: call.error,
                  })),
                },
                null,
                2,
              )}
            </pre>
          </div>
        </details>
      ) : null}
    </section>
  );
}

function dispatchCopy(result: RoomPayload): string {
  const dispatch = result.dispatch;
  if (dispatch.result) {
    return `${dispatch.result.dispatched ? "Sent." : "Not sent."} ${dispatch.result.reason}`;
  }
  if (dispatch.mode === "off") {
    return "Dispatch is off. The button shows the palette it would send to Hue, Home Assistant, or a webhook.";
  }
  return dispatch.configured
    ? `Ready for ${dispatch.mode}. A Hue bridge has to be on the same network as this server.`
    : `${dispatch.mode} is selected, but the server is missing that target's address.`;
}
