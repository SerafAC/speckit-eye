import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { init, save, progressPercent, markCurrent } from "../../src/client/reader.js";
import { renderDocument } from "../../src/render/reader.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createMarkdown } from "../../src/render/markdown.js";
import { allArtifacts } from "../../src/render/site.js";
import { createFakeReader } from "./fake-reader.js";
const SPEC = [
  "# Feature Specification: X",
  "",
  "## Clarifications",
  "",
  "### Session 2026-01-01",
  "",
  ...Array.from({ length: 5 }, (_, i) => `- Q: Question ${i}? → A: Yes ${i}.`),
  "",
  "### Session 2026-01-02",
  "",
  "- Q: Later? → A: No.",
  "",
  "## User Scenarios",
  "",
  "### User Story 1 - One (Priority: P1)",
  "",
  "### User Story 2 - Two (Priority: P2)",
  "",
  "## Requirements",
  "",
  "### Functional Requirements",
  "",
  "**Editing**",
  "",
  "- **FR-001**: Users MUST edit.",
  "",
  "**Sharing**",
  "",
  "- **FR-002**: Users MAY share.",
].join("\n");

const FILES = { "specs/001-x/spec.md": SPEC };

let cached = null;
async function readerHtml() {
  if (!cached) {
    const project = buildModel(await scan(createFakeReader(FILES), "proj"));
    const entries = allArtifacts(project);
    const md = createMarkdown({ artifactsBySource: {}, base: "/" });
    const e = entries.find(({ artifact }) => artifact.kind === "spec");
    cached = renderDocument(e.artifact, { base: "/", project, feature: e.feature, md }).value;
  }
  return cached;
}

/** A fake IntersectionObserver that tests drive by hand. */
class FakeObserver {
  /** @type {FakeObserver[]} */
  static all = [];
  constructor(callback) {
    this.callback = callback;
    this.targets = [];
    this.disconnected = false;
    FakeObserver.all.push(this);
  }
  observe(t) {
    this.targets.push(t);
  }
  disconnect() {
    this.disconnected = true;
  }
  /** @param {{target: Element, isIntersecting: boolean, top?: number}[]} entries */
  fire(entries) {
    this.callback(entries.map((e) => ({ target: e.target, isIntersecting: e.isIntersecting, boundingClientRect: { top: e.top ?? 0 }, rootBounds: { top: 0 } })));
  }
}

/** @type {Window[]} */
const windows = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.close();
  FakeObserver.all = [];
});

async function page({ state } = {}) {
  const window = new Window({ url: "http://localhost/features/001-x/spec.html" });
  windows.push(window);
  const { document } = window;
  document.body.innerHTML = `<main>${await readerHtml()}</main>`;
  init(document, { document, window, IntersectionObserver: FakeObserver, state });
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  return { window, document, $, $$ };
}

const current = ($$) => $$('[data-region="toc"] a[aria-current="location"]').map((a) => a.getAttribute("data-toc"));

describe("contents panel (FR-041)", () => {
  test("observes the section targets of the contents links", async () => {
    const { $$ } = await page();
    const [observer] = FakeObserver.all;
    assert.deepEqual(
      observer.targets.map((t) => t.id),
      $$('[data-region="toc"] a[data-toc]').map((a) => a.getAttribute("data-toc")),
    );
    assert.ok(observer.targets.length >= 4);
  });

  test("marks the first section in view; else the last one scrolled past", async () => {
    const { $, $$ } = await page();
    const [observer] = FakeObserver.all;
    const clar = $("#clarifications");
    const stories = $("#user-scenarios");
    observer.fire([{ target: clar, isIntersecting: true }]);
    assert.deepEqual(current($$), ["clarifications"]);
    observer.fire([
      { target: clar, isIntersecting: false, top: -300 },
      { target: stories, isIntersecting: true },
    ]);
    assert.deepEqual(current($$), ["user-scenarios"]);
    observer.fire([{ target: stories, isIntersecting: false, top: -50 }]);
    assert.deepEqual(current($$), ["user-scenarios"], "scrolled past: still the last section above");
  });

  test("at the end of the page the last section is current", async () => {
    const { window, document, $, $$ } = await page();
    const [observer] = FakeObserver.all;
    observer.fire([{ target: $("#clarifications"), isIntersecting: true }]);
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 2000 });
    window.dispatchEvent(new window.Event("scroll"));
    assert.deepEqual(current($$), ["requirements"]);
    observer.fire([{ target: $("#clarifications"), isIntersecting: true }]);
    assert.deepEqual(current($$), ["requirements"], "the observer agrees while at the end");
  });

  test("choosing a link marks it at once", async () => {
    const { $, $$ } = await page();
    $('[data-region="toc"] a[data-toc="requirements"]').click();
    assert.deepEqual(current($$), ["requirements"]);
  });

  test("the progress indicator is shown with a w-pct class that follows the scroll position", async () => {
    const { window, document, $ } = await page();
    const box = $('[data-region="toc"] [data-part="progress"]');
    const bar = $('[data-part="progress-bar"]');
    assert.equal(box.hidden, false);
    Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 1000 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 500 });
    window.dispatchEvent(new window.Event("scroll"));
    assert.deepEqual([...bar.classList], ["w-pct-25"]);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 2000 });
    window.dispatchEvent(new window.Event("scroll"));
    assert.deepEqual([...bar.classList], ["w-pct-100"]);
  });

  test("progressPercent and markCurrent", () => {
    assert.equal(progressPercent(0, 2000, 1000), 0);
    assert.equal(progressPercent(333, 2000, 1000), 33);
    assert.equal(progressPercent(5000, 2000, 1000), 100);
    assert.equal(progressPercent(0, 500, 1000), 100, "nothing to scroll");
    assert.doesNotThrow(() => markCurrent(null, "x"));
  });
});

