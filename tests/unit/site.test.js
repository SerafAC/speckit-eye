import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderSite, HTML_TYPE, CSS_TYPE, JS_TYPE } from "../../src/render/site.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

async function model(files) {
  return buildModel(await scan(createFakeReader(files), "proj"));
}

const FILES = {
  ".specify/memory/constitution.md": "# Constitution",
  "specs/001-a/spec.md": "# Feature Specification: Alpha",
  "specs/001-a/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n- [ ] T002 two <b>",
};

const ASSETS = { styles: "body{color:red}", overview: "export const x = 1;" };

const site = async (opts = {}) =>
  renderSite(await model(FILES), { base: "/", mode: "serve", version: "9.9.9", assets: ASSETS, ...opts });

describe("renderSite", () => {
  test("returns exactly the overview and its two assets (US1)", async () => {
    const s = await site();
    assert.ok(s instanceof Map);
    assert.deepEqual([...s.keys()].sort(), ["assets/overview.js", "assets/styles.css", "index.html"]);
  });

  test("index.html is a full page with the overview inside <main>", async () => {
    const { type, body } = (await site()).get("index.html");
    assert.equal(type, HTML_TYPE);
    assert.match(body, /^<!doctype html>/);
    assert.match(body, /<title>proj · speckit-eye<\/title>/);
    assert.match(body, /<body data-mode="serve" data-version="9\.9\.9">/);
    assert.match(body, /<main><section data-region="progress">/);
    assert.match(body, /<div data-region="tree">/);
    assert.match(body, /<div data-region="grid">/);
    assert.match(body, /1 \/ 2 tasks \(50 %\)/);
    assert.match(body, /two &lt;b&gt;/);
    assert.doesNotMatch(body, /two <b>/);
  });

  test("assets are passed through unchanged with their types", async () => {
    const s = await site();
    assert.deepEqual(s.get("assets/styles.css"), { type: CSS_TYPE, body: ASSETS.styles });
    assert.deepEqual(s.get("assets/overview.js"), { type: JS_TYPE, body: ASSETS.overview });
  });

  test("links use the given base and mode", async () => {
    const { body } = (await site({ base: "/repo/", mode: "static" })).get("index.html");
    assert.match(body, /data-mode="static"/);
    assert.match(body, /href="\/repo\/assets\/styles\.css"/);
    assert.match(body, /src="\/repo\/assets\/overview\.js"/);
    assert.match(body, /href="\/repo\/constitution\.html"/);
  });

  test("is deterministic for the same input (FR-031)", async () => {
    const m = await model(FILES);
    const opts = { base: "/", mode: "serve", version: "1", assets: ASSETS };
    const a = renderSite(m, opts);
    const b = renderSite(m, opts);
    assert.deepEqual([...a.entries()], [...b.entries()]);
  });

  test("renders an empty project", async () => {
    const s = renderSite(await model({ ".specify/memory/constitution.md": "# C" }), {
      base: "/",
      mode: "serve",
      version: "1",
      assets: ASSETS,
    });
    assert.match(s.get("index.html").body, /data-part="empty"/);
  });
});
