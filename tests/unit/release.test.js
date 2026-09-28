import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { main, parseVersion, formatVersion, checkPackFiles, parsePackFileList, USAGE } from "../../scripts/release/release.js";

/** Fake I/O: in-memory files, captured output, fixed clock. */
function fakeIo(files = {}) {
  const io = {
    files: { ...files },
    out: "",
    err: "",
    readFile: (p) => {
      if (!Object.hasOwn(io.files, p)) throw new Error(`ENOENT: ${p}`);
      return io.files[p];
    },
    writeFile: (p, s) => {
      io.files[p] = s;
    },
    stdout: (s) => {
      io.out += s;
    },
    stderr: (s) => {
      io.err += s;
    },
    now: () => new Date("2026-09-28T12:00:00Z"),
  };
  return io;
}

describe("main dispatch", () => {
  test("no command prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main([], io), 2);
    assert.equal(io.err, USAGE);
    assert.equal(io.out, "");
  });

  test("an unknown command prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main(["publish"], io), 2);
    assert.match(io.err, /Unknown command: publish/);
    assert.ok(io.err.includes(USAGE));
  });

  test("an unknown option prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main(["verify", "--bogus", "x"], io), 2);
    assert.match(io.err, /bogus/);
    assert.ok(io.err.includes(USAGE));
  });

  test("an option without its value prints usage and exits 2", () => {
    const io = fakeIo();
    assert.equal(main(["verify", "--tag"], io), 2);
    assert.ok(io.err.includes(USAGE));
  });

  test("an inherited property name is not a command", () => {
    const io = fakeIo();
    assert.equal(main(["toString"], io), 2);
    assert.match(io.err, /Unknown command: toString/);
  });

  for (const command of ["bump", "verify", "notes", "release-commit"]) {
    test(`${command} is dispatched (stub exits 1, nothing written)`, () => {
      const io = fakeIo({ "package.json": "{}\n" });
      assert.equal(main([command], io), 1);
      assert.match(io.err, new RegExp(`^${command}: not implemented`));
      assert.deepEqual(io.files, { "package.json": "{}\n" });
    });
  }

  test("known options are accepted", () => {
    const io = fakeIo();
    const code = main(
      ["release-commit", "--version", "1.0.0", "--head-ref", "", "--tag-exists", "false"],
      io,
    );
    assert.notEqual(code, 2);
  });
});

describe("parseVersion", () => {
  test("parses MAJOR.MINOR.PATCH", () => {
    assert.deepEqual(parseVersion("1.2.3"), { major: 1, minor: 2, patch: 3, pre: null });
    assert.deepEqual(parseVersion("0.0.0"), { major: 0, minor: 0, patch: 0, pre: null });
    assert.deepEqual(parseVersion("10.20.30"), { major: 10, minor: 20, patch: 30, pre: null });
  });

  test("parses a -<id>.<n> pre-release", () => {
    assert.deepEqual(parseVersion("1.0.0-rc.1"), { major: 1, minor: 0, patch: 0, pre: { id: "rc", n: 1 } });
    assert.deepEqual(parseVersion("2.0.0-beta.0"), {
      major: 2,
      minor: 0,
      patch: 0,
      pre: { id: "beta", n: 0 },
    });
  });

  for (const text of [
    "1.0",
    "1",
    "01.0.0",
    "1.00.0",
    "1.0.01",
    "1.0.0+build",
    "1.0.0-rc.1+build",
    "1.0.0-rc",
    "1.0.0-rc.01",
    "1.0.0-rc.1.2",
    "1.0.0-1.0",
    "v1.0.0",
    " 1.0.0",
    "1.0.0 ",
    "",
    "1.0.0-",
  ]) {
    test(`rejects ${JSON.stringify(text)}`, () => {
      assert.equal(parseVersion(text), null);
    });
  }
});

describe("formatVersion", () => {
  test("formats a release version", () => {
    assert.equal(formatVersion({ major: 1, minor: 2, patch: 3, pre: null }), "1.2.3");
  });

  test("formats a pre-release", () => {
    assert.equal(formatVersion({ major: 1, minor: 3, patch: 0, pre: { id: "rc", n: 2 } }), "1.3.0-rc.2");
  });

  test("round-trips parseVersion", () => {
    for (const text of ["0.1.0", "1.0.0", "1.0.0-rc.0", "12.4.7-next.13"]) {
      assert.equal(formatVersion(parseVersion(text)), text);
    }
  });
});

/** Exactly the allowed files of a correct package (contracts/release-cli.md). */
const GOOD_PACK = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "bin/speckit-eye.js",
  "src/cli/main.js",
  "src/render/layout.js",
  "dist/styles.css",
  "dist/fonts/geist-latin-wght-normal.woff2",
  "dist/fonts/OFL-geist.txt",
];

