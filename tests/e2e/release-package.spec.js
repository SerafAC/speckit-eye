// 003 US1 — Install speckit-eye from npm (spec 003, User Story 1).
// Packs the repository with the real package manager, checks the file list
// with `release.js pack-check`, then installs the tarball into an empty
// temporary folder and runs the installed CLI through `npx`, as a user would
// after `npm install speckit-eye` (quickstart §2).

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, copyFixture } from "./helpers.js";

const WINDOWS = process.platform === "win32";
const RELEASE_JS = path.join(REPO_ROOT, "scripts", "release", "release.js");

// Packing runs `prepack` (the asset build) and installing downloads the
// runtime dependency, so this suite gets more time than the default.
test.describe.configure({ mode: "serial", timeout: 180_000 });

/**
 * Runs a command to completion. `pnpm`, `npm` and `npx` are `.cmd` shims on
 * Windows, which only a shell can start.
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: WINDOWS && command !== process.execPath, stdio: ["ignore", "pipe", "pipe"] });
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

/** Everything the suite creates, removed at the end. */
const temps = /** @type {string[]} */ ([]);
let packDir = "";
let fileList = "";
/** Absolute path of the packed `.tgz`. */
let tarball = "";

test.beforeAll(async () => {
  packDir = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-pack-"));
  temps.push(packDir);
  const pack = await run("pnpm", ["pack", "--json", "--pack-destination", packDir], REPO_ROOT);
  expect(pack.code, pack.stderr).toBe(0);
  // `prepack` prints to the same stdout before the JSON; pack-check skips it.
  fileList = path.join(packDir, "files.json");
  await writeFile(fileList, pack.stdout);
  const { filename } = JSON.parse(pack.stdout.slice(pack.stdout.indexOf("\n{") + 1));
  tarball = path.resolve(packDir, filename);
});

test.afterAll(async () => {
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
});

test("003 US1 FR-002 the package contains only runtime files, README, CHANGELOG and LICENSE", async () => {
  const check = await run(process.execPath, [RELEASE_JS, "pack-check", fileList], REPO_ROOT);
  expect(check.code, check.stderr).toBe(0);
  expect(check.stderr).toBe("");
});

test("003 US1 FR-001 the package carries complete metadata", async () => {
  const extract = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-unpack-"));
  temps.push(extract);
  const tar = await run("tar", ["-xzf", tarball, "-C", extract], packDir);
  expect(tar.code, tar.stderr).toBe(0);
  const pkg = JSON.parse(await readFile(path.join(extract, "package", "package.json"), "utf8"));
  for (const key of ["description", "license", "repository", "homepage", "bugs", "keywords", "engines"]) {
    expect(pkg[key], key).toBeTruthy();
  }
  expect(pkg.repository.url).toContain("github.com/SerafAC/speckit-eye");
  expect(pkg.keywords.length).toBeGreaterThan(0);
  expect(pkg.engines.node).toBe(">=22");
  expect(pkg.bin).toEqual({ "speckit-eye": "bin/speckit-eye.js" });
});

test("003 US1 FR-001 the installed tarball serves a project's overview", async ({ page }) => {
  const home = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-install-"));
  temps.push(home);
  await writeFile(path.join(home, "package.json"), '{ "name": "install-check", "private": true }\n');
  const install = await run("npm", ["install", "--no-audit", "--no-fund", tarball], home);
  expect(install.code, install.stderr).toBe(0);

  const project = await copyFixture("mixed");
  temps.push(project);
  // POSIX: its own process group, so stopping it also stops the node process
  // that npx starts. Windows: taskkill /T stops the tree.
  const child = spawn("npx", ["--no-install", "speckit-eye", "--serve", project], {
    cwd: home,
    shell: WINDOWS,
    detached: !WINDOWS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise((resolve) => child.once("exit", resolve));
  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    if (WINDOWS) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-(/** @type {number} */ (child.pid)), "SIGTERM");
    await exited;
  };

  try {
    let output = "";
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no Local: line within 60 s\n${output}`)), 60_000);
      const onData = (/** @type {string} */ chunk) => {
        output += chunk;
        const m = /Local:\s+(http:\/\/\S+)/.exec(output);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", onData);
      child.stderr.on("data", (c) => (output += c));
      exited.then((code) => {
        clearTimeout(timer);
        reject(new Error(`npx speckit-eye exited with ${code} before serving\n${output}`));
      });
    });
    // The server asks for port 4747 and falls back to a free one when it is
    // taken; this test never restarts it, so any port will do.
    expect(new URL(url).hostname).toBe("127.0.0.1");

    await page.goto(url);
    const percent = page.locator('[data-region="stats"] [data-stat="percent"]');
    await expect(percent.locator('[data-part="value"]')).toHaveText("62 %");
    await expect(percent.locator('[data-part="detail"]')).toHaveText("40 of 65 tasks");
  } finally {
    await stop();
  }
});
