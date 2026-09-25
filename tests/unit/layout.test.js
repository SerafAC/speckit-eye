import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderPage } from "../../src/render/layout.js";
import { html } from "../../src/render/html.js";

function project(overrides = {}) {
  return {
    name: "my-proj",
    features: [
      {
        dir: "001-full",
        title: "Full <Feature>",
        artifacts: [
          { kind: "spec", title: "Spec", source: "specs/001-full/spec.md", url: "features/001-full/spec.html" },
          { kind: "plan", title: "Plan", source: "specs/001-full/plan.md", url: "features/001-full/plan.html" },
          { kind: "contract", title: "CLI", source: "specs/001-full/contracts/cli.md", url: "features/001-full/contracts/cli.html" },
        ],
      },
      { dir: "002-bare", title: "Bare", artifacts: [] },
    ],
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

/** The header's link bar (the first <nav> in the header, not the menu). */
const headerNav = (doc) => {
  const header = doc.slice(doc.indexOf("<header"), doc.indexOf("</header>"));
  return header.slice(header.indexOf("<nav>"), header.indexOf("</nav>"));
};

/** The menu element. */
const menu = (doc) => doc.slice(doc.indexOf('<details data-region="menu">'), doc.indexOf("</details>") + "</details>".length);

/** Every href/src attribute value in the document. */
const urls = (doc) => [...doc.matchAll(/\s(?:href|src)="([^"]*)"/g)].map((m) => m[1]);

describe("renderPage", () => {
  test("a feature without an artifact list gets no menu group", () => {
    const doc = page({ project: project({ features: [{ dir: "003-none", title: "None" }] }) });
    assert.doesNotMatch(menu(doc), /003-none/);
    assert.match(menu(doc), /Overview/);
  });

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
    const header = headerNav(doc);
    assert.match(header, /href="\/constitution.html"/);
    assert.match(header, /href="\/assessments\/dash\/intake.html"/);
    assert.doesNotMatch(header, /decision.html/);
    assert.doesNotMatch(header, /empty/);
  });

  test("no constitution, assessments or features → only overview links", () => {
    const doc = page({ project: project({ constitution: null, assessments: [], features: [] }) });
    const header = doc.slice(doc.indexOf("<header"), doc.indexOf("</header>"));
    assert.deepEqual(urls(header), ["/index.html", "/index.html", "/index.html"]);
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

  test("static mode footer shows the generated time before the version (FR-031)", () => {
    const at = "2026-09-25T10:00:00.000Z";
    assert.match(
      page({ mode: "static", generatedAt: at }),
      /<footer>generated at <time datetime="2026-09-25T10:00:00\.000Z">2026-09-25T10:00:00\.000Z<\/time> · speckit-eye 1\.2\.3<\/footer>/,
    );
    assert.doesNotMatch(page({ generatedAt: at }), /generated at/);
    assert.doesNotMatch(page({ mode: "static" }), /generated at/);
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

  test("an always-visible Overview link in the header (FR-025)", () => {
    const nav = headerNav(page({ base: "/repo/" }));
    assert.match(nav, /<a href="\/repo\/index.html" data-part="overview-link">Overview<\/a>/);
  });

  test("the menu is a <details> in the header that works without scripts (FR-022, FR-025)", () => {
    const doc = page();
    const header = doc.slice(doc.indexOf("<header"), doc.indexOf("</header>"));
    assert.match(header, /<details data-region="menu">\n<summary>Menu<\/summary>/);
    assert.doesNotMatch(menu(doc), /\sopen[\s>]/);
  });

  test("the menu lists overview, constitution, assessments and features with their artifacts, in order", () => {
    const m = menu(page());
    assert.deepEqual(urls(m), [
      "/index.html",
      "/constitution.html",
      "/assessments/dash/intake.html",
      "/assessments/dash/decision.html",
      "/features/001-full/spec.html",
      "/features/001-full/plan.html",
      "/features/001-full/contracts/cli.html",
    ]);
    assert.match(m, /<a href="\/constitution.html">Constitution<\/a>/);
    assert.match(m, /<span data-part="group-title">Assessment: dash<\/span><ul><li><a href="\/assessments\/dash\/intake.html">Intake<\/a><\/li>/);
    assert.match(m, /<li data-part="group" data-key="001-full"><span data-part="group-title">Full &lt;Feature&gt;<\/span>/);
    // Groups without artifacts are left out.
    assert.doesNotMatch(m, /Assessment: empty/);
    assert.doesNotMatch(m, /Bare/);
  });

  test("the menu uses the base path and is the same on every mode", () => {
    const m = menu(page({ base: "/repo/", mode: "static" }));
    for (const u of urls(m)) assert.ok(u.startsWith("/repo/"), u);
    assert.equal(menu(page({ mode: "static" })), menu(page()));
  });

  test("the menu without constitution, assessments or features has only the overview", () => {
    const m = menu(page({ project: project({ constitution: null, assessments: [], features: [] }) }));
    assert.deepEqual(urls(m), ["/index.html"]);
  });
});
