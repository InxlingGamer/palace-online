import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  outputDir: "output/playwright/results",
  timeout: 90_000,
  workers: 2,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [["list"], ["html", { outputFolder: "output/playwright/report", open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
  webServer: [
    {
      command: "pnpm --filter @palace/server dev:test",
      url: "http://127.0.0.1:3001/healthz",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm --filter @palace/client dev --host 127.0.0.1 --port 4173",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 } },
    },
    {
      name: "desktop-webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "iphone-portrait",
      use: { ...devices["iPhone 15 Plus"], viewport: { width: 430, height: 932 } },
    },
    {
      name: "iphone-landscape",
      use: { ...devices["iPhone 15 Plus landscape"], viewport: { width: 932, height: 430 } },
    },
  ],
});
