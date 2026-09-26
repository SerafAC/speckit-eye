// Security checks (FR-004, FR-006, FR-007, FR-024, SC-008). Every test drives the real
// CLI against a temporary copy of the `mixed` fixture.

import { test, expect } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, copyFixture, featurePagePath, hashTree, runBuild, startServe } from "./helpers.js";

/** Every page the `mixed` fixture has (tests/fixtures/projects/README.md). */
const PAGES = [
  "/",
  "/index.html",
  "/constitution.html",
  "/assessments/speckit-dashboard/intake.html",
  "/assessments/speckit-dashboard/decision.html",
  "/features/001-alpha/spec.html",
  "/features/001-alpha/plan.html",
  "/features/001-alpha/tasks.html",
  "/features/002-beta/spec.html",
  "/features/002-beta/plan.html",
  "/features/002-beta/tasks.html",
  "/features/003-gamma/spec.html",
  "/features/003-gamma/plan.html",
  "/features/003-gamma/tasks.html",
  "/features/004-delta/spec.html",
  ...["001-alpha", "002-beta", "003-gamma", "004-delta"].map((dir) => `/${featurePagePath(dir)}`),
];

/** Paths that must never be served, sent verbatim (no client normalization). */
const FORBIDDEN = [
  "/../package.json",
  "/%2e%2e/package.json",
  "/specs/001-alpha/spec.md",
  "/.specify/memory/constitution.md",
  "/.env",
  "/src/cli/main.js",
  "/features/../../package.json",
];

const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:";

/** @type {(() => Promise<unknown>)[]} */
let cleanup = [];

test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

/** Serves a fresh copy of `mixed` (with a `.env` so that path really exists). */
async function serveMixed() {
  const dir = await copyFixture("mixed");
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, ".env"), "SECRET=do-not-serve\n");
  const server = await startServe(dir, { anyPort: true });
  cleanup.push(() => server.stop());
  return { dir, server };
}

/**
 * A raw GET with the path sent exactly as given (node:http does not
 * normalize `..` or percent escapes, unlike a browser or `fetch`).
 * @param {string} origin
 * @param {string} rawPath
 * @param {string} [host] connect to this address instead of the origin's host
 * @returns {Promise<{ status: number, headers: http.IncomingHttpHeaders, body: string }>}
 */
function rawGet(origin, rawPath, host) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: host ?? url.hostname, port: url.port, path: rawPath, method: "GET", timeout: 2_000 },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

test("SC-008 FR-007 paths outside the route table return 404 and leak nothing", async () => {
  const { server } = await serveMixed();
  for (const p of FORBIDDEN) {
    const res = await rawGet(server.url, p);
    expect(res.status, p).toBe(404);
    expect(res.body, p).not.toContain("SECRET");
    expect(res.body, p).not.toContain("speckit-eye");
    expect(res.body, p).not.toContain("# Feature Specification");
  }
});

test("FR-024 FR-007 every page response has the CSP and nosniff headers", async () => {
  const { server } = await serveMixed();
  for (const p of PAGES) {
    const res = await rawGet(server.url, p);
    expect(res.status, p).toBe(200);
    expect(res.headers["content-type"], p).toBe("text/html; charset=utf-8");
    expect(res.headers["content-security-policy"], p).toBe(CSP);
    expect(res.headers["x-content-type-options"], p).toBe("nosniff");
  }
  for (const p of ["/assets/styles.css", "/assets/theme.js", "/assets/app.js", "/assets/overview.js", "/assets/live.js", "/nope.html"]) {
    const res = await rawGet(server.url, p);
    expect(res.headers["content-security-policy"], p).toBe(CSP);
    expect(res.headers["x-content-type-options"], p).toBe("nosniff");
  }
});

