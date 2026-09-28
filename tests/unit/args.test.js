import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs, normalizeBase, USAGE } from "../../src/cli/args.js";

describe("parseCliArgs: valid", () => {
  test("--serve <dir>", () => {
    assert.deepEqual(parseCliArgs(["--serve", "."]), { mode: "serve", dir: ".", out: null, base: "/", home: null });
  });

  test("--serve=<dir>", () => {
    assert.deepEqual(parseCliArgs(["--serve=proj"]), { mode: "serve", dir: "proj", out: null, base: "/", home: null });
  });

  test("--build with --out, default base", () => {
    assert.deepEqual(parseCliArgs(["--build", "proj", "--out", "site"]), {
      mode: "build",
      dir: "proj",
      out: "site",
      base: "/",
      home: null,
    });
  });

  test("--build with --base is normalized", () => {
    assert.equal(parseCliArgs(["--build", "p", "--out", "o", "--base", "repo"]).base, "/repo/");
  });

  for (const flag of ["--help", "-h"]) {
    test(`${flag} → help`, () => assert.equal(parseCliArgs([flag]).mode, "help"));
  }
  for (const flag of ["--version", "-v"]) {
    test(`${flag} → version`, () => assert.equal(parseCliArgs([flag]).mode, "version"));
  }
  test("help wins over a mode", () => assert.equal(parseCliArgs(["--serve", ".", "--help"]).mode, "help"));
});

describe("parseCliArgs: --home (003 contracts/cli-home.md)", () => {
  test("an https URL is accepted in build mode and kept as given", () => {
    const r = parseCliArgs(["--build", "p", "--out", "o", "--home", "https://example.com/docs/"]);
    assert.equal(r.mode, "build");
    assert.equal(r.home, "https://example.com/docs/");
  });

  test("an http URL is accepted", () => {
    assert.equal(parseCliArgs(["--build", "p", "--out", "o", "--home=http://localhost:3000/"]).home, "http://localhost:3000/");
  });

  test("home defaults to null in every mode", () => {
    assert.equal(parseCliArgs(["--build", "p", "--out", "o"]).home, null);
    assert.equal(parseCliArgs(["--serve", "."]).home, null);
    assert.equal(parseCliArgs(["--help"]).home, null);
    assert.equal(parseCliArgs(["--version"]).home, null);
  });

  for (const value of ["javascript:alert(1)", "/relative", "ftp://x", "example.com", ""]) {
    test(`${JSON.stringify(value)} is rejected`, () => {
      assert.deepEqual(parseCliArgs(["--build", "p", "--out", "o", `--home=${value}`]), {
        error: "--home must be an http or https URL",
      });
    });
  }

  test("--home with --serve is rejected", () => {
    assert.deepEqual(parseCliArgs(["--serve", ".", "--home", "https://example.com/"]), {
      error: "--home can only be used with --build",
    });
  });
});

describe("parseCliArgs: errors", () => {
  const cases = [
    ["no arguments", []],
    ["unknown option", ["--serve", ".", "--port", "80"]],
    ["positional argument", ["."]],
    ["both modes", ["--serve", "a", "--build", "b", "--out", "o"]],
    ["--serve without a value", ["--serve"]],
    ["--serve with an empty value", ["--serve="]],
    ["--build without --out", ["--build", "p"]],
    ["--build with an empty --out", ["--build", "p", "--out="]],
    ["--build with an empty value", ["--build=", "--out", "o"]],
    ["--out with serve", ["--serve", ".", "--out", "o"]],
    ["--base with serve", ["--serve", ".", "--base", "x"]],
    ["only --out", ["--out", "o"]],
  ];
  for (const [name, argv] of cases) {
    test(name, () => {
      const r = parseCliArgs(argv);
      assert.equal(typeof r.error, "string", JSON.stringify(r));
      assert.ok(r.error.length > 0);
      assert.equal(r.mode, undefined);
    });
  }

  test("parseCliArgs never throws", () => {
    assert.doesNotThrow(() => parseCliArgs(["--nope", "-x", "--build"]));
  });
});

describe("normalizeBase", () => {
  const rows = [
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["repo", "/repo/"],
    ["/repo", "/repo/"],
    ["repo/", "/repo/"],
    ["/repo/", "/repo/"],
    ["a/b", "/a/b/"],
    ["//a//", "/a/"],
  ];
  for (const [input, expected] of rows) {
    test(`${JSON.stringify(input)} → ${expected}`, () => assert.equal(normalizeBase(input), expected));
  }
});

describe("USAGE", () => {
  test("contains the synopsis", () => {
    for (const line of [
      "speckit-eye --serve <dir>",
      "speckit-eye --build <dir> --out <folder> [--base <path>] [--home <url>]",
      "speckit-eye --help",
      "speckit-eye --version",
    ]) {
      assert.ok(USAGE.includes(line), line);
    }
  });

  test("lists the --home option", () => {
    assert.ok(
      USAGE.includes("  --home <url>      Link back to <url> from every page, for --build (for example your docs site)"),
    );
  });
});
