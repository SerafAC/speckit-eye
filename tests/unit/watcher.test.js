import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createWatcher, QUIET_MS, MAX_WAIT_MS } from "../../src/serve/watcher.js";

const ROOT = path.resolve("/proj");
const GIT = path.join(ROOT, ".git");
const p = (...parts) => path.join(ROOT, ...parts);

/** A fake `fs.watch` that records every watch and lets tests emit events. */
function fakeFs(initial) {
  const dirs = new Set(initial);
  /** @type {Map<string, {options: object, listener: Function, closed: boolean, errorHandlers: Function[]}>} */
  const watches = new Map();
  const calls = [];
  const watch = (dir, options, listener) => {
    calls.push({ dir, options });
    const w = {
      options,
      listener,
      closed: false,
      errorHandlers: [],
      close() {
        w.closed = true;
      },
      on(event, cb) {
        if (event === "error") w.errorHandlers.push(cb);
        return w;
      },
    };
    watches.set(dir, w);
    return w;
  };
  const exists = (dir) => dirs.has(dir);
  const emit = (dir, eventType, filename) => {
    const w = watches.get(dir);
    assert.ok(w && !w.closed, `no open watch on ${dir}`);
    w.listener(eventType, filename);
  };
  return { dirs, watches, calls, watch, exists, emit };
}

const FULL = [ROOT, p("specs"), p(".specify"), p(".specify", "memory"), p(".specify", "assessments"), GIT];

