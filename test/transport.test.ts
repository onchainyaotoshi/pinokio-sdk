import { afterEach, describe, expect, it, vi } from "vitest";
import { executeScript } from "../src/transport.js";
import type { TransportConfig } from "../src/types.js";

const CFG: TransportConfig = {
  baseUrl: "https://pinokio.test",
  apiKey: "pk_test",
  pollIntervalMs: 1,
  deadlineMs: 5_000,
};

interface Call {
  url: string;
  method: string;
  body?: unknown;
}

function stubFetch(handlers: Array<() => { status: number; body: unknown }>): Call[] {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: String(url),
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const { status, body } = handlers[Math.min(i++, handlers.length - 1)]!();
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("executeScript", () => {
  it("sends the script id, an explicit dryRun, and each call in order", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r1" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "r1" } }),
      () => ({ status: 200, body: { token: "abc" } }),
    ]);

    const { result } = await executeScript<{ token: string }>(
      CFG,
      "browser-automation/ginee-unofficial-auth/login",
      {},
      { dryRun: false },
    );

    expect(result).toEqual({ token: "abc" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login",
    );
    expect(calls[0]!.body).toEqual({ dryRun: false });
    expect(calls[1]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login/runs/r1",
    );
    expect(calls[2]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login/runs/r1/result",
    );
  });

  it("polls until the run settles", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r2" } }),
      () => ({ status: 200, body: { status: "running", runId: "r2" } }),
      () => ({ status: 200, body: { status: "running", runId: "r2" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "r2" } }),
      () => ({ status: 200, body: 42 }),
    ]);

    const { result } = await executeScript<number>(CFG, "functions/ws/s", {}, { dryRun: true });
    expect(result).toBe(42);
    expect(calls.length).toBe(5);
  });

  it("maps a failed run to RUN_FAILED with the server reason", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r3" } }),
      () => ({
        status: 200,
        body: { status: "failed", runId: "r3", reason: "pool_exhausted", error: { message: "no page" } },
      }),
    ]);

    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_FAILED",
      runId: "r3",
    });
  });

  it("maps timed_out and cancelled", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r4" } }),
      () => ({ status: 200, body: { status: "timed_out", runId: "r4" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_TIMED_OUT",
    });

    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r5" } }),
      () => ({ status: 200, body: { status: "cancelled", runId: "r5" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
  });

  it("maps 401 to AUTH_ERROR", async () => {
    stubFetch([
      () => ({ status: 401, body: { status: "error", code: "InvalidApiKey", message: "bad key" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "AUTH_ERROR",
      serverCode: "InvalidApiKey",
    });
  });

  it("maps ScriptNotFound and RunNotFound", async () => {
    stubFetch([
      () => ({ status: 404, body: { status: "error", code: "ScriptNotFound", message: "nope" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "SCRIPT_NOT_FOUND",
    });

    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r6" } }),
      () => ({ status: 404, body: { status: "error", code: "RunNotFound", message: "evicted" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
    });
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("honours the deadline while polling", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r7" } }),
      () => ({ status: 200, body: { status: "running", runId: "r7" } }),
    ]);
    await expect(
      executeScript({ ...CFG, deadlineMs: 20 }, "functions/ws/s", {}, { dryRun: false }),
    ).rejects.toMatchObject({ code: "TIMEOUT", runId: "r7" });
  });

  it("rejects a malformed script id before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(executeScript(CFG, "not-an-id", {}, { dryRun: false })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
