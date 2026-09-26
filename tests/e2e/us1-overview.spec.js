// US1 — See where the project stands in the new overview (spec 002, User
// Story 1; spec 001 US1 for the behavior kept from the first version).
// Every test drives the real CLI against a temporary copy of a fixture
// (tests/fixtures/projects/README.md has the expected numbers). The 001 task
// grid tests at the end move to us2-taskmap.spec.js with the task map (T040).

import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFixture, startServe, runCli, hashTree, sidebar, sidebarFeature, featurePagePath } from "./helpers.js";
import { generateLarge, FEATURES } from "../fixtures/generate-large.js";

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

const stats = (page) => page.locator('[data-region="stats"]');
const stat = (page, name) => stats(page).locator(`[data-stat="${name}"]`);
const upNext = (page) => page.locator('[data-region="up-next"]');
const tree = (page) => page.locator('[data-region="tree"]');
const grid = (page) => page.locator('[data-region="grid"]');
const orderButton = (page) => page.locator('button[data-part="order"]');
const depthButton = (page, depth) => page.locator(`[data-part="depth"] button[data-depth="${depth}"]`);
const filterButton = (page, filter) => page.locator(`[data-part="view-filter"] button[data-filter="${filter}"]`);
const feature = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
const summaryOf = (page, key) => feature(page, key).locator(":scope > summary");
const taskRow = (page, key) => tree(page).locator(`li[data-key="${key}"]`);

/** data-key of every open <details> in the tree, in document order. */
const openKeys = (page) =>
  tree(page)
    .locator("details[open]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));

/** Folder names of the tree's feature rows, in document order. */
const treeOrder = (page) =>
  tree(page)
    .locator("li[data-feature]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-feature")));

