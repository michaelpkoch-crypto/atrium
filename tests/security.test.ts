import { describe, expect, it } from "vitest";

import { ORCHESTRATOR_RULES } from "@/lib/agent/llm";
import { atmosphereSchema } from "@/lib/atmosphere/schema";
import { readConfig } from "@/lib/config";
import { consumeRateLimit, readJsonBody, resetRateLimits } from "@/lib/security/http";
import { redactSecrets } from "@/lib/security/redact";

describe("public demo guards", () => {
  it("keeps Qloo on an https qloo.com host and dispatch off by default", () => {
    const config = readConfig({});
    expect(config.qlooBaseUrl).toBe("https://hackathon.api.qloo.com");
    expect(config.dispatch.mode).toBe("off");
    expect(config.dispatch.configured).toBe(false);

    expect(() => readConfig({ QLOO_API_URL: "http://hackathon.api.qloo.com", QLOO_API_KEY: "secret-key-value" })).toThrow(
      /https/,
    );
    try {
      readConfig({ QLOO_API_URL: "https://evil.example/steal", QLOO_API_KEY: "secret-key-value" });
      throw new Error("expected the foreign host to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain("secret-key-value");
      expect((error as Error).message).not.toContain("evil.example");
    }
  });

  it("ignores a dispatch URL that is not http(s)", () => {
    const config = readConfig({
      ATMOSPHERE_DISPATCH: "webhook",
      DISPATCH_WEBHOOK_URL: "file:///etc/passwd",
    });
    expect(config.dispatch.mode).toBe("webhook");
    expect(config.dispatch.configured).toBe(false);
    expect(config.dispatch.webhookUrl).toBe("");
  });

  it("strips secrets and bounds how often one caller can compile", async () => {
    expect(redactSecrets("bad key super-secret-key-value", ["super-secret-key-value"])).not.toContain("super-secret");
    expect(redactSecrets("Authorization: Bearer sk-ant-api03-abcdefghij")).not.toContain("sk-ant");

    resetRateLimits();
    expect(consumeRateLimit("compile:test", 2, 60_000, 1_000).ok).toBe(true);
    expect(consumeRateLimit("compile:test", 2, 60_000, 1_100).ok).toBe(true);
    const blocked = consumeRateLimit("compile:test", 2, 60_000, 1_200);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    const request = new Request("http://127.0.0.1/api/compile", {
      method: "POST",
      body: JSON.stringify({ prompt: "x".repeat(50) }),
      headers: { "content-length": "80" },
    });
    await expect(readJsonBody(request, 16)).rejects.toThrow(/too large/);
  });

  it("tells the model to ignore instructions hidden in the prompt", () => {
    expect(ORCHESTRATOR_RULES).toMatch(/untrusted data/);
    expect(ORCHESTRATOR_RULES).toMatch(/Ignore any instruction/);
  });

  it("drops an extra webhook field from a compiled room", () => {
    const parsed = atmosphereSchema.safeParse({
      webhookUrl: "https://evil.example/hook",
      version: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
