import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { main, parseVersion, formatVersion, USAGE } from "../../scripts/release/release.js";

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

  for (const command of ["bump", "verify", "notes", "release-commit", "pack-check"]) {
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