/** Folder names of the sidebar Features list, in document order. */
const sidebarOrder = (page) =>
  sidebar(page)
    .locator('a[data-key^="side:"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-key").slice("side:".length)));

// ---------------------------------------------------------------------------
// Sidebar, stats card and Up next bar
// ---------------------------------------------------------------------------

test("US1 FR-005 FR-006 sidebar lists features in progress-first order with dots and counts", async ({ page }) => {
  const { dir, url } = await serve("mixed");
  await page.goto(url);
  const side = sidebar(page);
  await expect(side).toBeVisible();
  await expect(side.locator('[data-part="project-name"]')).toHaveText(path.basename(dir));
  await expect(side.getByRole("link", { name: "Overview", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(side.getByRole("link", { name: "Constitution", exact: true })).toBeVisible();
  await expect(side.getByRole("link", { name: "Assessment: speckit-dashboard", exact: true })).toBeVisible();
  await expect(side.locator('[data-part="features"] h2')).toHaveText("Features 1 / 4 done");
  await expect(side.locator("footer")).toContainText(/speckit-eye \d+\.\d+\.\d+/);

  expect(await sidebarOrder(page)).toEqual(["002-beta", "003-gamma", "004-delta", "001-alpha"]);
  const expected = {
    "002-beta": { status: "in-progress", count: "10" },
    "003-gamma": { status: "not-started", count: "15" },
    "004-delta": { status: "no-tasks", count: "" },
    "001-alpha": { status: "done", count: null },
  };
  for (const [dir, { status, count }] of Object.entries(expected)) {
    const entry = sidebarFeature(page, dir);
    await expect(entry.locator('[data-part="dot"]')).toHaveAttribute("data-status", status);
    if (count !== null) await expect(entry.locator('[data-part="count"]')).toHaveText(count);
  }
  await expect(sidebarFeature(page, "002-beta").locator('[data-part="name"]')).toHaveAttribute("title", "Beta");
  // The complete feature shows a done mark instead of a count.
  await expect(sidebarFeature(page, "001-alpha").locator('[data-part="count"] svg')).toHaveCount(1);
  await expect(sidebarFeature(page, "001-alpha").locator('[data-part="count"]')).not.toHaveText(/\d/);

  // Done is filled, in progress a ring, not started grey: three different looks.
  const look = (dirName) =>
    sidebarFeature(page, dirName)
      .locator('[data-part="dot"]')
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.backgroundColor}|${s.borderTopColor}|${s.boxShadow}`;
      });
  const looks = new Set([await look("001-alpha"), await look("002-beta"), await look("003-gamma")]);
  expect(looks.size).toBe(3);
});

test("US1 FR-011 stats card shows 62 % and 40 of 65 tasks", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(page.locator('[data-region="page-head"] h1')).toHaveText("Project overview");
  await expect(stat(page, "percent").locator('[data-part="value"]')).toHaveText("62 %");
  await expect(stat(page, "percent").locator('[data-part="detail"]')).toHaveText("40 of 65 tasks");
  await expect(stat(page, "features").locator('[data-part="value"]')).toHaveText("1 / 4");
  await expect(stat(page, "features").locator('[data-part="detail"]')).toHaveText("1 in progress");
  await expect(stat(page, "phases").locator('[data-part="value"]')).toHaveText("5 / 9");
  await expect(stat(page, "phases").locator('[data-part="detail"]')).toHaveText("4 remaining");
  await expect(stat(page, "open").locator('[data-part="value"]')).toHaveText("25");
  await expect(stat(page, "open").locator('[data-part="detail"]')).toHaveText("across 2 features");
});

test("US1 FR-011 segmented bar has one segment per feature with tasks, widths 46/31/23 %", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const segments = stats(page).locator('[data-part="segments"] > a');
  await expect(segments).toHaveCount(3);
  expect(await segments.evaluateAll((els) => els.map((el) => el.getAttribute("data-key")))).toEqual([
    "seg:001-alpha",
    "seg:002-beta",
    "seg:003-gamma",
  ]);
  const bar = await stats(page).locator('[data-part="segments"]').boundingBox();
  expect(bar).toBeTruthy();
  const widths = [];
  for (const segment of await segments.all()) {
    const box = await segment.boundingBox();
    widths.push((box.width / bar.width) * 100);
  }
  const expected = [46, 31, 23];
  widths.forEach((w, i) => expect(Math.abs(w - expected[i]), `segment ${i}: ${w.toFixed(2)} %`).toBeLessThanOrEqual(1));

  // Each segment names its feature and counts on hover and is labelled with its number.
  await expect(segments.nth(1)).toHaveAttribute("title", "002 · Beta — 10 done, 9 open, 1 next");
  await expect(stats(page).locator('[data-part="labels"] span')).toHaveText(["001", "002", "003"]);
  await expect(stats(page).locator('[data-part="legend"] li')).toHaveText(["Done", "Open", "Next up"]);
});

test("US1 FR-013 Up next bar names the next task with full text on hover and View task opens the feature page", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const bar = upNext(page);
  await expect(bar.locator('[data-part="id"]')).toHaveText("T011");
  await expect(bar.locator('[data-part="text"]')).toHaveText("List paging");
  await expect(bar.locator('[data-part="text"]')).toHaveAttribute("title", "List paging");
  await expect(bar.locator('[data-part="where"]')).toContainText("Beta › Phase 3");
  // One line, truncated with an ellipsis when too long.
  const style = await bar.locator('[data-part="text"]').evaluate((el) => {
    const s = getComputedStyle(el);
    return { whiteSpace: s.whiteSpace, overflow: s.textOverflow };
  });
  expect(style).toEqual({ whiteSpace: "nowrap", overflow: "ellipsis" });
  // The fixture has no quickstart, so there is no "Open quickstart".
  await expect(bar.getByRole("link", { name: "Open quickstart" })).toHaveCount(0);
  // Dark in both themes.
  await expect(bar).toHaveClass(/always-dark/);

  await bar.getByRole("link", { name: "View task" }).click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("002-beta")}#task-002-beta-T011$`));
  await expect(page.locator("main h1")).toHaveText("Beta");
});

test("US1 FR-013 Up next bar says why there is no next task", async ({ page }) => {
  const { url } = await serve("complete");
  await page.goto(url);
  await expect(upNext(page)).toHaveAttribute("data-empty", "complete");
  await expect(upNext(page).locator('[data-part="text"]')).toHaveText("Every task is complete");
  await expect(upNext(page).getByRole("link", { name: "View task" })).toHaveCount(0);
  await expect(stat(page, "percent").locator('[data-part="value"]')).toHaveText("100 %");
});

// ---------------------------------------------------------------------------
// Feature tree
// ---------------------------------------------------------------------------

test("US1 FR-012 order cycles through four orders and the label names the current one", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const button = orderButton(page);
  await expect(button).toBeVisible();
  const steps = [
    ["In progress first", ["002-beta", "003-gamma", "004-delta", "001-alpha"]],
    ["Number", ["001-alpha", "002-beta", "003-gamma", "004-delta"]],
    ["Least complete", ["003-gamma", "002-beta", "001-alpha", "004-delta"]],
    ["Name A–Z", ["001-alpha", "002-beta", "004-delta", "003-gamma"]],
    ["In progress first", ["002-beta", "003-gamma", "004-delta", "001-alpha"]],
  ];
  for (const [i, [label, order]] of steps.entries()) {
    if (i > 0) await button.click();
    await expect(button.locator('[data-part="order-label"]')).toHaveText(label);
    expect(await treeOrder(page), label).toEqual(order);
  }
  // The task map and the sidebar are not affected by the order.
  await button.click();
  expect(await sidebarOrder(page)).toEqual(["002-beta", "003-gamma", "004-delta", "001-alpha"]);
  await expect(grid(page).locator("a[data-key]").first()).toHaveAttribute("data-key", "001-alpha/T001");
});

