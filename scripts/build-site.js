// Builds the documentation site into site/ (contracts/site.md "Build command").
// Development-only: not part of the published package. `sitePaths` is pure;
// `main(argv, io)` wires the steps to injected I/O so it can be unit tested
// with fakes. Run from the repository root: `pnpm run docs:build`.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };

/** Output folder, relative to the repository root. */
export const SITE_DIR = "site";

/**
 * The local docmd binary. Run with the current Node rather than through
 * node_modules/.bin/docmd, whose shim is a .cmd file on Windows.
 */
export const DOCMD_BIN = path.join("node_modules", "@docmd", "core", "dist", "bin", "docmd.js");

/** The speckit-eye CLI of this repository, which builds the dashboard. */
export const DASHBOARD_BIN = path.join("bin", "speckit-eye.js");

/** Output folder of the dashboard (this repository's own specs), under site/. */
export const STATUS_DIR = path.join(SITE_DIR, "status");

/**
 * Derives the site addresses from package.json `homepage` (data-model
 * "Documentation site": the site URL has one definition).
 *
 * @param {string} homepage for example `https://serafac.github.io/speckit-eye/`
 * @returns {{home: string, base: string, statusBase: string, statusUrl: string}}
 *   `home` with a trailing `/`; `base` is its URL path (`/speckit-eye/`);
 *   `statusBase` and `statusUrl` point at the dashboard under `status/`.
 * @throws {Error} unless `homepage` is an `http:` or `https:` URL.
 */
export function sitePaths(homepage) {
  let url;
  try {
    url = new URL(String(homepage));
  } catch {
    throw new Error(`homepage is not a URL: ${homepage}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`homepage must be an http: or https: URL: ${homepage}`);
  }
  const base = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  const home = `${url.origin}${base}`;
  return { home, base, statusBase: `${base}status/`, statusUrl: `${home}status/` };
}

/**
 * Removes site/, runs `docmd build` (config docmd.config.js), then builds
 * this repository's speckit-eye dashboard into site/status/ with a Home link
 * back to the docs (contracts/site.md steps 1–4). A failing step stops the
 * build: nothing is deployed unless both builds succeed (FR-024).
 *
 * @param {string[]} argv command-line arguments (none are used)
 * @param {{homepage: string, rm: (p: string) => void,
 *   run: (cmd: string, args: string[]) => number | null,
 *   stderr: (s: string) => void}} io `homepage` is package.json `homepage`
 * @returns {number} the exit code: 0, or the first failing step's code (1
 *   when a step ended without one).
 */
export function main(argv, io) {
  const { home, statusBase } = sitePaths(io.homepage);
  io.rm(SITE_DIR);
  const steps = [
    ["docmd build", [DOCMD_BIN, "build"]],
    ["dashboard build", [DASHBOARD_BIN, "--build", ".", "--out", STATUS_DIR, "--base", statusBase, "--home", home]],
  ];
  for (const [name, args] of steps) {
    const code = io.run(process.execPath, args);
    if (code !== 0) {
      io.stderr(`docs:build: ${name} failed (exit code ${code})\n`);
      return code || 1;
    }
  }
  return 0;
}

/** Real I/O, relative to the current directory. */
export const nodeIo = {
  homepage: pkg.homepage,
  rm: (p) => fs.rmSync(p, { recursive: true, force: true }),
  run: (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status,
  stderr: (s) => process.stderr.write(s),
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), nodeIo);
