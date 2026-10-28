import { hexToRgb } from "@/lib/atmosphere/color";

/** Govee OpenAPI. The key is a request header and is not part of any URL. */
export const GOVEE_ORIGIN = "https://openapi.api.govee.com";
const LIST_PATH = "/router/api/v1/user/devices";
const CONTROL_PATH = "/router/api/v1/device/control";
/** Per-device control is 2 requests/second. A short gap keeps one batch inside that. */
export const GOVEE_GAP_MS = 450;
const STEADY_BRIGHTNESS = 70;

export type GoveeBulb = {
  name: string;
  color: string;
  ok: boolean;
  error: string | null;
};

type Capability = { type?: unknown; instance?: unknown };

export type GoveeDevice = {
  sku?: unknown;
  device?: unknown;
  deviceName?: unknown;
  capabilities?: unknown;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function packRgb(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (r << 16) + (g << 8) + b;
}

export function sceneColor(colors: readonly string[], index: number): string {
  if (!colors.length) return "#f4efe6";
  return colors[index % colors.length] ?? colors[0] ?? "#f4efe6";
}

function capabilityList(device: GoveeDevice): { type: string; instance: string }[] {
  if (!Array.isArray(device.capabilities)) return [];
  return device.capabilities.flatMap((row) => {
    const capability = row as Capability;
    if (typeof capability.type !== "string" || typeof capability.instance !== "string") return [];
    return [{ type: capability.type, instance: capability.instance }];
  });
}

export function isColorBulb(device: GoveeDevice): boolean {
  return capabilityList(device).some(
    (capability) => capability.type === "devices.capabilities.color_setting" && capability.instance === "colorRgb",
  );
}

function hasCapability(device: GoveeDevice, type: string, instance: string): boolean {
  return capabilityList(device).some((capability) => capability.type === type && capability.instance === instance);
}

function deviceId(device: GoveeDevice): string {
  return typeof device.device === "string" ? device.device.trim() : "";
}

function deviceSku(device: GoveeDevice): string {
  return typeof device.sku === "string" ? device.sku.trim() : "";
}

export function deviceLabel(device: GoveeDevice): string {
  if (typeof device.deviceName === "string" && device.deviceName.trim()) return device.deviceName.trim().slice(0, 80);
  const sku = deviceSku(device);
  return sku || "Govee bulb";
}

/** Allowlist matches a device id or a sku. An empty list keeps every color bulb. */
export function pickColorBulbs(devices: GoveeDevice[], allowlist: string[]): GoveeDevice[] {
  const wanted = new Set(allowlist.map((item) => item.trim().toLowerCase()).filter(Boolean));
  return devices.filter((device) => {
    if (!deviceId(device) || !deviceSku(device) || !isColorBulb(device)) return false;
    if (!wanted.size) return true;
    return wanted.has(deviceId(device).toLowerCase()) || wanted.has(deviceSku(device).toLowerCase());
  });
}

export function readDeviceList(body: unknown): GoveeDevice[] {
  if (!body || typeof body !== "object") return [];
  const data = (body as { data?: unknown }).data;
  if (Array.isArray(data)) return data as GoveeDevice[];
  if (data && typeof data === "object" && Array.isArray((data as { devices?: unknown }).devices)) {
    return (data as { devices: GoveeDevice[] }).devices;
  }
  return [];
}

function controlBody(device: GoveeDevice, capability: { type: string; instance: string; value: number }) {
  return {
    requestId: crypto.randomUUID(),
    payload: {
      sku: deviceSku(device),
      device: deviceId(device),
      capability,
    },
  };
}

async function readCode(response: Response): Promise<number | null> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "number" ? body.code : null;
  } catch {
    return null;
  }
}

/**
 * One command, then a single wait-and-retry when Govee answers 429.
 * The API key stays in the header and is not written into the error string.
 */
async function postCommand(
  fetchImpl: FetchLike,
  apiKey: string,
  device: GoveeDevice,
  capability: { type: string; instance: string; value: number },
  sleep: (ms: number) => Promise<void>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const send = async () =>
    fetchImpl(`${GOVEE_ORIGIN}${CONTROL_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Govee-API-Key": apiKey,
      },
      body: JSON.stringify(controlBody(device, capability)),
      signal: AbortSignal.timeout(8_000),
    });

  let response = await send();
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000);
    response = await send();
  }
  if (response.status === 429) return { ok: false, error: "Govee rate limit" };
  const code = await readCode(response);
  if (response.ok && (code == null || code === 200)) return { ok: true };
  return { ok: false, error: `Govee returned ${response.status}` };
}

export async function sendGoveeScene(
  args: {
    apiKey: string;
    allowlist: string[];
    colors: readonly string[];
    fetchImpl: FetchLike;
    sleep?: (ms: number) => Promise<void>;
  },
): Promise<{ bulbs: GoveeBulb[]; error: string | null }> {
  const sleep = args.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let listed: Response;
  try {
    listed = await args.fetchImpl(`${GOVEE_ORIGIN}${LIST_PATH}`, {
      method: "GET",
      headers: { "Govee-API-Key": args.apiKey },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { bulbs: [], error: "Govee device list did not respond." };
  }
  if (listed.status === 429) {
    return { bulbs: [], error: "Govee rate limit on the device list." };
  }
  if (!listed.ok) return { bulbs: [], error: `Govee device list returned ${listed.status}.` };

  let body: unknown;
  try {
    body = await listed.json();
  } catch {
    return { bulbs: [], error: "Govee device list was not JSON." };
  }
  const bulbs = pickColorBulbs(readDeviceList(body), args.allowlist);
  if (!bulbs.length) return { bulbs: [], error: "Govee returned no color bulbs to set." };

  const results: GoveeBulb[] = [];
  for (let index = 0; index < bulbs.length; index += 1) {
    const device = bulbs[index];
    const color = sceneColor(args.colors, index);
    const commands: { type: string; instance: string; value: number }[] = [];
    if (hasCapability(device, "devices.capabilities.on_off", "powerSwitch")) {
      commands.push({ type: "devices.capabilities.on_off", instance: "powerSwitch", value: 1 });
    }
    commands.push({ type: "devices.capabilities.color_setting", instance: "colorRgb", value: packRgb(color) });
    if (hasCapability(device, "devices.capabilities.range", "brightness")) {
      commands.push({ type: "devices.capabilities.range", instance: "brightness", value: STEADY_BRIGHTNESS });
    }

    let failed: string | null = null;
    for (const command of commands) {
      await sleep(GOVEE_GAP_MS);
      try {
        const sent = await postCommand(args.fetchImpl, args.apiKey, device, command, sleep);
        if (!sent.ok) {
          failed = sent.error;
          break;
        }
      } catch {
        failed = "Govee did not respond";
        break;
      }
    }
    results.push({ name: deviceLabel(device), color, ok: failed == null, error: failed });
  }
  return { bulbs: results, error: null };
}
