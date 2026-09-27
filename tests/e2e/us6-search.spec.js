// US6 — Find a task, feature or document with search (spec.md, User Story 6;
// quickstart Scenario 7). Every test drives the real CLI against a temporary
// copy of the `mixed` fixture (tests/fixtures/projects/README.md): 002-beta
// has T018 "Search box, depends on T011" (blocked), and its plan.md has the
// headings Summary and Technical Context and the body-only word "lighthouse".

import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { copyFixture, featurePagePath, runBuild, serveStatic, startServe } from "./helpers.js";

/** Live updates must show within this time (FR-001, SC-008). */
const LIVE_MS = 2_000;

/** @type {(() => Promise<unknown>)[]} */
let cleanup = [];

test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

/** Serves a fresh copy of `mixed`. */
async function serveMixed() {
  const dir = await copyFixture("mixed");
  const server = await startServe(dir);
  cleanup.push(() => server.stop());
  return { dir, url: server.url };
}

const dialog = (page) => page.locator('dialog[data-region="search"]');
const box = (page) => dialog(page).locator('input[data-part="query"]');
const group = (page, name) => dialog(page).locator(`[data-part="group"][data-group="${name}"]`);
const results = (page, name) => group(page, name).locator('[data-part="result"]');
const status = (page) => dialog(page).locator('[data-part="status"]');
const entry = (page) => page.locator('[data-region="sidebar"] [data-part="search"]');

/** Opens search with the shortcut (⌘K on macOS, Ctrl+K elsewhere). */
async function openByKey(page) {
  await page.keyboard.press("ControlOrMeta+k");
  await expect(dialog(page)).toHaveJSProperty("open", true);
}

/** Types a query into the open search box. */
async function query(page, text) {
  await box(page).fill(text);
}

