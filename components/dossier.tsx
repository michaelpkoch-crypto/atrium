"use client";

import type { CompileResult } from "@/lib/agent/orchestrate";
import type { DispatchResult } from "@/lib/dispatch/lights";
import { affinityText, typeLabel } from "@/components/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export type RoomPayload = CompileResult & {
  dispatch: CompileResult["dispatchPlan"] & { result: DispatchResult | null };
};

export function Dossier({
  result,
  error,
  loading,
  dispatching,
  onDispatch,
}: {
  result: RoomPayload | null;
  error: string | null;
  loading: boolean;
  dispatching: boolean;
  onDispatch: () => void;
}) {
  if (!result && !error) {
    return (
      <div className="space-y-4 p-5 text-sm text-white/75">
        <p className="font-mono text-[10px] tracking-[0.22em] text-white/75 uppercase">Taste graph</p>
        <p>
          The room is empty. A prompt becomes Qloo entities, those entities cross into music, places, and brands, and
          the compiler cites each one.
        </p>
        {loading ? <p>Asking the taste graph…</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-5 p-5 text-sm text-[#f6f1e8]">
      {error ? (
        <p role="alert" className="border border-red-300/40 bg-red-950/50 p-3 text-red-100">
          {error}
        </p>
      ) : null}
      {result ? <RoomDossier result={result} dispatching={dispatching} onDispatch={onDispatch} /> : null}
    </div>
  );
}

function RoomDossier({
  result,
  dispatching,
  onDispatch,
}: {
  result: RoomPayload;
  dispatching: boolean;
  onDispatch: () => void;
}) {
  const { atmosphere, graph, trace, agent, dispatch } = result;
  const mock = atmosphere.provenance.source === "mock";

  return (
    <>
      <div className={`border p-3 ${mock ? "border-amber-200/70 bg-amber-200/15" : "border-emerald-200/40 bg-emerald-200/10"}`}>
        <p className="font-mono text-[10px] tracking-[0.18em] uppercase">{mock ? "Mock taste graph" : "Live Qloo"}</p>
        <p className="mt-1 text-xs leading-5 text-white/80">{atmosphere.provenance.note}</p>
      </div>
      {result.warnings.map((warning) => (
        <p key={warning} className="border border-white/25 bg-black/40 p-3 text-xs leading-5 text-white/85">
          {warning}
        </p>
      ))}

      <p className="leading-6 text-white/85">{atmosphere.logline}</p>
      <p className="font-mono text-[10px] tracking-wide text-white/75 uppercase">
        Agent: {agent.kind === "llm" ? `${agent.provider} · ${agent.model}` : "deterministic compiler"}
        {agent.fallback ? ` · fallback: ${agent.fallback}` : ""}
      </p>

      <Section title="Seeds">
        {graph.seeds.length ? (
          graph.seeds.map((seed) => <EntityRow key={seed.id} name={seed.name} type={seed.type} affinity={null} tags={seed.tags} mock={seed.mock} why="Resolved by /search from the prompt." />)
        ) : (
          <p className="text-white/60">No named entity matched. Tag signals carried the request.</p>
        )}
      </Section>

      <Section title="Fixtures, and the Qloo row that earned each one">
        <ul className="space-y-2">
          {atmosphere.room.lights.map((light) => (
            <li key={light.id} className="text-xs leading-5 text-white/75">
              <span className="mr-2 inline-block size-2.5 rounded-full align-middle" style={{ background: light.color }} />
              <span className="text-white">{light.kind.replace("-", " ")} · {light.label}. </span>
              {light.citation.detail}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Palette, and the entity that earned it">
        <div className="grid grid-cols-4 gap-2">
          {atmosphere.palette.reasons.map((reason) => (
            <div key={reason.role}>
              <div className="h-10 border border-white/20" style={{ background: reason.hex }} />
              <p className="mt-1 font-mono text-[10px] tracking-wide uppercase">{reason.role}</p>
              <p className="font-mono text-[10px] text-white/60">{reason.hex}</p>
            </div>
          ))}
        </div>
        <ul className="space-y-2">
          {atmosphere.palette.reasons.map((reason) => (
            <li key={`${reason.role}-why`} className="text-xs leading-5 text-white/75">
              <span className="text-white">{reason.role}. </span>
              {reason.because}{" "}
              <Cite id={reason.citation.id} name={reason.citation.name} />
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Music affinities">
        {atmosphere.music.map((track) => (
          <EntityRow
            key={`${track.entityId}-${track.name}`}
            name={track.name}
            type="urn:entity:artist"
            affinity={track.affinity}
            tags={track.tags}
            mock={mock}
            why={track.why}
            muted={track.gap}
          />
        ))}
        <p className="text-xs text-white/60">
          Texture: {atmosphere.audio.description} Noise {atmosphere.audio.noise.toFixed(2)}, filter{" "}
          {atmosphere.audio.filterHz} Hz.
        </p>
      </Section>

      <Section title="Drinks, from place affinities">
        {atmosphere.drinks.map((drink) => (
          <div key={`${drink.venueId}-${drink.name}`} className="border border-white/10 p-3">
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-medium">{drink.name}</p>
              <span className="font-mono text-[10px] text-white/80">{affinityText(drink.affinity)}</span>
            </div>
            <p className="text-xs text-white/60">{drink.venue}</p>
            <p className="mt-1 text-xs leading-5 text-white/75">
              {drink.because} <Cite id={drink.citation.id} name={drink.citation.name} />
            </p>
          </div>
        ))}
      </Section>

      <Section title="Decor">
        {atmosphere.decor.map((item) => (
          <p key={item.item} className="text-xs leading-5 text-white/80">
            {item.item}. {item.because} <Cite id={item.citation.id} name={item.citation.name} />
          </p>
        ))}
      </Section>

      {atmosphere.reading.length ? (
        <Section title="On the table">
          {atmosphere.reading.map((book) => (
            <EntityRow key={book.entityId} name={book.name} type="urn:entity:book" affinity={book.affinity} tags={book.tags} mock={mock} why={book.why} />
          ))}
        </Section>
      ) : null}

      {atmosphere.pictures.length ? (
        <Section title="Also on the wall">
          {atmosphere.pictures.map((movie) => (
            <EntityRow key={movie.entityId} name={movie.name} type="urn:entity:movie" affinity={movie.affinity} tags={movie.tags} mock={mock} why={movie.why} />
          ))}
        </Section>
      ) : null}

      <Section title="Cross-domain rows">
        <Domain label="Artists" rows={graph.artists} />
        <Domain label="Places" rows={graph.places} />
        <Domain label="Brands" rows={graph.brands} />
        <Domain label="Books" rows={graph.books} />
        <Domain label="Movies" rows={graph.movies} />
      </Section>

      <Section title="Tag signals">
        {graph.tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {graph.tags.map((tag) => (
              <Badge key={tag.id} variant="outline" className="border-white/20 text-[10px] text-white/80">
                {tag.name}
                {tag.affinity != null ? ` ${tag.affinity.toFixed(2)}` : ""}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-white/80">No tag ids were sent. Entity signals were enough.</p>
        )}
        <p className="font-mono text-[10px] leading-4 break-all text-white/75">
          signal.interests.entities={atmosphere.signals.entityIds.join(",") || "none"}
        </p>
        <p className="font-mono text-[10px] leading-4 break-all text-white/75">
          signal.interests.tags={atmosphere.signals.tagIds.join(",") || "none"}
        </p>
      </Section>

      <Section title="Qloo calls">
        <ul className="space-y-2">
          {trace.map((call, index) => (
            <li key={`${call.path}-${index}`} className="font-mono text-[10px] leading-4 text-white/70">
              <span className={call.mocked ? "text-amber-200" : "text-emerald-200"}>
                {call.mocked ? "MOCK" : call.status}
              </span>{" "}
              GET {call.path}?{new URLSearchParams(call.query).toString()} → {call.resultCount} rows
              {call.error ? ` · ${call.error}` : ""}
            </li>
          ))}
        </ul>
      </Section>

      <Separator className="bg-white/10" />

      <div className="space-y-2">
        <p className="font-mono text-[10px] tracking-[0.22em] text-white/75 uppercase">Lights</p>
        <p className="text-xs leading-5 text-white/70">
          Dispatch is {dispatch.mode}
          {dispatch.configured ? " and configured" : ""}. {dispatch.auto ? "Auto-send is on." : "Auto-send is off."} A Hue
          bridge on a local network is not reachable from a hosted demo; use a public webhook or Home Assistant URL for
          that.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={dispatching}
          onClick={onDispatch}
          className="border-white/20 bg-transparent text-white hover:bg-white/10"
        >
          {dispatching ? "Sending…" : "Send to my real lights"}
        </Button>
        {dispatch.result ? (
          <p className="text-xs text-white/75">
            {dispatch.result.dispatched ? "Sent." : "Not sent."} {dispatch.result.reason}
          </p>
        ) : null}
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-white/60">Atmosphere JSON</summary>
        <pre className="mt-2 max-h-80 overflow-auto border border-white/10 p-2 text-[10px] leading-4 text-white/70">
          {JSON.stringify(atmosphere, null, 2)}
        </pre>
      </details>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-mono text-[10px] tracking-[0.22em] text-white/75 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Cite({ id, name }: { id: string; name: string }) {
  return (
    <span className="font-mono text-[10px] text-white/80" title={id}>
      [{name}]
    </span>
  );
}

function EntityRow({
  name,
  type,
  affinity,
  tags,
  mock,
  why,
  muted,
}: {
  name: string;
  type: string;
  affinity: number | null;
  tags: string[];
  mock: boolean;
  why: string;
  muted?: boolean;
}) {
  return (
    <div className={`border border-white/10 p-3 ${muted ? "opacity-70" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-medium">{name}</p>
        <span className="font-mono text-[10px] text-white/80">{affinityText(affinity)}</span>
      </div>
      <p className="font-mono text-[10px] text-white/75">
        {typeLabel(type)}
        {mock ? " · fixture" : ""}
        {tags.length ? ` · ${tags.slice(0, 4).join(", ")}` : ""}
      </p>
      <p className="mt-1 text-xs leading-5 text-white/70">{why}</p>
    </div>
  );
}

function Domain({
  label,
  rows,
}: {
  label: string;
  rows: { id: string; name: string; affinity: number | null; explainers: { name: string; score: number }[] }[];
}) {
  if (!rows.length) return null;
  return (
    <div>
      <p className="text-[10px] tracking-wide text-white/75 uppercase">{label}</p>
      <ul className="mt-1 space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex justify-between gap-3 text-xs">
            <span>{row.name}</span>
            <span className="font-mono text-white/80">
              {affinityText(row.affinity)}
              {row.explainers[0] ? ` · ${row.explainers[0].name}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
