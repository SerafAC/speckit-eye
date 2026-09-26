// US2 — Explore every task on the task map (spec 002, User Story 2). Every
// test drives the real CLI against a temporary copy of a fixture
// (tests/fixtures/projects/README.md has the expected numbers: `mixed` has
// 65 tasks, 40 done, next 002-beta/T011, T018 blocked by T011). The large
// layouts are covered in scale.spec.js.

import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyFixture, startServe, featurePagePath } from "./helpers.js";

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

/** Copies a fixture and starts serve mode on it. */
async function serve(fixture) {
  const dir = await copyFixture(fixture);
  server = await startServe(dir);
  return { dir, url: server.url };
}

const LIVE_MS = 2_000;

const map = (page) => page.locator('[data-region="taskmap"]');
const card = (page) => map(page).locator('[data-part="card"]');
const squares = (page) => map(page).locator("a[data-state]");
const square = (page, key) => map(page).locator(`a[data-key="${key}"]`);
const modeButton = (page) => map(page).locator('button[data-part="map-mode"]');
const tooltip = (page) => page.locator('[data-region="tooltip"]');
const tree = (page) => page.locator('[data-region="tree"]');
const feature = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
const taskRow = (page, key) => tree(page).locator(`li[data-key="${key}"]`);

/** Moves the pointer onto the middle of an element. */
async function pointAt(page, locator) {
  const box = await locator.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

/** Moves the pointer to a spot away from the map. */
const pointAway = (page) => page.mouse.move(5, 5);

test("US2 FR-021 FR-023 map shows 65 squares and legend Done 40 · Open 23 · Blocked 1 · Next 1", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(squares(page)).toHaveCount(65);
  await expect(map(page).locator("h2")).toHaveText("Task map");
  const legend = map(page).locator('[data-part="legend"]');
  await expect(legend.locator("li")).toHaveText(["Done 40", "Open 23", "Blocked 1", "Next 1", "1 dot = 1 task"]);
  // Title and toggle sit above the card, the legend under the map.
  const head = await map(page).locator("header").boundingBox();
  const cardBox = await card(page).boundingBox();
  expect(head.y + head.height).toBeLessThanOrEqual(cardBox.y + 1);
  const grid = await map(page).locator('[data-part="grid"]').boundingBox();
  const legendBox = await legend.boundingBox();
  expect(grid.y + grid.height).toBeLessThanOrEqual(legendBox.y + 1);
  // Folder and task order, not the tree order.
  await expect(squares(page).first()).toHaveAttribute("data-key", "001-alpha/T001");
  await expect(squares(page).last()).toHaveAttribute("data-key", "003-gamma/T015");
});

test("US2 FR-021 By feature regroups into labelled blocks and Stack all restores", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(map(page)).toHaveAttribute("data-layout", "stacked");
  await expect(modeButton(page)).toHaveText("By feature");
  await expect(modeButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(map(page).locator('[data-part="group-head"]').first()).toBeHidden();
  const stacked = await square(page, "001-alpha/T001").boundingBox();
  expect(Math.round(stacked.width)).toBe(13);

  await modeButton(page).click();
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  await expect(modeButton(page)).toHaveText("Stack all");
  await expect(modeButton(page)).toHaveAttribute("aria-pressed", "true");
  const heads = map(page).locator('[data-part="group-head"]');
  await expect(heads).toHaveCount(3);
  await expect(heads.locator('[data-part="name"]')).toHaveText(["Alpha", "Beta", "Gamma"]);
  await expect(heads.locator('[data-part="count"]')).toHaveText(["30/30", "10/20", "0/15"]);
  const grouped = await square(page, "001-alpha/T001").boundingBox();
  expect(Math.round(grouped.width)).toBe(9);
  // Each block starts on its own line under its head.
  const betaHead = await heads.nth(1).boundingBox();
  const betaFirst = await square(page, "002-beta/T001").boundingBox();
  expect(betaFirst.y).toBeGreaterThan(betaHead.y + betaHead.height - 1);
  await expect(squares(page)).toHaveCount(65);

  await modeButton(page).click();
  await expect(map(page)).toHaveAttribute("data-layout", "stacked");
  await expect(modeButton(page)).toHaveText("By feature");
  await expect(heads.first()).toBeHidden();
});

