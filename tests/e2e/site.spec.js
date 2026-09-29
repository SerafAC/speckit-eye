// 003 US3 — Read the documentation on a website (spec 003, User Story 3).
// 003 US4 — See the project's own status and a live demo (User Story 4).
// Builds the site with `pnpm run docs:build`, serves `site/` under
// /speckit-eye/ as GitHub Pages would, and checks the home page, the
// navigation, the guide pages and every internal link (quickstart §4), then
// this repository's own dashboard under /status/ (the US4 part below).

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { E2E_PORT, REPO_ROOT, countCheckboxes, featurePagePath, pressSearchShortcut, serveStatic } from "./helpers.js";

const WINDOWS = process.platform === "win32";
const SITE_DIR = path.join(REPO_ROOT, "site");
const BASE = "/speckit-eye/";
const STATUS = `${BASE}status/`;
const GUIDES = [
  { name: "Usage", path: `${BASE}usage/` },
  { name: "Hosting a snapshot", path: `${BASE}hosting/` },
  { name: "Architecture", path: `${BASE}architecture/` },
  { name: "Releasing", path: `${BASE}releasing/` },
];

// The docs build runs once for the whole suite.
test.describe.configure({ mode: "serial", timeout: 120_000 });

/**
 * Runs a command in the repository to completion. `pnpm` is a `.cmd` shim on
 * Windows, which only a shell can start.
 * @param {string} command
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: REPO_ROOT, shell: WINDOWS, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** @type {import("./helpers.js").StaticHandle} */
let host;

test.beforeAll(async () => {
  const build = await run("pnpm", ["run", "docs:build"]);
  expect(build.code, `${build.stdout}\n${build.stderr}`).toBe(0);
  host = await serveStatic(SITE_DIR, BASE, { port: E2E_PORT });
});

test.afterAll(async () => {
  await host?.close();
});

test("003 US3 FR-021 the home page links to every guide, npm, GitHub and the dashboard", async ({ page }) => {
  await page.goto(`${host.origin}${BASE}`);
  const main = page.locator("main");
  await expect(main.locator('a[href="https://www.npmjs.com/package/speckit-eye"]').first()).toBeVisible();
  await expect(main.locator('a[href="https://github.com/SerafAC/speckit-eye"]').first()).toBeVisible();
  await expect(main.getByRole("link", { name: "Project status & live demo" }).first()).toHaveAttribute(
    "href",
    "https://serafac.github.io/speckit-eye/status/",
  );
  // SC-006: every guide is one click from the home page.
  for (const guide of GUIDES) {
    await page.goto(`${host.origin}${BASE}`);
    await main.getByRole("link", { name: guide.name, exact: true }).first().click();
    await expect(page).toHaveURL(`${host.origin}${guide.path}`);
    await expect(page.locator("main h1:visible").first()).toBeVisible();
  }
});

test("003 US3 FR-021 the navigation lists every guide plus Contributing and Development", async ({ page }) => {
  await page.goto(`${host.origin}${GUIDES[0].path}`);
  const nav = page.locator("nav.sidebar-nav");
  for (const guide of GUIDES) {
    const link = nav.getByRole("link", { name: guide.name, exact: true });
    await expect(link).toHaveCount(1);
    expect(new URL(/** @type {string} */ (await link.getAttribute("href")), page.url()).pathname).toBe(guide.path);
  }
  await expect(nav.getByRole("link", { name: "Contributing" })).toHaveAttribute(
    "href",
    "https://github.com/SerafAC/speckit-eye/blob/main/CONTRIBUTING.md",
  );
  await expect(nav.getByRole("link", { name: "Development" })).toHaveAttribute(
    "href",
    "https://github.com/SerafAC/speckit-eye/blob/main/DEVELOPMENT.md",
  );
});

