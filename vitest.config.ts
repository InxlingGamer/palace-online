import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "packages/**/*.test.ts",
      "apps/server/**/*.test.ts",
      "apps/client/**/*.test.{ts,tsx}",
    ],
    coverage: { reporter: ["text", "html"] },
  },
});
