// US4 — Publish a shareable snapshot from CI (spec.md, User Story 4).
// Every test builds a temporary copy of the `mixed` fixture with the real CLI
// and serves the output from a plain static file server under a sub-path
// (tests/e2e/helpers.js `serveStatic`), like GitHub Pages does.

import { test, expect } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BIN, REPO_ROOT, copyFixture, featurePagePath, hashTree, navLink, pressSearchShortcut, runBuild, serveStatic, sidebar, startServe } from "./helpers.js";
import { spawn } from "node:child_process";

const BASE = "/my-repo/";

/** Every page the `mixed` fixture builds (tests/fixtures/projects/README.md). */
const PAGES = [
  "index.html",
  "constitution.html",
  "assessments/speckit-dashboard/intake.html",
  "assessments/speckit-dashboard/decision.html",
  "features/001-alpha/spec.html",
  "features/001-alpha/plan.html",
  "features/001-alpha/tasks.html",
  "features/002-beta/spec.html",
  "features/002-beta/plan.html",
  "features/002-beta/tasks.html",
  "features/003-gamma/spec.html",
  "features/003-gamma/plan.html",
  "features/003-gamma/tasks.html",
  "features/004-delta/spec.html",
  ...["001-alpha", "002-beta", "003-gamma", "004-delta"].map(featurePagePath),
];

/** @type {(() => Promise<unknown>)[]} */
let cleanup = [];

test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

/** A fresh temporary folder (not inside the project). */
async function tempDir(prefix = "speckit-eye-out-") {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/**
 * Copies `mixed`, builds it into a temporary `site` folder with `base` and
 * serves the output under `base`.
 * @param {string} [base]
 */
async function buildAndServe(base = BASE) {
  const dir = await copyFixture("mixed");
  const out = path.join(await tempDir(), "site");
  const result = await runBuild(dir, out, base);
  expect(result.code, result.stderr).toBe(0);
  const host = await serveStatic(out, base);
  cleanup.push(() => host.close());
  return { dir, out, result, host };
}

/** Every file under `dir`, as sorted `/`-separated relative paths. */
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join("/"))
    .sort();
}

const tree = (page) => page.locator('[data-region="tree"]');
const details = (page, key) => tree(page).locator(`details[data-key="${key}"]`);

test("US4 AC1 FR-003 build writes the overview and one page per artifact and exits 0 with a summary", async () => {
  const { out, result } = await buildAndServe();
  const files = await listFiles(out);
  expect(files.filter((f) => f.endsWith(".html")).sort()).toEqual([...PAGES].sort());
  expect(files).toContain("assets/styles.css");
  expect(files).toContain("assets/taskmap.js");
  expect(files).toContain("assets/app.js");
  expect(files).toContain("assets/theme.js");
  expect(files).toContain(".speckit-eye-build");
  expect(files).not.toContain("assets/live.js");
  expect(result.stdout).toMatch(/^speckit-eye \S+ — building .+ → .+ \(base \/my-repo\/\)\n/);
  expect(result.stdout).toContain(`  wrote ${PAGES.length} pages\n`);
  expect(result.stdout).not.toMatch(/warnings? \(see above\)/);
});

test("US4 AC2 FR-004 FR-032 a deep link under the base loads with styles and working links", async ({ page }) => {
  const { host } = await buildAndServe();
  /** @type {string[]} */
  const failed = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });

  const res = await page.goto(`${host.url}features/001-alpha/plan.html`);
  expect(res?.status()).toBe(200);
  await expect(page.locator('article[data-region="doc"]')).toHaveAttribute("data-key", "specs/001-alpha/plan.md");
  // The stylesheet loaded and applies (the prose article is styled by it).
  const rules = await page.evaluate(() => [...document.styleSheets].reduce((n, s) => n + s.cssRules.length, 0));
  expect(rules).toBeGreaterThan(10);

  // Every internal link and asset starts with the base and loads.
  const urls = await page.evaluate(() =>
    [...document.querySelectorAll("[href], [src]")].map((el) => el.getAttribute("href") ?? el.getAttribute("src")),
  );
  const internal = urls.filter((u) => u && !u.startsWith("#"));
  expect(internal.length).toBeGreaterThan(5);
  for (const u of internal) expect(u.startsWith(BASE), u).toBe(true);
  for (const u of new Set(internal.map((u) => u.split("#")[0]))) {
    const r = await page.request.get(`${host.origin}${u}`);
    expect(r.status(), u).toBe(200);
  }

  // Every page opens directly by its address.
  for (const p of PAGES) {
    const r = await page.goto(`${host.url}${p}`);
    expect(r?.status(), p).toBe(200);
  }
  await page.goto(host.url);
  await navLink(page, "Constitution").click();
  await expect(page).toHaveURL(`${host.url}constitution.html`);
  await page.goto(host.url);
  await sidebar(page).locator('a[data-key="side:002-beta"]').click();
  await expect(page).toHaveURL(`${host.url}${featurePagePath("002-beta")}`);
  await expect(page.locator('[data-region="feature-head"] h1')).toBeVisible();
  expect(failed).toEqual([]);
});

