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

const ASSETS = { styles: "body{color:red}", overview: "export const x = 1;", live: "export const live = 1;" };

const site = async (opts = {}) =>
  renderSite(await model(FILES), { base: "/", mode: "serve", version: "9.9.9", assets: ASSETS, ...opts });

describe("renderSite", () => {
  test("returns exactly the overview and its assets; live.js only in serve mode (US1, US2)", async () => {
    const s = await site();
    assert.ok(s instanceof Map);
    assert.deepEqual([...s.keys()].sort(), ["assets/live.js", "assets/overview.js", "assets/styles.css", "index.html"]);
    const st = await site({ mode: "static" });
    assert.deepEqual([...st.keys()].sort(), ["assets/overview.js", "assets/styles.css", "index.html"]);
  });

  test("serve mode needs the live script; static mode does not", async () => {
    const m = await model(FILES);
    const assets = { styles: "", overview: "" };
    assert.throws(() => renderSite(m, { base: "/", mode: "serve", version: "1", assets }), /assets\.live/);
    assert.ok(renderSite(m, { base: "/", mode: "static", version: "1", assets }).has("index.html"));
  });

  test("the live script and banner are on serve pages and absent from static pages (FR-032)", async () => {
    const serve = (await site()).get("index.html").body;
    assert.match(serve, /<script type="module" src="\/assets\/live\.js" defer><\/script>/);
    assert.match(serve, /<div data-region="live-status" hidden>Live updates paused — reconnecting…<\/div>/);
    const stat = (await site({ mode: "static", base: "/repo/" })).get("index.html").body;
    assert.doesNotMatch(stat, /live\.js/);
    assert.doesNotMatch(stat, /live-status/);
    assert.doesNotMatch(stat, /__events/);
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
    assert.deepEqual(s.get("assets/live.js"), { type: JS_TYPE, body: ASSETS.live });
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
