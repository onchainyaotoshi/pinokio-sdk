import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinokio } from "../src/client.js";

function stubFetch(handlers: Array<() => { status: number; body: unknown }>) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined });
      const { status, body } = handlers[Math.min(i++, handlers.length - 1)]!();
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const pk = createPinokio({ baseUrl: "https://pinokio.test", apiKey: "pk_test", pollIntervalMs: 1 });

afterEach(() => vi.unstubAllGlobals());

describe("gineeUnofficialAuth.login", () => {
  it("always sends dryRun:false and returns the typed result", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "g1" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "g1" } }),
      () => ({
        status: 200,
        body: {
          token: "tkn",
          tokenType: "Bearer",
          expiresAt: "2026-11-16T02:54:12.000Z",
          source: "login",
          user: { id: "U1", username: "PNK", countryCode: "ID", accountLevel: "TIER_2" },
        },
      }),
    ]);

    const result = await pk.browserAutomation.gineeUnofficialAuth.login({ forceLogin: true });
    expect(result.token).toBe("tkn");
    expect(result.source).toBe("login");
    expect(calls[0]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login",
    );
    expect(calls[0]!.body).toEqual({ forceLogin: true, dryRun: false });
  });
});

describe("gineeUnofficialAuth.isExpired", () => {
  it("forwards token and marginSeconds, and sends dryRun:false", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "g2" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "g2" } }),
      () => ({
        status: 200,
        body: {
          expired: true,
          reason: "expired",
          expiresAt: "2023-11-14T22:13:20.000Z",
          expiresInSeconds: 0,
          checkedBy: "local",
        },
      }),
    ]);

    const result = await pk.browserAutomation.gineeUnofficialAuth.isExpired("raw.token", {
      marginSeconds: 60,
    });
    expect(result.expired).toBe(true);
    expect(calls[0]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/is-expired",
    );
    expect(calls[0]!.body).toEqual({ token: "raw.token", marginSeconds: 60, dryRun: false });
  });
});
