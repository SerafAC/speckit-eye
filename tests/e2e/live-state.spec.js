// Live updates keep the view state (spec 002 FR-051, SC-008; quickstart
// Scenario 6) and the live-update behavior of spec 001 still works (FR-001:
// 001 FR-026 to FR-030, 001 US2). Every test drives the real CLI against a
// temporary copy of a fixture (tests/fixtures/projects/README.md: `mixed` has
// 40/65 tasks, 002-beta active with T011 next and T018 blocked by T011) and
// changes files on disk while the page is open.

import { test, expect } from "@playwright/test";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, copyFixture, featurePagePath, sidebar, startServe } from "./helpers.js";

/** Live updates must show within this time (FR-001, SC-008). */
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

/**
 * Copies this repository's `specs/` and `.specify/` into a temporary folder
 * and serves it (the reader's structured `spec.md` view needs a real spec).
 */
async function serveRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-repo-"));
  await cp(path.join(REPO_ROOT, "specs"), path.join(dir, "specs"), { recursive: true });
  await cp(path.join(REPO_ROOT, ".specify"), path.join(dir, ".specify"), { recursive: true });
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

/**
 * Opens a page and waits until its live connection is open (the hello was received).
 * @param {import("@playwright/test").Page} page
 * @param {string} url
 */
async function openLive(page, url) {
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
}

// Overview
const summary = (page) => page.locator('[data-stat="percent"] [data-part="detail"]');
const percent = (page) => page.locator('[data-stat="percent"] [data-part="value"]');
const tree = (page) => page.locator('[data-region="tree"]');
const details = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
const taskRow = (page, key) => tree(page).locator(`li[data-key="${key}"]`);
const orderButton = (page) => page.locator('button[data-part="order"]');
const orderLabel = (page) => orderButton(page).locator('[data-part="order-label"]');
const depthButton = (page, depth) => page.locator(`[data-part="depth"] button[data-depth="${depth}"]`);
const filterButton = (page, filter) => page.locator(`[data-part="view-filter"] button[data-filter="${filter}"]`);
const map = (page) => page.locator('[data-region="taskmap"]');
const modeButton = (page) => map(page).locator('button[data-part="map-mode"]');
const banner = (page) => page.locator('[data-region="live-status"]');

/** Opens the overview of `mixed` and waits for the live connection. */
async function openOverview(page, url) {
  await openLive(page, url);
  await expect(summary(page)).toHaveText("40 of 65 tasks");
}

/** Folder names of the tree's feature rows, in document order. */
const treeOrder = (page) =>
  tree(page)
    .locator("li[data-feature]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-feature")));

/** data-key of every open <details> in the tree, in document order. */
const openKeys = (page) =>
  tree(page)
    .locator("details[open]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));

// Feature page
const featureHead = (page) => page.locator('[data-region="feature-head"]');
const tasks = (page) => page.locator('[data-region="tasks"]');
const chip = (page, value) => tasks(page).locator(`[data-part="filters"] button[data-filter-chip="${value}"]`);
const textFilter = (page) => tasks(page).locator('input[data-part="text-filter"]');
const railBlock = (page, short) =>
  tasks(page).locator('[data-part="rail"] [data-part="block"]').filter({ has: page.locator(`[data-part="short"]:text-is("${short}")`) });
const phase = (page, n) => tasks(page).locator(`#phase-${n}`);
const row = (page, id) => tasks(page).locator(`details[data-part="task"][data-id="${id}"]`);
const detail = (page) => tasks(page).locator('[data-region="detail"]');

/** IDs of the task rows that are not filtered out, in document order. */
const visibleIds = (page) =>
  tasks(page)
    .locator('details[data-part="task"]:not([data-filtered-out])')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));

