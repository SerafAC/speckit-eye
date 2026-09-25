/**
 * Shared helpers for the Playwright suites: fixture copies, spawning the real
 * CLI, and hashing a folder to prove it was not modified (FR-006).
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const BIN = path.join(REPO_ROOT, "bin", "speckit-eye.js");
export const FIXTURES = path.join(REPO_ROOT, "tests", "fixtures", "projects");
export const E2E_PORT = 4747;
const START_TIMEOUT_MS = 15_000;

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
 * @returns {Promise<ServeHandle>}
 */
export function startServe(dir) {
  const child = spawn(process.execPath, [BIN, "--serve", dir], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  /** @type {Promise<number | null>} */
  const exited = new Promise((resolve) => child.once("exit", (code) => resolve(code)));

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
      if (new URL(url).port !== String(E2E_PORT)) {
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
