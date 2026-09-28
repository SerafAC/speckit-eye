// 003 US2 — Cut a release safely by following one guide (spec 003, User Story 2).
// Drives the real `scripts/release/release.js` through a release and through
// broken inputs, on scratch copies of a frozen sample `package.json` and
// `CHANGELOG.md` (tests/fixtures/release), never the repository's live files,
// so the suite keeps passing after real releases (quickstart §3).

import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT } from "./helpers.js";

const RELEASE_JS = path.join(REPO_ROOT, "scripts", "release", "release.js");
const FIXTURE = path.join(REPO_ROOT, "tests", "fixtures", "release");
const REPO = "https://github.com/SerafAC/speckit-eye";

/**
 * Runs `node release.js <args>` in `cwd`.
 * @param {string} cwd
 * @param {string[]} args
 * @returns {Promise<{ code: number | null, stdout: string, stderr: string }>}
 */
function release(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RELEASE_JS, ...args], { cwd, stdio: ["ignore", "pipe", "pipe"] });
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

/** SHA-256 of a file. @param {string} file */
async function hashOf(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

/** Today's date in UTC, as the changelog writes it. */
const todayUtc = () => new Date().toISOString().slice(0, 10);

let dir = "";

test.beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-release-"));
  await copyFile(path.join(FIXTURE, "package.json"), path.join(dir, "package.json"));
  await copyFile(path.join(FIXTURE, "CHANGELOG.md"), path.join(dir, "CHANGELOG.md"));
});

test.afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const changelog = () => readFile(path.join(dir, "CHANGELOG.md"), "utf8");
const pkgVersion = async () => JSON.parse(await readFile(path.join(dir, "package.json"), "utf8")).version;

/** Adds an entry to the Unreleased section of the scratch changelog. */
async function addEntry(text) {
  const current = await changelog();
  await writeFile(path.join(dir, "CHANGELOG.md"), current.replace("## [Unreleased]\n", `## [Unreleased]\n\n### Fixed\n\n- ${text}\n`));
}

