import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { run, formatWarning, allWarnings, siteChanged, VERSION, EXPOSURE_NOTE, defaultReadAsset, defaultOnSignal } from "../../src/cli/main.js";
import { EventEmitter } from "node:events";
import { USAGE } from "../../src/cli/args.js";
import { createFakeReader } from "./fake-reader.js";
import { fakeFs } from "./fake-fs.js";

const pkgVersion = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version;

const MIXED = {
  ".specify/memory/constitution.md": "# Constitution",
  "specs/001-a/spec.md": "# Feature Specification: Alpha",
  "specs/001-a/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n- [ ] T002 two",
};

const NONSTANDARD = {
  "specs/001-odd/tasks.md": "## Phase 1: Setup\n- [ ] no id here\n- [x] T002 fine",
};

function sink() {
  const s = { text: "", write: (chunk) => (s.text += chunk) };
  return s;
}

/**
 * Fakes for every dependency. `files` = null means the folder is missing.
 */
function fakes({ files = MIXED, listenError = null, assetError = null } = {}) {
  const calls = { roots: [], startServer: [], closed: 0, signalHandler: null, watchers: [], hubs: [] };
  const deps = {
    stdout: sink(),
    stderr: sink(),
    cwd: "/work",
    createReader: (root) => {
      calls.roots.push(root);
      if (files === null) {
        return { list: async () => [], read: async () => "", exists: async () => false, readGitHead: async () => null };
      }
      return createFakeReader(files);
    },
    startServer: async (opts) => {
      calls.startServer.push(opts);
      if (listenError) throw listenError;
      return {
        url: "http://127.0.0.1:4747/",
        port: 4747,
        close: async () => {
          calls.closed++;
        },
      };
    },
    readAsset: async (name) => {
      if (assetError) throw assetError;
      return `/* ${name} */`;
    },
    onSignal: (handler) => {
      calls.signalHandler = handler;
    },
    createWatcher: (opts) => {
      const w = { opts, closed: false, close: () => (w.closed = true) };
      calls.watchers.push(w);
      return w;
    },
    createEventHub: (opts) => {
      const hub = { opts, broadcasts: [], added: [], closed: false };
      hub.add = (req, res) => hub.added.push({ req, res });
      hub.broadcast = (v) => hub.broadcasts.push(v);
      hub.close = () => (hub.closed = true);
      calls.hubs.push(hub);
      return hub;
    },
  };
  return { deps, calls };
}

/** Starts `run`, waits until it blocks on the signal, returns the pending promise. */
async function startServe(argv, f) {
  const pending = run(argv, f.deps);
  for (let i = 0; i < 50 && !f.calls.signalHandler; i++) await new Promise((r) => setImmediate(r));
  return pending;
}

function get(handler, url, method = "GET") {
  const res = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body === undefined ? undefined : Buffer.from(body).toString("utf8");
    },
  };
  handler({ method, url }, res);
  return res;
}

describe("run: help, version, usage errors", () => {
  test("--help prints usage to stdout and returns 0", async () => {
    for (const flag of ["--help", "-h"]) {
      const f = fakes();
      assert.equal(await run([flag], f.deps), 0);
      assert.equal(f.deps.stdout.text, USAGE);
      assert.equal(f.deps.stderr.text, "");
    }
  });

  test("--version prints the package.json version and returns 0", async () => {
    assert.equal(VERSION, pkgVersion);
    for (const flag of ["--version", "-v"]) {
      const f = fakes();
      assert.equal(await run([flag], f.deps), 0);
      assert.equal(f.deps.stdout.text, `${pkgVersion}\n`);
    }
  });

  test("no arguments prints usage to stderr and returns 2", async () => {
    const f = fakes();
    assert.equal(await run([], f.deps), 2);
    assert.equal(f.deps.stderr.text, USAGE);
    assert.equal(f.deps.stdout.text, "");
  });

  test("usage errors print the reason and usage to stderr and return 2", async () => {
    for (const argv of [["--nope"], ["--serve", "a", "--build", "b"], ["--serve", "a", "--out", "x"], ["--build", "a"]]) {
      const f = fakes();
      assert.equal(await run(argv, f.deps), 2, argv.join(" "));
      assert.match(f.deps.stderr.text, /^speckit-eye: .+\n\nUsage:/);
      assert.equal(f.deps.stdout.text, "");
      assert.equal(f.calls.startServer.length, 0);
    }
  });
});

