import type { Atmosphere, VisualMode } from "@/lib/atmosphere/schema";
import { GenerativeArt } from "@/components/generative-art";
import { hashString } from "@/lib/atmosphere/color";

export function RoomStage({
  atmosphere,
  loading,
}: {
  atmosphere: Atmosphere | null;
  loading: boolean;
}) {
  const mode: VisualMode | "idle" = atmosphere?.visual.mode ?? "idle";
  const palette = atmosphere?.palette;
  const primary = palette?.primary ?? "#c4b39a";
  const secondary = palette?.secondary ?? "#8d8275";
  const accent = palette?.accent ?? "#e6d3b4";
  const seed = hashString(atmosphere?.visual.artwork.citation.id ?? "idle");

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" data-room={mode} aria-hidden>
      <div
        className="absolute inset-0 transition-colors duration-700"
        style={{
          background: `radial-gradient(1200px 700px at 20% 80%, ${accent}55, transparent 55%), linear-gradient(180deg, ${secondary}, ${palette?.ambient ?? "#12100e"} 72%)`,
        }}
      />
      <div className={`room-fx room-fx-${mode}`} />
      <svg className="absolute inset-0 h-full w-full opacity-25 mix-blend-overlay">
        <filter id="room-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#room-grain)" />
      </svg>
      <div className="absolute inset-x-0 bottom-0 h-[34%] bg-gradient-to-t from-black/70 to-transparent" />
      <div
        className={`absolute left-1/2 top-[18%] w-[min(46vh,280px)] -translate-x-1/2 transition-opacity duration-700 ${atmosphere ? "opacity-100" : "opacity-0"}`}
      >
        <div className="border border-white/30 bg-black/20 p-3 shadow-2xl backdrop-blur-[2px]" style={{ borderColor: accent }}>
          {atmosphere?.visual.artwork.kind === "entity-image" && atmosphere.visual.artwork.imageUrl ? (
            // Qloo image URLs are dynamic; a plain img avoids a remote-pattern allowlist.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={atmosphere.visual.artwork.imageUrl}
              alt={atmosphere.visual.artwork.caption}
              className="aspect-[4/5] w-full object-cover"
            />
          ) : (
            <div className="aspect-[4/5] w-full">
              <GenerativeArt
                mode={mode === "idle" ? "grain-warm" : mode}
                primary={primary}
                secondary={secondary}
                accent={accent}
                ink={palette?.ink ?? "#f4efe6"}
                seed={seed}
              />
            </div>
          )}
          <p className="mt-2 font-mono text-[10px] tracking-wide text-white/80">{atmosphere?.visual.artwork.caption}</p>
        </div>
      </div>
      {loading ? <div className="absolute inset-0 animate-pulse bg-black/20" /> : null}
    </div>
  );
}
