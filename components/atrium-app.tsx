"use client";

import { useEffect, useState } from "react";

import { AudioDesk } from "@/components/audio-desk";
import { Dossier, type RoomPayload } from "@/components/dossier";
import { PromptDock } from "@/components/prompt-dock";
import { RoomStage } from "@/components/room-stage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EXAMPLE_PROMPTS } from "@/lib/examples";

type Status = {
  qlooMode: "live" | "mock";
  qlooHost: string;
  llm: { provider: string; model: string } | null;
  dispatch: { mode: string; auto: boolean; configured: boolean };
};

const IDLE = {
  primary: "#c4b39a",
  secondary: "#8d8275",
  accent: "#e6d3b4",
  ambient: "#12100e",
  ink: "#f6f1e8",
};

export function AtriumApp() {
  const [prompt, setPrompt] = useState<string>(EXAMPLE_PROMPTS[0]);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RoomPayload | null>(null);
  const [dispatching, setDispatching] = useState(false);

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
    try {
      const response = await fetch("/api/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
      });
      const body = (await response.json()) as RoomPayload & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "The room could not be compiled.");
        return;
      }
      setResult(body);
    } catch {
      setError("The compiler could not be reached.");
    } finally {
      setLoading(false);
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

  const palette = result?.atmosphere.palette;
  const mock = result
    ? result.atmosphere.provenance.source === "mock"
    : status
      ? status.qlooMode !== "live"
      : null;

  return (
    <div
      className="text-[color:var(--room-ink)]"
      style={
        {
          "--room-primary": palette?.primary ?? IDLE.primary,
          "--room-secondary": palette?.secondary ?? IDLE.secondary,
          "--room-accent": palette?.accent ?? IDLE.accent,
          "--room-ambient": palette?.ambient ?? IDLE.ambient,
          "--room-ink": palette?.ink ?? IDLE.ink,
          background: "var(--room-ambient)",
          color: "var(--room-ink)",
        } as React.CSSProperties
      }
    >
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="relative min-h-dvh">
          <RoomStage atmosphere={result?.atmosphere ?? null} loading={loading} />
          <div className="relative z-10 flex min-h-dvh flex-col px-4 py-5 sm:px-8">
            <header className="flex flex-wrap items-start justify-between gap-3 rounded-md bg-black/70 px-3 py-2 backdrop-blur-md">
              <div>
                <p className="font-display text-3xl tracking-tight">Atrium</p>
                <p className="font-mono text-[10px] tracking-[0.22em] text-white/60 uppercase">
                  Taste graph to room
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={
                    mock == null
                      ? "border-white/20 text-white/80"
                      : mock
                        ? "border-amber-200/70 bg-amber-200/15 text-amber-50"
                        : "border-emerald-200/50 bg-emerald-200/10 text-emerald-50"
                  }
                >
                  {mock == null ? "Checking keys" : mock ? "Mock data" : "Live Qloo"}
                </Badge>
                <Badge variant="outline" className="border-white/20 text-white/80">
                  {status?.llm ? status.llm.model : "No model key"}
                </Badge>
              </div>
            </header>

            <div className="mx-auto mt-[12vh] w-full max-w-3xl">
              {!result && !loading ? (
                <div className="mb-8 max-w-xl">
                  <h1 className="font-display text-4xl leading-tight sm:text-5xl">Name a mood by what it tastes like.</h1>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-white/75">
                    Atrium asks Qloo which artists, bars, and objects sit next to that taste, then builds the room from
                    those affinities. Without a key, the same pipeline runs on a labeled fixture graph.
                  </p>
                </div>
              ) : null}
              <PromptDock prompt={prompt} loading={loading} onPrompt={setPrompt} onSubmit={compile} />
              {error && !result ? (
                <p role="alert" className="mt-4 max-w-xl border border-red-300/40 bg-black/50 p-3 text-sm text-red-100">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="mt-auto flex flex-col gap-4 pt-16 lg:max-w-[calc(100%-1rem)]">
              {result ? (
                <div className="max-w-xl">
                  <p className="font-mono text-[10px] tracking-[0.2em] text-white/80 uppercase">{result.atmosphere.visual.mode}</p>
                  <h2 className="font-display text-4xl leading-none sm:text-6xl">{result.atmosphere.title}</h2>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-white/80">{result.atmosphere.logline}</p>
                </div>
              ) : (
                <p className="max-w-sm text-sm text-white/80">The lamp stays low until a prompt arrives.</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <AudioDesk texture={result?.atmosphere.audio ?? null} ink="var(--room-ink)" />
                <Sheet>
                  <SheetTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 border-white/20 bg-black/40 text-[color:var(--room-ink)] lg:hidden hover:bg-white/10"
                      />
                    }
                  >
                    Taste graph
                  </SheetTrigger>
                  <SheetContent side="bottom" className="h-[86dvh] border-white/10 bg-[#14110e] text-[#f6f1e8]">
                    <SheetHeader>
                      <SheetTitle className="font-display text-[#f6f1e8]">Why this room</SheetTitle>
                    </SheetHeader>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <Dossier
                        result={result}
                        error={error}
                        loading={loading}
                        dispatching={dispatching}
                        onDispatch={sendLights}
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </div>

        <aside className="sticky top-0 hidden h-dvh flex-col border-l border-white/10 bg-black/80 backdrop-blur-xl lg:flex">
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Dossier result={result} error={error} loading={loading} dispatching={dispatching} onDispatch={sendLights} />
          </div>
        </aside>
      </div>
    </div>
  );
}
