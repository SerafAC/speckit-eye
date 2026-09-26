import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { init, save, reveal, nextOrder, ORDER_LABELS, applyDepth } from "../../src/client/tree.js";
import { createPrefs } from "../../src/client/prefs.js";
import { renderOverview } from "../../src/render/overview.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

/** n task lines, the first `done` checked. */
const lines = (n, done, start = 1, label = "") =>
  Array.from({ length: n }, (_, i) => {
    const id = `T${String(start + i).padStart(3, "0")}`;
    return `- [${i < done ? "x" : " "}] ${id}${label ? ` [${label}]` : ""} task ${id}`;
  });

/** Like the `mixed` fixture: complete, in progress (with story groups), ready, spec only. */
const FILES = {
  "specs/001-alpha/spec.md": "# Feature Specification: Alpha",
  "specs/001-alpha/tasks.md": ["## Phase 1: Setup", ...lines(3, 3)].join("\n"),
  "specs/002-beta/spec.md": "# Feature Specification: Beta\n### User Story 1 - L (Priority: P1)\n### User Story 2 - D (Priority: P2)",
  "specs/002-beta/tasks.md": [
    "## Phase 1: Setup",
    ...lines(2, 2),
    "## Phase 2: Mixed",
    "- [ ] T003 [US1] a",
    "- [ ] T004 [US2] b",
    "- [ ] T005 [US2] c",
    "## Phase 3: Empty",
  ].join("\n"),
  "specs/003-gamma/spec.md": "# Feature Specification: Gamma",
  "specs/003-gamma/tasks.md": ["## Phase 1: Setup", ...lines(2, 0), "## Phase 2: More", ...lines(2, 0, 3)].join("\n"),
  "specs/004-delta/spec.md": "# Feature Specification: Aardvark",
};

let html = null;
async function overviewHtml() {
  html ??= renderOverview(buildModel(await scan(createFakeReader(FILES), "proj")), { base: "/" }).value;
  return html;
}

/** @type {Window[]} */
const windows = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.close();
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => void data.set(k, String(v)) };
}

async function page(stored = {}) {
  const window = new Window();
  windows.push(window);
  const { document } = window;
  document.body.innerHTML = `<main>${await overviewHtml()}</main>`;
  const storage = memoryStorage(stored);
  const deps = { document, storage, prefs: createPrefs(storage) };
  return { window, document, storage, deps };
}

const order = (document) => [...document.querySelectorAll('ul[data-part="features"] > li[data-feature]')].map((li) => li.dataset.feature);
const orderButton = (document) => document.querySelector('button[data-part="order"]');
const openKeys = (document) =>
  [...document.querySelectorAll('[data-region="tree"] details')].filter((d) => d.open).map((d) => d.dataset.key);
const depthPressed = (document) =>
  [...document.querySelectorAll('[data-part="depth"] button')].map((b) => `${b.dataset.depth}:${b.getAttribute("aria-pressed")}`);
const click = (window, el) => el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
const pointerdown = (window, el) => el.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true }));

describe("tree init", () => {
  test("un-hides the order button, depth group and view filter", async () => {
    const { document, deps } = await page();
    for (const sel of ['button[data-part="order"]', '[data-part="depth"]', '[data-part="view-filter"]']) {
      assert.equal(document.querySelector(sel).hasAttribute("hidden"), true, sel);
    }
    init(document, deps);
    for (const sel of ['button[data-part="order"]', '[data-part="depth"]', '[data-part="view-filter"]']) {
      assert.equal(document.querySelector(sel).hasAttribute("hidden"), false, sel);
    }
    assert.deepEqual(depthPressed(document), ["features:false", "phases:false", "tasks:false"]);
  });

  test("does nothing on a page without a tree", async () => {
    const window = new Window();
    windows.push(window);
    window.document.body.innerHTML = "<main><p>x</p></main>";
    init(window.document, { document: window.document, storage: null });
    assert.equal(save(window.document).depth, null);
    assert.equal(reveal(window.document, "task-x"), null);
  });
});

