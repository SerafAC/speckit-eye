import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { writeSite, MARKER } from "../../src/build/build.js";
import { fakeFs } from "./fake-fs.js";

const ROOT = path.resolve("/proj");
const OUT = path.resolve("/site");
const at = (...parts) => path.join(OUT, ...parts);

const page = (body) => ({ type: "text/html; charset=utf-8", body });
const SITE = new Map([
  ["index.html", page("<p>overview</p>")],
  ["features/001-a/spec.html", page("<p>spec</p>")],
  ["features/001-a/contracts/cli.html", page("<p>cli</p>")],
  ["assets/styles.css", { type: "text/css; charset=utf-8", body: "body{}" }],
]);

describe("writeSite (T053, FR-033)", () => {
  test("a fresh folder gets every page and asset, then the marker", async () => {
    const fs = fakeFs();
    assert.deepEqual(await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs }), { pages: 3 });
    assert.equal(fs.files.get(at("index.html")), "<p>overview</p>");
    assert.equal(fs.files.get(at("features", "001-a", "contracts", "cli.html")), "<p>cli</p>");
    assert.equal(fs.files.get(at("assets", "styles.css")), "body{}");
    assert.ok(fs.files.has(at(MARKER)));
    assert.equal(fs.writes.at(-1), at(MARKER));
  });

  test("byte bodies are written with no encoding and text bodies as UTF-8 (research D12)", async () => {
    const bytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0x80]);
    const site = new Map([
      ["index.html", page("<p>ü ✓</p>")],
      ["assets/fonts/geist-latin-wght-normal.woff2", { type: "font/woff2", body: bytes }],
      ["assets/fonts/OFL-geist.txt", { type: "text/plain; charset=utf-8", body: "Copyright ©" }],
    ]);
    const fs = fakeFs();
    assert.deepEqual(await writeSite({ site, out: OUT, projectRoot: ROOT, fs }), { pages: 1 });
    const font = fs.files.get(at("assets", "fonts", "geist-latin-wght-normal.woff2"));
    assert.ok(font instanceof Uint8Array);
    assert.deepEqual([...font], [...bytes]);
    assert.equal(fs.encodings.get(at("assets", "fonts", "geist-latin-wght-normal.woff2")), null);
    assert.equal(fs.files.get(at("assets", "fonts", "OFL-geist.txt")), "Copyright ©");
    assert.equal(fs.encodings.get(at("assets", "fonts", "OFL-geist.txt")), "utf8");
    assert.equal(fs.files.get(at("index.html")), "<p>ü ✓</p>");
    assert.equal(fs.encodings.get(at("index.html")), "utf8");
    assert.equal(fs.encodings.get(at(MARKER)), "utf8");
  });

  test("an existing empty folder is used", async () => {
    const fs = fakeFs();
    fs.dirs.add(OUT);
    assert.deepEqual(await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs }), { pages: 3 });
  });

  test("a rebuild removes stale pages from the previous build", async () => {
    const fs = fakeFs({
      [at(MARKER)]: "",
      [at("index.html")]: "old",
      [at("features", "002-gone", "plan.html")]: "stale",
      [at("old.txt")]: "stale",
    });
    assert.deepEqual(await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs }), { pages: 3 });
    assert.equal(fs.files.get(at("index.html")), "<p>overview</p>");
    assert.ok(!fs.files.has(at("features", "002-gone", "plan.html")));
    assert.ok(!fs.dirs.has(at("features", "002-gone")));
    assert.ok(!fs.files.has(at("old.txt")));
    assert.ok(fs.files.has(at(MARKER)));
  });

  test("a non-empty folder without the marker is left untouched (exit code 2)", async () => {
    const initial = { [at("notes.txt")]: "mine", [at("sub", "a.html")]: "mine" };
    const fs = fakeFs(initial);
    const result = await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs });
    assert.equal(result.code, 2);
    assert.match(result.error, /not empty/);
    assert.match(result.error, /\.speckit-eye-build/);
    assert.deepEqual(Object.fromEntries(fs.files), initial);
    assert.deepEqual(fs.writes, []);
  });

  test("out inside specs/ or .specify/, or equal to the project, is a usage error", async () => {
    for (const out of [
      ROOT,
      path.join(ROOT, "specs"),
      path.join(ROOT, "specs", "site"),
      path.join(ROOT, ".specify", "x", "y"),
    ]) {
      const fs = fakeFs();
      const result = await writeSite({ site: SITE, out, projectRoot: ROOT, fs });
      assert.equal(result.code, 2, out);
      assert.deepEqual(fs.writes, [], out);
    }
  });

  test("out elsewhere inside the project (such as _site) is allowed", async () => {
    const fs = fakeFs();
    const out = path.join(ROOT, "_site");
    assert.deepEqual(await writeSite({ site: SITE, out, projectRoot: ROOT, fs }), { pages: 3 });
    // A sibling whose name only starts with "specs" is not inside specs/.
    assert.deepEqual(await writeSite({ site: SITE, out: path.join(ROOT, "specs-site"), projectRoot: ROOT, fs }), { pages: 3 });
  });

  test("out that is a file is a usage error", async () => {
    const fs = fakeFs({ [OUT]: "file" });
    const result = await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs });
    assert.equal(result.code, 2);
    assert.match(result.error, /not a folder/);
  });

  test("a write failure returns exit code 1", async () => {
    const fs = fakeFs();
    fs.writeFile = async () => {
      throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    };
    const result = await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs });
    assert.equal(result.code, 1);
    assert.match(result.error, /EACCES/);
  });

  test("a thrown non-Error value is reported as text", async () => {
    const fs = fakeFs();
    fs.writeFile = async () => {
      throw "disk on fire";
    };
    const result = await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs });
    assert.equal(result.code, 1);
    assert.match(result.error, /disk on fire/);
  });

  test("a read failure other than a missing folder returns exit code 1", async () => {
    const fs = fakeFs();
    fs.readdir = async () => {
      throw Object.assign(new Error("EACCES"), { code: "EACCES" });
    };
    assert.equal((await writeSite({ site: SITE, out: OUT, projectRoot: ROOT, fs })).code, 1);
  });

  test("a site key escaping the folder is refused", async () => {
    const fs = fakeFs();
    const result = await writeSite({ site: new Map([["../evil.html", page("x")]]), out: OUT, projectRoot: ROOT, fs });
    assert.equal(result.code, 1);
    assert.ok(!fs.files.has(path.resolve("/evil.html")));
  });
});