describe("run: project checks", () => {
  test("missing folder returns 2 with a message naming it", async () => {
    const f = fakes({ files: null });
    assert.equal(await run(["--serve", "missing"], f.deps), 2);
    assert.match(f.deps.stderr.text, /folder not found: .*missing/);
    assert.equal(f.calls.startServer.length, 0);
  });

  test("a folder without specs/ or .specify/ returns 2 naming both", async () => {
    const f = fakes({ files: { "README.md": "# hi" } });
    assert.equal(await run(["--serve", "plain"], f.deps), 2);
    assert.match(f.deps.stderr.text, /not a Spec Kit project \(expected a specs\/ or \.specify\/ folder\)/);
    assert.equal(f.calls.startServer.length, 0);
  });

  test("resolves the folder against cwd", async () => {
    const f = fakes({ files: null });
    await run(["--serve", "proj"], f.deps);
    assert.deepEqual(f.calls.roots, [path.resolve("/work", "proj")]);
  });
});

describe("run: serve mode", () => {
  test("serves the rendered site and prints the start lines", async () => {
    const f = fakes();
    const pending = startServe(["--serve", "proj"], f);
    await new Promise((r) => setImmediate(r));
    assert.equal(f.calls.startServer.length, 1);
    const root = path.resolve("/work", "proj");
    assert.equal(
      f.deps.stdout.text,
      `speckit-eye ${pkgVersion} — serving ${root}\n` +
        "  Local: http://127.0.0.1:4747/\n" +
        "  Watching specs/ and .specify/ for changes (Ctrl+C to stop)\n",
    );
    assert.equal(f.deps.stderr.text, "");

    const { handler } = f.calls.startServer[0];
    const page = get(handler, "/");
    assert.equal(page.status, 200);
    assert.match(page.body, /<body data-mode="serve" data-version="/);
    assert.match(page.body, /<title>proj · speckit-eye<\/title>/);
    assert.match(page.body, /1 \/ 2 tasks \(50 %\)/);
    assert.equal(get(handler, "/assets/styles.css").body, "/* styles.css */");
    assert.equal(get(handler, "/assets/overview.js").body, "/* overview.js */");
    assert.equal(get(handler, "/assets/live.js").body, "/* live.js */");
    assert.equal(get(handler, "/constitution.md").status, 404);

    f.calls.signalHandler();
    assert.equal(await pending, 0);
    assert.equal(f.calls.closed, 1);
  });

  test("prints each warning to stderr", async () => {
    const f = fakes({ files: NONSTANDARD });
    const pending = startServe(["--serve", "odd"], f);
    await new Promise((r) => setImmediate(r));
    assert.equal(f.deps.stderr.text, "warning: specs/001-odd/tasks.md:2 checkbox without a task ID (counted)\n");
    f.calls.signalHandler();
    assert.equal(await pending, 0);
  });

  test("returns 1 when the server cannot start", async () => {
    const f = fakes({ listenError: Object.assign(new Error("listen EACCES"), { code: "EACCES" }) });
    assert.equal(await run(["--serve", "proj"], f.deps), 1);
    assert.match(f.deps.stderr.text, /speckit-eye: listen EACCES/);
  });

  test("returns 1 on an unexpected error", async () => {
    const f = fakes({ assetError: new Error("boom") });
    assert.equal(await run(["--serve", "proj"], f.deps), 1);
    assert.match(f.deps.stderr.text, /speckit-eye: boom/);
    assert.equal(f.calls.startServer.length, 0);
  });
});

describe("run: non-Error failures", () => {
  test("a thrown non-Error value is printed as text and returns 1", async () => {
    const f = fakes({ assetError: "no assets" });
    assert.equal(await run(["--serve", "proj"], f.deps), 1);
    assert.equal(f.deps.stderr.text, "speckit-eye: no assets\n");
  });
});

describe("defaultReadAsset", () => {
  test("reads a packaged asset by name", async () => {
    const calls = [];
    const text = await defaultReadAsset("overview.js", async (url, enc) => {
      calls.push([url.pathname, enc]);
      return "js";
    });
    assert.equal(text, "js");
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /\/src\/client\/overview\.js$/);
    assert.equal(calls[0][1], "utf8");
  });

  test("an unknown name is rejected without reading", async () => {
    await assert.rejects(
      defaultReadAsset("secret.txt", async () => assert.fail("must not read")),
      /unknown asset secret\.txt/,
    );
  });

  test("a missing dist/styles.css names the build command", async () => {
    const enoent = async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    };
    await assert.rejects(defaultReadAsset("styles.css", enoent), /run `pnpm run build:css` first/);
  });

  test("other read errors are passed through", async () => {
    const enoent = async () => {
      throw Object.assign(new Error("ENOENT live"), { code: "ENOENT" });
    };
    await assert.rejects(defaultReadAsset("live.js", enoent), /^Error: ENOENT live$/);
    const eacces = async () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };
    await assert.rejects(defaultReadAsset("styles.css", eacces), /^Error: EACCES$/);
  });
});

