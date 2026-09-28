// 003 US3 — Read the documentation on a website (spec 003, User Story 3).
// Builds the site with `pnpm run docs:build`, serves `site/` under
// /speckit-eye/ as GitHub Pages would, and checks the home page, the
// navigation, the guide pages and every internal link (quickstart §4).
// The /status/ dashboard is covered by the US4 part of this suite.

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { E2E_PORT, REPO_ROOT, serveStatic } from "./helpers.js";

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
