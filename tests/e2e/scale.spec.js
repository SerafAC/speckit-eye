// Scale checks (spec 002 SC-006, SC-007, SC-008, SC-014, FR-027): 50 features
// × 40 tasks from tests/fixtures/generate-large.js (1,000 / 2,000 tasks done).

import { test, expect } from "@playwright/test";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { generateLarge, featureDir, FEATURES } from "../fixtures/generate-large.js";
import { featurePagePath, pressSearchShortcut, runBuild, startServe } from "./helpers.js";

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

// The stats card's "done of total tasks" line.
const bar = (page) => page.locator('[data-stat="percent"] [data-part="detail"]');
const map = (page) => page.locator('[data-region="taskmap"]');
const tooltip = (page) => page.locator('[data-region="tooltip"]');

test("SC-007 the overview of 50 features / 2,000 tasks fires load within 2 s", async ({ page }) => {
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
  await expect(bar(page)).toHaveText("1000 of 2000 tasks");
  await expect(page.locator('[data-region="taskmap"] a[data-key][data-state]')).toHaveCount(2000);
});

test("SC-008 a checkbox change in a large project shows within 2 s", async ({ page }) => {
  const { dir, url } = await serveLarge();
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await expect(bar(page)).toHaveText("1000 of 2000 tasks");
  const file = path.join(dir, "specs", featureDir(10), "tasks.md");
  const text = await readFile(file, "utf8");
  const ticked = text.replace(/^- \[ \] (T\d+)/m, "- [x] $1");
  expect(ticked).not.toBe(text);
  await writeFile(file, ticked);
  await expect(bar(page)).toHaveText("1001 of 2000 tasks", { timeout: LIVE_MS });
});

test("SC-007 --build of 50 features / 2,000 tasks finishes within 30 s", async () => {
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
  expect(index).toContain('data-key="stat:percent"');
  for (let i = 0; i < 50; i++) await access(path.join(out, ...featurePagePath(featureDir(i)).split("/")));
});

