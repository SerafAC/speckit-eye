import { defineConfig, devices } from "@playwright/test";

// E2E tests drive the real CLI (constitution §V) in the three browser engines
// of the supported browsers (FR-055, research D16): Chromium, Firefox and
// WebKit, plus a Chromium project without JavaScript (FR-053) and a Chromium
// phone project (FR-009). The cloud container has Chromium only; Firefox and
// WebKit run in CI.
// The `tooling` project (feature 003, research R14) runs the release, docs-site
// and repository-health suites once in Chromium: they test packaging, the
// release scripts and the docs site, not browser engines, so the desktop
// engine projects ignore them. It runs wherever `pnpm run test:e2e` runs,
// including CI on Linux, macOS and Windows.
// One worker: every E2E server uses the default port 4747, and US2 AC7
// restarts the server on the same address.
const DESKTOP_VIEWPORT = { width: 1440, height: 900 }; // SC-009
const TOOLING_MATCH = /(release-.*|site|repo-health)\.spec\.js/;
const DESKTOP_IGNORE = [/nojs\.spec\.js/, /mobile\.spec\.js/, TOOLING_MATCH];

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT },
      testIgnore: DESKTOP_IGNORE,
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: DESKTOP_VIEWPORT },
      testIgnore: DESKTOP_IGNORE,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: DESKTOP_VIEWPORT },
      testIgnore: DESKTOP_IGNORE,
    },
    {
      name: "chromium-nojs",
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT, javaScriptEnabled: false },
      testMatch: /nojs\.spec\.js/,
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: /mobile\.spec\.js/,
    },
    {
      name: "tooling",
      use: { ...devices["Desktop Chrome"], viewport: DESKTOP_VIEWPORT },
      testMatch: TOOLING_MATCH,
    },
  ],
});
