import { existsSync } from "node:fs";
import { defineConfig, devices, chromium } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ??
        (existsSync("/opt/google/chrome/chrome")
          ? "/opt/google/chrome/chrome"
          : chromium.executablePath()),
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      AUTH_URL: "http://localhost:3100",
      AUTH_TRUST_HOST: "true",
      INNGEST_DEV: "1",
      INNGEST_BASE_URL: "http://127.0.0.1:1",
    },
  },
});