describe("checkPackFiles", () => {
  test("the exact allowed set passes", () => {
    assert.deepEqual(checkPackFiles(GOOD_PACK), { unexpected: [], missing: [] });
  });

  for (const bad of [
    "tests/unit/release.test.js",
    "specs/003-npm-release-docs-site/spec.md",
    "src/styles/input.css",
    "src/styles/theme.js",
    "src/client/notes.md",
    "docs/x.md",
    ".github/workflows/ci.yml",
    "scripts/release/release.js",
    "dist/other.css",
    "dist/fonts/sub/x.woff2",
    "dist/fonts/readme.txt",
    "bin/other.js",
    "pnpm-lock.yaml",
  ]) {
    test(`rejects ${bad}`, () => {
      assert.deepEqual(checkPackFiles([...GOOD_PACK, bad]), { unexpected: [bad], missing: [] });
    });
  }

  test("reports a missing LICENSE", () => {
    assert.deepEqual(checkPackFiles(GOOD_PACK.filter((p) => p !== "LICENSE")), { unexpected: [], missing: ["LICENSE"] });
  });

  test("reports a package without any .woff2", () => {
    const { missing } = checkPackFiles(GOOD_PACK.filter((p) => !p.endsWith(".woff2")));
    assert.deepEqual(missing, ["dist/fonts/*.woff2"]);
  });

  test("reports a package without any src/ file", () => {
    const { missing } = checkPackFiles(GOOD_PACK.filter((p) => !p.startsWith("src/")));
    assert.deepEqual(missing, ["src/**/*.js"]);
  });

  test("reports every missing fixed file of an empty package", () => {
    assert.deepEqual(checkPackFiles([]).missing, [
      "package.json",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "bin/speckit-eye.js",
      "dist/styles.css",
      "src/**/*.js",
      "dist/fonts/*.woff2",
    ]);
  });

  test("lists unexpected files sorted", () => {
    assert.deepEqual(checkPackFiles([...GOOD_PACK, "tests/b.js", "docs/a.md"]).unexpected, ["docs/a.md", "tests/b.js"]);
  });
});

describe("parsePackFileList", () => {
  const files = GOOD_PACK.map((path) => ({ path }));

  test("reads the npm pack --dry-run --json array form", () => {
    assert.deepEqual(parsePackFileList(JSON.stringify([{ id: "x@1.0.0", files }], null, 2)), GOOD_PACK);
  });

  test("reads the pnpm pack --json object form", () => {
    assert.deepEqual(parsePackFileList(JSON.stringify({ name: "x", files }, null, 2)), GOOD_PACK);
  });

  test("skips lifecycle script output printed before the JSON", () => {
    const text = `Copied 11 font files to dist/fonts/\n[warn] {not json\n${JSON.stringify({ files }, null, 2)}\n`;
    assert.deepEqual(parsePackFileList(text), GOOD_PACK);
  });

  for (const [label, text] of [
    ["empty text", ""],
    ["not JSON", "hello"],
    ["no files", JSON.stringify({ name: "x" })],
    ["empty array", "[]"],
    ["a path that is not a string", JSON.stringify({ files: [{ path: 1 }] })],
  ]) {
    test(`returns null for ${label}`, () => {
      assert.equal(parsePackFileList(text), null);
    });
  }
});

describe("pack-check command", () => {
  const files = GOOD_PACK.map((path) => ({ path }));

  test("exits 0 for a correct npm file list", () => {
    const io = fakeIo({ "files.json": JSON.stringify([{ files }]) });
    assert.equal(main(["pack-check", "files.json"], io), 0);
    assert.equal(io.err, "");
  });

  test("exits 0 for a correct pnpm file list", () => {
    const io = fakeIo({ "files.json": JSON.stringify({ files }) });
    assert.equal(main(["pack-check", "files.json"], io), 0);
  });

  test("exits 1 and names every unexpected and missing file", () => {
    const bad = [...GOOD_PACK.filter((p) => p !== "LICENSE"), "tests/x.test.js", ".github/workflows/ci.yml"];
    const io = fakeIo({ "files.json": JSON.stringify({ files: bad.map((path) => ({ path })) }) });
    assert.equal(main(["pack-check", "files.json"], io), 1);
    assert.match(io.err, /unexpected file in package: tests\/x\.test\.js/);
    assert.match(io.err, /unexpected file in package: \.github\/workflows\/ci\.yml/);
    assert.match(io.err, /missing from package: LICENSE/);
  });

  test("exits 1 when the file cannot be read", () => {
    const io = fakeIo();
    assert.equal(main(["pack-check", "nope.json"], io), 1);
    assert.match(io.err, /cannot read nope\.json/);
  });

  test("exits 1 when the file is not a pack file list", () => {
    const io = fakeIo({ "files.json": "{}" });
    assert.equal(main(["pack-check", "files.json"], io), 1);
    assert.match(io.err, /not the JSON/);
  });

  test("exits 2 without a file argument", () => {
    const io = fakeIo();
    assert.equal(main(["pack-check"], io), 2);
    assert.ok(io.err.includes(USAGE));
  });

  test("writes nothing", () => {
    const io = fakeIo({ "files.json": JSON.stringify({ files }) });
    main(["pack-check", "files.json"], io);
    assert.deepEqual(Object.keys(io.files), ["files.json"]);
  });
});