/** data-key of every open phase. */
const openPhases = (page) =>
  tasks(page)
    .locator('details[data-part="phase"][open]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));

// ---------------------------------------------------------------------------
// View state of every page (FR-051, SC-008)
// ---------------------------------------------------------------------------

test("US1 FR-020 FR-051 order, filter, depth, expanded rows and tree scroll survive a live update", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);

  // Order "Name A–Z", "Open tasks only", depth "Tasks".
  for (let i = 0; i < 3; i++) await orderButton(page).click();
  await expect(orderLabel(page)).toHaveText("Name A–Z");
  await filterButton(page, "open").click();
  await depthButton(page, "tasks").click();
  const order = await treeOrder(page);
  expect(order).toEqual(["001-alpha", "002-beta", "004-delta", "003-gamma"]);
  const open = await openKeys(page);

  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });
  await expect(orderLabel(page)).toHaveText("Name A–Z");
  expect(await treeOrder(page)).toEqual(order);
  await expect(tree(page)).toHaveAttribute("data-filter", "open");
  await expect(filterButton(page, "open")).toHaveAttribute("aria-pressed", "true");
  await expect(depthButton(page, "tasks")).toHaveAttribute("aria-pressed", "true");
  expect(await openKeys(page)).toEqual(open);
  // The filter applies to the new content: T011 is done now and hidden.
  await expect(taskRow(page, "002-beta/T011")).toBeHidden();
  await expect(taskRow(page, "002-beta/T012")).toBeVisible();

  // Rows toggled by hand (which clears the depth), the filter set back to
  // all, and the tree card's scroll.
  await filterButton(page, "all").click();
  await details(page, "003-gamma/p2").locator(":scope > summary").click();
  await expect(details(page, "003-gamma/p2")).not.toHaveAttribute("open");
  await expect(page.locator('[data-part="depth"] button[aria-pressed="true"]')).toHaveCount(0);
  const scrollTop = await tree(page).evaluate((el) => {
    el.scrollTop = 120;
    return el.scrollTop;
  });
  expect(scrollTop).toBeGreaterThan(50);
  const openBefore = await openKeys(page);

  await tickOnDisk(dir, "002-beta", ["T012"]);
  await expect(summary(page)).toHaveText("42 of 65 tasks", { timeout: LIVE_MS });
  await expect(details(page, "003-gamma/p2")).not.toHaveAttribute("open");
  expect(await openKeys(page)).toEqual(openBefore);
  await expect(page.locator('[data-part="depth"] button[aria-pressed="true"]')).toHaveCount(0);
  expect(await tree(page).evaluate((el) => el.scrollTop)).toBe(scrollTop);
  await expect(orderLabel(page)).toHaveText("Name A–Z");
  await expect(tree(page)).toHaveAttribute("data-filter", "all");
  await expect(filterButton(page, "all")).toHaveAttribute("aria-pressed", "true");
});

test("US2 FR-028 FR-051 map mode survives a live update", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
  await modeButton(page).click();
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");

  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  await expect(modeButton(page)).toHaveText("Stack all");
  await expect(modeButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(map(page).locator('[data-part="group-head"] [data-part="count"]')).toHaveText(["30/30", "11/20", "0/15"]);
  // T018 is no longer blocked in the map.
  await expect(map(page).locator('a[data-key="002-beta/T018"]')).toHaveAttribute("data-state", "open");
});

test("US3 FR-051 feature filters, text filter, open phase, selected task and list scroll survive a live update", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  const { dir, url } = await serveMixed();
  await openLive(page, `${url}${featurePagePath("002-beta")}`);
  await expect(tasks(page).locator('[data-part="filters"]')).toBeVisible();

  // Open phase 4 in the rail, select T018 (blocked by T011), scroll.
  await railBlock(page, "P4").click();
  expect(await openPhases(page)).toEqual(["002-beta/p4"]);
  await row(page, "T018").locator(":scope > summary").click();
  await expect(row(page, "T018")).toHaveAttribute("data-selected", "");
  await expect(detail(page).locator('[data-part="status"]')).toHaveText("Blocked");
  await expect(detail(page).locator('[data-part="waiting"]')).toHaveText("Waiting on T011");
  const list = tasks(page).locator('[data-part="list"]');
  const scrolled = await page.evaluate(() => {
    window.scrollTo(0, 150);
    return window.scrollY;
  });
  expect(scrolled).toBeGreaterThan(50);
  const listScroll = await list.evaluate((el) => el.scrollTop);

  // quickstart Scenario 6: T011 is checked, so T018 is no longer blocked.
  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(featureHead(page).locator('[data-part="counts"]')).toContainText("11 / 20 tasks", { timeout: LIVE_MS });
  expect(await openPhases(page)).toEqual(["002-beta/p4"]);
  await expect(railBlock(page, "P4")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "T018")).toHaveAttribute("data-selected", "");
  await expect(row(page, "T018")).toHaveAttribute("open", "");
  await expect(row(page, "T018")).toHaveAttribute("data-state", "open");
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator('[data-part="id"]')).toHaveText("T018");
  await expect(detail(page).locator('[data-part="status"]')).not.toHaveText("Blocked");
  await expect(detail(page).locator('[data-part="waiting"]')).toBeHidden();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  expect(await list.evaluate((el) => el.scrollTop)).toBe(listScroll);

  // Chip "Open" and a text filter.
  await chip(page, "open").click();
  await textFilter(page).fill("T01");
  const matching = ["T012", "T013", "T014", "T015", "T016", "T017", "T018", "T019"];
  expect(await visibleIds(page)).toEqual(matching);
  const openWhileFiltering = await openPhases(page);

  await tickOnDisk(dir, "002-beta", ["T012"]);
  await expect(featureHead(page).locator('[data-part="counts"]')).toContainText("12 / 20 tasks", { timeout: LIVE_MS });
  await expect(chip(page, "open")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "open").locator('[data-part="count"]')).toHaveText("7");
  await expect(textFilter(page)).toHaveValue("T01");
  expect(await visibleIds(page)).toEqual(matching.slice(1));
  expect(await openPhases(page)).toEqual(openWhileFiltering);
  await expect(row(page, "T018")).toHaveAttribute("data-selected", "");

  // Clearing the filters returns to the phase open before filtering.
  await chip(page, "all").click();
  await textFilter(page).fill("");
  expect(await visibleIds(page)).toHaveLength(20);
  expect(await openPhases(page)).toEqual(["002-beta/p4"]);
});

