import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { MODULES, start, save, reinit, initShell } from "../../src/client/app.js";
import { createPrefs } from "../../src/client/prefs.js";
import { createLiveClient } from "../../src/client/live.js";
import { renderFeaturePage } from "../../src/render/feature.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

const THEME = `<div role="group" aria-label="Theme" data-part="theme" hidden>
<button type="button" aria-pressed="false" data-theme-choice="light"></button>
<button type="button" aria-pressed="false" data-theme-choice="dark"></button>
<button type="button" aria-pressed="false" data-theme-choice="system"></button></div>`;

/** @type {Window[]} */
const windows = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.close();
});

function page(kind, { rail = false } = {}) {
  const window = new Window();
  windows.push(window);
  window.document.body.dataset.page = kind;
  window.document.body.innerHTML = `${rail ? `<nav data-region="rail">${THEME}</nav>` : `<aside data-region="sidebar">${THEME}</aside>`}<main></main>`;
  return window;
}

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => void data.set(k, String(v)) };
}

const throwing = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

/** A module that records its calls. */
function recorder(name, log, saved = undefined) {
  return {
    name,
    init: (root, deps) => log.push([name, "init", deps.state]),
    ...(saved === undefined ? {} : { save: () => saved }),
  };
}

/** A minimal overview tree (two features, one phase with one task). */
const TREE = `<div role="group" data-part="view-filter" hidden><button type="button" data-filter="all"></button><button type="button" data-filter="open"></button></div>
<section data-region="features"><button type="button" data-part="order" data-order="progress" hidden><span data-part="order-label">In progress first</span></button>
<div role="group" data-part="depth" hidden><button type="button" data-depth="features"></button><button type="button" data-depth="phases"></button><button type="button" data-depth="tasks"></button></div>
<div data-region="tree" data-filter="all"><ul data-part="features">
<li data-feature="002-b" data-rank-progress="0" data-rank-number="1" data-rank-least="0" data-rank-name="1"><details data-key="002-b"><summary>B</summary>
<ul><li data-part="phase"><details data-key="002-b/p1"><summary>Phase 1</summary><ul><li data-key="002-b/T1" id="b-t1" data-state="next">T1</li></ul></details></li></ul></details></li>
<li data-feature="001-a" data-rank-progress="1" data-rank-number="0" data-rank-least="1" data-rank-name="0"><details data-key="001-a"><summary>A</summary></details></li>
</ul></div></section>`;

const featureOrder = (document) => [...document.querySelectorAll("li[data-feature]")].map((li) => li.getAttribute("data-feature"));

const pressed = (document) =>
  [...document.querySelectorAll("[data-theme-choice]")].map((b) => `${b.dataset.themeChoice}:${b.getAttribute("aria-pressed")}`);

