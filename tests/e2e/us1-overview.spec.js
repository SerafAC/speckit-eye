// US1 — See where the project stands at a glance (spec.md, User Story 1).
// Every test drives the real CLI against a temporary copy of a fixture
// (tests/fixtures/projects/README.md has the expected numbers).

import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFixture, startServe, runCli, hashTree } from "./helpers.js";

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

/**
 * Copies a fixture, optionally adjusts it, starts serve mode on it.
 * @param {string} fixture
 * @param {(dir: string) => Promise<void>} [prepare]
 */
async function serve(fixture, prepare) {
  const dir = await copyFixture(fixture);
  if (prepare) await prepare(dir);
  server = await startServe(dir);
  return { dir, url: server.url };
}

/** Writes `.specify/feature.json` naming `specs/<feature>`. */
const featureJson = (feature) => async (dir) => {
  await mkdir(path.join(dir, ".specify"), { recursive: true });
  await writeFile(path.join(dir, ".specify", "feature.json"), JSON.stringify({ feature_directory: `specs/${feature}` }));
};

const tree = (page) => page.locator('[data-region="tree"]');
const grid = (page) => page.locator('[data-region="grid"]');
const feature = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
const summaryOf = (page, key) => feature(page, key).locator(":scope > summary");

/** data-key of every open <details> in the tree, in document order. */
const openKeys = (page) =>
  tree(page)
    .locator("details[open]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));

test("US1 AC1 overall bar shows 40 of 65 tasks (62 %) and each feature its own count", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const bar = page.locator('progress[data-key="project"]');
  await expect(bar).toHaveAttribute("value", "40");
  await expect(bar).toHaveAttribute("max", "65");
  await expect(page.locator('[data-region="progress"] [data-part="summary"]')).toHaveText("40 / 65 tasks (62 %)");
  await expect(summaryOf(page, "001-alpha")).toContainText("0 open / 30");
  await expect(summaryOf(page, "002-beta")).toContainText("10 open / 20");
  await expect(summaryOf(page, "003-gamma")).toContainText("15 open / 15");
});

test("US1 AC2 only the active feature and its active phase are expanded", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  expect(await openKeys(page)).toEqual(["002-beta", "002-beta/p3"]);
  // Collapsed items still show their progress.
  await expect(summaryOf(page, "003-gamma")).toContainText("15 open / 15");
  await expect(tree(page).locator('details[data-key="002-beta/p4"] > summary')).toContainText("7 open / 7");
});

test("US1 AC3 activating a collapsed item expands it and activating it again collapses it", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const gamma = feature(page, "003-gamma");
  await expect(gamma).not.toHaveAttribute("open");
  await summaryOf(page, "003-gamma").click();
  await expect(gamma).toHaveAttribute("open", "");
  await expect(gamma.locator('details[data-key="003-gamma/p1"]')).toBeVisible();
  await summaryOf(page, "003-gamma").click();
  await expect(gamma).not.toHaveAttribute("open");

  // Keyboard activation works too.
  await summaryOf(page, "001-alpha").focus();
  await page.keyboard.press("Enter");
  await expect(feature(page, "001-alpha")).toHaveAttribute("open", "");
});

test("US1 AC4 a feature without tasks.md shows a stage label and is not counted", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const delta = summaryOf(page, "004-delta");
  await expect(delta.locator('[data-part="stage"]')).toHaveText("Specified");
  await expect(delta).toContainText("0 open / 0");
  await expect(page.locator('progress[data-key="project"]')).toHaveAttribute("max", "65");
  await expect(grid(page).locator('a[data-key^="004-delta/"]')).toHaveCount(0);
});

test("US1 AC5 completed and partly done features show open / total and look different, also collapsed", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(summaryOf(page, "001-alpha")).toContainText("0 open / 30");
  await expect(summaryOf(page, "002-beta")).toContainText("10 open / 20");
  await expect(feature(page, "001-alpha")).toHaveAttribute("data-status", "done");
  await expect(feature(page, "001-alpha")).not.toHaveAttribute("open");

  const look = (key) =>
    summaryOf(page, key).evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, border: s.borderLeftColor, mark: getComputedStyle(el, "::after").content };
    });
  const alpha = await look("001-alpha");
  const gamma = await look("003-gamma");
  expect(alpha.color).not.toBe(gamma.color);
  expect(alpha.border).not.toBe(gamma.border);
  expect(alpha.mark).toContain("✓");
});

