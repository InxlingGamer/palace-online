import { defineConfig, devices } from "@playwright/test";

const scenario = process.env.TEST_GAME_SCENARIO;
if (!scenario) throw new Error("TEST_GAME_SCENARIO is required.");

export default defineConfig({
  testDir: "tests/e2e/scenarios",
  outputDir: `output/playwright/scenarios/${scenario}`,
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 10_000 },
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: [
    {
      command: `pnpm --filter @palace/server exec cross-env NODE_ENV=test PORT=3001 TEST_GAME_SCENARIO=${scenario} tsx src/index.ts`,
      url: "http://127.0.0.1:3001/healthz",
      reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @palace/client dev --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
    {
      name: "iphone-portrait",
      use: {
        ...devices["iPhone 15 Plus"],
        viewport: { width: 430, height: scenario === "big-hand" ? 739 : 932 },
      },
    },
    {
      name: "iphone-landscape",
      use: { ...devices["iPhone 15 Plus landscape"], viewport: { width: 932, height: 430 } },
    },
  ],
});
