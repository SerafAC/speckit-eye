// US2 — Follow progress live during a long run (spec.md, User Story 2).
// Every test drives the real CLI against a temporary copy of the `mixed`
// fixture (tests/fixtures/projects/README.md: 40/65 tasks, 002-beta active)
// and changes files on disk while the page is open.

import { test, expect } from "@playwright/test";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyFixture, startServe } from "./helpers.js";

/** Live updates must show within this time (FR-026, SC-002). */
const LIVE_MS = 2_000;

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

async function serveMixed() {
  const dir = await copyFixture("mixed");
  server = await startServe(dir);
  return { dir, url: server.url };
}

const tasksFile = (dir, feature) => path.join(dir, "specs", feature, "tasks.md");

/**
 * Returns `text` with the given task IDs checked.
 * @param {string} text
 * @param {string[]} ids
 */
function tick(text, ids) {
  let out = text;
  for (const id of ids) {
    const next = out.replace(new RegExp(`^- \\[ \\] ${id}\\b`, "m"), `- [x] ${id}`);
    if (next === out) throw new Error(`task ${id} is not open`);
    out = next;
  }
  return out;
}

/** Checks tasks in a feature's tasks.md with a plain write. */
async function tickOnDisk(dir, feature, ids) {
  const file = tasksFile(dir, feature);
  await writeFile(file, tick(await readFile(file, "utf8"), ids));
}

// The stats card's "done of total tasks" line and its percentage.
const summary = (page) => page.locator('[data-stat="percent"] [data-part="detail"]');
const percent = (page) => page.locator('[data-stat="percent"] [data-part="value"]');
const tree = (page) => page.locator('[data-region="tree"]');
const details = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
const banner = (page) => page.locator('[data-region="live-status"]');

/** Waits until the page's live connection is open (the hello was received). */
async function openLive(page, url) {
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await expect(summary(page)).toHaveText("40 of 65 tasks");
}

test("US2 AC1 a ticked task shows new counts within 2 s", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });
  await expect(details(page, "002-beta").locator(":scope > summary")).toContainText("11/20");
});

test("US2 SC-002 at least 19 of 20 single ticks appear within 2 s", async ({ page }) => {
  test.setTimeout(120_000);
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  const ticks = [
    ...["T011", "T012", "T013", "T014", "T015"].map((id) => ["002-beta", id]),
    ...Array.from({ length: 15 }, (_, i) => ["003-gamma", `T${String(i + 1).padStart(3, "0")}`]),
  ];
  let done = 40;
  const latencies = [];
  for (const [feature, id] of ticks) {
    done += 1;
    const started = Date.now();
    await tickOnDisk(dir, feature, [id]);
    await expect(summary(page)).toContainText(`${done} of 65 tasks`, { timeout: 10_000 });
    latencies.push(Date.now() - started);
  }
  const fast = latencies.filter((ms) => ms <= LIVE_MS).length;
  expect(fast, `latencies (ms): ${latencies.join(", ")}`).toBeGreaterThanOrEqual(19);
});

test("US2 AC2 scroll position and the viewer's expanded and collapsed items are kept", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  const { dir, url } = await serveMixed();
  await openLive(page, url);

  // Open a feature the tool does not expand, close one it does.
  await details(page, "003-gamma").locator(":scope > summary").click();
  await expect(details(page, "003-gamma")).toHaveAttribute("open", "");
  await details(page, "003-gamma").locator('details[data-key="003-gamma/p2"] > summary').click();
  await details(page, "002-beta").locator('details[data-key="002-beta/p3"] > summary').click();
  await expect(details(page, "002-beta").locator('details[data-key="002-beta/p3"]')).not.toHaveAttribute("open");

  await page.evaluate(() => window.scrollTo(0, 250));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(100);

  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });

  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await expect(details(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(details(page, "003-gamma/p2")).toHaveAttribute("open", "");
  await expect(details(page, "002-beta/p3")).not.toHaveAttribute("open");
  await expect(details(page, "002-beta")).toHaveAttribute("open", "");
});

test("US2 AC3 changed items are highlighted and the bar moves to its new value", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  await tickOnDisk(dir, "002-beta", ["T011"]);

  const task = tree(page).locator('li[data-key="002-beta/T011"]');
  await expect(task).toHaveAttribute("data-changed", "", { timeout: LIVE_MS });
  await expect(task).toHaveAttribute("data-state", "done");
  await expect(details(page, "002-beta/p3")).toHaveAttribute("data-changed", "");
  await expect(details(page, "002-beta")).toHaveAttribute("data-changed", "");
  await expect(page.locator('[data-region="taskmap"] [data-part="grid"] a[data-key="002-beta/T011"]')).toHaveAttribute("data-changed", "");
  // Items that did not change are not highlighted.
  await expect(details(page, "001-alpha")).not.toHaveAttribute("data-changed");

  await expect(summary(page)).toHaveText("41 of 65 tasks");
  await expect(percent(page)).toHaveText("63 %");
  // The highlight is brief (~1.5 s).
  await expect(task).not.toHaveAttribute("data-changed", { timeout: 3_000 });
});