test("003 US2 FR-006 bump moves Unreleased under the new dated version", async () => {
  const run = await release(dir, ["bump", "--version", "1.0.0"]);
  expect(run.code, run.stderr).toBe(0);
  expect(run.stdout).toBe("1.0.0\n");
  expect(await pkgVersion()).toBe("1.0.0");
  const text = (await changelog()).replace(/\r\n/g, "\n");
  // Unreleased is empty: the next heading follows directly.
  expect(text).toContain(`## [Unreleased]\n\n## [1.0.0] - ${todayUtc()}\n\n### Added\n\n- Serve mode:`);
  expect(text).toContain("- Static build mode: `speckit-eye --build <dir> --out <folder>`.");
  expect(text).toMatch(/^# Changelog\n\nAll notable changes/);
  expect(text.endsWith(`[Unreleased]: ${REPO}/compare/v1.0.0...HEAD\n[1.0.0]: ${REPO}/releases/tag/v1.0.0\n`)).toBe(true);
  expect(text).not.toContain("/commits/main");
});

test("003 US2 FR-008 bump refuses an empty Unreleased section", async () => {
  const first = await release(dir, ["bump", "--version", "1.0.0"]);
  expect(first.code, first.stderr).toBe(0);
  const before = [await hashOf(path.join(dir, "package.json")), await hashOf(path.join(dir, "CHANGELOG.md"))];
  const second = await release(dir, ["bump", "patch"]);
  expect(second.code).toBe(1);
  expect(second.stdout).toBe("");
  expect(second.stderr).toMatch(/Unreleased section of CHANGELOG\.md has no entries/);
  expect([await hashOf(path.join(dir, "package.json")), await hashOf(path.join(dir, "CHANGELOG.md"))]).toEqual(before);
});

test("003 US2 FR-010 verify accepts a matching tag and names latest", async () => {
  expect((await release(dir, ["bump", "--version", "1.0.0"])).code).toBe(0);
  const run = await release(dir, ["verify", "--tag", "v1.0.0"]);
  expect(run.code, run.stderr).toBe(0);
  expect(run.stdout).toBe("version=1.0.0\ntag=v1.0.0\nprerelease=false\ndist-tag=latest\n");
});

test("003 US2 FR-010 verify rejects a tag that does not match package.json", async () => {
  expect((await release(dir, ["bump", "--version", "1.0.0"])).code).toBe(0);
  const run = await release(dir, ["verify", "--tag", "v1.2.0"]);
  expect(run.code).toBe(1);
  expect(run.stdout).toBe("");
  // SC-003: the failure names the check that failed.
  expect(run.stderr).toContain("tag v1.2.0 does not match package.json version 1.0.0");
});

test("003 US2 FR-016 a pre-release verifies with the next dist-tag", async () => {
  expect((await release(dir, ["bump", "--version", "1.0.0"])).code).toBe(0);
  await addEntry("A pre-release fix.");
  const bump = await release(dir, ["bump", "preminor"]);
  expect(bump.code, bump.stderr).toBe(0);
  expect(bump.stdout).toBe("1.1.0-rc.0\n");
  const text = await changelog();
  expect(text).toContain(`[1.1.0-rc.0]: ${REPO}/compare/v1.0.0...v1.1.0-rc.0`);
  const run = await release(dir, ["verify", "--tag", "v1.1.0-rc.0"]);
  expect(run.code, run.stderr).toBe(0);
  expect(run.stdout).toContain("prerelease=true\n");
  expect(run.stdout).toContain("dist-tag=next\n");
});

test("003 US2 FR-015 notes print the version's changelog section", async () => {
  expect((await release(dir, ["bump", "--version", "1.0.0"])).code).toBe(0);
  const run = await release(dir, ["notes", "--version", "1.0.0"]);
  expect(run.code, run.stderr).toBe(0);
  const notes = run.stdout.replace(/\r\n/g, "\n");
  expect(notes.startsWith("### Added\n\n- Serve mode:")).toBe(true);
  expect(notes).toContain("- Static build mode:");
  expect(notes).not.toContain("## [");
  expect(notes).not.toContain("[Unreleased]:");
  const missing = await release(dir, ["notes", "--version", "9.9.9"]);
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("no changelog section for 9.9.9");
});

test("003 US2 FR-002 pack-check rejects an unexpected file", async () => {
  const files = [
    "package.json",
    "README.md",
    "CHANGELOG.md",
    "LICENSE",
    "bin/speckit-eye.js",
    "src/cli/main.js",
    "dist/styles.css",
    "dist/fonts/geist-latin-wght-normal.woff2",
    "tests/x.js",
  ].map((p) => ({ path: p }));
  await writeFile(path.join(dir, "files.json"), JSON.stringify({ files }));
  const run = await release(dir, ["pack-check", "files.json"]);
  expect(run.code).toBe(1);
  expect(run.stderr).toContain("unexpected file in package: tests/x.js");
});

test("003 US2 FR-009 release-commit ignores a version change not merged from release/next", async () => {
  expect((await release(dir, ["bump", "--version", "1.0.0"])).code).toBe(0);
  const handEdited = await release(dir, ["release-commit", "--version", "1.0.0", "--head-ref", "", "--tag-exists", "false"]);
  expect(handEdited.code, handEdited.stderr).toBe(0);
  expect(handEdited.stdout).toBe("release=false\nreason=not merged from release/next\n");
  const otherBranch = await release(dir, ["release-commit", "--version", "1.0.0", "--head-ref", "feature/x", "--tag-exists", "false"]);
  expect(otherBranch.stdout).toContain("release=false\n");
  const fromBump = await release(dir, ["release-commit", "--version", "1.0.0", "--head-ref", "release/next", "--tag-exists", "false"]);
  expect(fromBump.stdout).toBe("release=true\n");
});
