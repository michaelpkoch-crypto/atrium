import { describe, expect, it } from "vitest";

import { compileAtmosphere } from "@/lib/atmosphere/compile";
import { readConfig } from "@/lib/config";
import { rgbToXy } from "@/lib/atmosphere/color";
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
