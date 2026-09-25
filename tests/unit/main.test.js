import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { run, formatWarning, allWarnings, siteChanged, VERSION } from "../../src/cli/main.js";
import { USAGE } from "../../src/cli/args.js";
import { createFakeReader } from "./fake-reader.js";

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

describe("warning helpers", () => {
  test("formatWarning with and without a line", () => {
    assert.equal(formatWarning({ code: "W1", file: "specs/a/tasks.md", line: 14, message: "m" }), "warning: specs/a/tasks.md:14 m");
    assert.equal(formatWarning({ code: "W9", file: "specs/a/x.md", line: null, message: "m" }), "warning: specs/a/x.md m");
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
