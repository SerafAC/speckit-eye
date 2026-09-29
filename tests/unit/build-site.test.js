import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { sitePaths, main, nodeIo, DOCMD_BIN, DASHBOARD_BIN, STATUS_DIR } from "../../scripts/build-site.js";

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

/**
 * Fake I/O recording every call in order.
 * @param {...(number | null)} exitCodes exit code of each `run` call in turn (last one repeats)
 */
function fakeIo(...exitCodes) {
  const codes = exitCodes.length ? exitCodes : [0];
  const io = {
    homepage: "https://serafac.github.io/speckit-eye/",
    calls: [],
    err: "",
    rm: (p) => io.calls.push(["rm", p]),
    run: (cmd, args) => {
      io.calls.push(["run", cmd, ...args]);
      const i = io.calls.filter((c) => c[0] === "run").length - 1;
      return codes[Math.min(i, codes.length - 1)];
    },
    stderr: (s) => {
      io.err += s;
    },
  };
  return io;
}

const DASHBOARD_CALL = [
  "run",
  process.execPath,
  DASHBOARD_BIN,
  "--build",
  ".",
  "--out",
  STATUS_DIR,
  "--base",
  "/speckit-eye/status/",
  "--home",
  "https://serafac.github.io/speckit-eye/",
];

describe("main", () => {
  test("removes site/, runs docmd build, then builds the dashboard into site/status (contracts/site.md)", () => {
    const io = fakeIo(0);
    assert.equal(main([], io), 0);
    assert.deepEqual(io.calls, [["rm", "site"], ["run", process.execPath, DOCMD_BIN, "build"], DASHBOARD_CALL]);
    assert.equal(STATUS_DIR, path.join("site", "status"));
    assert.equal(DASHBOARD_BIN, path.join("bin", "speckit-eye.js"));
    assert.equal(io.err, "");
  });

  test("the dashboard base and Home link follow package.json homepage", () => {
    const io = fakeIo(0);
    io.homepage = "https://example.com/docs";
    assert.equal(main([], io), 0);
    const last = io.calls.at(-1);
    assert.deepEqual(last.slice(last.indexOf("--base")), ["--base", "/docs/status/", "--home", "https://example.com/docs/"]);
  });

  test("the real I/O reads homepage from package.json", () => {
    assert.equal(nodeIo.homepage, "https://serafac.github.io/speckit-eye/");
  });

  test("propagates a non-zero exit code of docmd build and skips the dashboard", () => {
    const io = fakeIo(3);
    assert.equal(main([], io), 3);
    assert.equal(io.calls.filter((c) => c[0] === "run").length, 1);
    assert.match(io.err, /docmd build failed \(exit code 3\)/);
  });

  test("a failed build without an exit code (signal) exits 1", () => {
    const io = fakeIo(null);
    assert.equal(main([], io), 1);
  });

  test("a failing dashboard build fails the whole build (FR-024)", () => {
    const io = fakeIo(0, 2);
    assert.equal(main([], io), 2);
    assert.deepEqual(io.calls.at(-1), DASHBOARD_CALL);
    assert.match(io.err, /dashboard build failed \(exit code 2\)/);
  });

  test("a dashboard build ended by a signal exits 1", () => {
    const io = fakeIo(0, null);
    assert.equal(main([], io), 1);
  });
});
