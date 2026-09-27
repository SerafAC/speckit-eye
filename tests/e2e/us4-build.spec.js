// US4 — Publish a shareable snapshot from CI (spec.md, User Story 4).
// Every test builds a temporary copy of the `mixed` fixture with the real CLI
// and serves the output from a plain static file server under a sub-path
// (tests/e2e/helpers.js `serveStatic`), like GitHub Pages does.

import { test, expect } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { BIN, REPO_ROOT, copyFixture, featurePagePath, hashTree, navLink, runBuild, serveStatic, sidebar, startServe } from "./helpers.js";
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
