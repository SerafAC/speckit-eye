import { defineConfig, devices } from "@playwright/test";

// E2E tests drive the real CLI (constitution §V). Chromium only (research R7).
// One worker: every E2E server uses the default port 4747, and US2 AC7
// restarts the server on the same address.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
