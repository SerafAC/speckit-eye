// Narrow screens (spec 002 FR-009, FR-010, FR-024, FR-026, FR-031, FR-032,
// FR-039, FR-050, SC-009; quickstart Scenario 8). Runs in the
// `chromium-mobile` project (playwright.config.js): 375 × 812 with touch.
// Every test drives the real CLI against a temporary copy of a fixture
// (tests/fixtures/projects/README.md) or of this repository's specs.

import { test, expect } from "@playwright/test";
import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, checkHitTargets, copyFixture, featurePagePath, sidebar, startServe } from "./helpers.js";

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

/** Copies this repository's `specs/` and `.specify/` and serves the copy. */
async function serveRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-repo-"));
  await cp(path.join(REPO_ROOT, "specs"), path.join(dir, "specs"), { recursive: true });
  await cp(path.join(REPO_ROOT, ".specify"), path.join(dir, ".specify"), { recursive: true });
  server = await startServe(dir);
  return { dir, url: server.url };
}

/** Pages of every type in the `mixed` fixture. */
const MIXED_PAGES = [
  "",
  featurePagePath("002-beta"),
  featurePagePath("004-delta"),
  "features/002-beta/spec.html",
  "features/002-beta/plan.html",
  "features/002-beta/tasks.html",
  "constitution.html",
  "assessments/speckit-dashboard/intake.html",
];

/** Pages of this repository with long tables, code and many documents. */
const REPO_PAGES = [
  featurePagePath("002-dashboard-redesign"),
  "features/002-dashboard-redesign/spec.html",
  "features/002-dashboard-redesign/plan.html",
  "features/002-dashboard-redesign/tasks.html",
  "features/002-dashboard-redesign/contracts/routes.html",
];

const tree = (page) => page.locator('[data-region="tree"]');
const map = (page) => page.locator('[data-region="taskmap"]');
const menu = (page) => page.locator('details[data-region="mobile-menu"]');

/** Whether the whole page scrolls sideways. */
const pageScrollsSideways = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

test("FR-009 SC-009 every page type has no horizontal page scroll at 375 px", async ({ page }) => {
  expect(page.viewportSize()?.width).toBe(375);
  const { url } = await serve("mixed");
  for (const p of MIXED_PAGES) {
    await page.goto(`${url}${p}`);
    expect(await pageScrollsSideways(page), p || "overview").toBe(false);
  }
  // With every tree row and phase open, and the map grouped.
  await page.goto(url);
  await page.locator('[data-part="depth"] button[data-depth="tasks"]').click();
  await map(page).locator('button[data-part="map-mode"]').click();
  expect(await pageScrollsSideways(page), "overview, all open").toBe(false);

  await server?.stop();
  const { url: repo } = await serveRepo();
  for (const p of REPO_PAGES) {
    await page.goto(`${repo}${p}`);
    expect(await pageScrollsSideways(page), p).toBe(false);
  }
  // The raw source of a document scrolls inside its own box.
  await page.goto(`${repo}features/002-dashboard-redesign/plan.html`);
  await page.locator('details[data-part="raw"] > summary').click();
  await expect(page.locator('details[data-part="raw"] pre')).toBeVisible();
  expect(await pageScrollsSideways(page), "raw markdown").toBe(false);
});