test("US1 AC6 feature.json picks the active feature while it has open tasks", async ({ page }) => {
  const { url } = await serve("mixed", featureJson("003-gamma"));
  await page.goto(url);
  await expect(feature(page, "003-gamma")).toHaveAttribute("data-active", "");
  await expect(feature(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(feature(page, "002-beta")).not.toHaveAttribute("data-active");
  await expect(page.locator('[data-region="progress"] [data-part="next"]')).toContainText("T001");
  await server.stop();
  server = null;

  // Naming a feature whose tasks are all done falls back to the first feature with open tasks.
  const second = await serve("mixed", featureJson("001-alpha"));
  await page.goto(second.url);
  await expect(feature(page, "002-beta")).toHaveAttribute("data-active", "");
  await expect(feature(page, "001-alpha")).not.toHaveAttribute("data-active");
  await expect(feature(page, "001-alpha")).not.toHaveAttribute("open");
});

test("US1 AC7 all tasks complete: nothing active without feature.json, the named feature with it", async ({ page }) => {
  const { url } = await serve("complete");
  await page.goto(url);
  await expect(page.locator('progress[data-key="project"]')).toHaveAttribute("value", "8");
  await expect(page.locator('progress[data-key="project"]')).toHaveAttribute("max", "8");
  await expect(page.locator('[data-region="progress"] [data-part="summary"]')).toContainText("(100 %)");
  await expect(tree(page).locator("[data-active]")).toHaveCount(0);
  expect(await openKeys(page)).toEqual([]);
  await expect(page.locator('[data-part="complete"]')).toContainText("All tasks are complete");
  await expect(page.locator('[data-region="progress"] [data-part="next"]')).toHaveCount(0);
  await server.stop();
  server = null;

  const named = await serve("complete", featureJson("002-second"));
  await page.goto(named.url);
  const second = feature(page, "002-second");
  await expect(second).toHaveAttribute("open", "");
  await expect(second).toHaveAttribute("data-active", "");
  await expect(second).toHaveAttribute("data-status", "done");
  expect(await openKeys(page)).toEqual(["002-second"]);
  await expect(tree(page).locator("[data-active]")).toHaveCount(1);
  await expect(page.locator('[data-region="progress"] [data-part="next"]')).toHaveCount(0);
  await expect(tree(page).locator('[data-part="next"]')).toHaveCount(0);
  await expect(page.locator('[data-part="complete"]')).toContainText("All tasks are complete");
});

test("US1 AC8 header, counters, tree statuses and one grid square per task", async ({ page }) => {
  const { dir, url } = await serve("mixed");
  await page.goto(url);
  const header = page.locator('[data-region="header"]');
  await expect(header).toContainText(path.basename(dir));
  await expect(header.locator(':scope > nav a[href="/constitution.html"]')).toBeVisible();
  await expect(header.locator(':scope > nav a[href="/assessments/speckit-dashboard/intake.html"]')).toBeVisible();

  await expect(page.locator('[data-counter="specs"] [data-part="value"]')).toHaveText("1 / 4");
  await expect(page.locator('[data-counter="phases"] [data-part="value"]')).toHaveText("5 / 9");
  await expect(page.locator('[data-counter="tasks"] [data-part="value"]')).toHaveText("40 / 65");

  await expect(feature(page, "001-alpha")).toHaveAttribute("data-status", "done");
  await expect(feature(page, "001-alpha")).not.toHaveAttribute("open");
  await expect(feature(page, "002-beta")).toHaveAttribute("data-status", "started");
  await expect(feature(page, "002-beta")).toHaveAttribute("data-active", "");
  await expect(feature(page, "002-beta")).toHaveAttribute("open", "");
  await expect(feature(page, "003-gamma")).toHaveAttribute("data-status", "not-started");
  await expect(feature(page, "004-delta")).toHaveAttribute("data-status", "not-started");

  const cells = grid(page).locator("a[data-key]");
  await expect(cells).toHaveCount(65);
  await expect(grid(page).locator('a[data-state="completed"]')).toHaveCount(40);
  await expect(grid(page).locator('a[data-state="current"]')).toHaveCount(1);
  await expect(grid(page).locator('a[data-key="002-beta/T011"]')).toHaveAttribute("data-state", "current");
  const colors = await cells.evaluateAll((els) => {
    const byState = {};
    for (const el of els) byState[el.getAttribute("data-state")] = getComputedStyle(el).backgroundColor;
    return byState;
  });
  expect(new Set(Object.values(colors)).size).toBe(Object.keys(colors).length);
});

test("US1 AC9 hovering a task square names the task and highlights its feature and phase", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const cell = grid(page).locator('a[data-key="002-beta/T011"]');
  await expect(cell).toHaveAttribute("title", "T011 · List paging — Beta › Phase 3 · US1 – Beta listing (P1)");
  await cell.hover();
  await expect(feature(page, "002-beta")).toHaveAttribute("data-highlight", "");
  await expect(tree(page).locator('details[data-key="002-beta/p3"]')).toHaveAttribute("data-highlight", "");
  await expect(feature(page, "001-alpha")).not.toHaveAttribute("data-highlight");

  // A square in a grouped phase also highlights its story group.
  await grid(page).locator('a[data-key="002-beta/T017"]').hover();
  await expect(tree(page).locator('details[data-key="002-beta/p4"]')).toHaveAttribute("data-highlight", "");
  await expect(tree(page).locator('details[data-key="002-beta/p4/US3"]')).toHaveAttribute("data-highlight", "");
  await expect(tree(page).locator('details[data-key="002-beta/p3"]')).not.toHaveAttribute("data-highlight");
});

test("US1 AC10 one command prints a local address and serves the overview without changing the project", async ({ page }) => {
  const dir = await copyFixture("mixed");
  const before = await hashTree(dir);
  server = await startServe(dir);
  expect(server.stdout).toMatch(/^speckit-eye \d+\.\d+\.\d+ — serving .+\n {2}Local: http:\/\/127\.0\.0\.1:4747\/\n/);
  const response = await page.goto(server.url);
  expect(response?.status()).toBe(200);
  await expect(page.locator('[data-region="progress"]')).toBeVisible();
  expect(await server.stop()).toBe(0);
  server = null;
  expect(await hashTree(dir)).toBe(before);
});

test("US1 SC-001 progress, active feature and next task are visible without scrolling at 1280×720", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const { url } = await serve("mixed");
  await page.goto(url);
  for (const locator of [
    page.locator('[data-region="progress"]'),
    summaryOf(page, "002-beta"),
    page.locator('[data-region="progress"] [data-part="next"]'),
  ]) {
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
  await expect(page.locator('[data-region="progress"] [data-part="next"]')).toContainText("T011");
  await expect(page.locator('[data-region="progress"] [data-part="next"]')).toContainText("List paging");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("US1 FR-015c a task depending on an open task is blocked in the grid and the tree", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(grid(page).locator('a[data-key="002-beta/T018"]')).toHaveAttribute("data-state", "blocked");
  await expect(tree(page).locator('li[data-key="002-beta/T018"]')).toHaveAttribute("data-state", "blocked");
  await expect(grid(page).locator('a[data-key="002-beta/T017"]')).toHaveAttribute("data-state", "future");
});

test("US1 FR-036 reduced motion turns off transitions and animations", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    const { url } = await serve("mixed");
    await page.goto(url);
    const motion = (locator) =>
      locator.evaluate((el) => {
        const s = getComputedStyle(el);
        return { transition: s.transitionDuration, animation: s.animationName };
      });
    const expected = { transition: "0s", animation: "none" };
    expect(await motion(page.locator('progress[data-key="project"]'))).toEqual(expected);
    expect(await motion(feature(page, "002-beta"))).toEqual(expected);
    expect(await motion(feature(page, "002-beta").locator(':scope > ul[data-part="phases"]'))).toEqual(expected);
    expect(await motion(summaryOf(page, "002-beta"))).toEqual(expected);
    // Opening an item does not start an animation either.
    await summaryOf(page, "003-gamma").click();
    expect(await motion(feature(page, "003-gamma").locator(':scope > ul[data-part="phases"]'))).toEqual(expected);
  } finally {
    await context.close();
  }
});

