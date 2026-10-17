import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/raw.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  keepNames: true,
  target: "es2022",
  platform: "neutral",
});