test("US2 FR-024 square grows on hover and tooltip appears after 500 ms, not before", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const target = square(page, "002-beta/T014");
  const neighbour = square(page, "002-beta/T015");
  const before = await neighbour.boundingBox();

  // Record, in the page, when the pointer entered and when the tooltip showed.
  await page.evaluate(() => {
    const w = /** @type {any} */ (window);
    w.__entered = null;
    w.__shown = null;
    const tip = document.querySelector('[data-region="tooltip"]');
    document.querySelector('[data-region="taskmap"] a[data-key="002-beta/T014"]').addEventListener("pointerover", () => {
      w.__entered ??= performance.now();
    });
    new MutationObserver(() => {
      if (!tip.hidden) w.__shown ??= performance.now();
    }).observe(tip, { attributes: true, attributeFilter: ["hidden"] });
  });
  await pointAt(page, target);
  await page.waitForTimeout(300);
  await expect(tooltip(page)).toBeHidden();
  // Grown about 1.6× by now (120 ms transition), with the two-ring outline.
  const grown = await target.evaluate((el) => ({ transform: getComputedStyle(el).transform, shadow: getComputedStyle(el).boxShadow }));
  expect(grown.transform).toMatch(/^matrix\(1\.6, 0, 0, 1\.6,/);
  expect(grown.shadow.match(/rgb/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  // No other square changes.
  expect(await neighbour.boundingBox()).toEqual(before);
  expect(await neighbour.evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  await expect(tooltip(page)).toBeVisible();
  const delay = await page.evaluate(() => /** @type {any} */ (window).__shown - /** @type {any} */ (window).__entered);
  expect(delay).toBeGreaterThanOrEqual(400);
  expect(delay).toBeLessThanOrEqual(600);
  await expect(tooltip(page).locator('[data-part="id"]')).toHaveText("T014");
  await expect(tooltip(page).locator('[data-part="status"]')).toHaveText("Open");
  await expect(tooltip(page).locator('[data-part="text"]')).toHaveText("Detail view model");
  await expect(tooltip(page).locator('[data-part="feature"]')).toHaveText("Beta");
});

test("US2 FR-024 tooltip hides at once on leave", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await pointAt(page, square(page, "002-beta/T014"));
  await expect(tooltip(page)).toBeVisible();
  await pointAway(page);
  expect(await tooltip(page).evaluate((el) => el.hidden)).toBe(true);
});

test("US2 FR-024 FR-050 keyboard focus on a square shows the tooltip at once and Enter reveals the task in the tree", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const target = square(page, "003-gamma/T008");
  await expect(feature(page, "003-gamma")).not.toHaveAttribute("open");
  // Tab from the square before it moves keyboard focus onto the target.
  await square(page, "003-gamma/T007").focus();
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
  expect(await tooltip(page).evaluate((el) => el.hidden)).toBe(false);
  await expect(tooltip(page).locator('[data-part="id"]')).toHaveText("T008");
  const outline = await target.evaluate((el) => getComputedStyle(el).transform);
  expect(outline).not.toBe("none");

  await page.keyboard.press("Enter");
  await expect(feature(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(feature(page, "003-gamma/p2")).toHaveAttribute("open", "");
  await expect(taskRow(page, "003-gamma/T008")).toHaveAttribute("data-selected", "");
  await expect(taskRow(page, "003-gamma/T008")).toBeInViewport();
  expect(new URL(page.url()).hash).toBe("");
});

test("US2 FR-024 tooltips of first- and last-column squares are fully inside card and viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { url } = await serve("mixed");
  await page.goto(url);
  // The first square and the right-most square of the first row.
  const keys = await squares(page).evaluateAll((els) => {
    const boxes = els.map((el) => ({ key: el.dataset.key, ...el.getBoundingClientRect().toJSON() }));
    const top = boxes[0].top;
    const row = boxes.filter((b) => Math.abs(b.top - top) < 1);
    return [row[0].key, row.reduce((a, b) => (b.left > a.left ? b : a)).key];
  });
  expect(keys[0]).not.toBe(keys[1]);
  const cardBox = await card(page).boundingBox();
  for (const [key, align] of [
    [keys[0], "left"],
    [keys[1], "right"],
  ]) {
    await pointAt(page, square(page, key));
    await expect(tooltip(page)).toBeVisible();
    await expect(tooltip(page)).toHaveAttribute("data-align", align);
    const tip = await tooltip(page).boundingBox();
    const sq = await square(page, key).boundingBox();
    expect(tip.x).toBeGreaterThanOrEqual(cardBox.x - 0.5);
    expect(tip.x + tip.width).toBeLessThanOrEqual(cardBox.x + cardBox.width + 0.5);
    expect(tip.x).toBeGreaterThanOrEqual(0);
    expect(tip.x + tip.width).toBeLessThanOrEqual(1440);
    expect(tip.y).toBeGreaterThanOrEqual(0);
    // Above the square.
    expect(tip.y + tip.height).toBeLessThanOrEqual(sq.y + 1);
    await pointAway(page);
    await expect(tooltip(page)).toBeHidden();
  }
});

test("US2 FR-025 hovering a square in a collapsed feature tints its feature row", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(feature(page, "003-gamma")).not.toHaveAttribute("open");
  const summary = feature(page, "003-gamma").locator(":scope > summary");
  const plain = await summary.evaluate((el) => getComputedStyle(el).backgroundColor);
  await pointAt(page, square(page, "003-gamma/T008"));
  await expect(feature(page, "003-gamma")).toHaveAttribute("data-hl", "deepest");
  expect(await summary.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(plain);
  await expect(tree(page).locator("[data-hl]")).toHaveCount(1);

  // In the open active feature: ancestors lightly, the visible task row strongly.
  await pointAt(page, square(page, "002-beta/T012"));
  await expect(feature(page, "002-beta")).toHaveAttribute("data-hl", "ancestor");
  await expect(feature(page, "002-beta/p3")).toHaveAttribute("data-hl", "ancestor");
  await expect(taskRow(page, "002-beta/T012")).toHaveAttribute("data-hl", "deepest");
  await expect(feature(page, "003-gamma")).not.toHaveAttribute("data-hl");

  await pointAway(page);
  await expect(tree(page).locator("[data-hl]")).toHaveCount(0);
});

test("US2 FR-026 clicking a square in collapsed 003-gamma opens feature and phase, scrolls the tree card and outlines the row; its ID opens the feature page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(feature(page, "003-gamma")).not.toHaveAttribute("open");
  const scrollY = await page.evaluate(() => window.scrollY);

  await square(page, "003-gamma/T008").click();
  await expect(feature(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(feature(page, "003-gamma/p2")).toHaveAttribute("open", "");
  const row = taskRow(page, "003-gamma/T008");
  await expect(row).toHaveAttribute("data-selected", "");
  expect(await row.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  // The row is inside the tree card's visible area and the page did not move.
  const inCard = await row.evaluate((el) => {
    const card = el.closest('[data-region="tree"]').getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top >= card.top - 1 && r.bottom <= card.bottom + 1;
  });
  expect(inCard).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  expect(new URL(page.url()).hash).toBe("");

  // Another square moves the selection.
  await square(page, "002-beta/T017").click();
  await expect(taskRow(page, "002-beta/T017")).toHaveAttribute("data-selected", "");
  await expect(row).not.toHaveAttribute("data-selected");
  await expect(feature(page, "002-beta/p4/US3")).toHaveAttribute("open", "");

  // Clicking elsewhere clears it.
  await page.locator("main h1").click();
  await expect(tree(page).locator("[data-selected]")).toHaveCount(0);

  // The task's ID leads on to the feature page.
  await square(page, "003-gamma/T008").click();
  await row.locator('a[data-part="id"]').click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("003-gamma")}#task-003-gamma-T008$`));
});

test("US2 FR-022 T018 is blocked in map and tree and its tooltip pill reads Blocked", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const sq = square(page, "002-beta/T018");
  await expect(sq).toHaveAttribute("data-state", "blocked");
  await expect(taskRow(page, "002-beta/T018")).toHaveAttribute("data-state", "blocked");
  await expect(sq).toHaveAttribute("title", "T018 · Blocked — Search box, depends on T011 — Beta");
  // The blocked color differs from done, open and next.
  const look = (key) => square(page, key).evaluate((el) => `${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).boxShadow}`);
  const blocked = await look("002-beta/T018");
  for (const other of ["001-alpha/T001", "002-beta/T011", "002-beta/T012"]) expect(await look(other)).not.toBe(blocked);

  await sq.focus();
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page).locator('[data-part="status"]')).toHaveText("Blocked");
  await expect(tooltip(page).locator('[data-part="status"]')).toHaveAttribute("data-status", "blocked");
});