describe("order (FR-012)", () => {
  test("the server order is progress-first", async () => {
    const { document, deps } = await page();
    init(document, deps);
    assert.deepEqual(order(document), ["002-beta", "003-gamma", "004-delta", "001-alpha"]);
    assert.equal(orderButton(document).querySelector('[data-part="order-label"]').textContent, "In progress first");
  });

  test("applies the stored order by sorting on data-rank-*", async () => {
    const expected = {
      progress: ["002-beta", "003-gamma", "004-delta", "001-alpha"],
      number: ["001-alpha", "002-beta", "003-gamma", "004-delta"],
      least: ["003-gamma", "002-beta", "001-alpha", "004-delta"],
      name: ["004-delta", "001-alpha", "002-beta", "003-gamma"],
    };
    for (const [name, dirs] of Object.entries(expected)) {
      const { document, deps } = await page({ "sk-order": name });
      init(document, deps);
      assert.deepEqual(order(document), dirs, name);
      assert.equal(orderButton(document).dataset.order, name);
      assert.equal(orderButton(document).querySelector('[data-part="order-label"]').textContent, ORDER_LABELS[name]);
    }
  });

  test("each click cycles progress → number → least → name → progress, stores it and relabels", async () => {
    const { window, document, deps, storage } = await page();
    init(document, deps);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      click(window, orderButton(document));
      seen.push([orderButton(document).dataset.order, orderButton(document).textContent.trim(), storage.data.get("sk-order")]);
    }
    assert.deepEqual(seen, [
      ["number", "Number", "number"],
      ["least", "Least complete", "least"],
      ["name", "Name A–Z", "name"],
      ["progress", "In progress first", "progress"],
    ]);
    assert.deepEqual(order(document), ["002-beta", "003-gamma", "004-delta", "001-alpha"]);
  });

  test("sorting moves the existing nodes (no re-render)", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const beta = document.querySelector('li[data-feature="002-beta"]');
    click(window, orderButton(document));
    assert.equal(document.querySelector('li[data-feature="002-beta"]'), beta);
  });

  test("init is idempotent: one click advances one step", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    init(document, deps);
    click(window, orderButton(document));
    assert.equal(orderButton(document).dataset.order, "number");
  });

  test("nextOrder wraps and treats unknown values as before the first", () => {
    assert.equal(nextOrder("progress"), "number");
    assert.equal(nextOrder("name"), "progress");
    assert.equal(nextOrder("bogus"), "progress");
  });

  test("an invalid stored order falls back to progress", async () => {
    const { document, deps } = await page({ "sk-order": "size" });
    init(document, deps);
    assert.equal(orderButton(document).dataset.order, "progress");
  });
});

describe("depth (FR-012)", () => {
  const depthButton = (document, d) => document.querySelector(`[data-part="depth"] button[data-depth="${d}"]`);

  test("Tasks opens every feature and every phase and story level with tasks", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    click(window, depthButton(document, "tasks"));
    assert.deepEqual(openKeys(document).sort(), [
      "001-alpha",
      "001-alpha/p1",
      "002-beta",
      "002-beta/p1",
      "002-beta/p2",
      "002-beta/p2/US1",
      "002-beta/p2/US2",
      "003-gamma",
      "003-gamma/p1",
      "003-gamma/p2",
      "004-delta",
    ]);
    assert.deepEqual(depthPressed(document), ["features:false", "phases:false", "tasks:true"]);
  });

  test("Phases opens features and closes phases; Features closes everything", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    click(window, depthButton(document, "tasks"));
    click(window, depthButton(document, "phases"));
    assert.deepEqual(openKeys(document).sort(), ["001-alpha", "002-beta", "003-gamma", "004-delta"]);
    assert.deepEqual(depthPressed(document), ["features:false", "phases:true", "tasks:false"]);
    click(window, depthButton(document, "features"));
    assert.deepEqual(openKeys(document), []);
    assert.deepEqual(depthPressed(document), ["features:true", "phases:false", "tasks:false"]);
  });

  test("a manual toggle of any row clears the selected depth; a link in a summary does not", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    click(window, depthButton(document, "phases"));
    click(window, document.querySelector('a[data-part="open-feature"]'));
    assert.deepEqual(depthPressed(document), ["features:false", "phases:true", "tasks:false"]);
    click(window, document.querySelector('details[data-key="003-gamma/p1"] > summary'));
    assert.deepEqual(depthPressed(document), ["features:false", "phases:false", "tasks:false"]);
  });

  test("save returns the depth and init restores it after a live swap", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    assert.deepEqual(save(document), { depth: null });
    click(window, depthButton(document, "tasks"));
    const state = save(document);
    assert.deepEqual(state, { depth: "tasks" });
    // A live swap replaces <main> with fresh server HTML (only the active chain open).
    document.querySelector("main").innerHTML = await overviewHtml();
    assert.deepEqual(openKeys(document), ["002-beta", "002-beta/p2", "002-beta/p2/US1"]);
    init(document, { ...deps, state });
    assert.deepEqual(depthPressed(document), ["features:false", "phases:false", "tasks:true"]);
    assert.ok(openKeys(document).includes("003-gamma/p2"));
    // The fresh buttons are wired too.
    click(window, depthButton(document, "features"));
    assert.deepEqual(openKeys(document), []);
  });

  test("an unknown saved depth is ignored", async () => {
    const { document, deps } = await page();
    init(document, { ...deps, state: { depth: "all" } });
    assert.deepEqual(depthPressed(document), ["features:false", "phases:false", "tasks:false"]);
  });

  test("applyDepth without a tree does nothing", () => {
    const window = new Window();
    windows.push(window);
    applyDepth(window.document, "tasks");
  });
});