test("US1 FR-012 depth Tasks expands every phase with tasks and Features collapses all", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const features = ["002-beta", "003-gamma", "004-delta", "001-alpha"];
  const phasesWithTasks = await tree(page)
    .locator('li[data-part="phase"] > details, li[data-part="group"] > details')
    .evaluateAll((els) => els.filter((d) => d.querySelector("li[data-state]")).map((d) => d.getAttribute("data-key")));
  expect(phasesWithTasks.length).toBeGreaterThanOrEqual(9);

  await depthButton(page, "tasks").click();
  await expect(depthButton(page, "tasks")).toHaveAttribute("aria-pressed", "true");
  const open = await openKeys(page);
  for (const key of [...features, ...phasesWithTasks]) expect(open, key).toContain(key);
  await expect(taskRow(page, "003-gamma/T008")).toBeVisible();

  await depthButton(page, "phases").click();
  await expect(depthButton(page, "phases")).toHaveAttribute("aria-pressed", "true");
  await expect(depthButton(page, "tasks")).toHaveAttribute("aria-pressed", "false");
  expect((await openKeys(page)).sort()).toEqual([...features].sort());

  await depthButton(page, "features").click();
  expect(await openKeys(page)).toEqual([]);
  await expect(depthButton(page, "features")).toHaveAttribute("aria-pressed", "true");

  // Toggling a row by hand clears the selected depth.
  await summaryOf(page, "003-gamma").click();
  await expect(feature(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(page.locator('[data-part="depth"] button[aria-pressed="true"]')).toHaveCount(0);
});

test("US1 FR-014 FR-016 FR-017 FR-018 rows show their parts and only the active chain is open on load", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  expect(await openKeys(page)).toEqual(["002-beta", "002-beta/p3"]);
  const beta = summaryOf(page, "002-beta");
  await expect(beta.locator('[data-part="number"]')).toHaveText("002");
  await expect(beta.locator('[data-part="title"]')).toHaveText("Beta");
  await expect(beta.locator('[data-part="pill"]')).toHaveText("10 open");
  await expect(beta.locator('[data-part="count"]')).toHaveText("10/20");
  await expect(beta.locator('a[data-part="open-feature"]')).toHaveAttribute("href", `/${featurePagePath("002-beta")}`);
  await expect(summaryOf(page, "001-alpha").locator('[data-part="pill"]')).toHaveText("Complete");
  // A feature without tasks has no bar and no count.
  await expect(summaryOf(page, "004-delta").locator('[data-part="bar"]')).toHaveCount(0);

  const p3 = tree(page).locator('details[data-key="002-beta/p3"] > summary');
  await expect(p3.locator('[data-part="phase-name"]')).toHaveText("Phase 3");
  await expect(p3.locator('[data-part="priority"]')).toHaveText("P1");
  await expect(p3.locator('[data-part="count"]')).toHaveText("3/6");
  await expect(tree(page).locator('details[data-key="002-beta/p1"] > summary [data-part="done-mark"]')).toHaveCount(1);

  const next = taskRow(page, "002-beta/T011");
  await expect(next).toHaveAttribute("data-state", "next");
  await expect(next.locator('[data-part="next"]')).toHaveText("NEXT");
  await expect(next.locator('a[data-part="id"]')).toHaveAttribute("href", `/${featurePagePath("002-beta")}#task-002-beta-T011`);
  await expect(next.locator('[data-part="text"]')).toHaveAttribute("title", "List paging");
});

