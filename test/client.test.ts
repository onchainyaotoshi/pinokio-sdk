import { describe, expect, it } from "vitest";
import { createPinokio, fromEnv } from "../src/client.js";

const TRANSPORT = Symbol.for("@yaotoshi/pinokio-sdk/transport");

describe("createPinokio", () => {
  it("rejects a missing base URL", () => {
    expect(() => createPinokio({ baseUrl: "", apiKey: "pk_x" })).toThrowError(/base URL/i);
  });

  it("rejects a missing API key", () => {
    expect(() => createPinokio({ baseUrl: "https://pinokio.test", apiKey: "" })).toThrowError(
      /api key/i,
    );
  });

  it("strips a trailing slash from the base URL", () => {
    const pk = createPinokio({ baseUrl: "https://pinokio.test/", apiKey: "pk_x" });
    const cfg = (pk as unknown as Record<symbol, { baseUrl: string }>)[TRANSPORT]!;
    expect(cfg.baseUrl).toBe("https://pinokio.test");
  });

  it("exposes the ginee module with both methods", () => {
    const pk = createPinokio({ baseUrl: "https://pinokio.test", apiKey: "pk_x" });
    expect(typeof pk.browserAutomation.gineeUnofficialAuth.login).toBe("function");
    expect(typeof pk.browserAutomation.gineeUnofficialAuth.isExpired).toBe("function");
  });
});

describe("fromEnv", () => {
  it("reads PINOKIO_BASE_URL and PINOKIO_API_KEY", () => {
    const pk = fromEnv({ PINOKIO_BASE_URL: "https://pinokio.test", PINOKIO_API_KEY: "pk_x" });
    expect(pk).toBeDefined();
  });

  it("names the missing variable", () => {
    expect(() => fromEnv({})).toThrowError(/PINOKIO_BASE_URL/);
    expect(() => fromEnv({ PINOKIO_BASE_URL: "https://pinokio.test" })).toThrowError(
      /PINOKIO_API_KEY/,
    );
  });
});
