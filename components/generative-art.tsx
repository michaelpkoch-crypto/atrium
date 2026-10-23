import type { VisualMode } from "@/lib/atmosphere/schema";

export function GenerativeArt({
  mode,
  primary,
  secondary,
  accent,
  ink,
  seed,
}: {
  mode: VisualMode | "idle";
  primary: string;
  secondary: string;
  accent: string;
  ink: string;
  seed: number;
}) {
  const shift = seed % 40;
  return (
    <svg viewBox="0 0 240 300" className="h-full w-full" role="img" aria-label={`${mode} generative artwork`}>
      <rect width="240" height="300" fill={primary} />
      {mode === "symmetry" ? (
        <>
          <rect x="46" y="36" width="148" height="188" fill="none" stroke={ink} strokeWidth="3" />
          <rect x="70" y="58" width="100" height="120" fill={secondary} />
          <circle cx="120" cy="118" r="28" fill={accent} />
          <rect x="92" y="210" width="56" height="8" fill={ink} />
        </>
      ) : mode === "neon-grid" ? (
        <>
          {Array.from({ length: 8 }, (_, index) => (
            <line
              key={`v${index}`}
              x1={20 + index * 28}
              y1="0"
              x2={120 + (index - 3.5) * 10}
              y2="300"
              stroke={accent}
              strokeWidth="1"
              opacity="0.75"
            />
          ))}
          <rect x="0" y="168" width="240" height="2" fill={secondary} />
          <circle cx="120" cy="168" r="18" fill="none" stroke={ink} strokeWidth="2" />
        </>
      ) : mode === "rain" ? (
        <>
          <rect width="240" height="300" fill={primary} />
          {Array.from({ length: 18 }, (_, index) => (
            <line
              key={index}
              x1={12 + ((index * 37 + shift) % 220)}
              y1={index * 8}
              x2={8 + ((index * 37 + shift) % 220)}
              y2={80 + index * 12}
              stroke={secondary}
              strokeWidth="1.4"
              opacity="0.8"
            />
          ))}
          <circle cx="168" cy="78" r="22" fill={accent} opacity="0.9" />
        </>
      ) : mode === "paper" ? (
        <>
          <rect width="240" height="300" fill={primary} />
          <rect x="58" y="48" width="124" height="168" fill={secondary} />
          <circle cx="176" cy="64" r="36" fill={accent} opacity="0.85" />
          {Array.from({ length: 7 }, (_, index) => (
            <line
              key={index}
              x1="74"
              y1={78 + index * 16}
              x2={150 - (index % 3) * 12}
              y2={78 + index * 16}
              stroke={ink}
              strokeWidth="1.5"
              opacity="0.55"
            />
          ))}
        </>
      ) : mode === "brutalist" ? (
        <>
          <rect x="18" y="30" width="150" height="90" fill={secondary} />
          <rect x="70" y="96" width="150" height="120" fill={accent} />
          <rect x="28" y="200" width="90" height="70" fill={ink} opacity="0.8" />
        </>
      ) : (
        <>
          <ellipse cx={90 + shift / 4} cy="120" rx="70" ry="90" fill={secondary} opacity="0.9" />
          <ellipse cx="150" cy="160" rx="64" ry="78" fill={accent} opacity="0.75" />
          <rect x="40" y="220" width="160" height="6" fill={ink} opacity="0.7" />
        </>
      )}
    </svg>
  );
}