test("003 US3 FR-023 the site has no broken internal links", async ({ page, request }) => {
  const seen = new Set([BASE]);
  const queue = [BASE];
  /** @type {string[]} */
  const broken = [];
  while (queue.length > 0) {
    const pathname = /** @type {string} */ (queue.shift());
    const response = await request.get(`${host.origin}${pathname}`);
    if (response.status() !== 200) {
      broken.push(`${pathname} → ${response.status()}`);
      continue;
    }
    if (!(response.headers()["content-type"] ?? "").startsWith("text/html")) continue;
    await page.goto(`${host.origin}${pathname}`);
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll("[href], [src]")].map((el) => {
        const raw = el.getAttribute("href") ?? el.getAttribute("src") ?? "";
        return new URL(raw, document.baseURI).href;
      }),
    );
    for (const target of targets) {
      const url = new URL(target);
      if (url.origin !== host.origin || !url.pathname.startsWith(BASE) || url.pathname.startsWith(STATUS)) continue;
      if (!seen.has(url.pathname)) {
        seen.add(url.pathname);
        queue.push(url.pathname);
      }
    }
  }
  expect(broken).toEqual([]);
  // The crawl reached the home page, every guide and the screenshot.
  for (const p of [...GUIDES.map((g) => g.path), `${BASE}assets/screenshot.png`]) expect(seen).toContain(p);
});

test("003 US3 FR-020 a guide page shows the text of its docs/ file", async ({ page }) => {
  const source = await readFile(path.join(REPO_ROOT, "docs", "usage.md"), "utf8");
  const title = /^# (.+)$/m.exec(source)?.[1];
  const section = /^## (.+)$/m.exec(source)?.[1];
  expect(title && section).toBeTruthy();
  await page.goto(`${host.origin}${BASE}usage/`);
  await expect(page.locator("main h1:visible", { hasText: /** @type {string} */ (title) })).toBeVisible();
  await expect(page.locator("main h2:visible", { hasText: /** @type {string} */ (section) }).first()).toBeVisible();
});

test("003 US3 FR-023 docmd validate passes", async () => {
  const validate = await run("pnpm", ["exec", "docmd", "validate"]);
  expect(validate.code, `${validate.stdout}\n${validate.stderr}`).toBe(0);
});

// ---- US4: the dashboard of this repository under /status/ ----

/** The production address of the docs site, as package.json `homepage` has it. */
const SITE_URL = "https://serafac.github.io/speckit-eye/";

/**
 * Answers requests for the production site from the local copy, so links to
 * `SITE_URL` (the dashboard's Home link) can be followed offline.
 * @param {import("@playwright/test").Page} page
 */
async function routeProductionToLocal(page) {
  await page.route(`${SITE_URL}**`, async (route) => {
    const local = new URL(route.request().url().slice(SITE_URL.length), `${host.origin}${BASE}`);
    route.fulfill({ response: await page.request.fetch(local.href) });
  });
}

/**
 * This repository's features with their checkbox counts, computed the way
 * self-counts.spec.js does (independently of src/parse).
 * @returns {Promise<{ dir: string, done: number, total: number }[]>}
 */