describe("defaultOnSignal", () => {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    test(`${signal} calls the handler once and removes both listeners`, () => {
      const proc = new EventEmitter();
      let calls = 0;
      defaultOnSignal(() => calls++, proc);
      assert.equal(proc.listenerCount("SIGINT"), 1);
      assert.equal(proc.listenerCount("SIGTERM"), 1);
      proc.emit(signal);
      assert.equal(calls, 1);
      assert.equal(proc.listenerCount("SIGINT"), 0);
      assert.equal(proc.listenerCount("SIGTERM"), 0);
    });
  }

  test("a second signal before the listeners are removed does not call the handler again", () => {
    const listeners = [];
    const fake = { on: (e, fn) => listeners.push(fn), off: () => {} };
    let calls = 0;
    defaultOnSignal(() => calls++, fake);
    listeners[0]();
    listeners[1]();
    assert.equal(calls, 1);
  });
});

describe("run: build mode (US4, T055)", () => {
  const NOW = new Date("2026-09-25T10:00:00.000Z");
  const build = (argv, opts = {}, fs = fakeFs()) => {
    const f = fakes(opts);
    f.deps.fs = fs;
    f.deps.now = () => NOW;
    return { f, fs, result: run(argv, f.deps) };
  };
  const root = path.resolve("/work", "proj");
  const out = path.resolve("/work", "site");

  test("writes the static site and prints the summary and the exposure note (FR-003, FR-034)", async () => {
    const { f, fs, result } = build(["--build", "proj", "--out", "site", "--base", "repo"]);
    assert.equal(await result, 0);
    assert.equal(
      f.deps.stdout.text,
      `speckit-eye ${pkgVersion} — building ${root} → site (base /repo/)\n` + "  wrote 4 pages\n" + EXPOSURE_NOTE,
    );
    assert.match(EXPOSURE_NOTE, /^  Note: this site includes every spec, plan, research note, the constitution and assessments\.\n {8}Anyone who can reach it can read them unless your host restricts access\.\n$/);
    assert.equal(f.deps.stderr.text, "");
    assert.equal(f.calls.startServer.length, 0);
    assert.equal(f.calls.watchers.length, 0);
    const index = fs.files.get(path.join(out, "index.html"));
    assert.match(index, /<body data-mode="static"/);
    assert.match(index, /href="\/repo\/assets\/styles\.css"/);
    assert.match(index, /generated at <time datetime="2026-09-25T10:00:00\.000Z">/);
    assert.doesNotMatch(index, /live\.js|__events/);
    assert.ok(fs.files.has(path.join(out, "features", "001-a", "spec.html")));
    assert.ok(fs.files.has(path.join(out, "constitution.html")));
    assert.equal(fs.files.get(path.join(out, "assets", "styles.css")), "/* styles.css */");
    assert.ok(!fs.files.has(path.join(out, "assets", "live.js")));
    assert.ok(fs.files.has(path.join(out, ".speckit-eye-build")));
  });

  test("warnings go to stderr and are counted in the summary", async () => {
    const { f, result } = build(["--build", "odd", "--out", "site"], { files: NONSTANDARD });
    assert.equal(await result, 0);
    assert.equal(f.deps.stderr.text, "warning: specs/001-odd/tasks.md:2 checkbox without a task ID (counted)\n");
    assert.match(f.deps.stdout.text, /\n  wrote 2 pages\n  1 warning \(see above\)\n  Note:/);
  });

  test("without an injected clock the current time is used", async () => {
    const f = fakes();
    const fs = fakeFs();
    f.deps.fs = fs;
    const before = Date.now();
    assert.equal(await run(["--build", "proj", "--out", "site"], f.deps), 0);
    const index = fs.files.get(path.join(out, "index.html"));
    const at = Date.parse(/datetime="([^"]+)"/.exec(index)[1]);
    assert.ok(at >= before && at <= Date.now());
  });

  test("more than one warning is counted in the plural", async () => {
    const files = { "specs/001-odd/tasks.md": "## Phase 1: Setup\n- [ ] no id\n- [ ] no id either" };
    const { f, result } = build(["--build", "odd", "--out", "site"], { files });
    assert.equal(await result, 0);
    assert.match(f.deps.stdout.text, /\n  2 warnings \(see above\)\n/);
  });

  test("a foreign non-empty --out returns 2 and writes nothing (FR-033)", async () => {
    const fs = fakeFs({ [path.join(out, "keep.txt")]: "mine" });
    const { f, result } = build(["--build", "proj", "--out", "site"], {}, fs);
    assert.equal(await result, 2);
    assert.match(f.deps.stderr.text, /speckit-eye: .*not empty/);
    assert.deepEqual(fs.writes, []);
    assert.doesNotMatch(f.deps.stdout.text, /wrote|Note/);
  });

  test("--out inside the project's specs/ returns 2", async () => {
    const { f, fs, result } = build(["--build", "proj", "--out", "proj/specs/site"]);
    assert.equal(await result, 2);
    assert.match(f.deps.stderr.text, /inside specs\//);
    assert.deepEqual(fs.writes, []);
  });

  test("a write failure returns 1", async () => {
    const fs = fakeFs();
    fs.writeFile = async () => {
      throw new Error("EROFS: read-only file system");
    };
    const { f, result } = build(["--build", "proj", "--out", "site"], {}, fs);
    assert.equal(await result, 1);
    assert.match(f.deps.stderr.text, /EROFS/);
  });

  test("a missing project returns 2 before anything is written", async () => {
    const { f, fs, result } = build(["--build", "missing", "--out", "site"], { files: null });
    assert.equal(await result, 2);
    assert.match(f.deps.stderr.text, /folder not found/);
    assert.deepEqual(fs.writes, []);
  });

  test("a missing asset returns 1", async () => {
    const { f, result } = build(["--build", "proj", "--out", "site"], { assetError: new Error("dist/styles.css is missing") });
    assert.equal(await result, 1);
    assert.match(f.deps.stderr.text, /styles\.css is missing/);
  });
});

