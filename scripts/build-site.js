// Builds the documentation site into site/ (contracts/site.md "Build command").
// Development-only: not part of the published package. `sitePaths` is pure;
// `main(argv, io)` wires the steps to injected I/O so it can be unit tested
// with fakes. Run from the repository root: `pnpm run docs:build`.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Output folder, relative to the repository root. */
export const SITE_DIR = "site";

/**
 * The local docmd binary. Run with the current Node rather than through
 * node_modules/.bin/docmd, whose shim is a .cmd file on Windows.
 */
export const DOCMD_BIN = path.join("node_modules", "@docmd", "core", "dist", "bin", "docmd.js");

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
 * Removes site/ and runs `docmd build` (config docmd.config.js).
 *
 * @param {string[]} argv command-line arguments (none are used)
 * @param {{rm: (p: string) => void, run: (cmd: string, args: string[]) => number | null,
 *   stderr: (s: string) => void}} io
 * @returns {number} the exit code: 0, or the failing step's code (1 when a
 *   step ended without one).
 */
export function main(argv, io) {
  io.rm(SITE_DIR);
  const code = io.run(process.execPath, [DOCMD_BIN, "build"]);
  if (code !== 0) {
    io.stderr(`docs:build: docmd build failed (exit code ${code})\n`);
    return code || 1;
  }
  return 0;
}

/** Real I/O, relative to the current directory. */
export const nodeIo = {
  rm: (p) => fs.rmSync(p, { recursive: true, force: true }),
  run: (cmd, args) => spawnSync(cmd, args, { stdio: "inherit" }).status,
  stderr: (s) => process.stderr.write(s),
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2), nodeIo);
