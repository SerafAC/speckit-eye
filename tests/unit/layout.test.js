import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import { renderPage, sidebarOrder } from "../../src/render/layout.js";
import { html } from "../../src/render/html.js";
import { renderOverview } from "../../src/render/overview.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

const tasks = (n, done) =>
  ["## Phase 1: P", ...Array.from({ length: n }, (_, i) => `- [${i < done ? "x" : " "}] T${String(i + 1).padStart(3, "0")} t`)].join("\n");

/** Four features like the `mixed` fixture: complete, in progress, ready, spec only. */
const FILES = {
  ".specify/memory/constitution.md": "# Constitution",
  ".specify/assessments/dash/intake.md": "# Intake",
  ".specify/assessments/dash/decision.md": "# Decision",
  "specs/001-alpha/spec.md": "# Feature Specification: Alpha",
  "specs/001-alpha/tasks.md": tasks(3, 3),
  "specs/002-beta/spec.md": "# Feature Specification: Beta <b>",
  "specs/002-beta/tasks.md": tasks(4, 2),
  "specs/003-gamma/tasks.md": tasks(2, 0),
  "specs/004-delta/spec.md": "# Feature Specification: Delta",
};

/** @type {import("../../src/model/build-model.js").Project} */
let project;
before(async () => {
  project = buildModel(await scan(createFakeReader(FILES), "my-proj"));
});

const page = (opts = {}) =>
  renderPage({
    title: "Overview",
    base: "/",
    mode: "serve",
    project,
    page: "overview",
    main: '<section data-region="stats">x</section>',
    version: "1.2.3",
    generatedAt: null,
    ...opts,
  });