describe("warning helpers", () => {
  test("formatWarning with and without a line", () => {
    assert.equal(formatWarning({ code: "W1", file: "specs/a/tasks.md", line: 14, message: "m" }), "warning: specs/a/tasks.md:14 m");
    assert.equal(formatWarning({ code: "W9", file: "specs/a/x.md", line: null, message: "m" }), "warning: specs/a/x.md m");
  });

  test("allWarnings accepts a project and features without warning lists", () => {
    assert.deepEqual(allWarnings({ features: [{}, { warnings: [{ file: "b" }] }] }), [{ file: "b" }]);
  });

  test("allWarnings lists project warnings then feature warnings", () => {
    const p = { warnings: [{ file: "a" }], features: [{ warnings: [{ file: "b" }] }, { warnings: [] }] };
    assert.deepEqual(allWarnings(p).map((w) => w.file), ["a", "b"]);
  });
});

describe("run: live updates (US2)", () => {
  /**
   * Starts serve mode with a reader whose files the test can replace.
   * `gitHeads` is consulted on every scan.
   */
  async function live(files = MIXED, { gitDir = null } = {}) {
    const f = fakes();
    const state = { files, gitDir };
    f.deps.createReader = (root) => {
      f.calls.roots.push(root);
      const current = () => createFakeReader(state.files, { gitHead: state.gitDir ? { gitDir: state.gitDir, head: "ref: refs/heads/main" } : null });
      return {
        list: (d) => current().list(d),
        read: (p) => current().read(p),
        exists: (p) => current().exists(p),
        readGitHead: () => current().readGitHead(),
      };
    };
    const pending = startServe(["--serve", "proj"], f);
    await settle();
    const watcher = () => f.calls.watchers.at(-1);
    const change = async () => {
      watcher().opts.onChange();
      await settle();
    };
    const handler = () => f.calls.startServer[0].handler;
    return { f, state, pending, watcher, change, handler, hub: () => f.calls.hubs[0] };
  }

  const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };

  test("creates the hub and the watcher for the project root and git dir", async () => {
    const t = await live(MIXED, { gitDir: "/work/proj/.git" });
    assert.equal(t.f.calls.hubs.length, 1);
    assert.equal(t.hub().opts.version, 0);
    assert.equal(t.f.calls.watchers.length, 1);
    assert.equal(t.watcher().opts.root, path.resolve("/work", "proj"));
    assert.equal(t.watcher().opts.gitDir, "/work/proj/.git");
    assert.equal(typeof t.watcher().opts.onChange, "function");
    assert.equal(typeof t.watcher().opts.onError, "function");
    t.f.calls.signalHandler();
    assert.equal(await t.pending, 0);
  });

  test("GET /__events is handed to the hub", async () => {
    const t = await live();
    get(t.handler(), "/__events");
    assert.equal(t.hub().added.length, 1);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("a change rescans, swaps the site, increments the version and broadcasts", async () => {
    const t = await live();
    assert.match(get(t.handler(), "/").body, /1 \/ 2 tasks \(50 %\)/);
    t.state.files = { ...MIXED, "specs/001-a/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n- [x] T002 two" };
    await t.change();
    assert.match(get(t.handler(), "/").body, /2 \/ 2 tasks \(100 %\)/);
    assert.deepEqual(t.hub().broadcasts, [1]);
    assert.match(t.f.deps.stdout.text, /updated \(1 features, 2\/2 tasks\)\n$/);

    t.state.files = { ...MIXED, "specs/001-a/tasks.md": "## Phase 1: Setup\n- [ ] T001 one\n- [x] T002 two" };
    await t.change();
    assert.deepEqual(t.hub().broadcasts, [1, 2]);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("a rescan that changes nothing logs the line but does not broadcast", async () => {
    const t = await live();
    await t.change();
    await t.change();
    assert.deepEqual(t.hub().broadcasts, []);
    const lines = t.f.deps.stdout.text.split("\n").filter((l) => l.startsWith("updated"));
    assert.deepEqual(lines, ["updated (1 features, 1/2 tasks)", "updated (1 features, 1/2 tasks)"]);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("new or changed warnings are printed once", async () => {
    const t = await live(NONSTANDARD);
    const w1 = "warning: specs/001-odd/tasks.md:2 checkbox without a task ID (counted)\n";
    assert.equal(t.f.deps.stderr.text, w1);
    await t.change();
    assert.equal(t.f.deps.stderr.text, w1, "unchanged warning not repeated");
    t.state.files = { "specs/001-odd/tasks.md": "## Phase 1: Setup\n- [x] T002 fine\n- [ ] no id here" };
    await t.change();
    const w2 = "warning: specs/001-odd/tasks.md:3 checkbox without a task ID (counted)\n";
    assert.equal(t.f.deps.stderr.text, w1 + w2, "moved warning printed once");
    await t.change();
    assert.equal(t.f.deps.stderr.text, w1 + w2);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("a failing rescan logs to stderr and keeps the last site", async () => {
    const t = await live();
    const before = get(t.handler(), "/").body;
    // A reader that throws on every call makes the scan itself fail.
    t.state.files = null;
    await t.change();
    assert.match(t.f.deps.stderr.text, /speckit-eye: rescan failed: /);
    assert.equal(get(t.handler(), "/").body, before);
    assert.deepEqual(t.hub().broadcasts, []);
    // Recovers on the next good rescan.
    t.state.files = { ...MIXED, "specs/001-a/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n- [x] T002 two" };
    await t.change();
    assert.deepEqual(t.hub().broadcasts, [1]);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("the watcher is re-created when the git dir changes", async () => {
    const t = await live(MIXED, { gitDir: null });
    const first = t.watcher();
    assert.equal(first.opts.gitDir, null);
    await t.change();
    assert.equal(t.f.calls.watchers.length, 1, "same git dir: same watcher");
    t.state.gitDir = "/work/proj/.git";
    await t.change();
    assert.equal(t.f.calls.watchers.length, 2);
    assert.equal(first.closed, true);
    assert.equal(t.watcher().opts.gitDir, "/work/proj/.git");
    t.f.calls.signalHandler();
    await t.pending;
    assert.equal(t.watcher().closed, true);
  });

  test("watch errors are logged and do not stop the server", async () => {
    const t = await live();
    t.watcher().opts.onError(new Error("ENOSPC"));
    assert.match(t.f.deps.stderr.text, /speckit-eye: watch error: ENOSPC\n/);
    t.f.calls.signalHandler();
    assert.equal(await t.pending, 0);
  });

  test("changes during a rescan lead to exactly one more rescan", async () => {
    const t = await live();
    t.watcher().opts.onChange();
    t.watcher().opts.onChange();
    t.watcher().opts.onChange();
    await settle();
    const lines = t.f.deps.stdout.text.split("\n").filter((l) => l.startsWith("updated"));
    assert.equal(lines.length, 2);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("a stop during a rescan drops its result and the pending rescan", async () => {
    const t = await live();
    t.state.files = { ...MIXED, "specs/001-a/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n- [x] T002 two" };
    t.watcher().opts.onChange();
    t.watcher().opts.onChange();
    t.f.calls.signalHandler();
    assert.equal(await t.pending, 0);
    await settle();
    assert.deepEqual(t.hub().broadcasts, []);
    assert.doesNotMatch(t.f.deps.stdout.text, /updated/);
  });

  test("non-Error rescan and watch failures are printed as text", async () => {
    const t = await live();
    t.state.files = new Proxy(
      {},
      {
        ownKeys() {
          throw "scan exploded";
        },
      },
    );
    await t.change();
    assert.match(t.f.deps.stderr.text, /speckit-eye: rescan failed: scan exploded\n/);
    t.watcher().opts.onError("ENOSPC");
    assert.match(t.f.deps.stderr.text, /speckit-eye: watch error: ENOSPC\n/);
    t.f.calls.signalHandler();
    await t.pending;
  });

  test("SIGINT/SIGTERM closes the watcher, the hub and the server", async () => {
    const t = await live();
    t.f.calls.signalHandler();
    assert.equal(await t.pending, 0);
    assert.equal(t.watcher().closed, true);
    assert.equal(t.hub().closed, true);
    assert.equal(t.f.calls.closed, 1);
  });

  test("the hub is closed when the server cannot start", async () => {
    const f = fakes({ listenError: Object.assign(new Error("listen EACCES"), { code: "EACCES" }) });
    assert.equal(await run(["--serve", "proj"], f.deps), 1);
    assert.equal(f.calls.hubs[0].closed, true);
    assert.equal(f.calls.watchers.length, 0);
  });
});

describe("siteChanged", () => {
  const site = (entries) => new Map(entries.map(([k, body]) => [k, { type: "t", body }]));
  test("equal maps are unchanged", () => {
    assert.equal(siteChanged(site([["a", "1"], ["b", "2"]]), site([["a", "1"], ["b", "2"]])), false);
  });
  test("a changed body, a new page or a removed page is a change", () => {
    assert.equal(siteChanged(site([["a", "1"]]), site([["a", "2"]])), true);
    assert.equal(siteChanged(site([["a", "1"]]), site([["a", "1"], ["b", "2"]])), true);
    assert.equal(siteChanged(site([["a", "1"], ["b", "2"]]), site([["a", "1"]])), true);
    assert.equal(siteChanged(site([["a", "1"], ["b", "2"]]), site([["a", "1"], ["c", "2"]])), true);
  });
});