test("FR-004 serves fonts from its own origin with the unchanged CSP", async ({ page }) => {
  const { server } = await serveMixed();
  const origin = new URL(server.url).origin;
  /** @type {string[]} */
  const requests = [];
  /** @type {import("@playwright/test").Response[]} */
  const fontResponses = [];
  page.on("request", (r) => requests.push(r.url()));
  page.on("response", (r) => {
    if (new URL(r.url()).pathname.endsWith(".woff2")) fontResponses.push(r);
  });
  for (const p of ["/", `/${featurePagePath("002-beta")}`, "/features/002-beta/plan.html"]) {
    await page.goto(`${origin}${p}`);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForLoadState("networkidle");
  }
  expect(fontResponses.length, "the pages load at least one bundled font").toBeGreaterThan(0);
  for (const r of fontResponses) {
    expect(new URL(r.url()).origin).toBe(origin);
    expect(new URL(r.url()).pathname).toMatch(/^\/assets\/fonts\/[^/]+\.woff2$/);
    expect(r.status(), r.url()).toBe(200);
    expect(await r.headerValue("content-type"), r.url()).toBe("font/woff2");
    expect(await r.headerValue("content-security-policy"), r.url()).toBe(CSP);
  }
  expect(requests.filter((u) => new URL(u).origin !== origin)).toEqual([]);

  // Every bundled font file is served byte-typed with the same headers.
  const files = (await readdir(path.join(REPO_ROOT, "dist", "fonts"))).filter((f) => f.endsWith(".woff2"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const res = await rawGet(server.url, `/assets/fonts/${f}`);
    expect(res.status, f).toBe(200);
    expect(res.headers["content-type"], f).toBe("font/woff2");
    expect(res.headers["content-security-policy"], f).toBe(CSP);
    expect(res.headers["x-content-type-options"], f).toBe("nosniff");
  }
});

test("FR-024 no CSP violation fires on the overview, any feature page or any artifact page", async ({ page }) => {
  const { server } = await serveMixed();
  const origin = new URL(server.url).origin;
  await page.addInitScript(() => {
    // @ts-ignore test-only global
    window.__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) =>
      // @ts-ignore test-only global
      window.__cspViolations.push(`${e.violatedDirective} ${e.blockedURI}`),
    );
  });
  for (const p of PAGES) {
    await page.goto(`${origin}${p}`);
    await page.waitForLoadState("load");
    // @ts-ignore test-only global
    expect(await page.evaluate(() => window.__cspViolations), p).toEqual([]);
  }
});

test("FR-007 the server is not reachable on a non-loopback interface address", async () => {
  const addresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && !a.internal)
    .map((a) => /** @type {os.NetworkInterfaceInfo} */ (a))
    .filter((a) => a.family === "IPv4" || (a.family === "IPv6" && a.scopeid === 0));
  test.skip(addresses.length === 0, "no non-loopback network interface on this machine");
  const { server } = await serveMixed();
  expect((await rawGet(server.url, "/")).status).toBe(200);
  for (const a of addresses) {
    const outcome = await rawGet(server.url, "/", a.address).then(
      (res) => `answered ${res.status}`,
      (err) => `refused: ${err.code ?? err.message}`,
    );
    expect(outcome, a.address).toMatch(/^refused/);
  }
});

test("FR-006 the project is unchanged after serve, a live update, and a build", async ({ page }) => {
  const { dir, server } = await serveMixed();
  const before = await hashTree(dir);

  await page.goto(server.url);
  await expect(page.locator('[data-stat="percent"] [data-part="detail"]')).toHaveText("40 of 65 tasks");
  for (const p of PAGES) expect((await rawGet(server.url, p)).status, p).toBe(200);
  expect(await hashTree(dir)).toBe(before);

  // A live update: the test edits a file, the tool rescans; nothing else may change.
  const tasks = path.join(dir, "specs", "002-beta", "tasks.md");
  const text = await readFile(tasks, "utf8");
  const ticked = text.replace(/^- \[ \] (T\d+)/m, "- [x] $1");
  expect(ticked).not.toBe(text);
  await writeFile(tasks, ticked);
  const afterEdit = await hashTree(dir);
  await expect(page.locator('[data-stat="percent"] [data-part="detail"]')).toHaveText("41 of 65 tasks", { timeout: 2_000 });
  expect(await hashTree(dir)).toBe(afterEdit);

  const outRoot = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-sec-out-"));
  cleanup.push(() => rm(outRoot, { recursive: true, force: true }));
  const result = await runBuild(dir, path.join(outRoot, "site"), "/my-repo/");
  expect(result.code, result.stderr).toBe(0);
  expect(await hashTree(dir)).toBe(afterEdit);
});