/** The outer HTML of the first element that starts with `open` and ends with `close`. */
const region = (doc, open, close) => {
  const i = doc.indexOf(open);
  if (i === -1) return "";
  return doc.slice(i, doc.indexOf(close, i) + close.length);
};
const sidebar = (doc) => region(doc, '<aside data-region="sidebar"', "</aside>");
const rail = (doc) => region(doc, '<nav data-region="rail"', "\n</nav>");
const mobile = (doc) => region(doc, '<details data-region="mobile-menu">', "</details>");
const head = (doc) => region(doc, "<head>", "</head>");

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

  test("body carries mode, version, page and base", () => {
    assert.match(page(), /<body data-mode="serve" data-version="1.2.3" data-page="overview" data-base="\/">/);
    assert.match(
      page({ mode: "static", page: "document", base: "/eye/" }),
      /<body data-mode="static" data-version="1.2.3" data-page="document" data-base="\/eye\/">/,
    );
  });

  test("script order: theme.js first and blocking, then styles, app.js, live.js in serve mode only", () => {
    const h = head(page());
    assert.match(
      h,
      /<script src="\/assets\/theme\.js"><\/script>\n<link rel="stylesheet" href="\/assets\/styles\.css">\n<script type="module" src="\/assets\/app\.js"><\/script>\n<script type="module" src="\/assets\/live\.js"><\/script>\n<\/head>/,
    );
    assert.equal(h.indexOf("<script"), h.indexOf('<script src="/assets/theme.js">'));
    const st = head(page({ mode: "static", base: "/repo/" }));
    assert.match(st, /<script type="module" src="\/repo\/assets\/app\.js"><\/script>\n<\/head>/);
    assert.doesNotMatch(st, /live\.js/);
    assert.doesNotMatch(page(), /overview\.js/);
  });

  test("serve mode has the hidden live-status banner; static mode has neither it nor live.js (FR-030, FR-032)", () => {
    assert.match(page(), /<\/main>\n<div data-region="live-status" hidden>Live updates paused — reconnecting…<\/div>\n/);
    const st = page({ mode: "static" });
    assert.doesNotMatch(st, /live-status|live\.js/);
  });

  test("main is inserted as trusted HTML (string or Raw)", () => {
    assert.match(page(), /<main><section data-region="stats">x<\/section><\/main>/);
    assert.match(page({ main: html`<p>${"<b>"}</p>` }), /<main><p>&lt;b&gt;<\/p><\/main>/);
  });

  test("regions per page type", () => {
    const has = (doc, re) => re.test(doc);
    for (const kind of ["overview", "feature", "document"]) {
      const doc = page({ page: kind, current: kind === "feature" ? "002-beta" : null });
      assert.equal(has(doc, /<aside data-region="sidebar" class="always-dark">/), kind !== "document", `${kind} sidebar`);
      assert.equal(has(doc, /<nav data-region="rail" class="always-dark"/), kind === "document", `${kind} rail`);
      assert.equal(has(doc, /<div data-region="tooltip" class="always-dark" role="tooltip" hidden><\/div>/), kind === "overview", `${kind} tooltip`);
      assert.ok(has(doc, /<details data-region="mobile-menu">\n<summary aria-label="Menu"><svg/), `${kind} mobile menu`);
      assert.ok(has(doc, /<dialog data-region="search" aria-label="Search"><\/dialog>/), `${kind} search dialog`);
      assert.ok(has(doc, /<main>/), `${kind} main`);
      assert.ok(has(doc, /<div role="group" aria-label="Theme" data-part="theme" hidden>/), `${kind} theme group`);
      assert.ok(has(doc, /<button type="button" data-part="search"[^>]* hidden>/), `${kind} search button`);
      // The old header, header links and Menu are gone (FR-008).
      assert.doesNotMatch(doc, /data-region="header"|data-region="menu"|overview-link/);
    }
  });

  test("sidebar, icon rail, Up next bar and map tooltip carry always-dark (FR-047)", () => {
    /** The opening tag of the element with this data-region, or null. */
    const tag = (doc, region) => doc.match(new RegExp(`<[a-z]+ data-region="${region}"[^>]*>`))?.[0] ?? null;
    const dark = (t) => /\sclass="(?:[^"]*\s)?always-dark(?:\s[^"]*)?"/.test(t ?? "");
    const overview = page({ main: renderOverview(project, { base: "/" }) });
    assert.ok(dark(tag(overview, "sidebar")), "overview sidebar");
    assert.ok(dark(tag(overview, "up-next")), "Up next bar");
    assert.ok(dark(tag(overview, "tooltip")), "map tooltip");
    assert.ok(dark(tag(page({ page: "feature", current: "002-beta" }), "sidebar")), "feature sidebar");
    assert.ok(dark(tag(page({ page: "document" }), "rail")), "icon rail");
    // Nothing else is forced dark: the content follows the theme.
    assert.ok(!dark(tag(overview, "stats")), "stats card follows the theme");
    assert.ok(!dark(tag(overview, "mobile-menu")), "mobile menu follows the theme");
  });

  test("Up next bar is always-dark also when every task is done", async () => {
    const done = buildModel(await scan(createFakeReader({ "specs/001-alpha/tasks.md": tasks(2, 2) }), "p"));
    const doc = page({ project: done, main: renderOverview(done, { base: "/" }) });
    assert.match(doc, /<section data-region="up-next" class="always-dark"[^>]* data-empty="complete">/);
  });

  test("no element carries a style attribute (CSP)", () => {
    for (const kind of ["overview", "feature", "document"]) {
      for (const mode of ["serve", "static"]) assert.doesNotMatch(page({ page: kind, mode }), /\sstyle=/);
    }
  });

  test("the sidebar has brand, project name, search with ⌘K hint and main navigation", () => {
    const s = sidebar(page());
    assert.match(s, /<a href="\/index.html" data-part="brand"><svg[^>]*>[\s\S]*?<\/svg><span>speckit-eye<\/span><\/a>/);
    assert.match(s, /<p data-part="project-name">my-proj<\/p>/);
    assert.match(s, /<button type="button" data-part="search" hidden><svg[\s\S]*?<\/svg><span>Search tasks, specs…<\/span><kbd>⌘K<\/kbd><\/button>/);
    const main = region(s, '<nav aria-label="Main">', "</nav>");
    assert.deepEqual(urls(main), ["/index.html", "/constitution.html", "/assessments/dash/intake.html"]);
    assert.match(main, /<span>Overview<\/span>[\s\S]*<span>Constitution<\/span>[\s\S]*<span>Assessment: dash<\/span>/);
  });

  test("main navigation leaves out a missing constitution and assessments without documents", () => {
    const bare = { ...project, constitution: null, assessments: [{ slug: "empty", artifacts: [] }] };
    const main = region(sidebar(page({ project: bare })), '<nav aria-label="Main">', "</nav>");
    assert.deepEqual(urls(main), ["/index.html"]);
  });

  test('sidebar Features list: "Features 1 / 4 done", status, dots, counts or check, feature page links', () => {
    const f = region(sidebar(page()), '<nav aria-label="Features"', "</nav>");
    assert.match(f, /<h2>Features <span data-part="features-count">1 \/ 4 done<\/span><\/h2>/);
    const links = [...f.matchAll(/<a data-key="side:([^"]+)" data-sig="[^"]*" data-status="([^"]+)" href="([^"]+)"/g)].map((m) => m.slice(1));
    // "In progress first" order from the model's ranks (FR-006, FR-012).
    assert.deepEqual(links, [
      ["002-beta", "in-progress", "/features/002-beta/index.html"],
      ["003-gamma", "not-started", "/features/003-gamma/index.html"],
      ["004-delta", "no-tasks", "/features/004-delta/index.html"],
      ["001-alpha", "done", "/features/001-alpha/index.html"],
    ]);
    assert.match(f, /data-key="side:001-alpha" data-sig="3\/3:complete"/);
    assert.match(f, /<span data-part="dot" data-status="done"><\/span><span data-part="name" title="Alpha">Alpha<\/span><span data-part="count"><svg[^>]*role="img" aria-label="Complete"/);
    assert.match(f, /title="Beta &lt;b&gt;">Beta &lt;b&gt;<\/span><span data-part="count">2<\/span>/);
    assert.match(f, /title="Delta">Delta<\/span><span data-part="count"><\/span>/);
    assert.match(f, /<ul data-keep-scroll="sidebar">/);
    assert.match(f, /^<nav aria-label="Features" data-part="features" data-live="sidebar-features" data-key="side:features" data-sig="1\/4">/);
  });

  test("the model's ranks put the sidebar in progress-first order; the mobile menu matches", () => {
    assert.deepEqual(project.features.map((f) => f.ranks.progress), [3, 0, 1, 2]);
    const doc = page();
    const menu = region(region(doc, '<details data-region="mobile-menu"', "</details>"), '<nav aria-label="Features"', "</nav>");
    assert.deepEqual([...menu.matchAll(/href="\/features\/([^/]+)\/index.html"/g)].map((m) => m[1]), ["002-beta", "003-gamma", "004-delta", "001-alpha"]);
  });

  test("a feature page marks its own sidebar entry, wherever it sits in the order", () => {
    for (const dir of ["001-alpha", "004-delta"]) {
      const f = region(sidebar(page({ page: "feature", current: dir })), '<nav aria-label="Features"', "</nav>");
      const current = [...f.matchAll(/<a data-key="side:([^"]+)"[^>]*aria-current="page"/g)].map((m) => m[1]);
      assert.deepEqual(current, [dir]);
    }
  });

  test("without ranks (partial model) the list keeps folder order", () => {
    const bare = { ...project, features: project.features.map(({ ranks: _r, ...f }) => f) };
    assert.deepEqual(sidebarOrder(bare.features).map((f) => f.dir), ["001-alpha", "002-beta", "003-gamma", "004-delta"]);
  });

  test("the Features list follows ranks.progress when the model has ranks", () => {
    const ranked = {
      ...project,
      features: project.features.map((f, i) => ({ ...f, ranks: { progress: [2, 0, 3, 1][i] } })),
    };
    assert.deepEqual(sidebarOrder(ranked.features).map((f) => f.dir), ["002-beta", "004-delta", "001-alpha", "003-gamma"]);
    const f = region(sidebar(page({ project: ranked })), '<nav aria-label="Features"', "</nav>");
    assert.deepEqual([...f.matchAll(/<a data-key="side:([^"]+)"/g)].map((m) => m[1]), ["002-beta", "004-delta", "001-alpha", "003-gamma"]);
  });

  test("aria-current marks the current feature, or Overview on the overview", () => {
    const feat = sidebar(page({ page: "feature", current: "002-beta" }));
    assert.deepEqual([...feat.matchAll(/<a [^>]*aria-current="page"/g)].length, 1);
    assert.match(feat, /href="\/features\/002-beta\/index.html" aria-current="page"/);
    const over = sidebar(page());
    assert.deepEqual([...over.matchAll(/aria-current="page"/g)].length, 1);
    assert.match(over, /<a href="\/index.html" aria-current="page"><svg[\s\S]*?<span>Overview<\/span>/);
    const doc = rail(page({ page: "document", current: "constitution" }));
    assert.match(doc, /<a href="\/constitution.html" aria-label="Constitution" title="Constitution" aria-current="page">/);
  });

  test("theme group: light, dark and system buttons with aria-pressed", () => {
    const g = region(page(), '<div role="group" aria-label="Theme"', "</div>");
    assert.deepEqual(
      [...g.matchAll(/<button type="button" aria-pressed="false" data-theme-choice="(\w+)"/g)].map((m) => m[1]),
      ["light", "dark", "system"],
    );
  });

  test("the icon rail links to the same destinations with labels, plus search and theme", () => {
    const r = rail(page({ page: "document" }));
    assert.deepEqual(urls(r), ["/index.html", "/index.html", "/constitution.html", "/assessments/dash/intake.html"]);
    assert.match(r, /aria-label="Assessment: dash"/);
    assert.match(r, /<button type="button" data-part="search" aria-label="Search" title="Search \(⌘K\)" hidden>/);
    assert.match(r, /data-part="theme" hidden/);
  });

  test("the mobile menu holds the same navigation without live-update keys (FR-009)", () => {
    for (const kind of ["overview", "feature", "document"]) {
      const m = mobile(page({ page: kind }));
      assert.match(m, /<nav aria-label="Main">/);
      assert.match(m, /Features <span data-part="features-count">1 \/ 4 done<\/span>/);
      assert.ok(urls(m).includes("/features/003-gamma/index.html"));
      assert.doesNotMatch(m, /data-key=|data-keep-scroll/);
      assert.match(m, /<nav aria-label="Features" data-part="features" data-live="menu-features">/);
      assert.doesNotMatch(m, /<details data-region="mobile-menu" open/);
    }
  });

  test("footer shows the version, plus the generated time in static mode", () => {
    const at = "2026-09-25T10:00:00.000Z";
    assert.match(
      page({ mode: "static", generatedAt: at }),
      /<footer data-live="footer" data-key="footer" data-sig="1\.2\.3">speckit-eye 1\.2\.3 · generated <time datetime="2026-09-25T10:00:00\.000Z">2026-09-25T10:00:00\.000Z<\/time><\/footer>/,
    );
    assert.match(page({ generatedAt: at }), /<footer data-live="footer" data-key="footer" data-sig="1\.2\.3">speckit-eye 1\.2\.3<\/footer>/);
    assert.match(sidebar(page()), /<footer /);
    assert.match(page({ page: "document" }), /<\/main>\n<footer /);
  });

  test("every link and asset is absolute with the base path (R10)", () => {
    for (const kind of ["overview", "feature", "document"]) {
      const all = urls(page({ base: "/repo/", page: kind }));
      for (const u of all) assert.ok(u.startsWith("/repo/"), u);
      for (const u of ["/repo/index.html", "/repo/assets/styles.css", "/repo/assets/theme.js", "/repo/assets/app.js", "/repo/constitution.html"]) {
        assert.ok(all.includes(u), `${kind} ${u}`);
      }
    }
  });

  test("project name, title and slugs are escaped", () => {
    const doc = page({
      title: "<script>",
      project: { ...project, name: "a&b<c>", assessments: [{ slug: 's"x', artifacts: [{ url: "assessments/s/intake.html" }] }] },
    });
    assert.match(doc, /<title>&lt;script&gt;<\/title>/);
    assert.match(doc, /<p data-part="project-name">a&amp;b&lt;c&gt;<\/p>/);
    assert.match(doc, /Assessment: s&quot;x/);
  });
});
