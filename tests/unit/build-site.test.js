import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sitePaths, main, DOCMD_BIN } from "../../scripts/build-site.js";

describe("sitePaths", () => {
  test("derives home, base and status paths from a project-site homepage", () => {
    assert.deepEqual(sitePaths("https://serafac.github.io/speckit-eye/"), {
      home: "https://serafac.github.io/speckit-eye/",
      base: "/speckit-eye/",
      statusBase: "/speckit-eye/status/",
      statusUrl: "https://serafac.github.io/speckit-eye/status/",
    });
  });

  test("adds the missing trailing slash", () => {
    assert.deepEqual(sitePaths("https://serafac.github.io/speckit-eye"), {
      home: "https://serafac.github.io/speckit-eye/",
      base: "/speckit-eye/",
      statusBase: "/speckit-eye/status/",
      statusUrl: "https://serafac.github.io/speckit-eye/status/",
    });
  });

  test("a root domain has base /", () => {
    assert.deepEqual(sitePaths("http://example.com"), {
      home: "http://example.com/",
      base: "/",
      statusBase: "/status/",
      statusUrl: "http://example.com/status/",
    });
  });

  test("rejects a non-http(s) URL", () => {
    assert.throws(() => sitePaths("ftp://example.com/docs/"), /http/);
  });

  test("rejects text that is not a URL", () => {
    assert.throws(() => sitePaths("not a url"));
    assert.throws(() => sitePaths(undefined));
  });
});

/** Fake I/O recording every call in order. */
function fakeIo(exitCode = 0) {
  const io = {
    calls: [],
    err: "",
    rm: (p) => io.calls.push(["rm", p]),
    run: (cmd, args) => {
      io.calls.push(["run", cmd, ...args]);
      return exitCode;
    },
    stderr: (s) => {
      io.err += s;
    },
  };
  return io;
}

describe("main", () => {
  test("removes site/ and then runs docmd build", () => {
    const io = fakeIo(0);
    assert.equal(main([], io), 0);
    assert.deepEqual(io.calls, [
      ["rm", "site"],
      ["run", process.execPath, DOCMD_BIN, "build"],
    ]);
  });

  test("propagates a non-zero exit code of docmd build", () => {
    const io = fakeIo(3);
    assert.equal(main([], io), 3);
  });

  test("a failed build without an exit code (signal) exits 1", () => {
    const io = fakeIo(null);
    assert.equal(main([], io), 1);
  });
});