test("US3 FR-051 deleting the selected task clears the selection", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openLive(page, `${url}${featurePagePath("002-beta")}#task-002-beta-T018`);
  await expect(row(page, "T018")).toHaveAttribute("data-selected", "");
  await expect(detail(page)).toBeVisible();

  const file = tasksFile(dir, "002-beta");
  const text = await readFile(file, "utf8");
  const without = text.replace(/^- \[ \] T018\b.*\n/m, "");
  expect(without).not.toBe(text);
  await writeFile(file, without);

  await expect(featureHead(page).locator('[data-part="counts"]')).toContainText("10 / 19 tasks", { timeout: LIVE_MS });
  await expect(row(page, "T018")).toHaveCount(0);
  await expect(tasks(page).locator('details[data-part="task"][data-selected]')).toHaveCount(0);
  await expect(detail(page)).toBeHidden();
  // The phase stays open and another task can be selected.
  expect(await openPhases(page)).toEqual(["002-beta/p4"]);
  await row(page, "T017").locator(":scope > summary").click();
  await expect(detail(page).locator('[data-part="id"]')).toHaveText("T017");
});

test("US5 FR-051 raw view, expansions and area chip survive a live update", async ({ page }) => {
  const { dir, url } = await serveRepo();
  const specFile = path.join(dir, "specs", "002-dashboard-redesign", "spec.md");
  const source = await readFile(specFile, "utf8");
  await openLive(page, `${url}features/002-dashboard-redesign/spec.html`);
  const article = page.locator('article[data-region="doc"]');
  const formatted = article.locator('[data-part="formatted"]');
  const reqs = formatted.locator('section[data-part="requirements"]');
  const raw = article.locator('details[data-part="raw"]');

  // Area chip "Theme", "Show 5 more answers", and a story card toggled by hand.
  await reqs.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(reqs.locator('li[data-part="requirement"]:visible')).toHaveCount(4);
  const more = formatted.locator('details[data-part="more"]').first();
  await more.locator(":scope > summary").click();
  await expect(more).toHaveAttribute("open", "");
  const story = formatted.locator('details[data-part="story"]').last();
  const storyWasOpen = await story.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open);
  await story.locator(":scope > summary").click();
  await expect.poll(() => story.evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open)).toBe(!storyWasOpen);

  await writeFile(specFile, `${source.trimEnd()}\n\nFirst live marker line.\n`);
  await expect(formatted).toContainText("First live marker line.", { timeout: LIVE_MS });
  await expect(reqs.getByRole("button", { name: "Theme", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(reqs.locator('li[data-part="requirement"]:visible')).toHaveCount(4);
  await expect(formatted.locator('details[data-part="more"]').first()).toHaveAttribute("open", "");
  expect(await formatted.locator('details[data-part="story"]').last().evaluate((d) => /** @type {HTMLDetailsElement} */ (d).open)).toBe(
    !storyWasOpen,
  );
  await expect(raw).not.toHaveAttribute("open");

  // The raw view stays open and shows the new source.
  await raw.locator(":scope > summary").click();
  await expect(raw.locator("pre")).toBeVisible();
  await expect(formatted).toBeHidden();
  await writeFile(specFile, `${source.trimEnd()}\n\nSecond live marker line.\n`);
  await expect(raw.locator("pre")).toContainText("Second live marker line.", { timeout: LIVE_MS });
  await expect(raw).toHaveAttribute("open", "");
  await expect(raw.locator("pre")).toBeVisible();
  await expect(formatted).toBeHidden();
});

test("FR-051 changed counts are briefly highlighted (stats, segments, sidebar)", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
  await tickOnDisk(dir, "002-beta", ["T011"]);

  const stat = page.locator('[data-region="stats"] [data-key="stat:percent"]');
  const segment = page.locator('[data-region="stats"] [data-part="segments"] a[data-key="seg:002-beta"]');
  const side = sidebar(page).locator('a[data-key="side:002-beta"]');
  await expect(stat).toHaveAttribute("data-changed", "", { timeout: LIVE_MS });
  await expect(segment).toHaveAttribute("data-changed", "");
  await expect(side).toHaveAttribute("data-changed", "");
  await expect(summary(page)).toHaveText("41 of 65 tasks");
  await expect(side.locator('[data-part="count"]')).toHaveText("9");
  // Unchanged items are not highlighted.
  await expect(page.locator('[data-part="segments"] a[data-key="seg:003-gamma"]')).not.toHaveAttribute("data-changed");
  await expect(sidebar(page).locator('a[data-key="side:003-gamma"]')).not.toHaveAttribute("data-changed");
  // The highlight is brief (~1.5 s).
  await expect(stat).not.toHaveAttribute("data-changed", { timeout: 3_000 });
  await expect(segment).not.toHaveAttribute("data-changed");
  await expect(side).not.toHaveAttribute("data-changed");
});

