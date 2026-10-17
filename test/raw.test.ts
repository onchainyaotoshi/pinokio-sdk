import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinokio } from "../src/client.js";
import { runScript } from "../src/raw.js";

function stubFetch(handlers: Array<() => { status: number; body: unknown }>) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const { status, body } = handlers[Math.min(i++, handlers.length - 1)]!();
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

const pk = createPinokio({ baseUrl: "https://pinokio.test", apiKey: "pk_test", pollIntervalMs: 1 });

afterEach(() => vi.unstubAllGlobals());

describe("runScript", () => {
  it("returns the script result when dryRun is false", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "x1" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "x1" } }),
      () => ({ status: 200, body: { urls: ["a"] } }),
    ]);
    await expect(
      runScript<{ urls: string[] }>(pk, "functions/ws/crawl", {}, { dryRun: false }),
    ).resolves.toEqual({ urls: ["a"] });
  });

  it("returns a dry-run report instead of a result when dryRun is true", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "x2" } }),
      () => ({
        status: 200,
        body: {
          status: "succeeded",
          runId: "x2",
          wouldExecute: [{ method: "POST", url: "https://target.test/order" }],
        },
      }),
    ]);
    const report = await runScript(pk, "functions/ws/write", {}, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.wouldExecute).toEqual([{ method: "POST", url: "https://target.test/order" }]);
  });

  it("rejects a malformed script id before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(runScript(pk, "not-an-id", {}, { dryRun: false })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