test("US1 FR-015 warning row shows count, line chips and Details link", async ({ page }) => {
  const { url } = await serve("nonstandard");
  await page.goto(url);
  const odd = feature(page, "001-odd");
  await expect(odd).toHaveAttribute("open", "");
  const rows = odd.locator(':scope > ul[data-part="warnings"] a[data-part="warning"]');
  // One row per kind of warning: W3, W1, W2, W7, W5, W6, W4, W12.
  await expect(rows).toHaveCount(8);
  await expect(summaryOf(page, "001-odd").locator('[data-part="warnings-badge"]')).toHaveText("8 warnings");

  const w1 = odd.locator('a[data-part="warning"][data-code="W1"]');
  await expect(w1.locator('[data-part="warning-title"]')).toHaveText("1 checkbox without a task ID in tasks.md");
  await expect(w1.locator('[data-part="note"]')).toContainText("counted, not linkable");
  await expect(w1.locator('[data-part="line"]')).toHaveText(["L10"]);
  await expect(w1.locator('[data-part="details"]')).toHaveText("Details");
  await expect(w1).toHaveAttribute("href", `/${featurePagePath("001-odd")}#warnings`);
  await expect(odd.locator('a[data-part="warning"][data-code="W12"] [data-part="line"]')).toHaveText(["L28"]);

  // Amber rows come first, before the phases.
  const firstChild = await odd.evaluate((d) => d.querySelector(":scope > ul")?.getAttribute("data-part"));
  expect(firstChild).toBe("warnings");
  const amber = await w1.evaluate((el) => getComputedStyle(el).backgroundColor);
  const plain = await tree(page).locator('li[data-part="phase"] > details > summary').first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(amber).not.toBe(plain);

  await w1.click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("001-odd")}#warnings$`));
});

test("US1 FR-019 Open tasks only hides complete features and done tasks", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await depthButton(page, "tasks").click();
  await expect(tree(page).locator("li[data-feature='001-alpha']")).toBeVisible();
  await expect(taskRow(page, "002-beta/T001")).toBeVisible();

  await filterButton(page, "open").click();
  await expect(tree(page)).toHaveAttribute("data-filter", "open");
  await expect(filterButton(page, "open")).toHaveAttribute("aria-pressed", "true");
  await expect(tree(page).locator("li[data-feature='001-alpha']")).toBeHidden();
  await expect(feature(page, "002-beta/p1")).toBeHidden();
  await expect(taskRow(page, "002-beta/T008")).toBeHidden();
  await expect(taskRow(page, "002-beta/T011")).toBeVisible();
  await expect(taskRow(page, "002-beta/T012")).toBeVisible();
  await expect(tree(page).locator("li[data-feature='003-gamma']")).toBeVisible();
  // The stats card and the map are not filtered.
  await expect(stat(page, "percent").locator('[data-part="value"]')).toHaveText("62 %");
  await expect(grid(page).locator("a[data-key]")).toHaveCount(65);

  await filterButton(page, "all").click();
  await expect(tree(page).locator("li[data-feature='001-alpha']")).toBeVisible();
  await expect(taskRow(page, "002-beta/T008")).toBeVisible();
});

test("US1 FR-020 order and filter are remembered after reload", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await orderButton(page).click();
  await orderButton(page).click();
  await filterButton(page, "open").click();
  await expect(orderButton(page).locator('[data-part="order-label"]')).toHaveText("Least complete");

  await page.reload();
  await expect(orderButton(page).locator('[data-part="order-label"]')).toHaveText("Least complete");
  expect(await treeOrder(page)).toEqual(["003-gamma", "002-beta", "001-alpha", "004-delta"]);
  await expect(tree(page)).toHaveAttribute("data-filter", "open");
  await expect(filterButton(page, "open")).toHaveAttribute("aria-pressed", "true");

  // Coming back from another page keeps them too.
  await sidebarFeature(page, "003-gamma").click();
  await page.goBack();
  await expect(orderButton(page).locator('[data-part="order-label"]')).toHaveText("Least complete");
  await expect(tree(page)).toHaveAttribute("data-filter", "open");
});