test("US2 FR-022 after checking T011 in tasks.md T018 becomes open", async ({ page }) => {
  const { dir, url } = await serve("mixed");
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await expect(square(page, "002-beta/T018")).toHaveAttribute("data-state", "blocked");
  const file = path.join(dir, "specs", "002-beta", "tasks.md");
  const text = await readFile(file, "utf8");
  await writeFile(file, text.replace("- [ ] T011", "- [x] T011"));
  await expect(square(page, "002-beta/T018")).toHaveAttribute("data-state", "open", { timeout: LIVE_MS });
  await expect(square(page, "002-beta/T011")).toHaveAttribute("data-state", "done");
  await expect(taskRow(page, "002-beta/T018")).toHaveAttribute("data-state", "open");
  await expect(map(page).locator('[data-part="legend"] li')).toHaveText(["Done 41", "Open 23", "Blocked 0", "Next 1", "1 dot = 1 task"]);
});

test("US2 FR-028 map mode is remembered after reload", async ({ page }) => {
  const { dir, url } = await serve("mixed");
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await modeButton(page).click();
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  const reconnected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.reload();
  await reconnected;
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  await expect(modeButton(page)).toHaveText("Stack all");

  // …and across a live update.
  const file = path.join(dir, "specs", "002-beta", "tasks.md");
  await writeFile(file, (await readFile(file, "utf8")).replace("- [ ] T011", "- [x] T011"));
  await expect(square(page, "002-beta/T011")).toHaveAttribute("data-state", "done", { timeout: LIVE_MS });
  await expect(map(page)).toHaveAttribute("data-layout", "grouped");
  await expect(modeButton(page)).toBeVisible();
});

