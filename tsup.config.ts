import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "server/index": "apps/server/src/index.ts" },
  format: ["cjs"],
  target: "node22",
  platform: "node",
  bundle: true,
  clean: true,
  sourcemap: true,
  noExternal: [/.*/],
  outExtension: () => ({ js: ".cjs" }),
});