test("US1 FR-006 sidebar entry opens the feature page and marks it current", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(sidebarFeature(page, "003-gamma")).not.toHaveAttribute("aria-current");
  await sidebarFeature(page, "003-gamma").click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("003-gamma")}$`));
  await expect(page.locator("main h1")).toHaveText("Gamma");
  await expect(sidebarFeature(page, "003-gamma")).toHaveAttribute("aria-current", "page");
  await expect(sidebar(page).locator('[aria-current="page"]')).toHaveCount(1);
  // The list keeps the progress-first order on every page.
  expect(await sidebarOrder(page)).toEqual(["002-beta", "003-gamma", "004-delta", "001-alpha"]);
});

// ---------------------------------------------------------------------------
// Success criteria and layout
// ---------------------------------------------------------------------------

test("US1 SC-001 percentage, in-progress feature and next task visible without scrolling at 1440 × 900", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { url } = await serve("mixed");
  await page.goto(url);
  for (const locator of [
    stat(page, "percent"),
    stat(page, "features"),
    upNext(page).locator('[data-part="id"]'),
    upNext(page).locator('[data-part="text"]'),
    summaryOf(page, "002-beta"),
  ]) {
    await expect(locator).toBeInViewport({ ratio: 1 });
  }
  await expect(stat(page, "percent")).toContainText("62 %");
  await expect(upNext(page)).toContainText("T011");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

// The feature page lists tasks with their text and files only from T048 (task
// list) and T052 (fixture file paths) of US3 on; until then this check is
// pending rather than weakened.
test.fixme("US1 SC-002 View task shows the next task's full text and files in one click", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await upNext(page).getByRole("link", { name: "View task" }).click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("002-beta")}#task-002-beta-T011$`));
  const target = page.locator("#task-002-beta-T011");
  await expect(target).toBeInViewport();
  await expect(target).toContainText("List paging");
  await expect(target.locator("code, [data-part='file']").first()).toBeVisible();
});

test("US1 SC-002 any task is two clicks from the map (square, then its ID)", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const square = grid(page).locator('a[data-key="003-gamma/T008"]');
  await expect(feature(page, "003-gamma")).not.toHaveAttribute("open");
  await square.click();
  const row = taskRow(page, "003-gamma/T008");
  await expect(row).toBeInViewport();
  await row.locator('a[data-part="id"]').click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("003-gamma")}#task-003-gamma-T008$`));
  await expect(page.locator("main h1")).toHaveText("Gamma");
});

