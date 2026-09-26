/**
 * Shared helpers for the Playwright suites: fixture copies, spawning the real
 * CLI, hashing a folder to prove it was not modified (FR-006), and the page
 * shell selectors of spec 002 (contracts/routes.md "Page shell").
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const BIN = path.join(REPO_ROOT, "bin", "speckit-eye.js");
export const FIXTURES = path.join(REPO_ROOT, "tests", "fixtures", "projects");
export const E2E_PORT = 4747;
const START_TIMEOUT_MS = 15_000;

/** @typedef {import("@playwright/test").Page} Page */

/** The dark sidebar of overview and feature pages. @param {Page} page */
export const sidebar = (page) => page.locator('[data-region="sidebar"]');

/** The icon rail of document pages. @param {Page} page */
export const rail = (page) => page.locator('[data-region="rail"]');

/**
 * The site navigation of any page: the sidebar or, on document pages, the rail
 * (not the mobile menu copy, which is hidden on desktop).
 * @param {Page} page
 */
export const siteNav = (page) => page.locator('[data-region="sidebar"], [data-region="rail"]');

/**
 * The link to a main destination ("Overview", "Constitution",
 * "Assessment: <slug>") in the sidebar or rail.
 * @param {Page} page
 * @param {string} name
 */
export const navLink = (page, name) => siteNav(page).getByRole("link", { name, exact: true });

/** The sidebar entry of a feature. @param {Page} page @param {string} dir */
export const sidebarFeature = (page, dir) => sidebar(page).locator(`a[data-key="side:${dir}"]`);

/**
 * The page path of a feature page, without the base.
 * @param {string} dir
 */
export const featurePagePath = (dir) => `features/${dir}/index.html`;

/**
 * Copies `tests/fixtures/projects/<name>` into a fresh temporary folder.
 * @param {string} name
 * @returns {Promise<string>} the absolute path of the copy
 */
export async function copyFixture(name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `speckit-eye-${name}-`));
  await cp(path.join(FIXTURES, name), dir, { recursive: true });
  return dir;
}

/**
 * @typedef {object} ServeHandle
 * @property {string} url
 * @property {string} stdout everything printed so far
 * @property {string} stderr everything printed so far
 * @property {() => Promise<number | null>} stop sends SIGTERM and resolves with the exit code
 */

/**
 * Spawns `node bin/speckit-eye.js --serve <dir>` and resolves once the
 * `Local:` line appears.
 * @param {string} dir
 * @param {{ anyPort?: boolean }} [options] `anyPort`: accept the port the
 *   server fell back to instead of requiring {@link E2E_PORT} (for tests
 *   that never restart the server)
 * @returns {Promise<ServeHandle>}
 */
export function startServe(dir, { anyPort = false } = {}) {
  const child = spawn(process.execPath, [BIN, "--serve", dir], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  // On Windows, kill() terminates the process without running its signal
  // handlers, so there is no exit code; a SIGTERM exit there counts as 0.
  /** @type {Promise<number | null>} */
  const exited = new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve(code === null && signal === "SIGTERM" && process.platform === "win32" ? 0 : code)),
  );

  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    return exited;
  };

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (/** @type {Error} */ err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop().finally(() => reject(err));
    };
    const timer = setTimeout(
      () => fail(new Error(`speckit-eye did not print a Local: line within ${START_TIMEOUT_MS / 1000} s\nstdout:\n${stdout}\nstderr:\n${stderr}`)),
      START_TIMEOUT_MS,
    );

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (settled) return;
      const m = /Local:\s+(http:\/\/\S+)/.exec(stdout);
      if (!m) return;
      const url = m[1];
      if (!anyPort && new URL(url).port !== String(E2E_PORT)) {
        fail(new Error(`E2E tests need port ${E2E_PORT} free (the server started on ${url})`));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        url,
        get stdout() {
          return stdout;
        },
        get stderr() {
          return stderr;
        },
        stop,
      });
    });
    exited.then((code) => fail(new Error(`speckit-eye exited with code ${code} before serving\nstdout:\n${stdout}\nstderr:\n${stderr}`)));
    child.once("error", fail);
  });
}

/**
 * Runs the CLI to completion.
 * @param {string[]} args
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
export function runCli(args, { timeout = 15_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`speckit-eye ${args.join(" ")} did not exit within ${timeout} ms`));
    }, timeout);
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * A digest of every file path and content under `dir` (FR-006 checks).
 * @param {string} dir
 * @returns {Promise<string>}
 */
export async function hashTree(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(dir, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join("/"))
    .sort();
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(`${rel}\0`);
    hash.update(await readFile(path.join(dir, rel)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

/**
 * Runs `node bin/speckit-eye.js --build <dir> --out <out> [--base <base>]`.
 * @param {string} dir
 * @param {string} out
 * @param {string} [base] omitted → the CLI default (`/`)
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
export function runBuild(dir, out, base) {
  const args = ["--build", dir, "--out", out];
  if (base !== undefined) args.push("--base", base);
  return runCli(args, { timeout: 30_000 });
}

const STATIC_TYPES = /** @type {Record<string, string>} */ ({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
});

/**
 * @typedef {object} StaticHandle
 * @property {string} origin `http://127.0.0.1:<port>`
 * @property {string} url origin + mount path
 * @property {string[]} requests every request path received, in order
 * @property {() => Promise<void>} close
 */

/**
 * A test-only plain static file server on 127.0.0.1 and port 0: maps
 * `<mountPath>*` to files under `rootDir` (a folder → its `index.html`),
 * anything else → 404. Like a static host, it has no server-side logic.
 * @param {string} rootDir
 * @param {string} [mountPath] with leading and trailing `/`
 * @returns {Promise<StaticHandle>}
 */
export async function serveStatic(rootDir, mountPath = "/") {
  const root = path.resolve(rootDir);
  /** @type {string[]} */
  const requests = [];
  const notFound = (/** @type {http.ServerResponse} */ res) => {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  };
  const server = http.createServer(async (req, res) => {
    const pathname = new URL(req.url ?? "/", "http://x").pathname;
    requests.push(pathname);
    if (req.method !== "GET" && req.method !== "HEAD") return notFound(res);
    if (!pathname.startsWith(mountPath)) return notFound(res);
    let rel;
    try {
      rel = decodeURIComponent(pathname.slice(mountPath.length));
    } catch {
      return notFound(res);
    }
    let file = path.resolve(root, rel);
    if (file !== root && !file.startsWith(root + path.sep)) return notFound(res);
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
      const body = await readFile(file);
      res.writeHead(200, { "Content-Type": STATIC_TYPES[path.extname(file)] ?? "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      notFound(res);
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(undefined));
  });
  const { port } = /** @type {import("node:net").AddressInfo} */ (server.address());
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    url: `${origin}${mountPath}`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
