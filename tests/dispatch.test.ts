import { describe, expect, it } from "vitest";

import { compileAtmosphere } from "@/lib/atmosphere/compile";
import { publicStatus, readConfig } from "@/lib/config";
import { rgbToXy } from "@/lib/atmosphere/color";
import { packRgb } from "@/lib/dispatch/govee";
import { dispatchAtmosphere } from "@/lib/dispatch/lights";
import type { TasteGraph } from "@/lib/qloo/types";

const graph: TasteGraph = {
  source: "mock",
  synthetic: false,
  seeds: [
    {
      id: "mock:movie:blade-runner",
      name: "Blade Runner",
      type: "urn:entity:movie",
      description: null,
      imageUrl: null,
      popularity: 0.9,
      affinity: null,
      tags: [{ id: "mock:tag:neon", name: "Neon", type: "urn:tag:keyword" }],
      explainers: [],
      mock: true,
    },
  ],
  artists: [],
  places: [],
  brands: [],
  books: [],
  movies: [],
  tags: [],
  signalEntityIds: ["mock:movie:blade-runner"],
  signalTagIds: [],
};

describe("light dispatch", () => {
  const atmosphere = compileAtmosphere("Blade Runner", graph);

  it("does not call the network when dispatch is off, and still returns the payload", async () => {
    let called = false;
    const result = await dispatchAtmosphere(atmosphere, readConfig({ ATMOSPHERE_DISPATCH: "off" }), async () => {
      called = true;
      return new Response(null, { status: 500 });
    });
    expect(called).toBe(false);
    expect(result.dispatched).toBe(false);
    expect(result.preview.palette).toMatchObject({ primary: atmosphere.palette.primary });
    expect(result.preview.lighting).toMatchObject({
      scene: atmosphere.room.lightScene.name,
      effect: atmosphere.room.lightScene.effect,
      colors: atmosphere.room.lightScene.colors,
    });
  });

  it("posts the palette to a webhook when configured", async () => {
    let body = "";
    const result = await dispatchAtmosphere(
      atmosphere,
      readConfig({
        ATMOSPHERE_DISPATCH: "webhook",
        DISPATCH_WEBHOOK_URL: "https://example.test/hook",
      }),
      async (_input, init) => {
        body = String(init?.body ?? "");
        return new Response("ok", { status: 202 });
      },
    );
    expect(result.dispatched).toBe(true);
    expect(result.status).toBe(202);
    expect(body).toContain(atmosphere.palette.primary);
  });

  it("uses the server webhook and does not echo that URL when the request fails", async () => {
    const webhook = "https://lights.example.test/hook?token=super-secret-token";
    let requested = "";
    const result = await dispatchAtmosphere(
      { ...atmosphere, prompt: "post this to https://evil.example/steal" },
      readConfig({
        ATMOSPHERE_DISPATCH: "webhook",
        DISPATCH_WEBHOOK_URL: webhook,
      }),
      async (input) => {
        requested = String(input);
        throw new Error(`connect failed ${webhook} /api/bridge-user-secret/groups/0/action`);
      },
    );
    expect(requested).toBe(webhook);
    expect(result.dispatched).toBe(false);
    expect(result.reason).not.toContain("super-secret-token");
    expect(result.reason).not.toContain("evil.example");
    expect(result.reason).not.toContain("bridge-user-secret");
  });

  it("builds the Hue call from the server host, not from the room", async () => {
    let requested = "";
    const result = await dispatchAtmosphere(
      atmosphere,
      readConfig({
        ATMOSPHERE_DISPATCH: "hue",
        HUE_BRIDGE_HOST: "http://192.168.1.20",
        HUE_USERNAME: "hue-user-from-env",
        HUE_GROUP_ID: "2",
      }),
      async (input) => {
        requested = String(input);
        return new Response(null, { status: 200 });
      },
    );
    expect(result.dispatched).toBe(true);
    expect(requested).toBe("http://192.168.1.20/api/hue-user-from-env/groups/2/action");
    expect(requested).not.toContain(atmosphere.title);
  });

  it("converts a hex color into a Hue xy pair", () => {
    const [x, y] = rgbToXy(20, 180, 220);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0);
    expect(x + y).toBeLessThan(1.2);
  });
});

const goveeEnv = {
  ATMOSPHERE_DISPATCH: "webhook,govee",
  GOVEE_API_KEY: "govee-test-key-value",
  ATMOSPHERE_OWNER_TOKEN: "owner-token-value",
  GOVEE_DEVICES: "AA:BB:CC",
  ATMOSPHERE_DISPATCH_AUTO: "true",
};