test("US6 FR-049 Ctrl/⌘K and the sidebar entry open search with the cursor in the box; Escape closes and returns focus", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(url);
  await expect(entry(page)).toBeVisible();

  await entry(page).focus();
  await openByKey(page);
  await expect(box(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveJSProperty("open", false);
  await expect(entry(page)).toBeFocused();

  await entry(page).click();
  await expect(dialog(page)).toHaveJSProperty("open", true);
  await expect(box(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveJSProperty("open", false);
  await expect(entry(page)).toBeFocused();

  // The same on a document page, from its rail entry.
  await page.goto(`${url}features/002-beta/plan.html`);
  const railEntry = page.locator('[data-region="rail"] [data-part="search"]');
  await expect(railEntry).toBeVisible();
  await railEntry.click();
  await expect(box(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(railEntry).toBeFocused();
});

test("US6 FR-049a T018 is the first result with state mark, text and feature", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(url);
  await openByKey(page);
  // Both features have a T018: the full ID ranks them first, in page order,
  // ahead of tasks that merely mention T018.
  await query(page, "T018");
  const tasks = results(page, "Tasks");
  await expect(tasks.locator('[data-part="id"]')).toHaveText(["T018", "T018"]);
  await expect(tasks.first()).toHaveAttribute("aria-selected", "true");
  await expect(tasks.first().locator('[data-part="mark"]')).toHaveAttribute("data-state", "done");
  await expect(tasks.first().locator('[data-part="context"]')).toHaveText("001 · Alpha");
  const beta = tasks.nth(1);
  await expect(beta.locator('[data-part="mark"]')).toHaveAttribute("data-state", "blocked");
  await expect(beta.locator('[data-part="text"]')).toHaveText("Search box, depends on T011");
  await expect(beta.locator('[data-part="context"]')).toHaveText("002 · Beta");

  // One more word narrows to the one T018, still first.
  await query(page, "t018 box");
  await expect(tasks.locator('[data-part="id"]')).toHaveText(["T018"]);
  await expect(tasks.first().locator('[data-part="context"]')).toHaveText("002 · Beta");
});

test("US6 FR-049a every typed word must match across groups", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(url);
  await openByKey(page);

  await query(page, "search");
  await expect(results(page, "Tasks").locator('[data-part="id"]')).toHaveText(["T017", "T018", "T020"]);
  await expect(results(page, "Documents")).toHaveCount(1);
  await expect(results(page, "Documents").first()).toContainText("User Story 3 - Beta search");
  await expect(group(page, "Features")).toHaveCount(0);

  await query(page, "search TESTS");
  await expect(results(page, "Tasks").locator('[data-part="id"]')).toHaveText(["T020"]);
  await expect(group(page, "Documents")).toHaveCount(0);

  await query(page, "beta");
  await expect(results(page, "Features")).toHaveCount(1);
  await expect(results(page, "Features").first()).toContainText("002 · Beta");
  await query(page, "technical context");
  await expect(results(page, "Documents")).toHaveCount(1);
  await expect(results(page, "Documents").first()).toContainText("Technical Context");
  await expect(group(page, "Tasks")).toHaveCount(0);
});

test("US6 FR-049b Enter on a task opens its feature page with the task selected and in view", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(url);
  await openByKey(page);
  await query(page, "T018 search box");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${url}${featurePagePath("002-beta")}#task-002-beta-T018`);
  const row = page.locator('details[data-part="task"][data-id="T018"]');
  await expect(row).toHaveAttribute("data-selected", "");
  await expect(row).toHaveJSProperty("open", true);
  await expect(row).toBeInViewport();
});

test("US6 FR-049b a heading result opens the reader at that heading", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(url);
  await openByKey(page);
  await query(page, "technical");
  const heading = results(page, "Documents").first();
  await expect(heading).toContainText("Technical Context");
  await heading.click();
  await expect(page).toHaveURL(`${url}features/002-beta/plan.html#technical-context`);
  const target = page.locator('article[data-region="doc"] #technical-context');
  await expect(target).toHaveText(/Technical Context/);
  await expect(target).toBeInViewport();

  // Keyboard: a feature by arrow keys and Enter.
  await openByKey(page);
  await query(page, "gamma");
  await expect(results(page, "Features")).toHaveCount(1);
  const options = dialog(page).locator('[role="option"]');
  const index = await options.evaluateAll((all) => all.findIndex((o) => o.getAttribute("data-type") === "feature"));
  for (let i = 0; i < index; i++) await page.keyboard.press("ArrowDown");
  await expect(results(page, "Features").first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${url}${featurePagePath("003-gamma")}`);
});

test("US6 FR-049a no match shows the message", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(url);
  await openByKey(page);
  await query(page, "zzqx nothing");
  await expect(status(page)).toHaveText('No results for "zzqx nothing"');
  await expect(dialog(page).locator('[role="option"]')).toHaveCount(0);
});

test("US6 FR-049a a word only in a document body finds nothing", async ({ page }) => {
  const { url } = await serveMixed();
  await page.goto(`${url}features/002-beta/plan.html`);
  await expect(page.locator('article[data-region="doc"]')).toContainText("lighthouse");
  await openByKey(page);
  await query(page, "lighthouse");
  await expect(status(page)).toHaveText('No results for "lighthouse"');
  await expect(dialog(page).locator('[role="option"]')).toHaveCount(0);
});

test("US6 FR-049c static build under /eye/ searches the same without other hosts", async ({ page }) => {
  const dir = await copyFixture("mixed");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-out-"));
  cleanup.push(() => rm(tmp, { recursive: true, force: true }));
  const out = path.join(tmp, "site");
  const built = await runBuild(dir, out, "/eye/");
  expect(built.code, built.stderr).toBe(0);
  const host = await serveStatic(out, "/eye/");
  cleanup.push(() => host.close());

  /** @type {string[]} */
  const requested = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto(`${host.url}${featurePagePath("001-alpha")}`);
  await openByKey(page);
  await query(page, "T018");
  await expect(results(page, "Tasks").first().locator('[data-part="id"]')).toHaveText("T018");
  expect(host.requests).toContain("/eye/assets/search-index.json");
  await query(page, "technical context");
  await expect(results(page, "Documents").first()).toHaveAttribute("href", "/eye/features/002-beta/plan.html#technical-context");
  await query(page, "T018 search box");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${host.url}${featurePagePath("002-beta")}#task-002-beta-T018`);
  await expect(page.locator('details[data-part="task"][data-id="T018"]')).toHaveAttribute("data-selected", "");

  for (const u of requested) expect(new URL(u).origin, u).toBe(host.origin);
  // Everything the page loads stays under the sub-path (the browser's own
  // favicon probe aside).
  for (const p of host.requests.filter((r) => r !== "/favicon.ico")) expect(p.startsWith("/eye/"), p).toBe(true);
});

test("US6 FR-049c a task added to tasks.md is found after the live update without reload", async ({ page }) => {
  const { dir, url } = await serveMixed();
  const connected = page.waitForResponse((r) => r.url().endsWith("/__events"));
  await page.goto(url);
  await connected;
  await openByKey(page);
  await query(page, "quokka");
  await expect(status(page)).toHaveText('No results for "quokka"');
  await page.keyboard.press("Escape");

  let navigated = false;
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) navigated = true;
  });
  const file = path.join(dir, "specs", "002-beta", "tasks.md");
  await writeFile(file, `${await readFile(file, "utf8")}\n- [ ] T021 Quokka migration\n`);
  await expect(page.locator('[data-region="tree"] li[data-key="002-beta/T021"]')).toHaveCount(1, { timeout: LIVE_MS });

  await openByKey(page);
  await query(page, "quokka");
  await expect(results(page, "Tasks").locator('[data-part="id"]')).toHaveText(["T021"]);
  expect(navigated, "no reload").toBe(false);
});