test("US4 AC3 FR-031 the overview matches serve mode, shows the generated time and never asks for live updates", async ({ page }) => {
  const { dir, host } = await buildAndServe();

  /** @type {string[]} */
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(host.url);
  await page.waitForLoadState("networkidle");
  const snapshot = async () => ({
    progress: await page.locator('[data-region="stats"]').innerText(),
    tree: await tree(page).evaluate((el) => el.textContent),
    grid: await page.locator('[data-region="taskmap"] [data-part="grid"]').evaluate((el) => ({
      text: el.textContent,
      squares: [...el.querySelectorAll("a[data-key]")].map((a) => `${a.dataset.key}=${a.dataset.state}|${a.title}`),
    })),
  });
  const built = await snapshot();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "static");
  await expect(page.locator("footer")).toContainText(/generated \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/);
  await expect(page.locator('[data-region="live-status"]')).toHaveCount(0);

  const server = await startServe(dir, { anyPort: true });
  cleanup.push(() => server.stop());
  await page.goto(server.url);
  const served = await snapshot();
  expect(built).toEqual(served);
  expect(built.grid.squares.length).toBe(65);

  const staticRequests = requests.slice(0, requests.findIndex((u) => u.startsWith(server.url)));
  expect(staticRequests.length).toBeGreaterThan(0);
  expect(host.requests.some((p) => p.includes("__events"))).toBe(false);
  expect(staticRequests.filter((u) => u.includes("__events"))).toEqual([]);
});

test("US4 FR-038 every request of the built site stays on the static server's origin", async ({ page }) => {
  const { host } = await buildAndServe();
  /** @type {string[]} */
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  for (const p of ["", "features/002-beta/plan.html", "constitution.html"]) {
    await page.goto(`${host.url}${p}`);
    await page.waitForLoadState("networkidle");
  }
  expect(requests.length).toBeGreaterThan(3);
  expect(requests.filter((u) => new URL(u).origin !== host.origin)).toEqual([]);
  expect(requests.filter((u) => u.includes("__events"))).toEqual([]);
});

test("US4 FR-037 expand and collapse work with JavaScript disabled", async ({ browser }) => {
  const { host } = await buildAndServe();
  const context = await browser.newContext({ javaScriptEnabled: false });
  cleanup.push(() => context.close());
  const page = await context.newPage();
  await page.goto(host.url);

  const gamma = details(page, "003-gamma");
  await expect(gamma).not.toHaveAttribute("open", /.*/);
  await gamma.locator(":scope > summary").click();
  await expect(gamma).toHaveAttribute("open", "");
  await expect(gamma.locator('details[data-key="003-gamma/p1"]')).toBeVisible();
  await gamma.locator(":scope > summary").click();
  await expect(gamma).not.toHaveAttribute("open", /.*/);

  // The active feature is expanded by the page itself, not by a script.
  await expect(details(page, "002-beta")).toHaveAttribute("open", "");
  // Grid colors come from the stylesheet alone.
  const colors = await page
    .locator('[data-region="taskmap"] [data-part="grid"] a[data-state]')
    .evaluateAll((els) => new Set(els.map((el) => getComputedStyle(el).backgroundColor)).size);
  expect(colors).toBeGreaterThanOrEqual(3);
});