async function repositoryCounts() {
  const specsDir = path.join(REPO_ROOT, "specs");
  const dirs = (await readdir(specsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const out = [];
  for (const dir of dirs) {
    let text;
    try {
      text = await readFile(path.join(specsDir, dir, "tasks.md"), "utf8");
    } catch {
      continue;
    }
    out.push({ dir, ...countCheckboxes(text) });
  }
  return out;
}

test("003 US4 FR-025 the dashboard of this repository is served at /status/", async ({ page }) => {
  await page.goto(`${host.origin}${STATUS}`);
  await expect(page.locator("main h1", { hasText: "Project overview" })).toBeVisible();
  const side = page.locator('[data-region="sidebar"]');
  await expect(side).toBeVisible();
  await expect(side.locator('[data-part="project-name"]')).toHaveText("speckit-eye");
  // This repository's features, including this one, are listed.
  await expect(side.locator('a[data-key="side:003-npm-release-docs-site"]')).toHaveCount(1);
  await expect(page.locator("body")).toHaveAttribute("data-base", STATUS);
});

test("003 US4 FR-025 the dashboard counts match this repository's tasks.md checkboxes", async ({ page }) => {
  const counts = await repositoryCounts();
  expect(counts.length).toBeGreaterThan(0);
  const sum = counts.reduce((acc, c) => ({ done: acc.done + c.done, total: acc.total + c.total }), { done: 0, total: 0 });
  await page.goto(`${host.origin}${STATUS}`);
  const stats = page.locator('[data-region="stats"]');
  // SC-007: the published status equals the repository's checkboxes.
  await expect(stats.locator('[data-stat="percent"] [data-part="detail"]')).toHaveText(`${sum.done} of ${sum.total} tasks`);
  await expect(stats.locator('[data-stat="open"] [data-part="value"]')).toHaveText(String(sum.total - sum.done));
  for (const { dir, done, total } of counts) {
    const count = page.locator(`[data-region="tree"] details[data-key="${dir}"] > summary [data-part="count"]`);
    if (total > 0) await expect(count, dir).toHaveText(`${done}/${total}`);
  }
});

test("003 US4 FR-027 every link, style, font and script of the dashboard loads under /status/", async ({ page, request }) => {
  /** @type {string[]} */
  const failed = [];
  /** @type {Set<string>} */
  const loaded = new Set();
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== host.origin) return;
    loaded.add(url.pathname);
    if (response.status() !== 200) failed.push(`${url.pathname} → ${response.status()}`);
  });
  page.on("requestfailed", (req) => failed.push(`${req.url()} → ${req.failure()?.errorText}`));

  const pages = [STATUS, `${STATUS}${featurePagePath("003-npm-release-docs-site")}`, `${STATUS}features/003-npm-release-docs-site/spec.html`];
  /** @type {Set<string>} */
  const targets = new Set();
  for (const pathname of pages) {
    await page.goto(`${host.origin}${pathname}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    const urls = await page.evaluate(() =>
      [...document.querySelectorAll("[href], [src]")].map((el) => new URL(el.getAttribute("href") ?? el.getAttribute("src") ?? "", document.baseURI).href),
    );
    for (const target of urls) {
      const url = new URL(target);
      if (url.origin === host.origin) targets.add(url.pathname);
    }
  }
  // Every same-origin link stays under /status/ and answers 200.
  /** @type {string[]} */
  const broken = [];
  for (const pathname of targets) {
    if (!pathname.startsWith(STATUS)) broken.push(`${pathname} is outside ${STATUS}`);
    const response = await request.get(`${host.origin}${pathname}`);
    if (response.status() !== 200) broken.push(`${pathname} → ${response.status()}`);
  }
  expect(broken).toEqual([]);
  expect(failed).toEqual([]);
  for (const asset of ["assets/styles.css", "assets/theme.js", "assets/app.js"]) expect(loaded).toContain(`${STATUS}${asset}`);
  expect([...loaded].some((p) => p.startsWith(`${STATUS}assets/fonts/`) && p.endsWith(".woff2"))).toBe(true);

  // The scripts work under the sub-path: search finds a task, the theme switch switches.
  await page.goto(`${host.origin}${STATUS}`);
  await pressSearchShortcut(page);
  const dialog = page.locator('dialog[data-region="search"]');
  await expect(dialog).toHaveJSProperty("open", true);
  await dialog.locator('input[data-part="query"]').fill("T029");
  await expect(dialog.locator('[data-part="group"][data-group="Tasks"] [data-part="result"]').first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveJSProperty("open", false);

  const html = page.locator("html");
  for (const theme of ["dark", "light"]) {
    await page.locator(`[data-region="sidebar"] [data-theme-choice="${theme}"]`).click();
    await expect(html).toHaveAttribute("data-theme", theme);
  }
});

test("003 US4 FR-027 the Home link returns to the documentation home", async ({ page }) => {
  await routeProductionToLocal(page);
  for (const pathname of [STATUS, `${STATUS}features/003-npm-release-docs-site/spec.html`]) {
    await page.goto(`${host.origin}${pathname}`);
    const home = page.locator('[data-region="sidebar"] [data-part="home"], [data-region="rail"] [data-part="home"]');
    await expect(home).toHaveCount(1);
    await expect(home).toHaveAttribute("href", SITE_URL);
    await home.click();
    await expect(page).toHaveURL(SITE_URL);
    await expect(page.locator("main").getByRole("link", { name: "Project status & live demo" }).first()).toBeVisible();
  }
});

test("003 US4 FR-026 the docs home and README link to the dashboard", async ({ page }) => {
  await page.goto(`${host.origin}${BASE}`);
  const link = page.locator("main").getByRole("link", { name: "Project status & live demo" }).first();
  const href = /** @type {string} */ (await link.getAttribute("href"));
  expect(new URL(href, page.url()).pathname).toBe(STATUS);
  const readme = await readFile(path.join(REPO_ROOT, "README.md"), "utf8");
  expect(readme).toContain(`${SITE_URL}status/`);
  expect(readme).toContain(`[Project status & live demo](${SITE_URL}status/)`);
  expect(readme).toContain(`[Documentation](${SITE_URL})`);
});
