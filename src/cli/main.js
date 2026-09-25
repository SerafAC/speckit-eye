/**
 * CLI entry logic (contracts/cli.md): parse arguments, read the project,
 * render the site and serve it. Every side effect is injected so the whole
 * flow is unit tested with fakes; `bin/speckit-eye.js` only calls `run`.
 */

import path from "node:path";
import * as nodeFs from "node:fs/promises";
import pkg from "../../package.json" with { type: "json" };
import { parseCliArgs, USAGE } from "./args.js";
import { createReader as defaultCreateReader } from "../project/reader.js";
import { isSpecKitProject, scan } from "../project/scan.js";
import { buildModel } from "../model/build-model.js";
import { renderSite } from "../render/site.js";
import { createHandler } from "../serve/handler.js";
import { startServer as defaultStartServer } from "../serve/server.js";
import { createWatcher as defaultCreateWatcher } from "../serve/watcher.js";
import { createEventHub as defaultCreateEventHub } from "../serve/events.js";
import { writeSite } from "../build/build.js";

/** @typedef {import("../project/scan.js").Warning} Warning */
/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {{ write: (chunk: string) => unknown }} Writable */

export const VERSION = pkg.version;

/** Package-relative locations of the assets served under `assets/`. */
const ASSET_FILES = /** @type {Record<string, URL>} */ ({
  "styles.css": new URL("../../dist/styles.css", import.meta.url),
  "overview.js": new URL("../client/overview.js", import.meta.url),
  "live.js": new URL("../client/live.js", import.meta.url),
});

/**
 * Reads one packaged asset by name (`styles.css`, `overview.js`, `live.js`).
 * @param {string} name
 * @param {(url: URL, encoding: "utf8") => Promise<string>} [readFile] injected for unit tests
 * @returns {Promise<string>}
 */