test("US4 AC5 FR-033 a rebuild leaves no stale page; a foreign folder is refused and left unchanged", async () => {
  const dir = await copyFixture("mixed");
  const out = path.join(await tempDir(), "site");
  expect((await runBuild(dir, out, BASE)).code).toBe(0);
  expect(await listFiles(out)).toContain("features/003-gamma/plan.html");

  await rm(path.join(dir, "specs", "003-gamma", "plan.md"));
  const again = await runBuild(dir, out, BASE);
  expect(again.code, again.stderr).toBe(0);
  const files = await listFiles(out);
  expect(files).not.toContain("features/003-gamma/plan.html");
  expect(files.filter((f) => f.endsWith(".html"))).toHaveLength(PAGES.length - 1);
  expect(await readFile(path.join(out, "index.html"), "utf8")).not.toContain("003-gamma/plan.html");

  const foreign = await tempDir("speckit-eye-foreign-");
  await mkdir(path.join(foreign, "docs"));
  await writeFile(path.join(foreign, "notes.txt"), "keep me");
  await writeFile(path.join(foreign, "docs", "index.html"), "<p>mine</p>");
  const before = await hashTree(foreign);
  const refused = await runBuild(dir, foreign, BASE);
  expect(refused.code).toBe(2);
  expect(refused.stderr).toMatch(/not empty/);
  expect(refused.stderr).toContain(".speckit-eye-build");
  expect(await hashTree(foreign)).toBe(before);
});

test("US4 FR-006 building does not change the project folder", async () => {
  const dir = await copyFixture("mixed");
  const before = await hashTree(dir);
  const out = path.join(await tempDir(), "site");
  expect((await runBuild(dir, out, BASE)).code).toBe(0);
  expect((await runBuild(dir, out, BASE)).code).toBe(0);
  expect(await hashTree(dir)).toBe(before);
});

test("US4 FR-034 the build prints the public-exposure note", async () => {
  const { result } = await buildAndServe();
  expect(result.stdout).toContain(
    "  Note: this site includes every spec, plan, research note, the constitution and assessments.\n" +
      "        Anyone who can reach it can read them unless your host restricts access.\n",
  );
});

/**
 * Runs a shell-free command line (`node <args…>`) in `cwd`.
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function runIn(args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (c) => (stdout += c));
    child.stderr.setEncoding("utf8").on("data", (c) => (stderr += c));
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("US4 AC4 FR-039 the build command of the documented GitHub Pages workflow works", async ({ page }) => {
  // Windows checkouts may have CRLF line endings.
  const doc = (await readFile(path.join(REPO_ROOT, "docs", "hosting.md"), "utf8")).replaceAll("\r\n", "\n");
  const yaml = [...doc.matchAll(/```ya?ml\n([\s\S]*?)```/g)].map((m) => m[1]).join("\n");
  const lines = yaml.split("\n").filter((l) => /npx speckit-eye --build /.test(l));
  expect(lines, "one build line in the YAML sample of docs/hosting.md").toHaveLength(1);
  const command = lines[0].replace(/^\s*-?\s*run:\s*/, "").trim();
  expect(command).toContain("${{ github.event.repository.name }}");

  // The GitHub expression becomes a concrete repository name; npx becomes the local bin.
  const repoName = "my-repo";
  const concrete = command.replaceAll("${{ github.event.repository.name }}", repoName);
  expect(concrete).not.toMatch(/\$\{\{/);
  const argv = concrete.split(/\s+/);
  expect(argv.slice(0, 2)).toEqual(["npx", "speckit-eye"]);
  const cliArgs = argv.slice(2);
  const outFolder = cliArgs[cliArgs.indexOf("--out") + 1];
  const base = cliArgs[cliArgs.indexOf("--base") + 1];
  expect(base).toBe(`/${repoName}/`);

  // Run it the way CI does: from the checked-out repository root.
  const dir = await copyFixture("mixed");
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const result = await runIn([BIN, ...cliArgs], dir);
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain(`(base /${repoName}/)`);

  const host = await serveStatic(path.join(dir, outFolder), base);
  cleanup.push(() => host.close());
  const res = await page.goto(host.url);
  expect(res?.status()).toBe(200);
  await expect(page.locator("body")).toHaveAttribute("data-mode", "static");
  await expect(page.locator('[data-region="stats"]')).toContainText("40 of 65 tasks");
  const css = await page.request.get(`${host.origin}${base}assets/styles.css`);
  expect(css.status()).toBe(200);
});