describe("view filter (FR-019, FR-020)", () => {
  const tree = (document) => document.querySelector('[data-region="tree"]');
  const filterButton = (document, f) => document.querySelector(`button[data-filter="${f}"]`);

  test("sets data-filter on the tree and stores the choice", async () => {
    const { window, document, deps, storage } = await page();
    init(document, deps);
    assert.equal(tree(document).dataset.filter, "all");
    click(window, filterButton(document, "open"));
    assert.equal(tree(document).dataset.filter, "open");
    assert.equal(storage.data.get("sk-filter"), "open");
    assert.equal(filterButton(document, "open").getAttribute("aria-pressed"), "true");
    assert.equal(filterButton(document, "all").getAttribute("aria-pressed"), "false");
    click(window, filterButton(document, "all"));
    assert.equal(tree(document).dataset.filter, "all");
    assert.equal(storage.data.get("sk-filter"), "all");
  });

  test("the stored filter is applied on init (remembered after reload)", async () => {
    const { document, deps } = await page({ "sk-filter": "open" });
    init(document, deps);
    assert.equal(tree(document).dataset.filter, "open");
    assert.equal(filterButton(document, "open").getAttribute("aria-pressed"), "true");
  });

  test("a throwing storage still switches for this page", async () => {
    const { window, document } = await page();
    const throwing = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    init(document, { document, storage: throwing });
    click(window, filterButton(document, "open"));
    assert.equal(tree(document).dataset.filter, "open");
    click(window, orderButton(document));
    assert.equal(orderButton(document).dataset.order, "number");
  });
});

describe("reveal (FR-026)", () => {
  test("opens the task's feature, phase and story, selects the row and scrolls the tree card", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const tree = document.querySelector('[data-region="tree"]');
    const row = document.getElementById("task-003-gamma-T004");
    tree.getBoundingClientRect = () => ({ top: 100, height: 400, bottom: 500, left: 0, right: 300, width: 300 });
    row.getBoundingClientRect = () => ({ top: 900, height: 32, bottom: 932, left: 0, right: 300, width: 300 });
    tree.scrollTop = 50;
    let windowScrolled = false;
    window.scrollTo = () => (windowScrolled = true);

    assert.equal(reveal(document, "task-003-gamma-T004"), row);
    assert.ok(document.querySelector('details[data-key="003-gamma"]').open);
    assert.ok(document.querySelector('details[data-key="003-gamma/p2"]').open);
    assert.equal(row.hasAttribute("data-selected"), true);
    // Row centred: 50 + (900 - 100) - (400 - 32) / 2 = 666.
    assert.equal(tree.scrollTop, 666);
    assert.equal(windowScrolled, false);
  });

  test("opens a story level and moves the selection", async () => {
    const { document, deps } = await page();
    init(document, deps);
    reveal(document, "task-003-gamma-T001");
    reveal(document, "task-002-beta-T005");
    assert.ok(document.querySelector('details[data-key="002-beta/p2/US2"]').open);
    assert.deepEqual([...document.querySelectorAll("[data-selected]")].map((el) => el.id), ["task-002-beta-T005"]);
  });

  test("an unknown anchor returns null and changes nothing", async () => {
    const { document, deps } = await page();
    init(document, deps);
    reveal(document, "task-002-beta-T003");
    assert.equal(reveal(document, "task-nope"), null);
    assert.equal(document.querySelectorAll("[data-selected]").length, 1);
  });

  test("pressing elsewhere clears the selection; choosing a row selects it; a map square keeps it", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    reveal(document, "task-003-gamma-T004");
    pointerdown(window, document.querySelector('[data-region="taskmap"] a[data-parents]'));
    assert.equal(document.querySelectorAll("[data-selected]").length, 1);
    pointerdown(window, document.getElementById("task-003-gamma-T004").querySelector('[data-part="text"]'));
    assert.equal(document.getElementById("task-003-gamma-T004").hasAttribute("data-selected"), true);
    pointerdown(window, document.getElementById("task-002-beta-T003"));
    assert.deepEqual([...document.querySelectorAll("[data-selected]")].map((el) => el.id), ["task-002-beta-T003"]);
    pointerdown(window, document.querySelector("h1"));
    assert.equal(document.querySelectorAll("[data-selected]").length, 0);
  });
});
