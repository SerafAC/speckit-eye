// Pages without JavaScript (spec 002 FR-053, FR-048, SC-011; quickstart
// Scenario 8). Runs in the `chromium-nojs` project (playwright.config.js),
// whose browser has JavaScript disabled. Every test drives the real CLI
// against a temporary copy of a fixture (tests/fixtures/projects/README.md).

import { test, expect } from "@playwright/test";
import { cp, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, copyFixture, featurePagePath, sidebar, startServe } from "./helpers.js";

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

test.beforeEach(async ({ page }) => {
  // Without scripts, Playwright's "element is stable" check can stall while
  // an expand animation runs, so these tests turn motion off. Motion itself
  // is covered with scripts on (us1-overview.spec.js, FR-036).
  await page.emulateMedia({ reducedMotion: "reduce" });
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

const tree = (page) => page.locator('[data-region="tree"]');
const details = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
const summaryOf = (locator) => locator.locator(":scope > summary");

/**
 * Clicks a `<details>` summary and checks that it opened, then closed again.
 * @param {import("@playwright/test").Locator} el
 * @param {import("@playwright/test").Locator} [inside] shown only while open
 */
async function toggleOpenClose(el, inside) {
  await expect(el).not.toHaveAttribute("open");
  await summaryOf(el).click();
  await expect(el).toHaveAttribute("open", "");
  if (inside) await expect(inside).toBeVisible();
  await summaryOf(el).click();
  await expect(el).not.toHaveAttribute("open");
  if (inside) await expect(inside).toBeHidden();
}

test("FR-053 SC-011 overview tree, phases and task rows open and close without scripts", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  await expect(page.locator('[data-stat="percent"] [data-part="detail"]')).toHaveText("40 of 65 tasks");
  // The server opens the active chain: 002-beta and its active phase.
  await expect(details(page, "002-beta")).toHaveAttribute("open", "");
  await expect(details(page, "002-beta/p3")).toHaveAttribute("open", "");
  await expect(tree(page).locator('li[data-key="002-beta/T011"]')).toBeVisible();

  // A collapsed feature, then its phase with its task rows.
  const gamma = details(page, "003-gamma");
  await toggleOpenClose(gamma, gamma.locator('details[data-key="003-gamma/p1"]'));
  await summaryOf(gamma).click();
  const phase = details(page, "003-gamma/p1");
  await toggleOpenClose(phase, tree(page).locator('li[data-key="003-gamma/T001"]'));
  await summaryOf(phase).click();
  const row = tree(page).locator('li[data-key="003-gamma/T001"]');
  await expect(row).toBeVisible();
  // The task ID leads on to the feature page.
  await row.getByRole("link", { name: "T001" }).click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("003-gamma")}#task-003-gamma-T001$`));
});

test("FR-053 map squares jump to their tree rows", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  const { url } = await serve("mixed");
  await page.goto(url);
  const square = page.locator('[data-region="taskmap"] a[data-key="003-gamma/T008"]');
  const row = tree(page).locator('li[data-key="003-gamma/T008"]');
  await expect(row).toBeHidden();
  const href = await square.getAttribute("href");
  expect(href).toBe(`#${await row.getAttribute("id")}`);
  await square.click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));
  // The browser opens the collapsed feature and phase to show the target.
  await expect(details(page, "003-gamma")).toHaveAttribute("open", "");
  await expect(row).toBeInViewport();
});

test("FR-053 feature page tabs, phases, task rows and Show lines work", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(`${url}${featurePagePath("002-beta")}`);
  const tasks = page.locator('[data-region="tasks"]');
  const phase = (n) => tasks.locator(`#phase-${n}`);
  const row = (id) => tasks.locator(`details[data-part="task"][data-id="${id}"]`);

  // The active phase is open; another phase and a task row open and close.
  await expect(phase(3)).toHaveAttribute("open", "");
  await summaryOf(phase(4)).click();
  await expect(phase(4)).toHaveAttribute("open", "");
  await toggleOpenClose(row("T018"), row("T018").locator('[data-part="full-text"]'));
  await summaryOf(phase(4)).click();
  await expect(phase(4)).not.toHaveAttribute("open");
  await expect(row("T018")).toBeHidden();
  // Rail blocks link to their phase section.
  await tasks.locator('[data-part="rail"] a[href="#phase-1"]').click();
  await expect(page).toHaveURL(/#phase-1$/);

  // A task address opens and shows the task row.
  await page.goto(`${url}${featurePagePath("002-beta")}#task-002-beta-T017`);
  await expect(row("T017")).toBeInViewport();

  // Tabs are links.
  const tabs = page.locator('[data-region="tabs"]');
  await tabs.getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/features\/002-beta\/plan\.html$/);
  await expect(page.locator('article[data-region="doc"] h1')).toBeVisible();

  // Warnings: "Show lines" opens and closes.
  await server?.stop();
  const { url: odd } = await serve("nonstandard");
  await page.goto(`${odd}${featurePagePath("001-odd")}`);
  const lines = page.locator('[data-part="warnings"] details[data-part="show-lines"]').first();
  await toggleOpenClose(lines, lines.locator("ol"));
});

