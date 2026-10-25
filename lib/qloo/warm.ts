import { assembleGraph } from "@/lib/agent/assemble";
import { knownProposal } from "@/lib/agent/propose";
import { QlooClient } from "@/lib/qloo/client";
import type { TasteClient } from "@/lib/qloo/types";

const SAMPLE_PROMPTS = [
  "Studio Ghibli bathhouse at dusk",
  "Blade Runner meets a 1970s jazz bar",
  "a Wes Anderson brunch",
  "reading Murakami on a rainy night",
];

let started = false;

/** Fill the instance cache for the four sample prompts after a live compile, without blocking it. */
export function scheduleSampleWarmup(client: TasteClient): void {
  if (started || !(client instanceof QlooClient)) return;
  started = true;
  void warm(client);
}

async function warm(client: QlooClient): Promise<void> {
  for (const prompt of SAMPLE_PROMPTS) {
    const proposal = knownProposal(prompt);
    if (!proposal) continue;
    try {
      await assembleGraph(client, prompt, proposal, []);
    } catch {
      // A warmup miss must not surface on the room the person is looking at.
    }
  }
}
