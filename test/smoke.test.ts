import { describe, expect, it } from "vitest";
import { SDK_NAME } from "../src/index.js";

describe("package scaffold", () => {
  it("exposes the package name", () => {
    expect(SDK_NAME).toBe("@yaotoshi/pinokio-sdk");
  });
});
