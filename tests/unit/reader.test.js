import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveInside, createReader } from "../../src/project/reader.js";
import { createFakeReader } from "./fake-reader.js";

const ROOT = path.resolve("/work/proj");

function enoent(p) {
  return Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
}

/**
 * In-memory fs/promises subset. Keys are absolute paths; values are strings or bytes.
 * @param {Record<string, string | Uint8Array>} files
 */
function createMemoryFs(files) {
  const map = new Map(Object.entries(files).map(([k, v]) => [path.resolve(k), v]));
  const isDir = (abs) => {
    const prefix = abs.endsWith(path.sep) ? abs : abs + path.sep;
    for (const k of map.keys()) if (k.startsWith(prefix)) return true;
    return false;
  };
  const calls = [];
  return {
    calls,
    async readdir(p, opts) {
      calls.push(["readdir", p]);
      assert.deepEqual(opts, { withFileTypes: true });
      if (!isDir(p)) throw enoent(p);
      const prefix = p + path.sep;
      const children = new Map();
      for (const k of map.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const i = rest.indexOf(path.sep);
        if (i === -1) children.set(rest, children.get(rest) ?? false);
        else children.set(rest.slice(0, i), true);
      }
      return [...children].map(([name, d]) => ({ name, isDirectory: () => d }));
    },
    async readFile(p) {
      calls.push(["readFile", p]);
      if (!map.has(p)) throw enoent(p);
      const v = map.get(p);
      return typeof v === "string" ? new TextEncoder().encode(v) : v;
    },
    async stat(p) {
      calls.push(["stat", p]);
      if (map.has(p)) return { isDirectory: () => false, isFile: () => true };
      if (isDir(p)) return { isDirectory: () => true, isFile: () => false };
      throw enoent(p);
    },
  };
}

describe("resolveInside", () => {
  test("resolves a relative path inside root", () => {
    assert.equal(resolveInside(ROOT, "specs/001-x/spec.md"), path.join(ROOT, "specs", "001-x", "spec.md"));
    assert.equal(resolveInside(ROOT, "."), ROOT);
    assert.equal(resolveInside(ROOT, ""), ROOT);
    assert.equal(resolveInside(ROOT, "specs/../plan.md"), path.join(ROOT, "plan.md"));
  });

  test("throws for paths that leave root with ..", () => {
    assert.throws(() => resolveInside(ROOT, ".."), /leaves the project root/);
    assert.throws(() => resolveInside(ROOT, "../other/file.md"), /leaves the project root/);
    assert.throws(() => resolveInside(ROOT, "specs/../../x"), /leaves the project root/);
  });

  test("does not treat a sibling folder with the same prefix as inside", () => {
    assert.throws(() => resolveInside(ROOT, "../proj-evil/a.md"), /leaves the project root/);
  });

  test("throws for absolute paths outside root and accepts absolute paths inside", () => {
    assert.throws(() => resolveInside(ROOT, path.resolve("/etc/passwd")), /leaves the project root/);
    assert.equal(resolveInside(ROOT, path.join(ROOT, "a.md")), path.join(ROOT, "a.md"));
  });

  test("allows names that merely start with two dots", () => {
    assert.equal(resolveInside(ROOT, "..notes.md"), path.join(ROOT, "..notes.md"));
  });
});

describe("createReader with an in-memory fs", () => {
  const fs = createMemoryFs({
    [`${ROOT}/specs/001-x/spec.md`]: "# Spec",
    [`${ROOT}/specs/001-x/contracts/cli.md`]: "cli",
    [`${ROOT}/specs/002-y/plan.md`]: "plan",
    [`${ROOT}/bad.md`]: new Uint8Array([0x66, 0xff, 0xfe]),
    [`${ROOT}/bom.md`]: new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]),
  });
  const reader = createReader(ROOT, fs);

  test("list returns names with an isDir flag", async () => {
    assert.deepEqual(await reader.list("specs"), [
      { name: "001-x", isDir: true },
      { name: "002-y", isDir: true },
    ]);
    const inner = await reader.list("specs/001-x");
    assert.deepEqual(inner.sort((a, b) => (a.name < b.name ? -1 : 1)), [
      { name: "contracts", isDir: true },
      { name: "spec.md", isDir: false },
    ]);
  });

  test("list returns [] for a missing folder", async () => {
    assert.deepEqual(await reader.list("does-not-exist"), []);
  });

  test("list rejects paths outside root without touching fs", async () => {
    const before = fs.calls.length;
    await assert.rejects(reader.list("../elsewhere"), /leaves the project root/);
    assert.equal(fs.calls.length, before);
  });

  test("read decodes UTF-8 text", async () => {
    assert.equal(await reader.read("specs/001-x/spec.md"), "# Spec");
    assert.equal(await reader.read("bom.md"), "hi");
  });

  test("read throws on invalid UTF-8", async () => {
    await assert.rejects(reader.read("bad.md"), TypeError);
  });

  test("read throws for a missing file and for paths outside root", async () => {
    await assert.rejects(reader.read("nope.md"), { code: "ENOENT" });
    await assert.rejects(reader.read("../secret.md"), /leaves the project root/);
  });

  test("exists reports files and folders", async () => {
    assert.equal(await reader.exists("specs"), true);
    assert.equal(await reader.exists("specs/001-x/spec.md"), true);
    assert.equal(await reader.exists(".specify"), false);
    assert.equal(await reader.exists("../other"), false);
  });

  test("uses node:fs/promises by default", () => {
    const r = createReader(ROOT);
    assert.equal(typeof r.list, "function");
    assert.equal(typeof r.readGitHead, "function");
  });
});