test("SC-007 each sampled feature page of a large project fires load within 2 s", async ({ page }) => {
  const { url } = await serveLarge();
  // First, middle and last feature, plus one more.
  for (const i of [0, 10, 24, 49]) {
    const dir = featureDir(i);
    const started = Date.now();
    await page.goto(`${url}${featurePagePath(dir)}`, { waitUntil: "load" });
    const elapsed = Date.now() - started;
    const navigation = await page.evaluate(() => {
      const [nav] = /** @type {PerformanceNavigationTiming[]} */ (performance.getEntriesByType("navigation"));
      return nav.loadEventStart - nav.startTime;
    });
    expect(navigation, dir).toBeLessThanOrEqual(LOAD_MS);
    expect(elapsed, dir).toBeLessThanOrEqual(LOAD_MS);
    await expect(page.locator(`[data-region="sidebar"] a[data-key="side:${dir}"]`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-region="tasks"] details[data-part="task"]')).toHaveCount(40);
    // The page's own module has run (the filter bar is shown).
    await expect(page.locator('[data-region="tasks"] [data-part="filters"]')).toBeVisible();
  }
  await expect(page.locator('[data-region="sidebar"] nav[aria-label="Features"] li')).toHaveCount(50);
});

test("US2 FR-027 map opens By feature above 1,000 tasks", async ({ page }) => {
  const { url } = await serveLarge();
  await page.goto(url);
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  await expect(map(page).locator('button[data-part="map-mode"]')).toHaveText("Stack all");
  const heads = map(page).locator('[data-part="group-head"]');
  await expect(heads).toHaveCount(FEATURES);
  await expect(heads.first().locator('[data-part="name"]')).toHaveText("Feature 1");
  await expect(heads.first().locator('[data-part="count"]')).toHaveText("0/40");
  await expect(map(page).locator("a[data-state]")).toHaveCount(2000);
  await expect(map(page).locator('[data-part="legend"] li').last()).toHaveText("1 dot = 1 task");
  // Squares keep the click behavior.
  const key = `${featureDir(49)}/T001`;
  await map(page).locator(`a[data-key="${key}"]`).click();
  const row = page.locator(`[data-region="tree"] li[data-key="${key}"]`);
  await expect(row).toHaveAttribute("data-selected", "");
  // Revealed inside the tree card's own scroll area (the window is not scrolled).
  const inCard = await row.evaluate((el) => {
    const card = el.closest('[data-region="tree"]').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top >= card.top - 1 && r.bottom <= card.bottom + 1;
  });
  expect(inCard).toBe(true);
});

test("US2 SC-006 hover growth within 150 ms and tooltip at 500 ± 100 ms with 2,000 squares", async ({ page }) => {
  const { url } = await serveLarge();
  await page.goto(url);
  const key = `${featureDir(24)}/T020`;
  const target = map(page).locator(`a[data-key="${key}"]`);
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  // Measured in the page: pointer entry, the first frame the growth is
  // visible, and the moments the tooltip is shown and hidden again.
  await page.evaluate((k) => {
    const w = /** @type {any} */ (window);
    const sq = document.querySelector(`[data-region="taskmap"] a[data-key="${k}"]`);
    const tip = document.querySelector('[data-region="tooltip"]');
    w.__t = {};
    sq.addEventListener("pointerover", () => {
      if (w.__t.entered) return;
      w.__t.entered = performance.now();
      const poll = () => {
        const m = /^matrix\(([\d.]+)/.exec(getComputedStyle(sq).transform);
        if (m && Number(m[1]) >= 1.05) w.__t.grown = performance.now();
        else requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    });
    sq.addEventListener("pointerout", () => {
      w.__t.left ??= performance.now();
    });
    new MutationObserver(() => {
      if (!tip.hidden) w.__t.shown ??= performance.now();
      else if (w.__t.shown) w.__t.hidden ??= performance.now();
    }).observe(tip, { attributes: true, attributeFilter: ["hidden"] });
  }, key);
  const box = await target.boundingBox();
  // Plain waits instead of polling assertions: polling queries the page and
  // would compete with the frames being measured.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);
  await page.mouse.move(box.x + box.width / 2, box.y - 200);
  await page.waitForTimeout(200);
  const t = await page.evaluate(() => /** @type {any} */ (window).__t);
  expect(t.grown - t.entered).toBeLessThanOrEqual(150);
  expect(t.shown - t.entered).toBeGreaterThanOrEqual(400);
  expect(t.shown - t.entered).toBeLessThanOrEqual(600);
  expect(t.hidden - t.left).toBeLessThanOrEqual(100);
});

test("US2 FR-024 a grown square at a group's edge keeps both rings inside its group", async ({ page }) => {
  const { url } = await serveLarge();
  await page.goto(url);
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  const group = map(page).locator('[data-part="group"]').nth(24);
  await group.scrollIntoViewIfNeeded();
  // The first square of each row and every square of the last row sit at the group's edges.
  const edgeKeys = await group.evaluate((g) => {
    const squares = [...g.querySelectorAll("a[data-state]")];
    const tops = squares.map((a) => a.getBoundingClientRect().top);
    const lastTop = Math.max(...tops);
    return squares.filter((a, i) => i === 0 || tops[i] !== tops[i - 1] || tops[i] === lastTop).map((a) => a.dataset.key);
  });
  expect(edgeKeys.length).toBeGreaterThan(2);
  for (const key of edgeKeys) {
    const sq = map(page).locator(`a[data-key="${key}"]`);
    await sq.hover();
    await expect(sq).toHaveCSS("transform", /^matrix\(1\.6,/);
    const fits = await sq.evaluate((el) => {
      const g = el.closest('[data-part="group"]');
      const box = g.getBoundingClientRect();
      const r = el.getBoundingClientRect(); // includes the 1.6 scale
      // The outer ring (3 px box-shadow spread) is scaled with the square.
      const ring = 3 * 1.6;
      return r.left - ring >= box.left - 0.5 && r.right + ring <= box.right + 0.5 && r.top - ring >= box.top - 0.5 && r.bottom + ring <= box.bottom + 0.5;
    });
    expect(fits, key).toBe(true);
  }
});

test("US1 FR-011 with 50 features, segments too narrow for a label show none but stay visible", async ({ page }) => {
  const { url } = await serveLarge();
  await page.goto(url);
  const segments = page.locator('[data-region="stats"] [data-part="segments"] > a');
  await expect(segments).toHaveCount(FEATURES);
  const widths = await segments.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  for (const w of widths) expect(w).toBeGreaterThanOrEqual(2.5);
  // Every feature has 40 of 2,000 tasks (2 %), below the 4 % label rule.
  const labels = await page.locator('[data-region="stats"] [data-part="labels"] > span').allTextContents();
  expect(labels).toHaveLength(FEATURES);
  expect(labels.every((text) => text.trim() === "")).toBe(true);
});

test("US6 SC-014 results update within 200 ms per keystroke with 2,000 tasks and a full ID is first", async ({ page }) => {
  const { url } = await serveLarge();
  await page.goto(url);
  const dialog = page.locator('dialog[data-region="search"]');
  await pressSearchShortcut(page);
  await expect(dialog).toHaveJSProperty("open", true);
  // Load the index once, then start from an empty box.
  const box = dialog.locator('input[data-part="query"]');
  await box.fill("feature");
  await expect(dialog.locator('[data-part="result"]').first()).toBeVisible();
  await box.fill("");
  // Measured in the page: each keydown to the moment the results list has
  // been replaced for that keystroke.
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    const results = document.querySelector('dialog[data-region="search"] [data-part="results"]');
    const status = document.querySelector('dialog[data-region="search"] [data-part="status"]');
    w.__keys = [];
    document.addEventListener("keydown", () => w.__keys.push({ down: performance.now() }), true);
    const done = () => {
      const last = w.__keys[w.__keys.length - 1];
      if (last && last.shown === undefined) last.shown = performance.now();
    };
    new MutationObserver(done).observe(results, { childList: true });
    new MutationObserver(done).observe(status, { childList: true, characterData: true, subtree: true });
  });
  await page.keyboard.type("T020", { delay: 50 });
  const tasks = dialog.locator('[data-group="Tasks"] [data-part="result"]');
  await expect(tasks.first().locator('[data-part="id"]')).toHaveText("T020");
  const keys = await page.evaluate(() => /** @type {any} */ (window).__keys);
  expect(keys).toHaveLength(4);
  for (const k of keys) expect(k.shown - k.down).toBeLessThanOrEqual(200);
  // Every feature has a T020: the full ID ranks all of them first, ahead of
  // anything else, eight shown and the rest counted.
  await expect(tasks.locator('[data-part="id"]')).toHaveText(Array(8).fill("T020"));
  await expect(dialog.locator('[data-group="Tasks"] [data-part="more"]')).toHaveText("42 more");
});
