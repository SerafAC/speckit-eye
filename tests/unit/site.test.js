import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderSite, allArtifacts, HTML_TYPE, CSS_TYPE, JS_TYPE } from "../../src/render/site.js";
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
  test("tolerates a feature without artifacts and an artifact without content", async () => {
    const m = await model(FILES);
    m.features.push({ ...m.features[0], dir: "002-b", title: "B", artifacts: undefined });
    delete m.constitution.content;
    const s = renderSite(m, { base: "/", mode: "static", version: "1", assets: ASSETS });
    assert.ok(s.has("constitution.html"));
    assert.equal(allArtifacts(m).filter(({ feature }) => feature?.dir === "002-b").length, 0);
  });

  test("returns exactly the overview, its assets and the artifact pages; live.js only in serve mode (US1, US2, US3)", async () => {
    const s = await site();
    assert.ok(s instanceof Map);
    const pages = ["constitution.html", "features/001-a/spec.html", "features/001-a/tasks.html"];
    assert.deepEqual([...s.keys()].sort(), ["assets/live.js", "assets/overview.js", "assets/styles.css", ...pages, "index.html"].sort());
    const st = await site({ mode: "static" });
    assert.deepEqual([...st.keys()].sort(), ["assets/overview.js", "assets/styles.css", ...pages, "index.html"].sort());
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

  test("serve and static <main> HTML are identical for the same model with base / (FR-031)", async () => {
    const m = await model(ARTIFACT_FILES);
    const serve = renderSite(m, { base: "/", mode: "serve", version: "1", assets: ASSETS });
    const stat = renderSite(m, { base: "/", mode: "static", version: "1", generatedAt: "2026-09-25T10:00:00.000Z", assets: ASSETS });
    const main = (body) => body.slice(body.indexOf("<main>"), body.indexOf("</main>") + "</main>".length);
    const pages = [...serve.keys()].filter((k) => k.endsWith(".html"));
    assert.ok(pages.length > 10);
    for (const key of pages) {
      assert.ok(main(serve.get(key).body).length > 20, key);
      assert.equal(main(stat.get(key).body), main(serve.get(key).body), key);
    }
    const index = stat.get("index.html").body;
    assert.match(index, /<footer>generated at <time datetime="2026-09-25T10:00:00\.000Z">/);
    assert.doesNotMatch(index, /__events|live\.js|live-status/);
  });

  test("static pages prefix every link and asset with the base", async () => {
    const s = renderSite(await model(ARTIFACT_FILES), { base: "/my-repo/", mode: "static", version: "1", generatedAt: "x", assets: ASSETS });
    for (const [key, { body }] of s) {
      if (!key.endsWith(".html")) continue;
      for (const [, url] of body.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
        assert.ok(url.startsWith("/my-repo/") || url.startsWith("#"), `${key}: ${url}`);
      }
    }
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

/** Every artifact type, same shape as tests/fixtures/projects/artifacts. */
const ARTIFACT_FILES = {
  ".specify/memory/constitution.md": "# Constitution",
  ".specify/assessments/idea-x/notes.md": "# Notes",
  ".specify/assessments/idea-x/decision.md": "# Decision",
  ".specify/assessments/idea-x/intake.md": "# Intake",
  "specs/001-full/spec.md": "# Feature Specification: Full",
  "specs/001-full/plan.md": [
    "# Plan",
    "[spec](./spec.md) [cli](./contracts/cli.md#synopsis) [src](../../src/index.js) [x](javascript:alert(1))",
    "",
    "<script>alert(1)</script>",
    "",
    "```mermaid",
    "graph TD",
    "```",
  ].join("\n"),
  "specs/001-full/research.md": "# Research",
  "specs/001-full/data-model.md": "# Data Model",
  "specs/001-full/quickstart.md": "# Quickstart",
  "specs/001-full/tasks.md": "## Phase 1: Setup\n- [ ] T001 one",
  "specs/001-full/contracts/cli.md": "# CLI\n## Synopsis",
  "specs/001-full/checklists/requirements.md": "# Requirements\n- [x] CHK001 x",
  "specs/001-full/decisions.md": "# Decisions",
  "specs/001-full/run-log.md": "# Run Log",
  "specs/001-full/bad name.md": "# Bad",
  "specs/002-partial/spec.md": "# Feature Specification: Partial",
  "specs/002-partial/plan.md": "# Partial plan",
};

const ARTIFACT_PAGES = [
  "constitution.html",
  "assessments/idea-x/intake.html",
  "assessments/idea-x/decision.html",
  "assessments/idea-x/notes.html",
  "features/001-full/spec.html",
  "features/001-full/plan.html",
  "features/001-full/research.html",
  "features/001-full/data-model.html",
  "features/001-full/quickstart.html",
  "features/001-full/tasks.html",
  "features/001-full/contracts/cli.html",
  "features/001-full/checklists/requirements.html",
  "features/001-full/decisions.html",
  "features/001-full/run-log.html",
  "features/002-partial/spec.html",
  "features/002-partial/plan.html",
];

describe("renderSite: artifact pages (T050, US3)", () => {
  const artifactSite = async (opts = {}) =>
    renderSite(await model(ARTIFACT_FILES), { base: "/", mode: "serve", version: "1", assets: ASSETS, ...opts });

  test("the page set equals the artifact set (FR-021)", async () => {
    const m = await model(ARTIFACT_FILES);
    const s = await artifactSite();
    const htmlPages = [...s.keys()].filter((k) => k.endsWith(".html") && k !== "index.html");
    assert.deepEqual(htmlPages.sort(), [...ARTIFACT_PAGES].sort());
    const fromModel = allArtifacts(m).map(({ artifact }) => artifact.url);
    assert.deepEqual(fromModel.sort(), [...ARTIFACT_PAGES].sort());
  });

  test("W11 names get no page", async () => {
    const s = await artifactSite();
    for (const key of s.keys()) assert.doesNotMatch(key, /bad|\s/);
    for (const { body } of s.values()) assert.doesNotMatch(body, /href="[^"]*bad/);
    // The skipped file is reported as a warning on its feature instead.
    assert.match(s.get("index.html").body, /specs\/001-full\/bad name\.md name not supported for a page \(skipped\)/);
  });

  test("an artifact page is a full page with the breadcrumb and the rendered article", async () => {
    const { type, body } = (await artifactSite()).get("features/001-full/plan.html");
    assert.equal(type, HTML_TYPE);
    assert.match(body, /^<!doctype html>/);
    assert.match(body, /<title>Plan · proj · speckit-eye<\/title>/);
    assert.match(body, /<details data-region="menu">/);
    assert.match(body, /<main><nav data-region="breadcrumb"[^>]*><a href="\/index.html">Overview<\/a>[\s\S]*Full[\s\S]*Plan<\/span><\/nav>/);
    assert.match(body, /<article class="prose" data-region="artifact" data-key="specs\/001-full\/plan.md">/);
    assert.match(body, /<h1 id="plan">Plan<\/h1>/);
  });

  test("links between artifacts go to their pages; other links are plain text (FR-023)", async () => {
    const { body } = (await artifactSite({ base: "/repo/", mode: "static" })).get("features/001-full/plan.html");
    const article = body.slice(body.indexOf("<article"));
    assert.match(article, /<a href="\/repo\/features\/001-full\/spec.html">spec<\/a>/);
    assert.match(article, /<a href="\/repo\/features\/001-full\/contracts\/cli.html#synopsis">cli<\/a>/);
    assert.doesNotMatch(article, /src\/index\.js"/);
    assert.doesNotMatch(article, /href="javascript/i);
  });

  test("scripts from files are escaped and diagrams stay code (FR-024, FR-020)", async () => {
    const { body } = (await artifactSite()).get("features/001-full/plan.html");
    const article = body.slice(body.indexOf("<article"));
    assert.doesNotMatch(article, /<script/);
    assert.match(article, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(article, /<pre><code class="language-mermaid">graph TD/);
  });

  test("assessment and constitution pages have their own breadcrumb", async () => {
    const s = await artifactSite();
    assert.match(s.get("assessments/idea-x/intake.html").body, /<span data-part="parent">Assessment: idea-x<\/span>/);
    assert.doesNotMatch(s.get("constitution.html").body, /data-part="parent"/);
  });

  test("the same pages exist in serve and static mode", async () => {
    const serve = [...(await artifactSite()).keys()].filter((k) => k.endsWith(".html"));
    const stat = [...(await artifactSite({ mode: "static", base: "/repo/" })).keys()].filter((k) => k.endsWith(".html"));
    assert.deepEqual(stat, serve);
  });
});
