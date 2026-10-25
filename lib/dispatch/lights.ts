import type { Atmosphere } from "@/lib/atmosphere/schema";
import type { AppConfig } from "@/lib/config";
import { hexToRgb, rgbToXy } from "@/lib/atmosphere/color";

export type DispatchResult = {
  dispatched: boolean;
  mode: AppConfig["dispatch"]["mode"];
  reason: string;
  preview: Record<string, unknown>;
  status?: number;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export async function dispatchAtmosphere(
  atmosphere: Atmosphere,
  config: AppConfig,
  fetchImpl: FetchLike = fetch,
): Promise<DispatchResult> {
  const preview = payloadFor(atmosphere);
  const { dispatch } = config;

  if (dispatch.mode === "off") {
    return {
      dispatched: false,
      mode: "off",
      reason: "Dispatch is off. Set ATMOSPHERE_DISPATCH to webhook, hue, or home_assistant.",
      preview,
    };
  }

  if (!dispatch.configured) {
    return {
      dispatched: false,
      mode: dispatch.mode,
      reason: `ATMOSPHERE_DISPATCH=${dispatch.mode} but the credentials for that target are incomplete.`,
      preview,
    };
  }

  try {
    if (dispatch.mode === "webhook") {
      const response = await fetchImpl(dispatch.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "atrium.atmosphere", ...preview }),
        signal: AbortSignal.timeout(8_000),
      });
      return {
        dispatched: response.ok,
        mode: "webhook",
        reason: response.ok ? "Webhook accepted the palette." : `Webhook returned ${response.status}.`,
        preview,
        status: response.status,
      };
    }

    if (dispatch.mode === "hue") {
      const [r, g, b] = hexToRgb(atmosphere.palette.primary);
      const [x, y] = rgbToXy(r, g, b);
      const url = `${dispatch.hueHost}/api/${encodeURIComponent(dispatch.hueUsername)}/groups/${encodeURIComponent(dispatch.hueGroupId)}/action`;
      const response = await fetchImpl(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: true, bri: 140, xy: [x, y], transitiontime: 20 }),
        signal: AbortSignal.timeout(8_000),
      });
      return {
        dispatched: response.ok,
        mode: "hue",
        reason: response.ok ? "Hue group updated." : `Hue bridge returned ${response.status}.`,
        preview: { ...preview, xy: [x, y] },
        status: response.status,
      };
    }

    const [r, g, b] = hexToRgb(atmosphere.palette.primary);
    const response = await fetchImpl(`${dispatch.haBaseUrl}/api/services/light/turn_on`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${dispatch.haToken}`,
      },
      body: JSON.stringify({
        entity_id: dispatch.haEntityId,
        rgb_color: [r, g, b],
        brightness: 140,
        transition: 2,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    return {
      dispatched: response.ok,
      mode: "home_assistant",
      reason: response.ok ? "Home Assistant accepted the light call." : `Home Assistant returned ${response.status}.`,
      preview: { ...preview, entityId: dispatch.haEntityId, rgb: [r, g, b] },
      status: response.status,
    };
  } catch {
    return {
      dispatched: false,
      mode: dispatch.mode,
      reason: "The light target did not respond. The address stays on the server and is not included here.",
      preview,
    };
  }
}

function payloadFor(atmosphere: Atmosphere): Record<string, unknown> {
  return {
    title: atmosphere.title,
    prompt: atmosphere.prompt,
    mode: atmosphere.visual.mode,
    palette: {
      primary: atmosphere.palette.primary,
      secondary: atmosphere.palette.secondary,
      accent: atmosphere.palette.accent,
      ambient: atmosphere.palette.ambient,
    },
    tempoBpm: atmosphere.audio.tempoBpm,
    source: atmosphere.provenance.source,
    lights: atmosphere.room.lights.map((light) => ({
      id: light.id,
      label: light.label,
      color: light.color,
      intensity: light.intensity,
    })),
  };
}