describe("createReader error handling", () => {
  const failing = (code) => {
    const err = Object.assign(new Error(code), { code });
    return {
      readdir: async () => {
        throw err;
      },
      readFile: async () => {
        throw err;
      },
      stat: async () => {
        throw err;
      },
    };
  };

  test("list returns [] when a path segment is a file (ENOTDIR)", async () => {
    assert.deepEqual(await createReader(ROOT, failing("ENOTDIR")).list("specs/x.md"), []);
  });

  test("list passes other errors through", async () => {
    await assert.rejects(createReader(ROOT, failing("EACCES")).list("specs"), { code: "EACCES" });
  });

  test("exists is false for ENOTDIR and for other stat errors", async () => {
    assert.equal(await createReader(ROOT, failing("ENOTDIR")).exists("specs"), false);
    assert.equal(await createReader(ROOT, failing("EACCES")).exists("specs"), false);
  });

  test("a thrown value without a code is not treated as missing", async () => {
    const fs = { readdir: async () => Promise.reject(null), readFile: async () => null, stat: async () => null };
    await assert.rejects(createReader(ROOT, fs).list("specs"), (err) => err === null);
  });
});

describe("createReader.readGitHead", () => {
  test("reads .git/HEAD in a normal repository", async () => {
    const reader = createReader(ROOT, createMemoryFs({ [`${ROOT}/.git/HEAD`]: "ref: refs/heads/001-x\n" }));
    assert.deepEqual(await reader.readGitHead(), { gitDir: path.join(ROOT, ".git"), head: "ref: refs/heads/001-x" });
  });

  test("follows a worktree .git file and reads exactly HEAD in that gitdir", async () => {
    const gitDir = path.resolve("/work/main/.git/worktrees/proj");
    const fs = createMemoryFs({
      [`${ROOT}/.git`]: `gitdir: ${gitDir}\n`,
      [`${gitDir}/HEAD`]: "ref: refs/heads/002-y\n",
      [`${gitDir}/config`]: "secret",
    });
    const reader = createReader(ROOT, fs);
    assert.deepEqual(await reader.readGitHead(), { gitDir, head: "ref: refs/heads/002-y" });
    const outsideReads = fs.calls.filter(([op, p]) => op === "readFile" && !p.startsWith(ROOT));
    assert.deepEqual(outsideReads, [["readFile", path.join(gitDir, "HEAD")]]);
  });

  test("resolves a relative gitdir against the project root", async () => {
    const gitDir = path.resolve(ROOT, "../main/.git/worktrees/proj");
    const reader = createReader(
      ROOT,
      createMemoryFs({
        [`${ROOT}/.git`]: "gitdir: ../main/.git/worktrees/proj",
        [`${gitDir}/HEAD`]: "0123456789abcdef0123456789abcdef01234567",
      }),
    );
    assert.deepEqual(await reader.readGitHead(), { gitDir, head: "0123456789abcdef0123456789abcdef01234567" });
  });

  test("returns null when there is no repository", async () => {
    const reader = createReader(ROOT, createMemoryFs({ [`${ROOT}/specs/a.md`]: "x" }));
    assert.equal(await reader.readGitHead(), null);
  });

  test("returns null for a .git file without gitdir or a gitdir without HEAD", async () => {
    const noGitdir = createReader(ROOT, createMemoryFs({ [`${ROOT}/.git`]: "garbage" }));
    assert.equal(await noGitdir.readGitHead(), null);
    const noHead = createReader(ROOT, createMemoryFs({ [`${ROOT}/.git`]: "gitdir: /nowhere" }));
    assert.equal(await noHead.readGitHead(), null);
  });
});

describe("createFakeReader", () => {
  const reader = createFakeReader(
    {
      "specs/001-x/spec.md": "# Spec",
      "specs/001-x/contracts/cli.md": "cli",
      "bad.md": new Error("EIO"),
    },
    { gitHead: { gitDir: "/g", head: "ref: refs/heads/001-x" } },
  );

  test("lists implied folders and files", async () => {
    assert.deepEqual(await reader.list("specs"), [{ name: "001-x", isDir: true }]);
    assert.deepEqual(await reader.list("specs/001-x/"), [
      { name: "spec.md", isDir: false },
      { name: "contracts", isDir: true },
    ]);
    assert.deepEqual(await reader.list(""), [
      { name: "specs", isDir: true },
      { name: "bad.md", isDir: false },
    ]);
    assert.deepEqual(await reader.list("missing"), []);
  });

  test("reads content, throws the configured Error, and ENOENT for missing files", async () => {
    assert.equal(await reader.read("specs/001-x/spec.md"), "# Spec");
    await assert.rejects(reader.read("bad.md"), /EIO/);
    await assert.rejects(reader.read("nope.md"), { code: "ENOENT" });
  });

  test("exists covers files and implied folders", async () => {
    assert.equal(await reader.exists("specs"), true);
    assert.equal(await reader.exists("specs/001-x/contracts/cli.md"), true);
    assert.equal(await reader.exists(".specify"), false);
  });

  test("readGitHead returns the configured value, a string shorthand, or null", async () => {
    assert.deepEqual(await reader.readGitHead(), { gitDir: "/g", head: "ref: refs/heads/001-x" });
    assert.deepEqual(await createFakeReader({}, { gitHead: "ref: refs/heads/main" }).readGitHead(), {
      gitDir: "/fake/.git",
      head: "ref: refs/heads/main",
    });
    assert.equal(await createFakeReader({}).readGitHead(), null);
  });
});