test("FR-009 sidebar is behind the menu control", async ({ page }) => {
  const { url } = await serve("mixed");
  for (const p of ["", featurePagePath("002-beta"), "features/002-beta/plan.html"]) {
    await page.goto(`${url}${p}`);
    await expect(sidebar(page)).toBeHidden();
    await expect(page.locator('[data-region="rail"]')).toBeHidden();
    const summary = menu(page).locator(":scope > summary");
    await expect(summary).toBeVisible();
    const box = await summary.boundingBox();
    expect(box?.y, p).toBeLessThanOrEqual(1);
    expect(box?.width, p).toBeGreaterThan(300);

    const features = menu(page).locator('nav[aria-label="Features"]');
    await expect(features).toBeHidden();
    await summary.tap();
    await expect(features).toBeVisible();
    await expect(features.locator("li")).toHaveCount(4);
    await expect(menu(page).getByRole("link", { name: "Overview", exact: true })).toBeVisible();
    await expect(menu(page).getByRole("link", { name: "Constitution", exact: true })).toBeVisible();
  }
  // A feature in the menu opens its page.
  await menu(page).locator('nav[aria-label="Features"]').getByRole("link", { name: /Gamma/ }).tap();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("003-gamma")}$`));
});

test("FR-010 tree comes before the map", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const treeBox = await tree(page).boundingBox();
  const mapBox = await map(page).boundingBox();
  expect(treeBox && mapBox).toBeTruthy();
  expect(treeBox.y + treeBox.height).toBeLessThanOrEqual(mapBox.y + 1);
  // One column: both start at the same left edge.
  expect(Math.abs(treeBox.x - mapBox.x)).toBeLessThan(40);
  // Page head, stats card and Up next come first.
  const order = await page.evaluate(() =>
    ["page-head", "stats", "up-next", "tree", "taskmap"].map((r) => document.querySelector(`[data-region="${r}"]`).getBoundingClientRect().top),
  );
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("FR-024 FR-026 tapping a square reveals its task without a tooltip", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const gamma = tree(page).locator('details[data-key="003-gamma"]');
  await expect(gamma).not.toHaveAttribute("open");
  const square = map(page).locator('a[data-key="003-gamma/T008"]');
  await square.scrollIntoViewIfNeeded();
  await square.tap();
  const row = tree(page).locator('li[data-key="003-gamma/T008"]');
  await expect(row).toHaveAttribute("data-selected", "");
  await expect(gamma).toHaveAttribute("open", "");
  await expect(tree(page).locator('details[data-key="003-gamma/p2"]')).toHaveAttribute("open", "");
  await expect(row).toBeInViewport();
  // No tooltip, also not after the hover delay.
  await page.waitForTimeout(800);
  await expect(page.locator('[data-region="tooltip"]')).toBeHidden();
});

test("FR-031 FR-032 tabs and phase rail scroll sideways inside their own area", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${featurePagePath("002-dashboard-redesign")}`);
  for (const selector of ['[data-region="tabs"]', '[data-region="tasks"] [data-part="rail"]']) {
    const area = page.locator(selector);
    await expect(area).toBeVisible();
    const box = await area.evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      overflow: getComputedStyle(el).overflowX,
      right: el.getBoundingClientRect().right,
    }));
    expect(box.scroll, selector).toBeGreaterThan(box.client);
    expect(["auto", "scroll"], selector).toContain(box.overflow);
    expect(box.right, selector).toBeLessThanOrEqual(375);
    const left = await area.evaluate((el) => {
      el.scrollLeft = 200;
      return el.scrollLeft;
    });
    expect(left, selector).toBeGreaterThan(0);
  }
  expect(await pageScrollsSideways(page)).toBe(false);
  // The last tab can be reached and opens its document.
  const tabs = page.locator('[data-region="tabs"] [data-part="tab"]');
  const last = tabs.last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test("FR-039 reader hides the contents panel and puts the document list behind a control", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}features/002-dashboard-redesign/spec.html`);
  await expect(page.locator('[data-region="toc"]')).toBeHidden();
  const list = page.locator('[data-region="doc-list"]');
  const groups = list.locator('details[data-part="doc-menu"] [data-part="doc-group"]');
  await expect(list.locator('[data-part="doc-groups"]')).toBeHidden();
  const control = list.locator('details[data-part="doc-menu"] > summary');
  await expect(control).toBeVisible();
  await expect(control).toHaveText("Documents");
  await expect(groups.first()).toBeHidden();
  await control.tap();
  await expect(groups.first()).toBeVisible();
  await expect(list.locator('details[data-part="doc-menu"] a[aria-current="page"]')).toContainText("Specification");
  // The reading column comes after the list and uses the width.
  const article = await page.locator('article[data-region="doc"]').boundingBox();
  expect(article?.width).toBeGreaterThan(300);
  await list.locator('details[data-part="doc-menu"]').getByRole("link", { name: "Implementation plan" }).tap();
  await expect(page).toHaveURL(/\/features\/002-dashboard-redesign\/plan\.html$/);
});

test("FR-050 buttons and links have hit targets of at least 36 px (squares excepted)", async ({ page }) => {
  await checkHitTargets(page, { serve, serveRepo, stop: () => server?.stop() });
});
