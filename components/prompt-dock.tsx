"use client";

import { LoaderCircle } from "lucide-react";

import { EXAMPLE_PROMPTS } from "@/lib/examples";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PromptDock({
  prompt,
  loading,
  hasRoom,
  onPrompt,
  onSubmit,
}: {
  prompt: string;
  loading: boolean;
  hasRoom: boolean;
  onPrompt: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  return (
    <form
      className="mx-auto w-full max-w-3xl rounded-md bg-black/65 p-2 backdrop-blur-md sm:p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(prompt);
      }}
    >
      <label
        htmlFor="cultural-prompt"
        className={
          hasRoom
            ? "sr-only"
            : "mb-1.5 block font-mono text-[10px] tracking-[0.22em] text-white/70 uppercase"
        }
      >
        Cultural prompt
      </label>
      <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
        <Input
          id="cultural-prompt"
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          placeholder="Blade Runner meets a 1970s jazz bar"
          maxLength={400}
          className="h-11 w-full min-w-0 border-white/20 bg-black/45 px-4 text-base text-white placeholder:text-white/70 sm:h-12 sm:flex-1"
        />
        <Button
          type="submit"
          disabled={loading || prompt.trim().length < 3}
          className="h-9 w-full bg-white text-black hover:bg-white/90 focus:shadow-[0_0_0_3px_#f5d90a] sm:h-12 sm:w-auto sm:px-4"
        >
          {loading ? <LoaderCircle className="animate-spin" /> : null}
          <span className="sm:hidden">Compile</span>
          <span className="hidden sm:inline">Compile room</span>
        </Button>
      </div>
      {hasRoom ? null : (
        <div className="relative mt-2">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
            {EXAMPLE_PROMPTS.map((example) => (
              <Button
                key={example}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0 border-white/15 bg-black/30 px-2 text-xs whitespace-nowrap text-white/85 hover:bg-white/10"
                onClick={() => {
                  onPrompt(example);
                  onSubmit(example);
                }}
              >
                {example}
              </Button>
            ))}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0c0b0a] to-transparent" />
        </div>
      )}
    </form>
  );
}
