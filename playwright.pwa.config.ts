import { defineConfig, devices } from "@playwright/test";

// Assumes pnpm build has run; test:e2e:pwa builds before invoking this config.
export default defineConfig({
  testDir: "tests/pwa",
  outputDir: "output/playwright/pwa-results",
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 15_000 },
  use: { baseURL: "http://127.0.0.1:4180", trace: "retain-on-failure", serviceWorkers: "allow" },
  webServer: {
    command:
      "pnpm exec cross-env NODE_ENV=production PORT=4180 PUBLIC_APP_URL=http://127.0.0.1:4180 ALLOWED_ORIGINS=http://127.0.0.1:4180 ROOM_CREATE_LIMIT=1000 node dist/server/index.cjs",
    url: "http://127.0.0.1:4180/healthz",
    reuseExistingServer: false,
  },
  projects: [
    { name: "pwa-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "pwa-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