test("US2 FR-024 checkbox without an ID shows \"Checkbox without a task ID\"", async ({ page }) => {
  const { url } = await serve("nonstandard");
  await page.goto(url);
  await expect(squares(page)).toHaveCount(9);
  const loose = map(page).locator('a[title^="No ID · "]');
  await expect(loose).toHaveCount(1);
  await pointAt(page, loose);
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page).locator('[data-part="id"]')).toHaveText("Checkbox without a task ID");
  await expect(tooltip(page).locator('[data-part="text"]')).toHaveText("Checkbox line without a task ID");
});

test("US2 FR-028 FR-026 without scripts every square keeps its color and its click reaches the task through the fragment", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 480 } });
  const page = await context.newPage();
  try {
    const { url } = await serve("mixed");
    await page.goto(url);
    await expect(modeButton(page)).toBeHidden();
    const colors = await squares(page).evaluateAll(
      (els) => new Set(els.map((el) => `${getComputedStyle(el).backgroundColor}|${getComputedStyle(el).boxShadow}`)).size,
    );
    expect(colors).toBe(4);
    const task = taskRow(page, "002-beta/T017");
    await expect(task).toBeHidden();
    const sq = square(page, "002-beta/T017");
    await expect(sq).toHaveAttribute("title", /^T017 · Open — Search index — Beta$/);
    const href = await sq.getAttribute("href");
    await expect(task).toHaveAttribute("id", href.slice(1));
    await sq.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(feature(page, "002-beta/p4")).toHaveAttribute("open", "");
    await expect(feature(page, "002-beta/p4/US3")).toHaveAttribute("open", "");
    await expect(task).toBeInViewport();
  } finally {
    await context.close();
  }
});
