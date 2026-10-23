import { readConfig } from "@/lib/config";
import { MockTasteClient } from "@/lib/qloo/mock";
import { QlooClient } from "@/lib/qloo/client";
import type { TasteClient } from "@/lib/qloo/types";

export function createTasteClient(env: Record<string, string | undefined> = process.env): TasteClient {
  const config = readConfig(env);
  if (config.qlooMode === "mock") return new MockTasteClient();
  return new QlooClient({ baseUrl: config.qlooBaseUrl, apiKey: config.qlooKey });
}

export { QlooClient, QlooError } from "@/lib/qloo/client";
export { MockTasteClient } from "@/lib/qloo/mock";
