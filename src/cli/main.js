/**
 * CLI entry logic (contracts/cli.md): parse arguments, read the project,
 * render the site and serve it. Every side effect is injected so the whole
 * flow is unit tested with fakes; `bin/speckit-eye.js` only calls `run`.
 */

import path from "node:path";
import { readFile } from "node:fs/promises";
import pkg from "../../package.json" with { type: "json" };
import { parseCliArgs, USAGE } from "./args.js";
import { createReader as defaultCreateReader } from "../project/reader.js";
import { isSpecKitProject, scan } from "../project/scan.js";
import { buildModel } from "../model/build-model.js";
import { renderSite } from "../render/site.js";
import { createHandler } from "../serve/handler.js";
import { startServer as defaultStartServer } from "../serve/server.js";

/** @typedef {import("../project/scan.js").Warning} Warning */
/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {{ write: (chunk: string) => unknown }} Writable */

export const VERSION = pkg.version;

/** Package-relative locations of the assets served under `assets/`. */
const ASSET_FILES = /** @type {Record<string, URL>} */ ({
  "styles.css": new URL("../../dist/styles.css", import.meta.url),
  "overview.js": new URL("../client/overview.js", import.meta.url),
});

/**
 * Reads one packaged asset by name (`styles.css`, `overview.js`).
 * @param {string} name
 * @returns {Promise<string>}
 */
export async function defaultReadAsset(name) {
  const url = ASSET_FILES[name];
  if (!url) throw new Error(`unknown asset ${name}`);
  try {
    return await readFile(url, "utf8");
  } catch (err) {
    if (name === "styles.css" && /** @type {{code?: string}} */ (err)?.code === "ENOENT") {
      throw new Error("dist/styles.css is missing; run `pnpm run build:css` first");
    }
    throw err;
  }
}

/**
 * Calls `handler` once on SIGINT or SIGTERM.
 * @param {() => void} handler
 */
export function defaultOnSignal(handler) {
  let fired = false;
  const once = () => {
    if (fired) return;
    fired = true;
    process.off("SIGINT", once);
    process.off("SIGTERM", once);
    handler();
  };
  process.on("SIGINT", once);
  process.on("SIGTERM", once);
}

/**
 * @param {Warning} w
 * @returns {string} `warning: <file>:<line> <message>`
 */
export function formatWarning(w) {
  return `warning: ${w.file}${w.line ? `:${w.line}` : ""} ${w.message}`;
}

/**
 * Every warning of the project: project-level ones, then each feature's.
 * @param {Project} project
 * @returns {Warning[]}
 */
export function allWarnings(project) {
  return [...(project.warnings ?? []), ...project.features.flatMap((f) => f.warnings ?? [])];
}

/**
 * @typedef {object} RunDeps
 * @property {Writable} [stdout]
 * @property {Writable} [stderr]
 * @property {(root: string) => import("../project/reader.js").ProjectReader} [createReader]
 * @property {typeof defaultStartServer} [startServer]
 * @property {(name: string) => Promise<string>} [readAsset]
 * @property {(handler: () => void) => void} [onSignal]
 * @property {string} [cwd]
 */

/**
 * Runs the CLI. Resolves with the process exit code; in serve mode it
 * resolves only after SIGINT/SIGTERM.
 * @param {string[]} argv arguments after the node binary and script
 * @param {RunDeps} [deps]
 * @returns {Promise<number>}
 */
export async function run(argv, deps = {}) {
  const {
    stdout = process.stdout,
    stderr = process.stderr,
    createReader = (/** @type {string} */ root) => defaultCreateReader(root),
    startServer = defaultStartServer,
    readAsset = defaultReadAsset,
    onSignal = defaultOnSignal,
    cwd = process.cwd(),
  } = deps;

  const args = parseCliArgs(argv);
  if ("error" in args) {
    const message = argv.length === 0 ? "" : `speckit-eye: ${args.error}\n\n`;
    stderr.write(`${message}${USAGE}`);
    return 2;
  }
  if (args.mode === "help") {
    stdout.write(USAGE);
    return 0;
  }
  if (args.mode === "version") {
    stdout.write(`${VERSION}\n`);
    return 0;
  }

  try {
    const root = path.resolve(cwd, /** @type {string} */ (args.dir));
    const reader = createReader(root);
    if (!(await reader.exists("."))) {
      stderr.write(`speckit-eye: folder not found: ${root}\n`);
      return 2;
    }
    if (!(await isSpecKitProject(reader))) {
      stderr.write(`speckit-eye: ${root} is not a Spec Kit project (expected a specs/ or .specify/ folder)\n`);
      return 2;
    }

    if (args.mode === "build") {
      stderr.write("speckit-eye: --build is not available yet\n");
      return 1;
    }

    const assets = { styles: await readAsset("styles.css"), overview: await readAsset("overview.js") };
    const scanResult = await scan(reader, path.basename(root));
    const project = buildModel({ ...scanResult, root });
    const site = renderSite(project, { base: "/", mode: "serve", version: VERSION, assets });
    const handler = createHandler({ getSite: () => site });

    const server = await startServer({ handler });
    stdout.write(`speckit-eye ${VERSION} — serving ${root}\n`);
    stdout.write(`  Local: ${server.url}\n`);
    stdout.write("  Watching specs/ and .specify/ for changes (Ctrl+C to stop)\n");
    for (const w of allWarnings(project)) stderr.write(`${formatWarning(w)}\n`);

    await new Promise((resolve) => onSignal(() => resolve(undefined)));
    await server.close();
    return 0;
  } catch (err) {
    stderr.write(`speckit-eye: ${/** @type {Error} */ (err)?.message ?? String(err)}\n`);
    return 1;
  }
}
