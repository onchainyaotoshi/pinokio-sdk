import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_SPECS } from "../src/modules/spec.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));

/** Independent implementation — deliberately not imported from src. */
const camel = (kebab: string) => kebab.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

describe("module naming contract", () => {
  it("uses the script name as the method name, camelCased", () => {
    for (const moduleSpec of MODULE_SPECS) {
      for (const script of moduleSpec.scripts) {
        expect(script.method).toBe(camel(script.script));
      }
    }
  });

  it("only uses script names that camelCase reversibly", () => {
    for (const moduleSpec of MODULE_SPECS) {
      for (const script of moduleSpec.scripts) {
        expect(script.script).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
        expect(script.script.includes("--")).toBe(false);
      }
    }
  });

  it("has a manifest fixture for every exposed script", () => {
    for (const moduleSpec of MODULE_SPECS) {
      for (const script of moduleSpec.scripts) {
        const file =
          moduleSpec.archetype + "__" + moduleSpec.workspace + "__" + script.script + ".manifest.json";
        const manifest = JSON.parse(readFileSync(join(HERE, "fixtures", file), "utf8")) as {
          name: string;
        };
        expect(manifest.name).toBe(script.script);
      }
    }
  });
});
