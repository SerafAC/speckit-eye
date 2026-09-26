import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { MODULES, start, save, reinit, initShell } from "../../src/client/app.js";
import { createPrefs } from "../../src/client/prefs.js";

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

  test("the default table runs the 001 overview behavior on the overview only", () => {
    assert.deepEqual(MODULES.overview.map((m) => m.name), ["overview"]);
    assert.deepEqual([...MODULES.all, ...MODULES.feature, ...MODULES.document], []);
    const w = page("overview");
    w.document.querySelector("main").innerHTML = '<div data-region="tree"><details data-key="f"><summary>f</summary><li data-key="f/T1">t</li></details></div><a data-key="f/T1" data-parents="f" href="#x">x</a>';
    start({ document: w.document, window: w, storage: memoryStorage() });
    w.document.querySelector("a[data-parents]").click();
    assert.equal(w.document.querySelector("details").open, true);
    assert.ok(w.document.querySelector("li").hasAttribute("data-highlight"));
    // A second start on the same document does not attach the listeners twice.
    assert.doesNotThrow(() => start({ document: w.document, window: w, storage: memoryStorage() }));
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

  test("keeps a choice made on the page after a reinit even when storage could not keep it", () => {
    const w = page("overview");
    start({ document: w.document, window: w, storage: throwing, modules: {} });
    w.document.querySelector('[data-theme-choice="light"]').click();
    reinit(w.document, {});
    assert.deepEqual(pressed(w.document), ["light:true", "dark:false", "system:false"]);
  });
});
