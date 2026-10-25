"use client";

import { LoaderCircle } from "lucide-react";

import { EXAMPLE_PROMPTS } from "@/lib/examples";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PromptDock({
  prompt,
  loading,
  onPrompt,
  onSubmit,
}: {
  prompt: string;
  loading: boolean;
  onPrompt: (value: string) => void;
  onSubmit: (value: string) => void;
}) {
  return (
    <form
      className="mx-auto w-full max-w-3xl rounded-md bg-black/65 p-3 backdrop-blur-md"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(prompt);
      }}
    >
      <label htmlFor="cultural-prompt" className="mb-1.5 block font-mono text-[10px] tracking-[0.22em] text-white/70 uppercase">
        Cultural prompt
      </label>
      <div className="flex gap-2">
        <Input
          id="cultural-prompt"
          value={prompt}
          onChange={(event) => onPrompt(event.target.value)}
          placeholder="Blade Runner meets a 1970s jazz bar"
          maxLength={400}
          className="h-12 min-w-0 flex-1 border-white/20 bg-black/45 px-4 text-base text-white placeholder:text-white/70"
        />
        <Button
          type="submit"
          disabled={loading || prompt.trim().length < 3}
          className="h-12 shrink-0 bg-white px-4 text-black hover:bg-white/90 focus:shadow-[0_0_0_3px_#f5d90a]"
        >
          {loading ? <LoaderCircle className="animate-spin" /> : null}
          Compile room
        </Button>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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
    </form>
  );
}
