/**
 * Project watcher for serve mode (research R2). Uses Node's built-in
 * `fs.watch`:
 *
 * - `specs/`, `.specify/memory/` and `.specify/assessments/` recursively;
 * - the single-file inputs through their parent folders, without recursion
 *   and filtered by file name (`.specify/` → `feature.json`, the git dir →
 *   `HEAD`), because rename-saves make a watch on the file itself go silent;
 * - the project root and `.specify/` without recursion, so a recursive root
 *   created after startup is picked up on the next event (`refreshRoots()`).
 *
 * Every relevant event triggers one debounced `onChange()` (100 ms quiet
 * period, at most 500 ms of waiting during a burst). Watcher errors go to
 * `onError` and never crash the process. All I/O and timers are injected so
 * the module is unit tested with fakes (constitution §IV).
 */

import fs from "node:fs";
import path from "node:path";

export const QUIET_MS = 100;
export const MAX_WAIT_MS = 500;

/** Recursive roots, relative to the project root. */
const RECURSIVE_ROOTS = Object.freeze(["specs", ".specify/memory", ".specify/assessments"]);

/**
 * @typedef {object} FsWatcher
 * @property {() => void} close
 * @property {(event: "error", cb: (err: Error) => void) => unknown} [on]
 */

/**
 * @typedef {(dir: string, options: {recursive: boolean}, listener: (eventType: string, filename: string | null) => void) => FsWatcher} WatchFn
 */

/**
 * @typedef {object} WatchEntry
 * @property {string} dir absolute folder to watch
 * @property {boolean} recursive
 * @property {(filename: string | null) => boolean} relevant whether an event on this name triggers a rescan
 * @property {boolean} structural events here may create or remove other roots
 */

/**
 * @param {string | Buffer | null | undefined} filename
 * @returns {string | null} the first path segment of an event's file name
 */
function topName(filename) {
  if (filename === null || filename === undefined) return null;
  return String(filename).split(/[\\/]/, 1)[0];
}

/**
 * @param {object} options
 * @param {string} options.root absolute project root
 * @param {string | null} [options.gitDir] absolute git dir (its `HEAD` is watched)
 * @param {WatchFn} [options.watch]
 * @param {(absPath: string) => boolean} [options.exists]
 * @param {(fn: () => void, ms: number) => any} [options.setTimeout]
 * @param {(handle: any) => void} [options.clearTimeout]
 * @param {() => void} options.onChange
 * @param {(err: Error) => void} [options.onError]
 * @returns {{ close: () => void, refreshRoots: () => boolean, watched: () => string[] }}
 */
export function createWatcher({
  root,
  gitDir = null,
  watch = /** @type {WatchFn} */ (/** @type {unknown} */ (fs.watch)),
  exists = fs.existsSync,
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout,
  onChange,
  onError = () => {},
}) {
  const specify = path.join(root, ".specify");

  /** @type {WatchEntry[]} */
  const entries = [
    ...RECURSIVE_ROOTS.map((rel) => ({
      dir: path.join(root, ...rel.split("/")),
      recursive: true,
      relevant: () => true,
      structural: false,
    })),
    {
      dir: specify,
      recursive: false,
      relevant: (name) => name === null || name === "feature.json" || name === "memory" || name === "assessments",
      structural: true,
    },
    {
      dir: root,
      recursive: false,
      relevant: (name) => name === "specs" || name === ".specify",
      structural: true,
    },
  ];
  if (gitDir) {
    entries.push({
      dir: gitDir,
      recursive: false,
      relevant: (name) => name === null || name === "HEAD",
      structural: false,
    });
  }

  /** @type {Map<string, FsWatcher>} */
  const active = new Map();
  let closed = false;
  /** @type {any} */
  let quietTimer = null;
  /** @type {any} */
  let maxTimer = null;

  const fire = () => {
    if (quietTimer !== null) clearTimeout(quietTimer);
    if (maxTimer !== null) clearTimeout(maxTimer);
    quietTimer = null;
    maxTimer = null;
    if (closed) return;
    try {
      onChange();
    } catch (err) {
      onError(/** @type {Error} */ (err));
    }
  };

  // Only called from a watch listener, which returns early once closed.
  const schedule = () => {
    if (quietTimer !== null) clearTimeout(quietTimer);
    quietTimer = setTimeout(fire, QUIET_MS);
    if (maxTimer === null) maxTimer = setTimeout(fire, MAX_WAIT_MS);
  };

  /**
   * @param {WatchEntry} entry
   */
  const stop = (entry) => {
    const w = active.get(entry.dir);
    if (!w) return;
    active.delete(entry.dir);
    try {
      w.close();
    } catch {
      // already closed
    }
  };

  /**
   * @param {WatchEntry} entry
   * @returns {boolean} whether the watch was added
   */
  const start = (entry) => {
    /** @type {FsWatcher} */
    let w;
    try {
      w = watch(entry.dir, { recursive: entry.recursive }, (_eventType, filename) => {
        if (closed) return;
        const name = entry.recursive ? null : topName(filename);
        const rootsChanged = entry.structural ? refreshRoots() : false;
        if (rootsChanged || entry.relevant(name)) schedule();
      });
    } catch (err) {
      onError(/** @type {Error} */ (err));
      return false;
    }
    active.set(entry.dir, w);
    w.on?.("error", (err) => {
      // A watcher that reported an error is dropped; the next refresh re-adds
      // it if its folder still exists.
      if (active.get(entry.dir) === w) stop(entry);
      onError(err);
    });
    return true;
  };

  /**
   * Adds watches for roots that exist now and drops those whose folder is
   * gone. Idempotent.
   * @returns {boolean} whether any watch was added or removed
   */
  function refreshRoots() {
    if (closed) return false;
    let changed = false;
    for (const entry of entries) {
      const present = exists(entry.dir);
      const watching = active.has(entry.dir);
      if (present && !watching) changed = start(entry) || changed;
      else if (!present && watching) {
        stop(entry);
        changed = true;
      }
    }
    return changed;
  }

  refreshRoots();

  return {
    refreshRoots,
    watched: () => [...active.keys()],
    close() {
      if (closed) return;
      closed = true;
      for (const entry of entries) stop(entry);
      if (quietTimer !== null) clearTimeout(quietTimer);
      if (maxTimer !== null) clearTimeout(maxTimer);
      quietTimer = null;
      maxTimer = null;
    },
  };
}
