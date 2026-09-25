// Scale checks (SC-010): 50 features × 40 tasks from
// tests/fixtures/generate-large.js (1,000 / 2,000 tasks done).

import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateLarge, featureDir } from "../fixtures/generate-large.js";
import { runBuild, startServe } from "./helpers.js";

const LOAD_MS = 2_000;
const LIVE_MS = 2_000;
const BUILD_MS = 30_000;

/** @type {(() => Promise<unknown>)[]} */
let cleanup = [];

test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

async function tempDir(prefix) {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function serveLarge() {
  const dir = await tempDir("speckit-eye-large-");
  await generateLarge(dir);
  const server = await startServe(dir, { anyPort: true });
  cleanup.push(() => server.stop());
  return { dir, url: server.url };
}

const bar = (page) => page.locator('progress[data-key="project"]');

test("SC-010 the overview of 50 features / 2,000 tasks fires load within 2 s", async ({ page }) => {
  const { url } = await serveLarge();
  const started = Date.now();
  await page.goto(url, { waitUntil: "load" });
  const elapsed = Date.now() - started;
  const navigation = await page.evaluate(() => {
    const [nav] = /** @type {PerformanceNavigationTiming[]} */ (performance.getEntriesByType("navigation"));
    return nav.loadEventStart - nav.startTime;
  });
  expect(navigation).toBeLessThanOrEqual(LOAD_MS);
  expect(elapsed).toBeLessThanOrEqual(LOAD_MS);
  await expect(bar(page)).toHaveAttribute("value", "1000");
  await expect(bar(page)).toHaveAttribute("max", "2000");
  await expect(page.locator('[data-region="grid"] a[data-key]')).toHaveCount(2000);
});

test("SC-010 SC-002 a checkbox change in a large project shows within 2 s", async ({ page }) => {
  const { dir, url } = await serveLarge();
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await expect(bar(page)).toHaveAttribute("value", "1000");
  const file = path.join(dir, "specs", featureDir(10), "tasks.md");
  const text = await readFile(file, "utf8");
  const ticked = text.replace(/^- \[ \] (T\d+)/m, "- [x] $1");
  expect(ticked).not.toBe(text);
  await writeFile(file, ticked);
  await expect(bar(page)).toHaveAttribute("value", "1001", { timeout: LIVE_MS });
});

test("SC-010 --build of 50 features / 2,000 tasks finishes within 30 s", async () => {
  test.setTimeout(BUILD_MS + 30_000);
  const dir = await tempDir("speckit-eye-large-");
  await generateLarge(dir);
  const out = path.join(await tempDir("speckit-eye-large-out-"), "site");
  const started = Date.now();
  const result = await runBuild(dir, out);
  const elapsed = Date.now() - started;
  expect(result.code, result.stderr).toBe(0);
  expect(elapsed).toBeLessThanOrEqual(BUILD_MS);
  const index = await readFile(path.join(out, "index.html"), "utf8");
  expect(index).toContain('data-key="project"');
});
