"use client";

import { Input } from "@/components/ui/input";

export function OwnerTokenField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="font-mono text-[10px] tracking-[0.16em] text-white/55 uppercase">Owner</span>
      <Input
        type="password"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Owner token"
        className="h-9 border-white/20 bg-black/40 text-sm text-white"
      />
    </label>
  );
}

export function BulbChips({ bulbs }: { bulbs: { name: string; color: string; ok: boolean; error: string | null }[] }) {
  if (!bulbs.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Govee bulbs">
      {bulbs.map((bulb, index) => (
        <li
          key={`${bulb.name}-${index}`}
          className="flex max-w-full items-center gap-1.5 rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/85"
        >
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: bulb.color }} aria-hidden="true" />
          <span className="truncate">{bulb.name}</span>
          <span className={bulb.ok ? "text-emerald-200" : "text-red-200"}>{bulb.ok ? "ok" : bulb.error ?? "error"}</span>
        </li>
      ))}
    </ul>
  );
}