describe("createWatcher", () => {
  let fsx;
  let changes;
  let errors;
  let watcher;

  function make({ dirs = FULL, gitDir = GIT } = {}) {
    fsx = fakeFs(dirs);
    changes = 0;
    errors = [];
    watcher = createWatcher({
      root: ROOT,
      gitDir,
      watch: fsx.watch,
      exists: fsx.exists,
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h),
      onChange: () => changes++,
      onError: (err) => errors.push(err),
    });
    return watcher;
  }

  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => {
    watcher?.close();
    mock.timers.reset();
  });

  test("watches the recursive roots recursively and the parents without recursion", () => {
    make();
    const byDir = Object.fromEntries(fsx.calls.map((c) => [c.dir, c.options.recursive]));
    assert.deepEqual(byDir, {
      [p("specs")]: true,
      [p(".specify", "memory")]: true,
      [p(".specify", "assessments")]: true,
      [p(".specify")]: false,
      [ROOT]: false,
      [GIT]: false,
    });
    assert.deepEqual(watcher.watched().sort(), [...FULL].sort());
  });

  test("a single event fires onChange once after the quiet period", () => {
    make();
    fsx.emit(p("specs"), "change", "001-a/tasks.md");
    mock.timers.tick(QUIET_MS - 1);
    assert.equal(changes, 0);
    mock.timers.tick(1);
    assert.equal(changes, 1);
    mock.timers.tick(1000);
    assert.equal(changes, 1);
  });

  test("a burst is capped at the maximum wait", () => {
    make();
    // One event every 50 ms keeps the quiet timer from ever expiring.
    for (let t = 0; t < MAX_WAIT_MS; t += 50) {
      fsx.emit(p("specs"), "change", "001-a/tasks.md");
      mock.timers.tick(50);
    }
    assert.equal(changes, 1, "fired once at 500 ms despite the ongoing burst");
    fsx.emit(p("specs"), "change", "001-a/tasks.md");
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 2);
  });

  test("HEAD replaced by rename still fires; unrelated files in the git dir are ignored", () => {
    make();
    fsx.emit(GIT, "rename", "index.lock");
    fsx.emit(GIT, "change", "index");
    fsx.emit(GIT, "rename", "HEAD.lock");
    mock.timers.tick(1000);
    assert.equal(changes, 0);
    fsx.emit(GIT, "rename", "HEAD");
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 1);
    // The watch on the folder survives the rename: a second switch fires again.
    fsx.emit(GIT, "rename", "HEAD");
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 2);
  });

  test(".specify/ is filtered to feature.json", () => {
    make();
    fsx.emit(p(".specify"), "change", "init-options.json");
    fsx.emit(p(".specify"), "rename", "templates");
    mock.timers.tick(1000);
    assert.equal(changes, 0);
    fsx.emit(p(".specify"), "rename", "feature.json");
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 1);
  });

  test("unrelated files in the project root are ignored", () => {
    make();
    fsx.emit(ROOT, "change", "README.md");
    fsx.emit(ROOT, "rename", "node_modules");
    mock.timers.tick(1000);
    assert.equal(changes, 0);
  });

  test("specs/ created after start gets watched and fires", () => {
    make({ dirs: [ROOT, p(".specify")] });
    assert.deepEqual(watcher.watched().sort(), [ROOT, p(".specify")].sort());
    fsx.dirs.add(p("specs"));
    fsx.emit(ROOT, "rename", "specs");
    assert.ok(watcher.watched().includes(p("specs")));
    assert.equal(fsx.calls.filter((c) => c.dir === p("specs"))[0].options.recursive, true);
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 1);
    fsx.emit(p("specs"), "rename", "001-new/spec.md");
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 2);
  });

  test(".specify/assessments created after start is added through the .specify watch", () => {
    make({ dirs: [ROOT, p("specs"), p(".specify")] });
    fsx.dirs.add(p(".specify", "assessments"));
    fsx.emit(p(".specify"), "rename", "assessments");
    assert.ok(watcher.watched().includes(p(".specify", "assessments")));
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 1);
  });

  test("refreshRoots is idempotent and drops roots that disappeared", () => {
    make();
    const before = fsx.calls.length;
    assert.equal(watcher.refreshRoots(), false);
    assert.equal(watcher.refreshRoots(), false);
    assert.equal(fsx.calls.length, before);
    fsx.dirs.delete(p("specs"));
    const specsWatch = fsx.watches.get(p("specs"));
    assert.equal(watcher.refreshRoots(), true);
    assert.equal(specsWatch.closed, true);
    assert.ok(!watcher.watched().includes(p("specs")));
  });

  test("missing roots and a missing git dir are skipped", () => {
    make({ dirs: [ROOT], gitDir: null });
    assert.deepEqual(watcher.watched(), [ROOT]);
  });

  test("watcher errors go to onError and do not crash; the watch is re-added later", () => {
    make();
    const w = fsx.watches.get(p("specs"));
    const err = new Error("EPERM");
    for (const h of w.errorHandlers) h(err);
    assert.deepEqual(errors, [err]);
    assert.ok(!watcher.watched().includes(p("specs")));
    assert.equal(watcher.refreshRoots(), true);
    assert.ok(watcher.watched().includes(p("specs")));
  });

  test("a throwing fs.watch is reported and skipped", () => {
    const err = new Error("ENOSPC");
    fsx = fakeFs(FULL);
    errors = [];
    watcher = createWatcher({
      root: ROOT,
      watch: (dir, options, listener) => {
        if (dir === p("specs")) throw err;
        return fsx.watch(dir, options, listener);
      },
      exists: fsx.exists,
      onChange: () => {},
      onError: (e) => errors.push(e),
    });
    assert.deepEqual(errors, [err]);
    assert.ok(!watcher.watched().includes(p("specs")));
  });

  test("close stops all watchers and pending timers", () => {
    make();
    fsx.emit(p("specs"), "change", "001-a/tasks.md");
    const all = [...fsx.watches.values()];
    watcher.close();
    assert.ok(all.every((w) => w.closed));
    assert.deepEqual(watcher.watched(), []);
    mock.timers.tick(1000);
    assert.equal(changes, 0);
    watcher.close();
  });

  test("events without a file name on a filtered folder still fire", () => {
    make();
    fsx.emit(p(".specify"), "rename", null);
    fsx.emit(GIT, "rename", undefined);
    mock.timers.tick(QUIET_MS);
    assert.equal(changes, 1);
  });

  test("a throwing onChange is reported through onError", () => {
    const err = new Error("boom");
    fsx = fakeFs(FULL);
    errors = [];
    watcher = createWatcher({
      root: ROOT,
      watch: fsx.watch,
      exists: fsx.exists,
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h),
      onChange: () => {
        throw err;
      },
      onError: (e) => errors.push(e),
    });
    fsx.emit(p("specs"), "change", "x.md");
    mock.timers.tick(QUIET_MS);
    assert.deepEqual(errors, [err]);
  });

  test("after close, late events, late timers and refreshRoots do nothing", () => {
    fsx = fakeFs(FULL);
    changes = 0;
    const timers = [];
    watcher = createWatcher({
      root: ROOT,
      watch: fsx.watch,
      exists: fsx.exists,
      setTimeout: (fn) => timers.push(fn),
      clearTimeout: () => {},
      onChange: () => changes++,
    });
    const listener = fsx.watches.get(p("specs")).listener;
    listener("change", "x.md");
    watcher.close();
    for (const fn of timers) fn();
    listener("change", "y.md");
    assert.equal(changes, 0);
    assert.equal(timers.length, 2);
    assert.equal(watcher.refreshRoots(), false);
  });

  test("a watch whose close throws is still dropped", () => {
    make();
    fsx.watches.get(p("specs")).close = () => {
      throw new Error("already closed");
    };
    fsx.dirs.delete(p("specs"));
    assert.equal(watcher.refreshRoots(), true);
    assert.ok(!watcher.watched().includes(p("specs")));
  });

  test("without onError, a failing fs.watch is skipped silently", () => {
    watcher = createWatcher({
      root: ROOT,
      watch: () => {
        throw new Error("ENOSPC");
      },
      exists: () => true,
      onChange: () => {},
    });
    assert.deepEqual(watcher.watched(), []);
  });
});
