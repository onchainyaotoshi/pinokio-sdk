import { describe, expect, it } from "vitest";
import * as main from "../src/index.js";

describe("main entry surface", () => {
  it("does not export a generic script runner", () => {
    expect(Object.keys(main)).not.toContain("runScript");
  });

  it("exports the curated surface", () => {
    expect(typeof main.createPinokio).toBe("function");
    expect(typeof main.fromEnv).toBe("function");
    expect(typeof main.PinokioSdkError).toBe("function");
  });
});