test("US1 FR-018 tree scrolls inside its card above about 800 px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { url } = await serve("mixed");
  await page.goto(url);
  await depthButton(page, "tasks").click();
  const box = await tree(page).evaluate((el) => ({
    client: el.clientHeight,
    scroll: el.scrollHeight,
    overflow: getComputedStyle(el).overflowY,
    height: el.getBoundingClientRect().height,
  }));
  expect(box.scroll).toBeGreaterThan(box.client);
  expect(["auto", "scroll"]).toContain(box.overflow);
  expect(box.height).toBeGreaterThan(700);
  expect(box.height).toBeLessThanOrEqual(820);

  // Scrolling the tree does not scroll the page.
  const before = await page.evaluate(() => window.scrollY);
  await tree(page).evaluate((el) => (el.scrollTop = 400));
  expect(await tree(page).evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("US1 SC-009 sidebar left of content, tree left of map", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { url } = await serve("mixed");
  await page.goto(url);
  const box = async (selector) => {
    const b = await page.locator(selector).boundingBox();
    expect(b, selector).toBeTruthy();
    return b;
  };
  const side = await box('[data-region="sidebar"]');
  const main = await box("main");
  expect(side.x + side.width).toBeLessThanOrEqual(main.x + 1);

  // Top to bottom: page head, stats card, Up next bar, then the two columns.
  const head = await box('[data-region="page-head"]');
  const statsBox = await box('[data-region="stats"]');
  const next = await box('[data-region="up-next"]');
  const features = await box('[data-region="features"]');
  const map = await box('[data-region="map-column"]');
  expect(head.y).toBeLessThan(statsBox.y);
  expect(statsBox.y + statsBox.height).toBeLessThanOrEqual(next.y + 1);
  expect(next.y + next.height).toBeLessThanOrEqual(features.y + 1);

  expect(features.x + features.width).toBeLessThanOrEqual(map.x + 1);
  expect(Math.abs(features.y - map.y)).toBeLessThan(2);
  expect(features.width).toBeGreaterThan(map.width);
  await expect(page.locator('[data-region="mobile-menu"]')).toBeHidden();
});

test("US1 FR-010 a narrow viewport stacks the tree above the map without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const { url } = await serve("mixed");
  await page.goto(url);
  const t = await page.locator('[data-region="features"]').boundingBox();
  const g = await page.locator('[data-region="map-column"]').boundingBox();
  expect(t && g).toBeTruthy();
  expect(g.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  expect(Math.abs(g.x - t.x)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});

// ---------------------------------------------------------------------------
// Behavior kept from spec 001
// ---------------------------------------------------------------------------

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

test("US1 AC6 feature.json picks the active feature while it has open tasks", async ({ page }) => {
  const { url } = await serve("mixed", featureJson("003-gamma"));
  await page.goto(url);
  await expect(feature(page, "003-gamma")).toHaveAttribute("data-active", "");
  await expect(feature(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(feature(page, "002-beta")).not.toHaveAttribute("data-active");
  await expect(upNext(page).locator('[data-part="id"]')).toHaveText("T001");
  await expect(upNext(page).locator('[data-part="where"]')).toContainText("Gamma");
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
  await expect(tree(page).locator("[data-active]")).toHaveCount(0);
  expect(await openKeys(page)).toEqual([]);
  await server.stop();
  server = null;

  const named = await serve("complete", featureJson("002-second"));
  await page.goto(named.url);
  const second = feature(page, "002-second");
  await expect(second).toHaveAttribute("open", "");
  await expect(second).toHaveAttribute("data-active", "");
  await expect(second).toHaveAttribute("data-status", "done");
  expect(await openKeys(page)).toEqual(["002-second"]);
  await expect(tree(page).locator('[data-part="next"]')).toHaveCount(0);
  await expect(upNext(page)).toHaveAttribute("data-empty", "complete");
});

test("US1 AC10 one command prints a local address and serves the overview without changing the project", async ({ page }) => {
  const dir = await copyFixture("mixed");
  const before = await hashTree(dir);
  server = await startServe(dir);
  expect(server.stdout).toMatch(/^speckit-eye \d+\.\d+\.\d+ — serving .+\n {2}Local: http:\/\/127\.0\.0\.1:4747\/\n/);
  const response = await page.goto(server.url);
  expect(response?.status()).toBe(200);
  await expect(stats(page)).toBeVisible();
  expect(await server.stop()).toBe(0);
  server = null;
  expect(await hashTree(dir)).toBe(before);
});

test("US1 FR-022 a task depending on an open task is blocked in the tree", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(taskRow(page, "002-beta/T018")).toHaveAttribute("data-state", "blocked");
  await expect(taskRow(page, "002-beta/T017")).toHaveAttribute("data-state", "open");
  await expect(grid(page).locator('a[data-key="002-beta/T018"]')).toHaveAttribute("data-state", "blocked");
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
    expect(await motion(stats(page).locator('[data-part="segments"] > a').first())).toEqual(expected);
    expect(await motion(feature(page, "002-beta"))).toEqual(expected);
    expect(await motion(summaryOf(page, "002-beta"))).toEqual(expected);
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
  await orderButton(page).click();
  await depthButton(page, "tasks").click();
  await filterButton(page, "open").click();
  await grid(page).locator('a[data-key="002-beta/T011"]').hover();
  await page.waitForLoadState("networkidle");
  expect(requests.length).toBeGreaterThanOrEqual(3);
  for (const r of requests) expect(new URL(r).origin).toBe(origin);
  expect(await page.evaluate(() => window.__cspViolations)).toEqual([]);
});

test("US1 FR-013 a nonstandard tasks.md is shown with warnings and exact counts", async ({ page }) => {
  const { url } = await serve("nonstandard");
  await page.goto(url);
  await expect(stat(page, "percent").locator('[data-part="detail"]')).toHaveText("5 of 9 tasks");
  await expect(grid(page).locator("a[data-key]")).toHaveCount(9);
  await expect(feature(page, "002-emptytasks").locator(':scope > ul[data-part="warnings"]')).toContainText("tasks.md");

  expect(server.stderr).toContain("warning: specs/001-odd/tasks.md:10 checkbox without a task ID (counted)");
  expect(server.stderr).toContain("warning: specs/001-odd/tasks.md:17 duplicate task ID T005 (both counted)");

  // Still running: a second request works.
  const again = await page.reload();
  expect(again?.status()).toBe(200);
});

test("US1 empty project shows 0 % with an explanation", async ({ page }) => {
  const { url } = await serve("empty");
  await page.goto(url);
  await expect(stat(page, "percent").locator('[data-part="value"]')).toHaveText("0 %");
  await expect(stats(page).locator('[data-part="empty"]')).toContainText("no features yet");
  await expect(upNext(page)).toHaveAttribute("data-empty", "no-tasks");
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

// ---------------------------------------------------------------------------
// 001 task grid (moves to us2-taskmap.spec.js with the task map, T040)
// ---------------------------------------------------------------------------

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

test("US1 FR-015b click on a grid square opens the task's feature, phase and story and scrolls to it", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto(url);
  const phase = tree(page).locator('details[data-key="002-beta/p4"]');
  const story = tree(page).locator('details[data-key="002-beta/p4/US3"]');
  const task = taskRow(page, "002-beta/T017");
  await expect(phase).not.toHaveAttribute("open");
  await expect(story).not.toHaveAttribute("open");
  await expect(task).toBeHidden();

  await grid(page).locator('a[data-key="002-beta/T017"]').click();
  await expect(feature(page, "002-beta")).toHaveAttribute("open", "");
  await expect(phase).toHaveAttribute("open", "");
  await expect(story).toHaveAttribute("open", "");
  await expect(task).toBeInViewport();
  await expect(task).toHaveAttribute("data-highlight", "");

  // A collapsed feature opens too; the highlight moves to the new task.
  await grid(page).locator('a[data-key="003-gamma/T008"]').click();
  await expect(feature(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(tree(page).locator('details[data-key="003-gamma/p2"]')).toHaveAttribute("open", "");
  await expect(taskRow(page, "003-gamma/T008")).toBeInViewport();
  await expect(task).not.toHaveAttribute("data-highlight");
});

test("US1 FR-015b FR-037 click without scripts reaches the task through the fragment", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 480 } });
  const page = await context.newPage();
  try {
    const { url } = await serve("mixed");
    await page.goto(url);
    const task = taskRow(page, "002-beta/T017");
    await expect(task).toBeHidden();
    const cell = grid(page).locator('a[data-key="002-beta/T017"]');
    const href = await cell.getAttribute("href");
    expect(href).toMatch(/^#task-/);
    await expect(task).toHaveAttribute("id", href.slice(1));
    await cell.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(tree(page).locator('details[data-key="002-beta/p4"]')).toHaveAttribute("open", "");
    await expect(tree(page).locator('details[data-key="002-beta/p4/US3"]')).toHaveAttribute("open", "");
    await expect(task).toBeInViewport();
  } finally {
    await context.close();
  }
});

test("US1 FR-015b large grid: 2,000 tasks show one row per feature", async ({ page }) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-large-"));
  await generateLarge(dir);
  server = await startServe(dir);
  await page.goto(server.url);
  await expect(grid(page)).toHaveAttribute("data-layout", "rows");
  await expect(grid(page).locator(':scope > [data-part="row"]')).toHaveCount(FEATURES);
  await expect(grid(page).locator('[data-part="row"]').first().locator('[data-part="label"]')).toHaveText("Feature 1");
  await expect(grid(page).locator("a[data-key]")).toHaveCount(2000);
  // Squares in rows keep the click behavior.
  await grid(page).locator('a[data-key="050-feature-50/T001"]').click();
  await expect(taskRow(page, "050-feature-50/T001")).toBeInViewport();
});