export async function defaultReadAsset(name, readFile = nodeFs.readFile) {
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

/** The public-exposure reminder printed after every build (FR-034). */
export const EXPOSURE_NOTE =
  "  Note: this site includes every spec, plan, research note, the constitution and assessments.\n" +
  "        Anyone who can reach it can read them unless your host restricts access.\n";

/**
 * Calls `handler` once on SIGINT or SIGTERM.
 * @param {() => void} handler
 * @param {{ on: (event: string, fn: () => void) => unknown, off: (event: string, fn: () => void) => unknown }} [proc]
 *   the process to listen on, injected for unit tests
 */
export function defaultOnSignal(handler, proc = process) {
  let fired = false;
  const once = () => {
    if (fired) return;
    fired = true;
    proc.off("SIGINT", once);
    proc.off("SIGTERM", once);
    handler();
  };
  proc.on("SIGINT", once);
  proc.on("SIGTERM", once);
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
 * @param {import("../render/site.js").Site} a
 * @param {import("../render/site.js").Site} b
 * @returns {boolean} whether any page or asset differs
 */
export function siteChanged(a, b) {
  if (a.size !== b.size) return true;
  for (const [key, entry] of b) {
    const old = a.get(key);
    if (!old || old.body !== entry.body || old.type !== entry.type) return true;
  }
  return false;
}

/**
 * @typedef {object} RunDeps
 * @property {Writable} [stdout]
 * @property {Writable} [stderr]
 * @property {(root: string) => import("../project/reader.js").ProjectReader} [createReader]
 * @property {typeof defaultStartServer} [startServer]
 * @property {(name: string) => Promise<string>} [readAsset]
 * @property {(handler: () => void) => void} [onSignal]
 * @property {typeof defaultCreateWatcher} [createWatcher]
 * @property {typeof defaultCreateEventHub} [createEventHub]
 * @property {string} [cwd]
 * @property {import("../build/build.js").BuildFs} [fs] file system for build output
 * @property {() => Date} [now] clock for the build's "generated at" time
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
    createReader = defaultCreateReader,
    startServer = defaultStartServer,
    readAsset = defaultReadAsset,
    onSignal = defaultOnSignal,
    createWatcher = defaultCreateWatcher,
    createEventHub = defaultCreateEventHub,
    cwd = process.cwd(),
    fs = nodeFs,
    now = () => new Date(),
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
      const out = path.resolve(cwd, /** @type {string} */ (args.out));
      stdout.write(`speckit-eye ${VERSION} — building ${root} → ${args.out} (base ${args.base})\n`);
      const assets = { styles: await readAsset("styles.css"), overview: await readAsset("overview.js") };
      const scanResult = await scan(reader, path.basename(root));
      const project = buildModel({ ...scanResult, root });
      const warnings = allWarnings(project).map(formatWarning);
      for (const line of warnings) stderr.write(`${line}\n`);
      const site = renderSite(project, {
        base: args.base,
        mode: "static",
        version: VERSION,
        generatedAt: now().toISOString(),
        assets,
      });
      const result = await writeSite({ site, out, projectRoot: root, fs });
      if ("error" in result) {
        stderr.write(`speckit-eye: ${result.error}\n`);
        return result.code;
      }
      stdout.write(`  wrote ${result.pages} pages\n`);
      if (warnings.length) stdout.write(`  ${warnings.length} warning${warnings.length === 1 ? "" : "s"} (see above)\n`);
      stdout.write(EXPOSURE_NOTE);
      return 0;
    }

    const assets = {
      styles: await readAsset("styles.css"),
      overview: await readAsset("overview.js"),
      live: await readAsset("live.js"),
    };
    const name = path.basename(root);
    const renderOptions = { base: "/", mode: /** @type {"serve"} */ ("serve"), version: VERSION, assets };
    const scanResult = await scan(reader, name);
    const project = buildModel({ ...scanResult, root });
    let site = renderSite(project, renderOptions);
    let modelVersion = 0;
    const events = createEventHub({ version: modelVersion });
    const handler = createHandler({ getSite: () => site, events });

    let server;
    try {
      server = await startServer({ handler });
    } catch (err) {
      events.close();
      throw err;
    }
    stdout.write(`speckit-eye ${VERSION} — serving ${root}\n`);
    stdout.write(`  Local: ${server.url}\n`);
    stdout.write("  Watching specs/ and .specify/ for changes (Ctrl+C to stop)\n");
    /** Formatted warnings printed so far for the current model (printed once each). */
    let printed = new Set(allWarnings(project).map(formatWarning));
    for (const line of printed) stderr.write(`${line}\n`);

    let stopped = false;
    let rescanning = false;
    let rescanAgain = false;
    let gitDir = scanResult.gitDir ?? null;

    /** Rebuilds the site; broadcasts a change when any page or asset differs. */
    const rescan = async () => {
      const next = await scan(reader, name);
      const nextProject = buildModel({ ...next, root });
      const nextSite = renderSite(nextProject, renderOptions);
      if (stopped) return;
      if (siteChanged(site, nextSite)) {
        site = nextSite;
        modelVersion += 1;
        events.broadcast(modelVersion);
      }
      const { done, total } = nextProject.totals.tasks;
      stdout.write(`updated (${nextProject.features.length} features, ${done}/${total} tasks)\n`);
      const current = new Set(allWarnings(nextProject).map(formatWarning));
      for (const line of current) if (!printed.has(line)) stderr.write(`${line}\n`);
      printed = current;
      const nextGitDir = next.gitDir ?? null;
      if (nextGitDir !== gitDir) {
        gitDir = nextGitDir;
        watcher.close();
        watcher = watch();
      }
    };

    /** Runs rescans one at a time; a change during a rescan runs one more. */
    const onChange = async () => {
      if (rescanning) {
        rescanAgain = true;
        return;
      }
      rescanning = true;
      try {
        do {
          rescanAgain = false;
          try {
            await rescan();
          } catch (err) {
            // Keep serving the last good site.
            stderr.write(`speckit-eye: rescan failed: ${/** @type {Error} */ (err)?.message ?? String(err)}\n`);
          }
        } while (rescanAgain && !stopped);
      } finally {
        rescanning = false;
      }
    };

    const watch = () =>
      createWatcher({
        root,
        gitDir,
        onChange: () => void onChange(),
        onError: (err) => stderr.write(`speckit-eye: watch error: ${err?.message ?? String(err)}\n`),
      });
    let watcher = watch();

    await new Promise((resolve) => onSignal(() => resolve(undefined)));
    stopped = true;
    watcher.close();
    events.close();
    await server.close();
    return 0;
  } catch (err) {
    stderr.write(`speckit-eye: ${/** @type {Error} */ (err)?.message ?? String(err)}\n`);
    return 1;
  }
}
