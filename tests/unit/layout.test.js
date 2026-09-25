import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../../src/render/layout.js";
import { html } from "../../src/render/html.js";

function project(overrides = {}) {
  return {
    name: "my-proj",
    features: [],
    constitution: { kind: "constitution", title: "C", source: ".specify/memory/constitution.md", url: "constitution.html" },
    assessments: [
      {
        slug: "dash",
        artifacts: [
          { kind: "assessment", title: "Intake", source: ".specify/assessments/dash/intake.md", url: "assessments/dash/intake.html" },
          { kind: "assessment", title: "Decision", source: ".specify/assessments/dash/decision.md", url: "assessments/dash/decision.html" },
        ],
      },
      { slug: "empty", artifacts: [] },
    ],
    warnings: [],
    ...overrides,
  };
}

const page = (opts = {}) =>
  renderPage({
    title: "Overview",
    base: "/",
    mode: "serve",
    project: project(),
    main: "<section data-region=\"progress\">x</section>",
    version: "1.2.3",
    generatedAt: null,
    ...opts,
  });

/** Every href/src attribute value in the document. */
const urls = (doc) => [...doc.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]);

describe("renderPage", () => {
  test("returns a complete HTML document", () => {
    const doc = page();
    assert.match(doc, /^<!doctype html>/);
    assert.match(doc, /<html lang="en">/);
    assert.match(doc, /<meta charset="utf-8">/);
    assert.match(doc, /<title>Overview<\/title>/);
    assert.match(doc, /<\/html>\s*$/);
  });

  test("body carries mode and version", () => {
    assert.match(page(), /<body data-mode="serve" data-version="1.2.3">/);
    assert.match(page({ mode: "static" }), /<body data-mode="static" data-version="1.2.3">/);
  });

  test("header has the project name linking to the overview", () => {
    assert.match(page(), /<header data-region="header">[\s\S]*<a href="\/index.html"[^>]*>my-proj<\/a>[\s\S]*<\/header>/);
  });

  test("header links to the constitution and each assessment's first artifact", () => {
    const doc = page();
    const header = doc.slice(doc.indexOf("<header"), doc.indexOf("</header>"));
    assert.match(header, /href="\/constitution.html"/);
    assert.match(header, /href="\/assessments\/dash\/intake.html"/);
    assert.doesNotMatch(header, /decision.html/);
    assert.doesNotMatch(header, /empty/);
  });

  test("no constitution and no assessments → only the project link", () => {
    const doc = page({ project: project({ constitution: null, assessments: [] }) });
    const header = doc.slice(doc.indexOf("<header"), doc.indexOf("</header>"));
    assert.deepEqual(urls(header), ["/index.html"]);
  });

  test("stylesheet and overview script", () => {
    const doc = page();
    assert.match(doc, /<link rel="stylesheet" href="\/assets\/styles.css">/);
    assert.match(doc, /<script type="module" src="\/assets\/overview.js"><\/script>/);
  });

  test("serve mode loads live.js and has the hidden live-status banner (US2, FR-030)", () => {
    const doc = page({ base: "/" });
    assert.match(doc, /<script type="module" src="\/assets\/live\.js" defer><\/script>\n<\/head>/);
    assert.match(doc, /<\/main>\n<div data-region="live-status" hidden>Live updates paused — reconnecting…<\/div>\n<footer>/);
  });

  test("static mode has neither live.js nor the live-status banner (FR-032)", () => {
    const doc = page({ mode: "static", base: "/repo/" });
    assert.doesNotMatch(doc, /live\.js/);
    assert.doesNotMatch(doc, /live-status/);
    assert.match(doc, /<script type="module" src="\/repo\/assets\/overview\.js"><\/script>\n<\/head>/);
  });

  test("main is inserted as trusted HTML (string or Raw)", () => {
    assert.match(page(), /<main><section data-region="progress">x<\/section><\/main>/);
    assert.match(page({ main: html`<p>${"<b>"}</p>` }), /<main><p>&lt;b&gt;<\/p><\/main>/);
  });

  test("footer shows the version", () => {
    assert.match(page(), /<footer>[^<]*1\.2\.3[^<]*<\/footer>/);
  });

  test("every link and asset is absolute with the base path (R10)", () => {
    const doc = page({ base: "/repo/" });
    const all = urls(doc);
    assert.ok(all.length >= 5);
    for (const u of all) assert.ok(u.startsWith("/repo/"), u);
    assert.ok(all.includes("/repo/index.html"));
    assert.ok(all.includes("/repo/assets/styles.css"));
    assert.ok(all.includes("/repo/assets/overview.js"));
    assert.ok(all.includes("/repo/constitution.html"));
    assert.ok(all.includes("/repo/assessments/dash/intake.html"));
  });

  test("project name, title and slugs are escaped", () => {
    const doc = page({
      title: "<script>",
      project: project({ name: "a&b<c>", assessments: [{ slug: "s\"x", artifacts: [{ url: "assessments/s/intake.html" }] }] }),
    });
    assert.match(doc, /<title>&lt;script&gt;<\/title>/);
    assert.match(doc, />a&amp;b&lt;c&gt;<\/a>/);
    assert.match(doc, /s&quot;x/);
  });

  test("no inline style attributes (serve-mode CSP)", () => {
    assert.doesNotMatch(page(), /\sstyle=/);
  });
});
