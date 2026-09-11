import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: true,
  entry: {
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "utils/index": "src/utils/index.ts",
  },
  format: ["esm", "cjs"],
  platform: "neutral",
  sourcemap: true,
  target: "es2022",
  treeshake: true,
});
