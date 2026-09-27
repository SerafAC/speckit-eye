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
 * On Linux, Node has no native recursive watch: its emulation watches every
 * file by inode, so after a file is replaced by rename (an editor's atomic
 * save) later in-place writes to it go unnoticed. There the recursive roots
 * are therefore watched as one non-recursive watch per folder (inotify
 * reports every change of a folder's entries by name, whatever the inode),
 * re-listed after every `rename` event so new folders are added and removed
 * ones dropped.
 *
 * A watched folder that is deleted and re-created at the same path (`rm -rf`
 * then `mkdir`, or another folder renamed into place) leaves its watch on the
 * deleted folder, which never reports again. Each watch therefore remembers
 * its folder's identity (`dev:ino`) and is re-created when the folder at its
 * path is a different one; and because a file system may hand the new folder
 * the same inode number, a watch that reports its own folder's name (inotify
 * signals the watched folder's deletion that way) is also re-created.
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
 * @property {() => void} [onRename] called on every `rename` event (folder-by-folder watches)
 */

/**
 * Every folder under `dir`, `dir` first. Unreadable folders are skipped;
 * symbolic links are not followed.
 * @param {string} dir
 * @param {(dir: string) => {name: string, isDirectory: () => boolean}[]} [readdir]
 * @returns {string[]}
 */
export function listDirs(dir, readdir = (d) => fs.readdirSync(d, { withFileTypes: true })) {
  const out = [dir];
  for (let i = 0; i < out.length; i++) {
    let entries;
    try {
      entries = readdir(out[i]);
    } catch {
      continue;
    }
    for (const e of entries) if (e.isDirectory()) out.push(path.join(out[i], e.name));
  }
  return out;
}

/**
 * @param {string} dir
 * @param {string} base
 * @returns {boolean} whether `dir` is `base` or inside it
 */
const isWithin = (dir, base) => dir === base || dir.startsWith(base + path.sep);

/**
 * @param {string} dir
 * @returns {string | null} the folder's `dev:ino`, or null when it cannot be read
 */
function folderIdentity(dir) {
  try {
    const st = fs.statSync(dir, { bigint: true });
    return `${st.dev}:${st.ino}`;
  } catch {
    return null;
  }
}

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
 * @param {boolean} [options.nativeRecursive] whether `watch` supports
 *   `recursive` natively (everywhere but Linux); otherwise every folder of a
 *   recursive root gets its own watch
 * @param {(dir: string) => string[]} [options.listDirs] every folder under a root, the root first
 * @param {(dir: string) => string | null} [options.identity] a folder's identity
 *   (`dev:ino`), or null when it is missing
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
  nativeRecursive = process.platform !== "linux",
  listDirs: listFolders = (dir) => listDirs(dir),
  identity = folderIdentity,
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
  /** @type {Map<string, string | null>} identity of each watched folder when its watch started */
  const ids = new Map();
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
   * @param {string} dir
   */
  const stop = (dir) => {
    const w = active.get(dir);
    if (!w) return;
    active.delete(dir);
    ids.delete(dir);
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
      w = watch(entry.dir, { recursive: entry.recursive }, (eventType, filename) => {
        if (closed) return;
        const name = entry.recursive ? null : topName(filename);
        // The watched folder itself was deleted or moved (or a child has the
        // same name, where a fresh watch costs nothing): drop this watch so
        // the refresh below re-creates it on whatever folder is there now.
        const self = eventType === "rename" && !entry.recursive && name === path.basename(entry.dir);
        if (self && active.get(entry.dir) === w) stop(entry.dir);
        if (eventType === "rename") entry.onRename?.();
        const rootsChanged = entry.structural || (self && !entry.onRename) ? refreshRoots() : false;
        if (rootsChanged || self || entry.relevant(name)) schedule();
      });
    } catch (err) {
      onError(/** @type {Error} */ (err));
      return false;
    }
    active.set(entry.dir, w);
    ids.set(entry.dir, identity(entry.dir));
    w.on?.("error", (err) => {
      // A watcher that reported an error is dropped; the next refresh re-adds
      // it if its folder still exists.
      if (active.get(entry.dir) === w) stop(entry.dir);
      onError(err);
    });
    return true;
  };

  /**
   * @param {string} dir
   * @returns {boolean} whether `dir` is watched but the folder at its path is
   *   no longer the one the watch was started on
   */
  const replaced = (dir) => active.has(dir) && identity(dir) !== ids.get(dir);

  /**
   * Adds watches for roots that exist now and drops those whose folder is
   * gone. Idempotent.
   * @returns {boolean} whether any watch was added or removed
   */
  function refreshRoots() {
    if (closed) return false;
    let changed = false;
    for (const entry of entries) {
      if (entry.recursive && !nativeRecursive) {
        changed = syncFolders(entry.dir) || changed;
        continue;
      }
      const present = exists(entry.dir);
      if (present && replaced(entry.dir)) stop(entry.dir);
      const watching = active.has(entry.dir);
      if (present && !watching) changed = start(entry) || changed;
      else if (!present && watching) {
        stop(entry.dir);
        changed = true;
      }
    }
    return changed;
  }

  /**
   * Without native recursion: one watch per folder under `root`, adding new
   * folders and dropping those that are gone. A `rename` event (an entry
   * created, removed or renamed) re-lists the folders.
   * @param {string} root
   * @returns {boolean} whether any watch was added or removed
   */
  function syncFolders(root) {
    const wanted = new Set(exists(root) ? listFolders(root) : []);
    let changed = false;
    for (const dir of [...active.keys()]) {
      if (isWithin(dir, root) && !wanted.has(dir)) {
        stop(dir);
        changed = true;
      }
    }
    for (const dir of wanted) {
      if (replaced(dir)) {
        stop(dir);
        changed = true;
      }
      if (active.has(dir)) continue;
      changed =
        start({
          dir,
          recursive: false,
          relevant: () => true,
          structural: false,
          onRename: () => syncFolders(root),
        }) || changed;
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
      for (const dir of [...active.keys()]) stop(dir);
      if (quietTimer !== null) clearTimeout(quietTimer);
      if (maxTimer !== null) clearTimeout(maxTimer);
      quietTimer = null;
      maxTimer = null;
    },
  };
}
