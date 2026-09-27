import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderSite, allArtifacts, HTML_TYPE, CSS_TYPE, JS_TYPE, FONT_TYPE, JSON_TYPE, TEXT_TYPE } from "../../src/render/site.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";
import { themeScript } from "../../src/render/theme-script.js";
import { buildSearchIndex } from "../../src/render/search-index.js";

async function model(files) {
  return buildModel(await scan(createFakeReader(files), "proj"));
}

const FILES = {
  ".specify/memory/constitution.md": "# Constitution",
  "specs/001-a/spec.md": "# Feature Specification: Alpha",
  "specs/001-a/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n- [ ] T002 two <b>",
};

const WOFF2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0x80]);

const ASSETS = {
  styles: "body{color:red}",
  modules: {
    "app.js": "export const app = 1;",
    "prefs.js": "export const prefs = 1;",
    "live.js": "export const live = 1;",
    "taskmap.js": "export const x = 1;",
  },
  fonts: { "geist-latin-wght-normal.woff2": WOFF2, "OFL-geist.txt": "SIL Open Font License" },
};

const ASSET_KEYS = [
  "assets/app.js",
  "assets/fonts/OFL-geist.txt",
  "assets/fonts/geist-latin-wght-normal.woff2",
  "assets/prefs.js",
  "assets/search-index.json",
  "assets/styles.css",
  "assets/taskmap.js",
  "assets/theme.js",
];

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

  test("returns exactly the overview, its assets, the feature pages and the artifact pages; live.js only in serve mode (US1, US2, US3)", async () => {
    const s = await site();
    assert.ok(s instanceof Map);
    const pages = ["constitution.html", "features/001-a/index.html", "features/001-a/spec.html", "features/001-a/tasks.html"];
    assert.deepEqual([...s.keys()].sort(), ["assets/live.js", ...ASSET_KEYS, ...pages, "index.html"].sort());
    const st = await site({ mode: "static" });
    assert.deepEqual([...st.keys()].sort(), [...ASSET_KEYS, ...pages, "index.html"].sort());
  });

  test("serve mode needs the live script; static mode does not", async () => {
    const m = await model(FILES);
    const assets = { styles: "", modules: { "app.js": "" }, fonts: {} };
    assert.throws(() => renderSite(m, { base: "/", mode: "serve", version: "1", assets }), /assets\.modules\["live\.js"\]/);
    assert.ok(renderSite(m, { base: "/", mode: "static", version: "1", assets }).has("index.html"));
  });

  test("the live script and banner are on serve pages and absent from static pages (FR-032)", async () => {
    const serve = (await site()).get("index.html").body;
    assert.match(serve, /<script type="module" src="\/assets\/live\.js"><\/script>/);
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
    assert.match(body, /<body data-mode="serve" data-version="9\.9\.9" data-page="overview" data-base="\/">/);
    assert.match(body, /<main><header data-region="page-head">/);
    assert.match(body, /<div data-region="tree" data-keep-scroll="tree" data-filter="all">/);
    assert.match(body, /<section data-region="taskmap" data-layout="stacked"/);
    assert.match(body, /50 %<\/span><span data-part="detail">1 of 2 tasks</);
    assert.match(body, /two &lt;b&gt;/);
    assert.doesNotMatch(body, /two <b>/);
  });

  test("assets are passed through unchanged with their types", async () => {
    const s = await site();
    assert.deepEqual(s.get("assets/styles.css"), { type: CSS_TYPE, body: ASSETS.styles });
    for (const name of Object.keys(ASSETS.modules)) {
      assert.deepEqual(s.get(`assets/${name}`), { type: JS_TYPE, body: ASSETS.modules[name] }, name);
    }
  });

  test("assets/theme.js is generated from themeScript() in both modes, not passed in as a module (research D3)", async () => {
    for (const mode of ["serve", "static"]) {
      const s = await site({ mode });
      assert.deepEqual(s.get("assets/theme.js"), { type: JS_TYPE, body: themeScript() });
      assert.match(s.get("assets/theme.js").body, /applyStoredTheme/);
    }
    const m = await model(FILES);
    const bare = renderSite(m, { base: "/", mode: "static", version: "1", assets: { styles: "", modules: {}, fonts: {} } });
    assert.equal(bare.get("assets/theme.js").body, themeScript());
  });

  test("assets/search-index.json is the model's search index, the same in both modes and under any base (FR-049c)", async () => {
    const m = await model(FILES);
    const expected = JSON.stringify(buildSearchIndex(m));
    for (const [mode, base] of [["serve", "/"], ["static", "/"], ["static", "/eye/"]]) {
      const s = await site({ mode, base });
      const entry = s.get("assets/search-index.json");
      assert.equal(entry.type, JSON_TYPE);
      assert.equal(entry.body, expected, `${mode} ${base}`);
      const parsed = JSON.parse(entry.body);
      assert.equal(parsed.version, 1);
      assert.ok(parsed.entries.some((e) => e.type === "task" && e.label === "T002"));
      assert.ok(!entry.body.includes("/eye/"), "URLs carry no base");
    }
  });

  test("font files are published under assets/fonts/ with their types; bytes stay a Uint8Array (research D12)", async () => {
    for (const mode of ["serve", "static"]) {
      const s = await site({ mode, base: "/repo/" });
      const font = s.get("assets/fonts/geist-latin-wght-normal.woff2");
      assert.equal(font.type, FONT_TYPE);
      assert.ok(font.body instanceof Uint8Array);
      assert.equal(font.body, WOFF2);
      assert.deepEqual([...font.body], [0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0x80]);
      assert.deepEqual(s.get("assets/fonts/OFL-geist.txt"), { type: TEXT_TYPE, body: "SIL Open Font License" });
    }
  });

  test("an unexpected file in the fonts folder is refused", async () => {
    const m = await model(FILES);
    const assets = { ...ASSETS, fonts: { "geist.woff": new Uint8Array([1]) } };
    assert.throws(() => renderSite(m, { base: "/", mode: "static", version: "1", assets }), /unexpected font file geist\.woff/);
  });

  test("the live module is published in serve mode only, even when passed in static mode", async () => {
    assert.ok((await site()).has("assets/live.js"));
    assert.ok(!(await site({ mode: "static" })).has("assets/live.js"));
    const m = await model(FILES);
    const noLive = { ...ASSETS, modules: { "app.js": "a" } };
    assert.ok(renderSite(m, { base: "/", mode: "static", version: "1", assets: noLive }).has("assets/app.js"));
  });

  test("the content types are the ones of research D12", () => {
    assert.equal(FONT_TYPE, "font/woff2");
    assert.equal(JSON_TYPE, "application/json; charset=utf-8");
    assert.equal(TEXT_TYPE, "text/plain; charset=utf-8");
  });

  test("links use the given base and mode", async () => {
    const { body } = (await site({ base: "/repo/", mode: "static" })).get("index.html");
    assert.match(body, /data-mode="static"/);
    assert.match(body, /href="\/repo\/assets\/styles\.css"/);
    assert.match(body, /src="\/repo\/assets\/theme\.js"/);
    assert.match(body, /src="\/repo\/assets\/app\.js"/);
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
    assert.match(index, /<footer[^>]*>speckit-eye 1 · generated <time datetime="2026-09-25T10:00:00\.000Z">/);
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

  test("the page set equals the artifact set plus one page per feature (FR-021, FR-029)", async () => {
    const m = await model(ARTIFACT_FILES);
    const s = await artifactSite();
    const htmlPages = [...s.keys()].filter((k) => k.endsWith(".html") && k !== "index.html" && !k.endsWith("/index.html"));
    const featurePages = [...s.keys()].filter((k) => k.endsWith("/index.html"));
    assert.deepEqual(featurePages.sort(), ["features/001-full/index.html", "features/002-partial/index.html"]);
    assert.deepEqual(htmlPages.sort(), [...ARTIFACT_PAGES].sort());
    const fromModel = allArtifacts(m).map(({ artifact }) => artifact.url);
    assert.deepEqual(fromModel.sort(), [...ARTIFACT_PAGES].sort());
  });

  test("W11 names get no page", async () => {
    const s = await artifactSite();
    for (const key of s.keys()) assert.doesNotMatch(key, /bad|\s/);
    for (const { body } of s.values()) if (typeof body === "string") assert.doesNotMatch(body, /href="[^"]*bad/);
    // The skipped file is reported as a warning on its feature instead.
    assert.match(s.get("index.html").body, /<a data-part="warning" data-code="W11" href="\/features\/001-full\/index.html#warnings">[\s\S]*?1 name not supported for a page<\/span> <span data-part="note">— skipped</);
  });

  test("an artifact page is a full page in the reader layout (FR-038, T061)", async () => {
    const { type, body } = (await artifactSite()).get("features/001-full/plan.html");
    assert.equal(type, HTML_TYPE);
    assert.match(body, /^<!doctype html>/);
    assert.match(body, /<title>Plan · proj · speckit-eye<\/title>/);
    assert.match(body, /<details data-region="mobile-menu">/);
    assert.match(body, /<body [^>]*data-page="document"/);
    assert.match(body, /<nav data-region="rail"/);
    assert.doesNotMatch(body, /data-region="sidebar"/);
    assert.match(body, /<main><div data-region="reader">\n<nav data-region="doc-list" data-keep-scroll="docs"/);
    assert.match(body, /<a data-part="back" href="\/features\/001-full\/index.html">/);
    assert.match(body, /<article data-region="doc" data-key="specs\/001-full\/plan.md" data-kind="plan">/);
    assert.match(body, /<p data-part="eyebrow">IMPLEMENTATION PLAN · plan.md<\/p>\n<h1>Plan<\/h1>/);
    assert.match(body, /<nav data-region="toc" aria-label="On this page">/);
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

  test("assessment and constitution pages get the project document list (FR-039)", async () => {
    const s = await artifactSite();
    const list = (key) => {
      const body = s.get(key).body;
      const at = body.indexOf('<div data-part="doc-groups">');
      return body.slice(at, body.indexOf("</nav>", at));
    };
    for (const key of ["constitution.html", "assessments/idea-x/intake.html"]) {
      assert.match(list(key), /<h2>Project<\/h2><ul><li><a href="\/constitution.html"/);
      assert.match(list(key), /<h2>Assessment: idea-x<\/h2><ul><li><a href="\/assessments\/idea-x\/intake.html"/);
      assert.match(list(key), /href="\/assessments\/idea-x\/notes.html"/);
    }
    assert.match(list("assessments/idea-x/intake.html"), /<a href="\/assessments\/idea-x\/intake.html" aria-current="page">/);
    assert.match(list("constitution.html"), /<a href="\/constitution.html" aria-current="page">/);
  });

  test("spec.md pages use the structured view (FR-042)", async () => {
    const { body } = (await artifactSite()).get("features/001-full/spec.html");
    assert.match(body, /<p data-part="eyebrow">SPECIFICATION · spec.md<\/p>\n<h1>Feature Specification: Full<\/h1>/);
    assert.equal(body.split("<h1").length, 2, "the title is shown once, in the header");
    assert.doesNotMatch(body, /data-part="title"/);
  });

  test("one feature page per feature, rendered with the sidebar marking it current (FR-029, T022)", async () => {
    const s = await artifactSite({ base: "/repo/", mode: "static" });
    const { type, body } = s.get("features/001-full/index.html");
    assert.equal(type, HTML_TYPE);
    assert.match(body, /^<!doctype html>/);
    assert.match(body, /<title>Full · proj · speckit-eye<\/title>/);
    assert.match(body, /<body [^>]*data-page="feature"/);
    assert.match(body, /<aside data-region="sidebar"/);
    assert.doesNotMatch(body, /data-region="rail"/);
    const sidebar = body.slice(body.indexOf("<aside"), body.indexOf("</aside>"));
    assert.match(sidebar, /<a data-key="side:001-full"[^>]*href="\/repo\/features\/001-full\/index\.html" aria-current="page">/);
    assert.doesNotMatch(sidebar, /<a data-key="side:002-partial"[^>]*aria-current/);
    assert.match(body, /<main><header data-region="feature-head">/);
    assert.match(body, /<h1>Full<\/h1>/);
    assert.match(body, /<a data-part="tab" href="\/repo\/features\/001-full\/plan\.html">Plan<\/a>/);
    assert.match(s.get("features/002-partial/index.html").body, /<h1>Partial<\/h1>/);
  });

  test("document pages use the rail and mark their main destination current", async () => {
    const s = await artifactSite();
    const rail = (key) => {
      const body = s.get(key).body;
      return body.slice(body.indexOf('<nav data-region="rail"'), body.indexOf("</nav>", body.indexOf('<nav data-region="rail"')));
    };
    assert.match(rail("constitution.html"), /href="\/constitution\.html" aria-label="Constitution" title="Constitution" aria-current="page"/);
    assert.match(rail("assessments/idea-x/notes.html"), /aria-label="Assessment: idea-x" title="Assessment: idea-x" aria-current="page"/);
    assert.doesNotMatch(rail("features/001-full/plan.html"), /aria-current/);
  });

  test("the same pages exist in serve and static mode", async () => {
    const serve = [...(await artifactSite()).keys()].filter((k) => k.endsWith(".html"));
    const stat = [...(await artifactSite({ mode: "static", base: "/repo/" })).keys()].filter((k) => k.endsWith(".html"));
    assert.deepEqual(stat, serve);
  });
});