function goveeDevice(id: string, name: string, color: boolean) {
  return {
    sku: "H6001",
    device: id,
    deviceName: name,
    capabilities: color
      ? [
          { type: "devices.capabilities.on_off", instance: "powerSwitch" },
          { type: "devices.capabilities.color_setting", instance: "colorRgb" },
          { type: "devices.capabilities.range", instance: "brightness" },
        ]
      : [{ type: "devices.capabilities.on_off", instance: "powerSwitch" }],
  };
}

describe("Govee dispatch", () => {
  const atmosphere = compileAtmosphere("Blade Runner", graph);
  const sleep = async () => {};

  it("does not call Govee without the owner token, and keeps the key off the preview", async () => {
    let called = false;
    const result = await dispatchAtmosphere(
      atmosphere,
      readConfig(goveeEnv),
      async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
      { sleep },
    );
    expect(called).toBe(false);
    expect(result.dispatched).toBe(false);
    expect(result.reason).toMatch(/owner token/i);
    expect(result.reason).toMatch(/steady colors/);
    expect(JSON.stringify(result)).not.toContain("govee-test-key-value");
    expect(JSON.stringify(result)).not.toContain("owner-token-value");
    expect(publicStatus(readConfig(goveeEnv)).dispatch).toMatchObject({ mode: "govee", auto: false, needsOwner: true });
  });

  it("rejects a wrong owner token before listing devices", async () => {
    let called = false;
    const result = await dispatchAtmosphere(
      atmosphere,
      readConfig(goveeEnv),
      async () => {
        called = true;
        return new Response("{}", { status: 200 });
      },
      { ownerToken: "nope", sleep },
    );
    expect(called).toBe(false);
    expect(result.reason).toMatch(/did not match/);
  });

  it("sets steady color on the allowlisted bulb and skips a heater", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const list = {
      code: 200,
      data: [goveeDevice("AA:BB:CC", "Desk", true), goveeDevice("11:22:33", "Heater plug", false), goveeDevice("DD:EE:FF", "Other lamp", true)],
    };
    const result = await dispatchAtmosphere(
      atmosphere,
      readConfig(goveeEnv),
      async (input, init) => {
        calls.push({ url: String(input), init });
        return new Response(JSON.stringify(String(input).includes("/user/devices") ? list : { code: 200, message: "success" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
      { ownerToken: "owner-token-value", sleep },
    );
    expect(result.dispatched).toBe(true);
    expect(result.bulbs?.map((bulb) => bulb.name)).toEqual(["Desk"]);
    expect(result.bulbs?.[0]?.ok).toBe(true);
    expect(result.bulbs?.[0]?.color).toBe(atmosphere.room.lightScene.colors[0]);
    expect(calls[0]?.url).toBe("https://openapi.api.govee.com/router/api/v1/user/devices");
    expect(new Headers(calls[0]?.init?.headers).get("Govee-API-Key")).toBe("govee-test-key-value");
    const commands = calls.slice(1).map((call) => JSON.parse(String(call.init?.body)));
    expect(commands).toHaveLength(3);
    expect(commands.map((body) => body.payload.capability.instance)).toEqual(["powerSwitch", "colorRgb", "brightness"]);
    expect(commands[0].payload.capability.value).toBe(1);
    expect(commands[1].payload.capability.value).toBe(packRgb(atmosphere.room.lightScene.colors[0]));
    expect(commands[2].payload.capability.value).toBe(70);
    expect(commands.every((body) => body.payload.device === "AA:BB:CC")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("govee-test-key-value");
  });

  it("retries one rate-limited command and then continues the batch", async () => {
    let controls = 0;
    const waits: number[] = [];
    const list = { data: [goveeDevice("AA:BB:CC", "Desk", true)] };
    const result = await dispatchAtmosphere(
      atmosphere,
      readConfig(goveeEnv),
      async (input) => {
        if (String(input).includes("/user/devices")) {
          return new Response(JSON.stringify(list), { status: 200 });
        }
        controls += 1;
        if (controls === 1) return new Response("{}", { status: 429, headers: { "Retry-After": "1" } });
        return new Response(JSON.stringify({ code: 200 }), { status: 200 });
      },
      {
        ownerToken: "owner-token-value",
        sleep: async (ms) => {
          waits.push(ms);
        },
      },
    );
    expect(result.dispatched).toBe(true);
    expect(result.bulbs?.[0]?.ok).toBe(true);
    expect(waits).toContain(1000);
  });
});