describe("expand all and raw view (FR-040)", () => {
  test("Expand all is shown, opens every collapsed part except the raw view, then collapses", async () => {
    const { $, $$ } = await page();
    const button = $('button[data-part="expand-all"]');
    assert.equal(button.hidden, false);
    assert.ok($$("article details:not([open])").length > 2);
    button.click();
    assert.deepEqual($$('article details:not([open])').map((d) => d.getAttribute("data-part")), ["raw"]);
    assert.equal(button.textContent, "Collapse all");
    assert.equal(button.getAttribute("aria-pressed"), "true");
    button.click();
    assert.equal($$("article details[open]").length, 0);
    assert.equal(button.textContent, "Expand all");
  });

  test("Raw markdown swaps the formatted view for the source and back", async () => {
    const { $ } = await page();
    const article = $('article[data-region="doc"]');
    const raw = $('details[data-part="raw"]');
    raw.open = true;
    raw.dispatchEvent(new raw.ownerDocument.defaultView.Event("toggle"));
    assert.equal(article.getAttribute("data-view"), "raw");
    raw.open = false;
    raw.dispatchEvent(new raw.ownerDocument.defaultView.Event("toggle"));
    assert.equal(article.hasAttribute("data-view"), false);
  });
});

describe("requirement area chips (FR-042)", () => {
  test("shown with All pressed; picking an area hides the others; All shows every area", async () => {
    const { $, $$ } = await page();
    const group = $('[data-part="areas"]');
    assert.equal(group.hidden, false);
    assert.equal($('button[data-area="all"]').getAttribute("aria-pressed"), "true");
    const areas = () => $$('[data-part="area"]').filter((a) => !a.hidden).map((a) => a.querySelector('[data-part="area-name"]')?.textContent ?? "");
    assert.deepEqual(areas(), ["Editing", "Sharing"]);
    $('button[data-area="1"]').click();
    assert.deepEqual(areas(), ["Sharing"]);
    assert.equal($('button[data-area="all"]').getAttribute("aria-pressed"), "false");
    assert.equal($('button[data-area="1"]').getAttribute("aria-pressed"), "true");
    $('button[data-area="all"]').click();
    assert.deepEqual(areas(), ["Editing", "Sharing"]);
  });
});

describe("save / init restore (FR-051)", () => {
  test("save returns raw, expanded, area and the open Show more parts", async () => {
    const { $ } = await page();
    assert.deepEqual(save($("main")), { raw: false, expanded: false, area: "all", more: [] });
    $('button[data-area="1"]').click();
    $('details[data-part="more"]').open = true;
    $('button[data-part="expand-all"]').click();
    $('details[data-part="raw"]').open = true;
    const state = save($("main"));
    assert.equal(state.raw, true);
    assert.equal(state.expanded, true);
    assert.equal(state.area, "1");
    assert.deepEqual(state.more, ["spec:more:session-2026-01-01"]);
  });

  test("init restores the saved state on a fresh page", async () => {
    const state = { raw: true, expanded: false, area: "1", more: ["spec:more:session-2026-01-01"] };
    const { $, $$ } = await page({ state });
    assert.equal($('details[data-part="raw"]').open, true);
    assert.equal($('article[data-region="doc"]').getAttribute("data-view"), "raw");
    assert.equal($('details[data-part="more"]').open, true);
    assert.equal($('button[data-area="1"]').getAttribute("aria-pressed"), "true");
    assert.deepEqual($$('[data-part="area"]').map((a) => a.hidden), [true, false]);
    assert.equal($('button[data-part="expand-all"]').textContent, "Expand all");
  });

  test("init restores Expand all", async () => {
    const { $, $$ } = await page({ state: { raw: false, expanded: true, area: "all", more: [] } });
    assert.equal($('button[data-part="expand-all"]').textContent, "Collapse all");
    assert.deepEqual($$("article details:not([open])").map((d) => d.getAttribute("data-part")), ["raw"]);
  });

  test("init is idempotent: a second call adds no listeners and keeps one observer", async () => {
    const { document, window, $ } = await page();
    init(document, { document, window, IntersectionObserver: FakeObserver });
    assert.equal(FakeObserver.all.length, 1);
    const button = $('button[data-part="expand-all"]');
    button.click();
    assert.equal(button.getAttribute("aria-pressed"), "true", "one click toggles once");
  });

  test("a new article after a live swap gets a new observer and the old one is disconnected", async () => {
    const { document, window } = await page();
    document.querySelector("main").innerHTML = await readerHtml();
    init(document, { document, window, IntersectionObserver: FakeObserver });
    assert.equal(FakeObserver.all.length, 2);
    assert.equal(FakeObserver.all[0].disconnected, true);
  });

  test("pages without a reader article are left alone", () => {
    const window = new Window();
    windows.push(window);
    window.document.body.innerHTML = "<main><p>overview</p></main>";
    assert.doesNotThrow(() => init(window.document, { document: window.document, window }));
    assert.deepEqual(save(window.document), { raw: false, expanded: false, area: "all", more: [] });
  });
});