test("US1 FR-038 every request stays on the server's origin and no CSP violation fires", async ({ page }) => {
  const { url } = await serve("mixed");
  const origin = new URL(url).origin;
  const requests = [];
  page.on("request", (req) => requests.push(req.url()));
  await page.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const response = await page.goto(url);
  expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  await grid(page).locator('a[data-key="002-beta/T011"]').hover();
  await expect(feature(page, "002-beta")).toHaveAttribute("data-highlight", "");
  await summaryOf(page, "003-gamma").click();
  await page.waitForLoadState("networkidle");
  expect(requests.length).toBeGreaterThanOrEqual(3);
  for (const r of requests) expect(new URL(r).origin).toBe(origin);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test("US1 FR-013 a nonstandard tasks.md is shown with warnings and exact counts", async ({ page }) => {
  const { url } = await serve("nonstandard");
  await page.goto(url);
  const bar = page.locator('progress[data-key="project"]');
  await expect(bar).toHaveAttribute("value", "5");
  await expect(bar).toHaveAttribute("max", "9");
  await expect(grid(page).locator("a[data-key]")).toHaveCount(9);

  const warnings = feature(page, "001-odd").locator(':scope > [data-part="warnings"]');
  await expect(warnings).toContainText("specs/001-odd/tasks.md:10 checkbox without a task ID (counted)");
  await expect(warnings).toContainText("specs/001-odd/tasks.md:28 duplicate phase number 2 (both shown)");
  await expect(feature(page, "002-emptytasks").locator(':scope > [data-part="warnings"]')).toContainText("tasks.md contains no tasks");

  expect(server.stderr).toContain("warning: specs/001-odd/tasks.md:10 checkbox without a task ID (counted)");
  expect(server.stderr).toContain("warning: specs/001-odd/tasks.md:17 duplicate task ID T005 (both counted)");

  // Still running: a second request works.
  const again = await page.reload();
  expect(again?.status()).toBe(200);
});

test("US1 FR-015 a narrow viewport stacks the tree above the grid", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const { url } = await serve("mixed");
  await page.goto(url);
  const t = await tree(page).boundingBox();
  const g = await grid(page).boundingBox();
  expect(t && g).toBeTruthy();
  expect(g.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  expect(Math.abs(g.x - t.x)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

test("US1 empty project shows 0 % with an explanation", async ({ page }) => {
  const { url } = await serve("empty");
  await page.goto(url);
  await expect(page.locator('[data-region="progress"] [data-part="summary"]')).toHaveText("0 / 0 tasks (0 %)");
  await expect(page.locator('[data-region="progress"] [data-part="empty"]')).toContainText("no features yet");
  await expect(tree(page).locator("details")).toHaveCount(0);
});

test("US1 FR-005 usage errors and missing or non-Spec-Kit folders exit 2, --help exits 0", async () => {
  const missing = await runCli(["--serve", path.join(os.tmpdir(), "speckit-eye-does-not-exist-xyz")]);
  expect(missing.code).toBe(2);
  expect(missing.stderr).toContain("folder not found");

  const plain = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-plain-"));
  const notSpecKit = await runCli(["--serve", plain]);
  expect(notSpecKit.code).toBe(2);
  expect(notSpecKit.stderr).toContain("specs/");
  expect(notSpecKit.stderr).toContain(".specify/");

  const none = await runCli([]);
  expect(none.code).toBe(2);
  expect(none.stderr).toContain("Usage:");
  expect(none.stdout).toBe("");

  const help = await runCli(["--help"]);
  expect(help.code).toBe(0);
  expect(help.stdout).toContain("Usage:");
  expect(help.stderr).toBe("");
});

test("US1 FR-006 serving never changes the project folder", async ({ page }) => {
  const dir = await copyFixture("nonstandard");
  const before = await hashTree(dir);
  server = await startServe(dir);
  await page.goto(server.url);
  await grid(page).locator("a[data-key]").first().hover();
  await page.goto(`${server.url}does-not-exist.html`);
  expect(await server.stop()).toBe(0);
  server = null;
  expect(await hashTree(dir)).toBe(before);
});