describe("start", () => {
  test("runs the shared modules, then the ones registered for data-page only", () => {
    for (const kind of ["overview", "feature", "document"]) {
      const log = [];
      const table = {
        all: [recorder("search", log)],
        overview: [recorder("tree", log), recorder("taskmap", log)],
        feature: [recorder("feature", log)],
        document: [recorder("reader", log)],
      };
      const w = page(kind);
      start({ document: w.document, window: w, storage: memoryStorage(), modules: table });
      const expected = { overview: ["search", "tree", "taskmap"], feature: ["search", "feature"], document: ["search", "reader"] }[kind];
      assert.deepEqual(log.map(([n]) => n), expected, kind);
    }
  });

  test("an unknown or missing data-page runs only the shared modules", () => {
    const log = [];
    const w = page("all");
    start({ document: w.document, window: w, modules: { all: [recorder("a", log)], overview: [recorder("o", log)] } });
    assert.deepEqual(log.map(([n]) => n), ["a"]);
  });

  test("the default table runs search.js on every page (T070): entry shown, Ctrl+K opens the dialog, the index is fetched under the base", async () => {
    assert.deepEqual(MODULES.all.map((m) => m.name), ["search"]);
    for (const kind of ["overview", "feature", "document"]) {
      const w = page(kind, { rail: kind === "document" });
      const doc = w.document;
      doc.body.dataset.base = "/eye/";
      doc.body.insertAdjacentHTML("afterbegin", '<button type="button" data-part="search" hidden><kbd>⌘K</kbd></button>');
      doc.body.insertAdjacentHTML("beforeend", '<dialog data-region="search" aria-label="Search"></dialog>');
      const fetched = [];
      w.fetch = async (url) => {
        fetched.push(url);
        return { ok: true, json: async () => ({ version: 1, entries: [] }) };
      };
      start({ document: doc, window: w, storage: memoryStorage() });
      assert.equal(doc.querySelector('[data-part="search"]').hidden, false, kind);
      doc.dispatchEvent(new w.KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));
      assert.equal(doc.querySelector('dialog[data-region="search"]').open, true, kind);
      await new Promise((r) => setTimeout(r, 0));
      assert.deepEqual(fetched, ["/eye/assets/search-index.json"], kind);
      assert.ok(!("search" in save(doc)), "search has no state to save");
    }
  });

  test("the default table runs tree.js and taskmap.js on the overview, feature.js on the feature page and reader.js on document pages", () => {
    assert.deepEqual(MODULES.overview.map((m) => m.name), ["tree", "taskmap"]);
    assert.deepEqual(MODULES.feature.map((m) => m.name), ["feature"]);
    assert.deepEqual(MODULES.document.map((m) => m.name), ["reader"]);
    const w = page("overview");
    w.document.querySelector("main").innerHTML = `${TREE}<section data-region="taskmap" data-layout="stacked"><header><button type="button" data-part="map-mode" aria-pressed="false" hidden><span data-part="mode-label">By feature</span></button></header><div data-part="card"><div data-part="grid"><a data-key="002-b/T1" data-state="next" data-parents="002-b 002-b/p1" href="#b-t1" title="T1 · Next — t — B"></a></div></div></section>`;
    const storage = memoryStorage({ "sk-map": "grouped" });
    start({ document: w.document, window: w, storage });
    const doc = w.document;
    assert.equal(doc.querySelector('[data-region="taskmap"]').getAttribute("data-layout"), "grouped");
    assert.equal(doc.querySelector('button[data-part="map-mode"]').hasAttribute("hidden"), false);
    doc.querySelector("a[data-parents]").click();
    assert.equal(doc.querySelector('details[data-key="002-b"]').open, true);
    assert.equal(doc.querySelector('details[data-key="002-b/p1"]').open, true);
    assert.ok(doc.getElementById("b-t1").hasAttribute("data-selected"));
    assert.deepEqual(save(doc), { tree: { depth: null } });
    // A second start on the same document does not attach the listeners twice.
    assert.doesNotThrow(() => start({ document: doc, window: w, storage }));
  });

  test("the default table wires the reader on document pages, and its state survives save / reinit", () => {
    const w = page("document", { rail: true });
    const article = `<article data-region="doc" data-key="specs/001-x/spec.md"><header data-part="doc-head"><button type="button" data-part="expand-all" hidden>Expand all</button><details data-part="raw" data-key="raw:x"><summary>Raw markdown</summary><pre><code>src</code></pre></details></header><div data-part="formatted"><details data-part="story" data-key="s1"><summary>US1</summary></details></div></article><nav data-region="toc" aria-label="On this page"><div data-part="progress" hidden><span data-part="progress-bar" class="w-pct-0"></span></div></nav>`;
    const main = w.document.querySelector("main");
    main.innerHTML = article;
    start({ document: w.document, window: w, storage: memoryStorage() });
    const doc = w.document;
    assert.equal(doc.querySelector('button[data-part="expand-all"]').hidden, false);
    assert.equal(doc.querySelector('[data-part="progress"]').hidden, false);
    doc.querySelector('button[data-part="expand-all"]').click();
    const state = save(doc);
    assert.deepEqual(state, { reader: { raw: false, expanded: true, area: "all", more: [] } });
    main.innerHTML = article;
    reinit(doc, state);
    assert.equal(doc.querySelector('details[data-key="s1"]').open, true);
    assert.equal(doc.querySelector('button[data-part="expand-all"]').textContent, "Collapse all");
  });

  test("the default table wires the tree: controls un-hidden, stored order applied, order click stored", () => {
    const w = page("overview");
    w.document.querySelector("main").innerHTML = TREE;
    const storage = memoryStorage({ "sk-order": "name", "sk-filter": "open" });
    start({ document: w.document, window: w, storage });
    const doc = w.document;
    for (const sel of ['button[data-part="order"]', '[data-part="depth"]', '[data-part="view-filter"]']) {
      assert.equal(doc.querySelector(sel).hasAttribute("hidden"), false, sel);
    }
    assert.deepEqual(featureOrder(doc), ["001-a", "002-b"]);
    assert.equal(doc.querySelector('[data-region="tree"]').getAttribute("data-filter"), "open");
    doc.querySelector('button[data-part="order"]').click();
    assert.equal(storage.data.get("sk-order"), "progress");
    assert.deepEqual(featureOrder(doc), ["002-b", "001-a"]);
  });

  test("the default table wires the feature page: filter bar shown, #task-… address selected, state kept across a live swap", async () => {
    const m = buildModel(
      await scan(
        createFakeReader({
          "specs/002-beta/spec.md": "# Feature Specification: Beta",
          "specs/002-beta/tasks.md": "## Phase 1: Setup\n- [x] T001 Create `src/list.go`\n- [ ] T002 List tests in `src/list_test.go`\n- [ ] T003 Docs",
        }),
        "proj",
      ),
    );
    const html = renderFeaturePage(m.features[0], m, { base: "/" }).value;
    const w = new Window({ url: "http://localhost/features/002-beta/index.html" });
    windows.push(w);
    const doc = w.document;
    doc.body.dataset.page = "feature";
    doc.body.innerHTML = `<main>${html}</main>`;
    const key = doc.querySelector('details[data-part="task"][data-id="T002"]').id;
    w.location.hash = `#${key}`;
    start({ document: doc, window: w, storage: memoryStorage() });
    assert.equal(doc.querySelector('[data-part="filters"]').hidden, false);
    const row = doc.querySelector('details[data-part="task"][data-id="T002"]');
    assert.equal(row.open, true);
    assert.ok(row.hasAttribute("data-selected"));
    const state = save(doc);
    assert.equal(state.feature.selected, row.getAttribute("data-key"));
    doc.querySelector("main").innerHTML = html;
    reinit(doc, state);
    assert.ok(doc.querySelector('details[data-part="task"][data-id="T002"]').hasAttribute("data-selected"));
  });

  test("the tree's depth survives a live swap through save and reinit", () => {
    const w = page("overview");
    const doc = w.document;
    doc.querySelector("main").innerHTML = TREE;
    start({ document: doc, window: w, storage: memoryStorage() });
    doc.querySelector('[data-depth="tasks"]').click();
    const state = save(doc);
    assert.deepEqual(state, { tree: { depth: "tasks" } });
    doc.querySelector("main").innerHTML = TREE;
    reinit(doc, state);
    assert.equal(doc.querySelector('[data-depth="tasks"]').getAttribute("aria-pressed"), "true");
    assert.equal(doc.querySelector('li[data-part="phase"] > details').open, true);
  });

  test("injects document, window, storage, prefs, timers, fetch and navigator", () => {
    let got = null;
    const w = page("feature");
    const storage = memoryStorage({ "sk-order": "name" });
    start({ document: w.document, window: w, storage, modules: { feature: [{ name: "f", init: (_r, d) => (got = d) }] } });
    assert.equal(got.document, w.document);
    assert.equal(got.window, w);
    assert.equal(got.storage, storage);
    assert.equal(got.prefs.get("order"), "name");
    assert.equal(typeof got.setTimeout, "function");
    assert.equal(typeof got.clearTimeout, "function");
    assert.equal(got.navigator, w.navigator);
  });
});

