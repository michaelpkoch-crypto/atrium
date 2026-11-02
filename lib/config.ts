import { publicHttpOrigin, publicHttpUrl, qlooBaseUrl } from "@/lib/security/urls";

export type DispatchMode = "off" | "webhook" | "hue" | "home_assistant" | "govee";

export type LlmConfig = {
  provider: "openai" | "anthropic" | "gateway";
  modelId: string;
  apiKey: string;
};

export type AppConfig = {
  qlooMode: "live" | "mock";
  qlooKey: string;
  qlooBaseUrl: string;
  llm: LlmConfig | null;
  dispatch: {
    mode: DispatchMode;
    auto: boolean;
    webhookUrl: string;
    hueHost: string;
    hueUsername: string;
    hueGroupId: string;
    haBaseUrl: string;
    haToken: string;
    haEntityId: string;
    goveeKey: string;
    goveeDevices: string[];
    ownerToken: string;
    configured: boolean;
  };
};

const DEFAULT_QLOO_URL = "https://hackathon.api.qloo.com";

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function readConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const qlooKey = clean(env.QLOO_API_KEY);
  const requested = clean(env.QLOO_MODE).toLowerCase() || "auto";
  const qlooMode = requested === "live" ? "live" : requested === "mock" ? "mock" : qlooKey ? "live" : "mock";
  if (qlooMode === "live" && !qlooKey) {
    throw new Error("QLOO_MODE=live requires QLOO_API_KEY.");
  }

  const base = qlooBaseUrl(clean(env.QLOO_API_URL) || DEFAULT_QLOO_URL);
  const dispatchMode = parseDispatchMode(clean(env.ATMOSPHERE_DISPATCH));
  const webhookUrl = publicHttpUrl(clean(env.DISPATCH_WEBHOOK_URL)) ?? "";
  const hueHost = publicHttpOrigin(clean(env.HUE_BRIDGE_HOST)) ?? "";
  const hueUsername = clean(env.HUE_USERNAME);
  const haBaseUrl = publicHttpOrigin(clean(env.HA_BASE_URL)) ?? "";
  const haToken = clean(env.HA_TOKEN);
  const haEntityId = clean(env.HA_ENTITY_ID);
  const goveeKey = clean(env.GOVEE_API_KEY);
  const ownerToken = clean(env.ATMOSPHERE_OWNER_TOKEN);
  const goveeDevices = clean(env.GOVEE_DEVICES)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const configured =
    (dispatchMode === "webhook" && webhookUrl.length > 0) ||
    (dispatchMode === "hue" && hueHost.length > 0 && hueUsername.length > 0) ||
    (dispatchMode === "home_assistant" &&
      haBaseUrl.length > 0 &&
      haToken.length > 0 &&
      haEntityId.length > 0) ||
    (dispatchMode === "govee" && goveeKey.length > 0 && ownerToken.length > 0);

  return {
    qlooMode,
    qlooKey,
    qlooBaseUrl: base,
    llm: readLlm(env),
    dispatch: {
      mode: dispatchMode,
      auto: clean(env.ATMOSPHERE_DISPATCH_AUTO).toLowerCase() === "true",
      webhookUrl,
      hueHost,
      hueUsername,
      hueGroupId: clean(env.HUE_GROUP_ID) || "0",
      haBaseUrl,
      haToken,
      haEntityId,
      goveeKey,
      goveeDevices,
      ownerToken,
      configured: dispatchMode !== "off" && configured,
    },
  };
}

function parseDispatchMode(value: string): DispatchMode {
  const parts = value
    .toLowerCase()
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parts.includes("govee")) return "govee";
  const first = parts.find((item) => item === "webhook" || item === "hue" || item === "home_assistant");
  return first === "webhook" || first === "hue" || first === "home_assistant" ? first : "off";
}

function readLlm(env: Record<string, string | undefined>): LlmConfig | null {
  const generic = clean(env.LLM_API_KEY);
  const requested = clean(env.LLM_PROVIDER).toLowerCase();
  const openaiKey = clean(env.OPENAI_API_KEY) || (requested === "openai" || !requested ? generic : "");
  const anthropicKey = clean(env.ANTHROPIC_API_KEY) || (requested === "anthropic" ? generic : "");
  const gatewayKey = clean(env.AI_GATEWAY_API_KEY) || (requested === "gateway" ? generic : "");

  const provider =
    requested === "openai" || requested === "anthropic" || requested === "gateway"
      ? requested
      : openaiKey
        ? "openai"
        : anthropicKey
          ? "anthropic"
          : gatewayKey
            ? "gateway"
            : null;

  if (!provider) return null;
  const modelOverride = clean(env.LLM_MODEL);
  if (provider === "openai" && openaiKey) {
    return { provider, apiKey: openaiKey, modelId: modelOverride || "gpt-4.1-mini" };
  }
  if (provider === "anthropic" && anthropicKey) {
    return { provider, apiKey: anthropicKey, modelId: modelOverride || "claude-sonnet-4-5" };
  }
  if (provider === "gateway" && gatewayKey) {
    return { provider, apiKey: gatewayKey, modelId: modelOverride || "openai/gpt-4.1-mini" };
  }
  return null;
}

export function publicStatus(config: AppConfig) {
  return {
    qlooMode: config.qlooMode,
    qlooHost: hostOf(config.qlooBaseUrl),
    llm: config.llm ? { provider: config.llm.provider, model: config.llm.modelId } : null,
    dispatch: {
      mode: config.dispatch.mode,
      auto: config.dispatch.mode !== "govee" && config.dispatch.auto && config.dispatch.configured,
      configured: config.dispatch.configured,
      needsOwner: config.dispatch.mode === "govee",
    },
  };
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