// ---------------------------------------------------------------------------
// Spec 002: the redesign in a static build (FR-052, FR-004, FR-005, D6)
// ---------------------------------------------------------------------------

test("FR-052 static build under a sub-path has the same pages as serve mode, including feature pages, fonts and search index", async ({ request }) => {
  const { dir, out, host } = await buildAndServe();
  const files = (await listFiles(out)).filter((f) => f !== ".speckit-eye-build");
  for (const dirName of ["001-alpha", "002-beta", "003-gamma", "004-delta"]) expect(files).toContain(featurePagePath(dirName));
  expect(files).toContain("assets/search-index.json");
  const fonts = (await readdir(path.join(REPO_ROOT, "dist", "fonts"))).map((f) => `assets/fonts/${f}`);
  expect(fonts.some((f) => f.endsWith(".woff2"))).toBe(true);
  for (const f of fonts) expect(files, f).toContain(f);

  // Every built file is a page or asset of serve mode too, with the same type.
  const server = await startServe(dir, { anyPort: true });
  cleanup.push(() => server.stop());
  for (const f of files) {
    const built = await request.get(`${host.url}${f}`);
    const served = await request.get(`${server.url}${f}`);
    expect(built.status(), f).toBe(200);
    expect(served.status(), f).toBe(200);
    expect(built.headers()["content-type"], f).toBe(served.headers()["content-type"]);
  }
  // Serve mode has no page the build lacks: its live client is the only extra asset.
  expect((await request.get(`${server.url}assets/live.js`)).status()).toBe(200);
  expect(files).not.toContain("assets/live.js");

  // Both search indexes list the same entries; the built one links under the base.
  const builtIndex = await (await request.get(`${host.url}assets/search-index.json`)).json();
  const servedIndex = await (await request.get(`${server.url}assets/search-index.json`)).json();
  expect(builtIndex.entries.length).toBeGreaterThan(65);
  expect(builtIndex.entries.map((e) => e.label)).toEqual(servedIndex.entries.map((e) => e.label));
});

test("FR-004 D6 data-driven widths and bundled fonts work under the sub-path", async ({ page }) => {
  const { host } = await buildAndServe();
  /** @type {string[]} */
  const fontUrls = [];
  page.on("response", (r) => {
    if (r.url().endsWith(".woff2") && r.status() === 200) fontUrls.push(new URL(r.url()).pathname);
  });
  await page.goto(host.url);

  // A segment of the stats card is as wide as its w-pct-N class says.
  const segment = page.locator('[data-region="stats"] [data-part="segments"] a[data-key="seg:001-alpha"]');
  await expect(segment).toHaveClass(/\bw-pct-46\b/);
  const share = await segment.evaluate((el) => el.getBoundingClientRect().width / /** @type {Element} */ (el.parentElement).getBoundingClientRect().width);
  expect(share).toBeGreaterThan(0.4);
  expect(share).toBeLessThan(0.5);

  // Fonts: Geist and Instrument Serif are loaded, from the base's assets/fonts/.
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      geist: document.fonts.check('16px "Geist Variable"'),
      serif: document.fonts.check('16px "Instrument Serif"'),
      families: [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")),
    };
  });
  expect(loaded.geist).toBe(true);
  expect(loaded.serif).toBe(true);
  expect(loaded.families).toContain("Geist Variable");
  expect(loaded.families).toContain("Instrument Serif");
  expect(fontUrls.length).toBeGreaterThan(0);
  for (const u of fontUrls) expect(u).toMatch(/^\/my-repo\/assets\/fonts\/[^/]+\.woff2$/);

  // A phase-rail block of a feature page has a non-zero width from its class.
  await page.goto(`${host.url}${featurePagePath("002-beta")}`);
  const blocks = page.locator('[data-region="tasks"] [data-part="rail"] [data-part="block"]');
  await expect(blocks).toHaveCount(4);
  const rail = await blocks.evaluateAll((els) => els.map((el) => ({ cls: el.className, width: el.getBoundingClientRect().width })));
  for (const b of rail) {
    expect(b.cls).toMatch(/\bw-pct-\d+\b/);
    expect(b.width).toBeGreaterThan(20);
  }
  // Phase 4 (7 tasks) is wider than phase 2 (3 tasks).
  expect(rail[3].width).toBeGreaterThan(rail[1].width);
});