describe("save and reinit", () => {
  test("save collects each module's state by name; reinit passes it back to each module", () => {
    const log = [];
    const w = page("feature");
    const table = { all: [recorder("search", log)], feature: [recorder("feature", log, { selected: "T018" }), recorder("plain", log)] };
    start({ document: w.document, window: w, storage: memoryStorage(), modules: table });
    const state = save(w.document);
    assert.deepEqual(state, { feature: { selected: "T018" } });
    log.length = 0;
    reinit(w.document, state);
    assert.deepEqual(log, [
      ["search", "init", undefined],
      ["feature", "init", { selected: "T018" }],
      ["plain", "init", undefined],
    ]);
  });

  test("reinit without a state still re-runs every module", () => {
    const log = [];
    const w = page("document");
    start({ document: w.document, window: w, modules: { document: [recorder("reader", log, { raw: true })] } });
    log.length = 0;
    reinit(w.document);
    assert.deepEqual(log, [["reader", "init", undefined]]);
  });
});

describe("theme switch (initShell)", () => {
  test("is un-hidden and aria-pressed reflects the stored choice (system by default)", () => {
    const w = page("overview");
    start({ document: w.document, window: w, storage: memoryStorage(), modules: {} });
    assert.equal(w.document.querySelector('[data-part="theme"]').hasAttribute("hidden"), false);
    assert.deepEqual(pressed(w.document), ["light:false", "dark:false", "system:true"]);

    const w2 = page("document", { rail: true });
    start({ document: w2.document, window: w2, storage: memoryStorage({ "sk-theme": "dark" }), modules: {} });
    assert.deepEqual(pressed(w2.document), ["light:false", "dark:true", "system:false"]);
  });

  test("a click stores the choice and sets or removes data-theme at once", () => {
    const w = page("overview");
    const storage = memoryStorage();
    start({ document: w.document, window: w, storage, modules: {} });
    const html = w.document.documentElement;
    w.document.querySelector('[data-theme-choice="dark"]').click();
    assert.equal(html.dataset.theme, "dark");
    assert.equal(storage.data.get("sk-theme"), "dark");
    assert.deepEqual(pressed(w.document), ["light:false", "dark:true", "system:false"]);
    w.document.querySelector('[data-theme-choice="light"]').click();
    assert.equal(html.dataset.theme, "light");
    w.document.querySelector('[data-theme-choice="system"]').click();
    assert.equal(html.hasAttribute("data-theme"), false);
    assert.equal(storage.data.get("sk-theme"), "system");
    assert.deepEqual(pressed(w.document), ["light:false", "dark:false", "system:true"]);
  });

  test("a throwing storage still switches the theme (US4 AC5)", () => {
    for (const storage of [throwing, null]) {
      const w = page("feature");
      start({ document: w.document, window: w, storage, modules: {} });
      assert.deepEqual(pressed(w.document), ["light:false", "dark:false", "system:true"]);
      assert.doesNotThrow(() => w.document.querySelector('[data-theme-choice="dark"]').click());
      assert.equal(w.document.documentElement.dataset.theme, "dark");
      assert.deepEqual(pressed(w.document), ["light:false", "dark:true", "system:false"]);
    }
  });

  test("is idempotent: wiring twice registers one listener per button", () => {
    const w = page("overview");
    let sets = 0;
    const prefs = createPrefs(memoryStorage());
    const counting = { get: prefs.get, set: (n, v) => (sets++, prefs.set(n, v)) };
    initShell(w.document, { document: w.document, prefs: counting });
    initShell(w.document, { document: w.document, prefs: counting });
    w.document.querySelector('[data-theme-choice="light"]').click();
    assert.equal(sets, 1);
  });

  test("reinit keeps the pressed button (FR-046, live update)", () => {
    for (const choice of ["light", "dark", "system"]) {
      const w = page("overview");
      start({ document: w.document, window: w, storage: memoryStorage(), modules: {} });
      w.document.querySelector(`[data-theme-choice="${choice}"]`).click();
      // A live swap may bring shell parts whose buttons are rendered unpressed.
      for (const b of w.document.querySelectorAll("[data-theme-choice]")) b.setAttribute("aria-pressed", "false");
      reinit(w.document, {});
      assert.deepEqual(
        pressed(w.document),
        ["light", "dark", "system"].map((c) => `${c}:${c === choice}`),
        choice,
      );
      assert.equal(w.document.documentElement.dataset.theme, choice === "system" ? undefined : choice);
    }
  });

  test("System removes data-theme, so CSS follows the OS, and stays pressed after reinit (FR-045)", () => {
    const w = page("feature");
    const html = w.document.documentElement;
    html.dataset.theme = "dark"; // as assets/theme.js sets it before first paint
    // Storage that keeps its old value because writes fail.
    const stuck = { getItem: (k) => (k === "sk-theme" ? "dark" : null), setItem: throwing.setItem };
    start({ document: w.document, window: w, storage: stuck, modules: {} });
    assert.deepEqual(pressed(w.document), ["light:false", "dark:true", "system:false"]);
    w.document.querySelector('[data-theme-choice="system"]').click();
    assert.equal(html.hasAttribute("data-theme"), false);
    reinit(w.document, {});
    assert.equal(html.hasAttribute("data-theme"), false);
    assert.deepEqual(pressed(w.document), ["light:false", "dark:false", "system:true"]);
  });

  test("the next page shows the stored choice (across pages)", () => {
    const storage = memoryStorage();
    const a = page("overview");
    start({ document: a.document, window: a, storage, modules: {} });
    a.document.querySelector('[data-theme-choice="light"]').click();
    const b = page("document", { rail: true });
    b.document.documentElement.dataset.theme = "light"; // assets/theme.js
    start({ document: b.document, window: b, storage, modules: {} });
    assert.deepEqual(pressed(b.document), ["light:true", "dark:false", "system:false"]);
  });

  test("a live update never touches <html data-theme> and the switch stays pressed", async () => {
    const w = page("overview");
    const doc = w.document;
    doc.body.insertAdjacentHTML("beforeend", '<footer data-live="footer" data-key="footer" data-sig="1">v1</footer>');
    const app = { save, reinit };
    start({ document: doc, window: w, storage: memoryStorage(), modules: {} });
    doc.querySelector('[data-theme-choice="dark"]').click();
    // The server renders pages without data-theme and with the switch unpressed.
    const next = `<!doctype html><html lang="en" data-theme="light"><body data-page="overview"><aside data-region="sidebar">${THEME}</aside><main><p>new</p></main><footer data-live="footer" data-key="footer" data-sig="2">v2</footer></body></html>`;
    const client = createLiveClient({
      document: doc,
      window: w,
      EventSource: class {
        addEventListener() {}
        close() {}
      },
      fetch: async () => ({ status: 200, ok: true, text: async () => next }),
      DOMParser: w.DOMParser,
      setTimeout: (fn, ms) => w.setTimeout(fn, ms),
      requestAnimationFrame: () => 0,
      app,
    });
    client.start();
    await client.update();
    assert.equal(doc.querySelector("main").textContent, "new");
    assert.equal(doc.querySelector("footer").textContent, "v2");
    assert.equal(doc.documentElement.dataset.theme, "dark");
    assert.deepEqual(pressed(doc), ["light:false", "dark:true", "system:false"]);
  });

  test("keeps a choice made on the page after a reinit even when storage could not keep it", () => {
    const w = page("overview");
    start({ document: w.document, window: w, storage: throwing, modules: {} });
    w.document.querySelector('[data-theme-choice="light"]').click();
    reinit(w.document, {});
    assert.deepEqual(pressed(w.document), ["light:true", "dark:false", "system:false"]);
  });
});