test("FR-001 SC-008 changes appear within 2 s", async ({ page }) => {
  test.setTimeout(120_000);
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
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
  // 95 % within 2 s.
  const fast = latencies.filter((ms) => ms <= LIVE_MS).length;
  expect(fast, `latencies (ms): ${latencies.join(", ")}`).toBeGreaterThanOrEqual(19);
});

// ---------------------------------------------------------------------------
// Live-update behavior kept from spec 001 (FR-001; 001 US2)
// ---------------------------------------------------------------------------

test("US2 AC1 a ticked task shows new counts within 2 s", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });
  await expect(details(page, "002-beta").locator(":scope > summary")).toContainText("11/20");
});

test("US2 AC2 scroll position and the viewer's expanded and collapsed items are kept", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 400 });
  const { dir, url } = await serveMixed();
  await openOverview(page, url);

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
  await openOverview(page, url);
  await tickOnDisk(dir, "002-beta", ["T011"]);

  const task = taskRow(page, "002-beta/T011");
  await expect(task).toHaveAttribute("data-changed", "", { timeout: LIVE_MS });
  await expect(task).toHaveAttribute("data-state", "done");
  await expect(details(page, "002-beta/p3")).toHaveAttribute("data-changed", "");
  await expect(details(page, "002-beta")).toHaveAttribute("data-changed", "");
  await expect(map(page).locator('[data-part="grid"] a[data-key="002-beta/T011"]')).toHaveAttribute("data-changed", "");
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
  await openLive(page, `${server.url}features/001-alpha/plan.html`);
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
  await openLive(page, `${server.url}features/002-beta/research.html`);
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
  await openOverview(page, url);
  await mkdir(path.join(dir, "specs", "005-new"));
  await writeFile(path.join(dir, "specs", "005-new", "spec.md"), "# Feature Specification: Newcomer\n");
  await expect(details(page, "005-new")).toBeVisible({ timeout: LIVE_MS });
  await expect(details(page, "005-new").locator(":scope > summary")).toContainText("Newcomer");
  await expect(sidebar(page).locator('a[data-key="side:005-new"]')).toBeVisible();
});

test("US2 FR-026 a deleted feature folder disappears from the tree", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
  await mkdir(path.join(dir, "specs", "005-new"));
  await writeFile(path.join(dir, "specs", "005-new", "spec.md"), "# Feature Specification: Newcomer\n");
  await expect(details(page, "005-new")).toBeVisible({ timeout: LIVE_MS });
  await rm(path.join(dir, "specs", "005-new"), { recursive: true, force: true });
  await expect(details(page, "005-new")).toHaveCount(0, { timeout: LIVE_MS });
  await expect(sidebar(page).locator('a[data-key="side:005-new"]')).toHaveCount(0);
});

test("US2 FR-026 a feature folder removed and re-created at the same path keeps updating", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
  const folder = path.join(dir, "specs", "002-beta");
  const saved = path.join(dir, "saved-002-beta");
  await cp(folder, saved, { recursive: true });
  // rm -rf + re-create (the new folder may even reuse the old inode number).
  await rm(folder, { recursive: true, force: true });
  await cp(saved, folder, { recursive: true });
  await expect(details(page, "002-beta")).toBeVisible({ timeout: LIVE_MS });
  await expect(summary(page)).toHaveText("40 of 65 tasks", { timeout: LIVE_MS });
  await page.waitForTimeout(300);
  await tickOnDisk(dir, "002-beta", ["T011"]);
  await expect(summary(page)).toHaveText("41 of 65 tasks", { timeout: LIVE_MS });

  // Another folder renamed into place over the removed one.
  const staged = path.join(dir, "staged-002-beta");
  await cp(folder, staged, { recursive: true });
  await rm(folder, { recursive: true, force: true });
  await rename(staged, folder);
  await page.waitForTimeout(300);
  await tickOnDisk(dir, "002-beta", ["T012"]);
  await expect(summary(page)).toHaveText("42 of 65 tasks", { timeout: LIVE_MS });
});

test("US2 AC6 save-by-rename and a burst of writes end on the final content", async ({ page }) => {
  const { dir, url } = await serveMixed();
  await openOverview(page, url);
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
  await openOverview(page, url);
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
