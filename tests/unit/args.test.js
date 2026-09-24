import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCliArgs, normalizeBase, USAGE } from "../../src/cli/args.js";

describe("parseCliArgs: valid", () => {
  test("--serve <dir>", () => {
    assert.deepEqual(parseCliArgs(["--serve", "."]), { mode: "serve", dir: ".", out: null, base: "/" });
  });

  test("--serve=<dir>", () => {
    assert.deepEqual(parseCliArgs(["--serve=proj"]), { mode: "serve", dir: "proj", out: null, base: "/" });
  });

  test("--build with --out, default base", () => {
    assert.deepEqual(parseCliArgs(["--build", "proj", "--out", "site"]), {
      mode: "build",
      dir: "proj",
      out: "site",
      base: "/",
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
      "speckit-eye --build <dir> --out <folder> [--base <path>]",
      "speckit-eye --help",
      "speckit-eye --version",
    ]) {
      assert.ok(USAGE.includes(line), line);
    }
  });
});