test("FR-052 theme, map mode, filters, reader and search work in the static build", async ({ page }) => {
  const { host } = await buildAndServe();
  await page.goto(host.url);

  // Theme: the choice applies at once and on the next page.
  const theme = sidebar(page).locator('[data-part="theme"]');
  await expect(theme).toBeVisible();
  await theme.locator('button[data-theme-choice="dark"]').click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // Map mode, remembered after a reload.
  const mode = page.locator('[data-region="taskmap"] button[data-part="map-mode"]');
  await mode.click();
  await expect(page.locator('[data-region="taskmap"]')).toHaveAttribute("data-layout", "grouped");
  // Overview filter.
  await page.locator('[data-part="view-filter"] button[data-filter="open"]').click();
  await expect(tree(page)).toHaveAttribute("data-filter", "open");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator('[data-region="taskmap"]')).toHaveAttribute("data-layout", "grouped");
  await expect(tree(page)).toHaveAttribute("data-filter", "open");

  // Feature page filters and selection.
  await page.goto(`${host.url}${featurePagePath("002-beta")}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const tasks = page.locator('[data-region="tasks"]');
  await tasks.locator('button[data-filter-chip="open"]').click();
  await expect(tasks.locator('details[data-part="task"]:not([data-filtered-out])')).toHaveCount(10);
  await tasks.locator('details[data-part="task"][data-id="T018"] > summary').click();
  await expect(tasks.locator('[data-region="detail"] [data-part="waiting"]')).toHaveText("Waiting on T011");

  // Reader: the raw view replaces the formatted view; the contents progress shows.
  await page.goto(`${host.url}features/002-beta/plan.html`);
  const article = page.locator('article[data-region="doc"]');
  await article.locator('details[data-part="raw"] > summary').click();
  await expect(article.locator('[data-part="formatted"]')).toBeHidden();
  await expect(article.locator('details[data-part="raw"] pre')).toBeVisible();
  await expect(page.locator('[data-region="toc"] [data-part="progress"]')).toBeVisible();

  // Search opens a result under the base.
  await pressSearchShortcut(page);
  const dialog = page.locator('dialog[data-region="search"]');
  await expect(dialog).toHaveJSProperty("open", true);
  // 001-alpha has a T018 too; its text tells them apart.
  await dialog.locator('input[data-part="query"]').fill("T018 search box");
  const first = dialog.locator('[data-group="Tasks"] [data-part="result"]').first();
  await expect(first.locator('[data-part="id"]')).toHaveText("T018");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(`${host.url}${featurePagePath("002-beta")}#task-002-beta-T018`);
  await expect(tasks.locator('details[data-part="task"][data-id="T018"]')).toHaveAttribute("data-selected", "");
});

test("FR-005 static footer shows the generation time", async ({ page }) => {
  const { host } = await buildAndServe();
  for (const p of ["", featurePagePath("002-beta"), "features/002-beta/plan.html", "constitution.html"]) {
    await page.goto(`${host.url}${p}`);
    const time = page.locator("footer time").first();
    await expect(time, p || "overview").toHaveAttribute("datetime", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
    const stamp = await time.getAttribute("datetime");
    expect(Math.abs(Date.now() - Date.parse(stamp)), p).toBeLessThan(10 * 60_000);
    await expect(page.locator("footer").first(), p).toContainText(`generated ${stamp}`);
  }
  // Serve mode has no generation time.
  const dir = await copyFixture("mixed");
  const server = await startServe(dir, { anyPort: true });
  cleanup.push(() => server.stop());
  await page.goto(server.url);
  await expect(page.locator("footer time")).toHaveCount(0);
  await expect(page.locator("footer").first()).not.toContainText("generated");
});