test("FR-053 reader clarification sessions, stories, Show more answers and Raw markdown open and close", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}features/002-dashboard-redesign/spec.html`);
  const article = page.locator('article[data-region="doc"]');
  const formatted = article.locator('[data-part="formatted"]');

  const session = formatted.locator('details[data-part="session"]').first();
  await expect(session).toHaveAttribute("open", "");
  await summaryOf(session).click();
  await expect(session).not.toHaveAttribute("open");
  await summaryOf(session).click();
  await expect(session).toHaveAttribute("open", "");

  const more = session.locator('details[data-part="more"]');
  await toggleOpenClose(more, more.locator('li[data-part="answer"]').first());

  const story = formatted.locator('details[data-part="story"]').last();
  const wasOpen = await story.evaluate((d) => d.hasAttribute("open"));
  await summaryOf(story).click();
  await expect(story).toHaveJSProperty("open", !wasOpen);
  await summaryOf(story).click();
  await expect(story).toHaveJSProperty("open", wasOpen);

  // Every requirement is listed; the area chips need scripts and are not shown.
  await expect(formatted.locator('section[data-part="requirements"] [data-part="areas"]')).toBeHidden();
  expect(await formatted.locator('li[data-part="requirement"]:visible').count()).toBeGreaterThan(50);

  const raw = article.locator('details[data-part="raw"]');
  await toggleOpenClose(raw, raw.locator("pre"));
  // "Expand all" needs scripts and is not shown.
  await expect(article.locator('button[data-part="expand-all"]')).toBeHidden();
});

test("FR-053 FR-009 mobile menu opens without scripts", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const { url } = await serve("mixed");
  for (const path of ["", featurePagePath("002-beta"), "features/002-beta/plan.html"]) {
    await page.goto(`${url}${path}`);
    const menu = page.locator('details[data-region="mobile-menu"]');
    await expect(menu).toBeVisible();
    await expect(sidebar(page)).toBeHidden();
    const features = menu.locator('nav[aria-label="Features"]');
    await expect(features).toBeHidden();
    await summaryOf(menu).click();
    await expect(features).toBeVisible();
    await expect(menu.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
    await summaryOf(menu).click();
    await expect(features).toBeHidden();
  }
  // A link in the menu navigates.
  await page.goto(url);
  const menu = page.locator('details[data-region="mobile-menu"]');
  await summaryOf(menu).click();
  await menu.locator('nav[aria-label="Features"]').getByRole("link", { name: /Gamma/ }).click();
  await expect(page).toHaveURL(new RegExp(`/${featurePagePath("003-gamma")}$`));
});

test("FR-048 page follows the OS theme", async ({ page }) => {
  const { url } = await serve("mixed");
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  /** @param {string} rgb */
  const lightness = (rgb) => {
    const [r, g, b] = (rgb.match(/[\d.]+/g) ?? []).map(Number);
    return (r + g + b) / 3;
  };
  for (const path of ["", featurePagePath("002-beta"), "features/002-beta/plan.html"]) {
    await page.emulateMedia({ colorScheme: "light" });
    await page.goto(`${url}${path}`);
    await expect(page.locator("html")).not.toHaveAttribute("data-theme");
    const light = await background();
    await page.emulateMedia({ colorScheme: "dark" });
    const dark = await background();
    expect(lightness(light), `${path} light ${light}`).toBeGreaterThan(200);
    expect(lightness(dark), `${path} dark ${dark}`).toBeLessThan(60);
  }
});

test("FR-053 search entry, theme switch, order, depth and filters are not shown", async ({ page }) => {
  const { url } = await serve("mixed");
  await page.goto(url);
  const shell = sidebar(page);
  await expect(shell).toBeVisible();
  await expect(shell.locator('button[data-part="search"]')).toBeHidden();
  await expect(shell.locator('[data-part="theme"]')).toBeHidden();
  await expect(page.locator('button[data-part="order"]')).toBeHidden();
  await expect(page.locator('[data-part="depth"]')).toBeHidden();
  await expect(page.locator('[data-part="view-filter"]')).toBeHidden();
  await expect(page.locator('button[data-part="map-mode"]')).toBeHidden();
  // Ctrl/⌘K does nothing.
  await page.keyboard.press("ControlOrMeta+k");
  await expect(page.locator('dialog[data-region="search"]')).toBeHidden();

  await page.goto(`${url}${featurePagePath("002-beta")}`);
  await expect(sidebar(page).locator('button[data-part="search"]')).toBeHidden();
  await expect(sidebar(page).locator('[data-part="theme"]')).toBeHidden();
  await expect(page.locator('[data-region="tasks"] [data-part="filters"]')).toBeHidden();
  await expect(page.locator('[data-region="detail"]')).toBeHidden();
  // Every task is listed.
  await expect(page.locator('[data-region="tasks"] details[data-part="task"]')).toHaveCount(20);

  await page.goto(`${url}features/002-beta/plan.html`);
  const rail = page.locator('[data-region="rail"]');
  await expect(rail).toBeVisible();
  await expect(rail.locator('button[data-part="search"]')).toBeHidden();
  await expect(rail.locator('[data-part="theme"]')).toBeHidden();
});