test("US2 AC4 an open artifact page shows new content within 2 s", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  const dir = await copyFixture("mixed");
  const plan = path.join(dir, "specs", "001-alpha", "plan.md");
  const long = (extra) =>
    ["# Implementation Plan: Alpha", "", ...Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}.\n`), extra].join("\n");
  await writeFile(plan, long("Old ending."));
  server = await startServe(dir);
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(`${server.url}features/001-alpha/plan.html`);
  await connected;
  const article = page.locator('article[data-region="doc"]');
  await expect(article).toContainText("Old ending.");

  await page.evaluate(() => window.scrollTo(0, 600));
  const scrollY = await page.evaluate(() => window.scrollY);
  expect(scrollY).toBeGreaterThan(100);

  await writeFile(plan, long("New ending."));
  await expect(article).toContainText("New ending.", { timeout: LIVE_MS });
  await expect(article).not.toContainText("Old ending.");
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
});

test("US2 FR-026 a deleted artifact's open page shows a notice linking to the overview", async ({ page }) => {
  const dir = await copyFixture("mixed");
  const research = path.join(dir, "specs", "002-beta", "research.md");
  await writeFile(research, "# Research: Beta\n\nFindings.\n");
  server = await startServe(dir);
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(`${server.url}features/002-beta/research.html`);
  await connected;
  await expect(page.locator('article[data-region="doc"]')).toContainText("Findings.");

  await rm(research);
  const notice = page.locator('[data-region="not-found"]');
  await expect(notice).toBeVisible({ timeout: LIVE_MS });
  const link = notice.getByRole("link", { name: "Back to the overview" });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.locator('[data-region="stats"]')).toBeVisible();
});

test("US2 AC5 a new feature folder appears without a restart", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  await mkdir(path.join(dir, "specs", "005-new"));
  await writeFile(path.join(dir, "specs", "005-new", "spec.md"), "# Feature Specification: Newcomer\n");
  await expect(details(page, "005-new")).toBeVisible({ timeout: LIVE_MS });
  await expect(details(page, "005-new").locator(":scope > summary")).toContainText("Newcomer");
});

test("US2 FR-026 a deleted feature folder disappears from the tree", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  await mkdir(path.join(dir, "specs", "005-new"));
  await writeFile(path.join(dir, "specs", "005-new", "spec.md"), "# Feature Specification: Newcomer\n");
  await expect(details(page, "005-new")).toBeVisible({ timeout: LIVE_MS });
  await rm(path.join(dir, "specs", "005-new"), { recursive: true, force: true });
  await expect(details(page, "005-new")).toHaveCount(0, { timeout: LIVE_MS });
});

test("US2 AC6 save-by-rename and a burst of writes end on the final content", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  const file = tasksFile(dir, "002-beta");
  const original = await readFile(file, "utf8");

  // Editor-style save: write a temporary file, rename it over tasks.md.
  const temp = path.join(dir, "specs", "002-beta", ".tasks.md.tmp");
  await writeFile(temp, tick(original, ["T011"]));
  await rename(temp, file);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });

  // 10 writes in 200 ms, alternating in-place writes and renames; each one
  // checks one more task, so the last write has all of 002-beta done.
  const open = ["T012", "T013", "T014", "T015", "T016", "T017", "T018", "T019", "T020"];
  const versions = Array.from({ length: 10 }, (_, i) => tick(original, ["T011", ...open.slice(0, Math.min(i, open.length))]));
  versions[9] = tick(original, ["T011", ...open]);
  for (const [i, text] of versions.entries()) {
    if (i % 2 === 0) {
      await writeFile(file, text);
    } else {
      await writeFile(temp, text);
      await rename(temp, file);
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  await expect(summary(page)).toHaveText("50 of 65 tasks", { timeout: LIVE_MS });
  await expect(details(page, "002-beta").locator(":scope > summary")).toContainText("20/20");
  // It stays on the final content (no late partial state).
  await page.waitForTimeout(1_000);
  await expect(summary(page)).toHaveText("50 of 65 tasks");
});

test("US2 AC7 a lost connection shows the banner; a restart hides it and catches up", async ({ page }) => {
  test.setTimeout(60_000);
  const { dir, url } = await serveMixed();
  await openLive(page, url);
  await expect(banner(page)).toBeHidden();

  await server?.stop();
  server = null;
  await expect(banner(page)).toBeVisible({ timeout: 5_000 });
  await expect(banner(page)).toHaveText("Live updates paused — reconnecting…");
  // The last content stays on the page.
  await expect(summary(page)).toHaveText("40 of 65 tasks");

  // A change made while the tool is down is picked up after the restart.
  await tickOnDisk(dir, "002-beta", ["T011"]);
  server = await startServe(dir);
  expect(server.url).toBe(url);
  await expect(banner(page)).toBeHidden({ timeout: 15_000 });
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });
});
