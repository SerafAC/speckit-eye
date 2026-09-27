import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import {
  init,
  placeTooltip,
  tooltipContent,
  treeRows,
  highlight,
  applyMode,
  TOOLTIP_DELAY_MS,
  MODE_LABELS,
  NO_ID_TEXT,
} from "../../src/client/taskmap.js";
import * as tree from "../../src/client/tree.js";
import { createPrefs } from "../../src/client/prefs.js";
import { renderOverview } from "../../src/render/overview.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

const lines = (n, done, start = 1, label = "") =>
  Array.from({ length: n }, (_, i) => {
    const id = `T${String(start + i).padStart(3, "0")}`;
    return `- [${i < done ? "x" : " "}] ${id}${label ? ` [${label}]` : ""} task ${id}`;
  });

/** Complete, in progress (story groups, a blocked task, a checkbox without an ID), ready. */
const FILES = {
  "specs/001-alpha/spec.md": "# Feature Specification: Alpha",
  "specs/001-alpha/tasks.md": ["## Phase 1: Setup", ...lines(3, 3)].join("\n"),
  "specs/002-beta/spec.md": "# Feature Specification: Beta\n### User Story 1 - L (Priority: P1)\n### User Story 2 - D (Priority: P2)",
  "specs/002-beta/tasks.md": [
    "## Phase 1: Setup",
    ...lines(2, 2),
    "## Phase 2: Mixed",
    "- [ ] T003 [US1] a",
    "- [ ] T004 [US2] b, depends on T003",
    "- [ ] T005 [US2] c",
    "- [ ] Loose checkbox",
  ].join("\n"),
  "specs/003-gamma/spec.md": "# Feature Specification: Gamma",
  "specs/003-gamma/tasks.md": ["## Phase 1: Setup", ...lines(2, 0), "## Phase 2: More", ...lines(2, 0, 3)].join("\n"),
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

/** Manual timers: `tick(ms)` runs what is due. */
function fakeTimers() {
  let now = 0;
  let id = 0;
  const pending = new Map();
  return {
    setTimeout: (fn, ms) => {
      pending.set(++id, { fn, at: now + ms });
      return id;
    },
    clearTimeout: (t) => void pending.delete(t),
    tick(ms) {
      now += ms;
      for (const [t, { fn, at }] of [...pending].sort((a, b) => a[1].at - b[1].at)) {
        if (at <= now) {
          pending.delete(t);
          fn();
        }
      }
    },
  };
}

async function page(stored = {}) {
  const window = new Window({ width: 1440, height: 900 });
  windows.push(window);
  const { document } = window;
  document.body.innerHTML = `<main>${await overviewHtml()}</main><div data-region="tooltip" role="tooltip" hidden></div>`;
  const storage = memoryStorage(stored);
  const timers = fakeTimers();
  const deps = {
    document,
    window,
    storage,
    prefs: createPrefs(storage),
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
  };
  return { window, document, storage, deps, timers };
}

const square = (document, key) => document.querySelector(`[data-region="taskmap"] a[data-key="${key}"]`);
const tip = (document) => document.querySelector('[data-region="tooltip"]');
const pointer = (window, type, el, pointerType = "mouse", relatedTarget = null) =>
  el.dispatchEvent(new window.PointerEvent(type, { bubbles: true, cancelable: true, pointerType, relatedTarget }));
const focus = (window, el) => el.dispatchEvent(new window.FocusEvent("focusin", { bubbles: true }));
const blur = (window, el) => el.dispatchEvent(new window.FocusEvent("focusout", { bubbles: true }));
const click = (window, el) => {
  const event = new window.MouseEvent("click", { bubbles: true, cancelable: true });
  el.dispatchEvent(event);
  return event;
};
const hl = (document) =>
  Object.fromEntries([...document.querySelectorAll('[data-region="tree"] [data-hl]')].map((el) => [el.dataset.key, el.dataset.hl]));

describe("taskmap tooltip (FR-024)", () => {
  test("no tooltip before 500 ms, shown at 500 ms with ID, status pill, text and feature", async () => {
    const { window, document, deps, timers } = await page();
    init(document, deps);
    assert.equal(TOOLTIP_DELAY_MS, 500);
    pointer(window, "pointerover", square(document, "002-beta/T004"));
    timers.tick(499);
    assert.equal(tip(document).hidden, true);
    timers.tick(1);
    assert.equal(tip(document).hidden, false);
    assert.equal(tip(document).querySelector('[data-part="id"]').textContent, "T004");
    const pill = tip(document).querySelector('[data-part="status"]');
    assert.equal(pill.textContent, "Blocked");
    assert.equal(pill.dataset.status, "blocked");
    assert.equal(pill.className, "pill");
    assert.equal(tip(document).querySelector('[data-part="text"]').textContent, "b, depends on T003");
    assert.equal(tip(document).querySelector('[data-part="feature"]').textContent, "Beta");
    assert.match(tip(document).style.left, /^-?\d+px$/);
    assert.match(tip(document).style.top, /^-?\d+px$/);
  });

  test("hidden at once on leave, and a pending timer is cancelled", async () => {
    const { window, document, deps, timers } = await page();
    init(document, deps);
    const sq = square(document, "002-beta/T003");
    pointer(window, "pointerover", sq);
    timers.tick(500);
    assert.equal(tip(document).hidden, false);
    pointer(window, "pointerout", sq);
    assert.equal(tip(document).hidden, true);
    pointer(window, "pointerover", sq);
    timers.tick(300);
    pointer(window, "pointerout", sq);
    timers.tick(1000);
    assert.equal(tip(document).hidden, true);
  });

  test("keyboard focus shows it at once; blur hides it", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const sq = square(document, "001-alpha/T001");
    focus(window, sq);
    assert.equal(tip(document).hidden, false);
    assert.equal(tip(document).querySelector('[data-part="status"]').textContent, "Done");
    blur(window, sq);
    assert.equal(tip(document).hidden, true);
  });

  test("focus caused by a pointer press does not show it at once", async () => {
    const { window, document, deps, timers } = await page();
    init(document, deps);
    const sq = square(document, "001-alpha/T001");
    pointer(window, "pointerdown", sq);
    focus(window, sq);
    assert.equal(tip(document).hidden, true);
    timers.tick(0);
    blur(window, sq);
    focus(window, sq);
    assert.equal(tip(document).hidden, false);
  });

  test("touch never shows it", async () => {
    const { window, document, deps, timers } = await page();
    init(document, deps);
    const sq = square(document, "002-beta/T003");
    pointer(window, "pointerover", sq, "touch");
    pointer(window, "pointerdown", sq, "touch");
    focus(window, sq);
    timers.tick(2000);
    assert.equal(tip(document).hidden, true);
  });

  test("a checkbox without an ID reads Checkbox without a task ID", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const sq = document.querySelector('[data-region="taskmap"] a[title^="No ID"]');
    focus(window, sq);
    assert.equal(tip(document).querySelector('[data-part="id"]').textContent, NO_ID_TEXT);
    assert.equal(NO_ID_TEXT, "Checkbox without a task ID");
    assert.equal(tip(document).querySelector('[data-part="text"]').textContent, "Loose checkbox");
  });

  test("tooltipContent falls back to the square's title without a tree", async () => {
    const { document } = await page();
    const c = tooltipContent(square(document, "002-beta/T004"), null);
    assert.deepEqual(c, { id: "T004", state: "blocked", label: "Blocked", text: "b, depends on T003", feature: "Beta" });
  });

  test("text is set as text, never as markup", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const sq = square(document, "002-beta/T003");
    sq.setAttribute("title", "T003 · Open — <img src=x onerror=alert(1)> — Beta");
    document.querySelector('[data-region="tree"] li[data-key="002-beta/T003"] [data-part="text"]').setAttribute("title", "<b>x</b>");
    focus(window, sq);
    assert.equal(tip(document).querySelector("img, b"), null);
    assert.equal(tip(document).querySelector('[data-part="text"]').textContent, "<b>x</b>");
  });
});

describe("placeTooltip", () => {
  const bounds = { left: 100, right: 472, top: 0, bottom: 900 };
  const tipBox = { width: 244, height: 80 };

  test("centred above the square when there is room", () => {
    const p = placeTooltip({ left: 280, top: 300, width: 13, height: 13 }, tipBox, bounds);
    assert.equal(p.align, "centre");
    assert.equal(p.left, 280 + 6.5 - 122);
    assert.equal(p.top, 300 - 8 - 80);
  });

  test("aligned left near the card's left edge", () => {
    const p = placeTooltip({ left: 110, top: 300, width: 13, height: 13 }, tipBox, bounds);
    assert.equal(p.align, "left");
    assert.equal(p.left, 110);
  });

  test("aligned right near the card's right edge", () => {
    const p = placeTooltip({ left: 455, top: 300, width: 13, height: 13 }, tipBox, bounds);
    assert.equal(p.align, "right");
    assert.equal(p.left, 468 - 244);
  });

  test("clamped to the bounds", () => {
    assert.equal(placeTooltip({ left: 90, top: 300, width: 13, height: 13 }, tipBox, bounds).left, 100);
    assert.equal(placeTooltip({ left: 470, top: 300, width: 13, height: 13 }, tipBox, bounds).left, 472 - 244);
    // wider than the bounds: starts at the left edge
    assert.equal(placeTooltip({ left: 200, top: 300, width: 13, height: 13 }, { width: 500, height: 80 }, bounds).left, 100);
  });

  test("below the square when there is no room above, and never past the bottom", () => {
    assert.equal(placeTooltip({ left: 280, top: 20, width: 13, height: 13 }, tipBox, bounds).top, 20 + 13 + 8);
    assert.equal(placeTooltip({ left: 280, top: 60, width: 13, height: 13 }, tipBox, { ...bounds, bottom: 100 }).top, 20);
  });

  test("init places the tooltip from the measured rectangles", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const card = document.querySelector('[data-region="taskmap"] [data-part="card"]');
    card.getBoundingClientRect = () => ({ left: 1000, top: 200, width: 372, height: 300, right: 1372, bottom: 500 });
    const sq = square(document, "001-alpha/T001");
    sq.getBoundingClientRect = () => ({ left: 1020, top: 240, width: 13, height: 13, right: 1033, bottom: 253 });
    tip(document).getBoundingClientRect = () => ({ left: 0, top: 0, width: 244, height: 80, right: 244, bottom: 80 });
    focus(window, sq);
    assert.equal(tip(document).style.left, "1020px");
    assert.equal(tip(document).style.top, `${240 - 8 - 80}px`);
    assert.equal(tip(document).dataset.align, "left");
  });
});

describe("taskmap highlight (FR-025)", () => {
  test("a square in a collapsed feature tints only its feature row, as the deepest", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    pointer(window, "pointerover", square(document, "003-gamma/T003"));
    assert.deepEqual(hl(document), { "003-gamma": "deepest" });
  });

  test("with feature and phase open the task row is the deepest; ancestors are tinted lightly", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    tree.reveal(document, "task-002-beta-T004");
    pointer(window, "pointerover", square(document, "002-beta/T004"));
    assert.deepEqual(hl(document), {
      "002-beta": "ancestor",
      "002-beta/p2": "ancestor",
      "002-beta/p2/US2": "ancestor",
      "002-beta/T004": "deepest",
    });
  });

  test("cleared on leave and on blur; moving to another square moves it", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const a = square(document, "003-gamma/T001");
    pointer(window, "pointerover", a);
    pointer(window, "pointerout", a);
    assert.deepEqual(hl(document), {});
    focus(window, a);
    assert.deepEqual(hl(document), { "003-gamma": "deepest" });
    blur(window, a);
    assert.deepEqual(hl(document), {});
    highlight(document, square(document, "001-alpha/T001"));
    highlight(document, square(document, "003-gamma/T001"));
    assert.deepEqual(hl(document), { "003-gamma": "deepest" });
  });

  test("the hover path never scans the tree (SC-006: 2,000 squares)", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    tree.reveal(document, "task-002-beta-T004");
    const treeEl = document.querySelector('[data-region="tree"]');
    const sq = square(document, "002-beta/T004");
    const scans = [];
    for (const target of [document, treeEl]) {
      for (const name of ["querySelector", "querySelectorAll"]) {
        const original = target[name].bind(target);
        target[name] = (selector) => {
          if (/data-key|data-hl|data-feature/.test(selector)) scans.push(selector);
          return original(selector);
        };
      }
    }
    pointer(window, "pointerover", sq);
    const tinted = scans.length;
    assert.deepEqual(hl(document), {
      "002-beta": "ancestor",
      "002-beta/p2": "ancestor",
      "002-beta/p2/US2": "ancestor",
      "002-beta/T004": "deepest",
    });
    const tipText = tooltipContent(sq, treeEl);
    assert.equal(tipText.text, "b, depends on T003");
    assert.equal(tipText.feature, "Beta");
    const hlScans = scans.length - tinted; // hl() itself scans on purpose
    pointer(window, "pointerout", sq);
    assert.deepEqual(scans.slice(0, tinted), [], "hover: no scan");
    assert.equal(scans.length - tinted, hlScans, "tooltip content and leave: no scan");
    assert.deepEqual(hl(document), {});
  });

  test("treeRows finds rows by selector when the task row has no id", async () => {
    const { document, deps } = await page();
    init(document, deps);
    const sq = square(document, "002-beta/T004");
    document.getElementById("task-002-beta-T004").removeAttribute("id");
    const rows = treeRows(document.querySelector('[data-region="tree"]'), sq);
    assert.deepEqual([...rows.keys()].sort(), ["002-beta", "002-beta/T004", "002-beta/p2", "002-beta/p2/US2"]);
    assert.equal(rows.get("002-beta/T004").tagName, "LI");
  });

  test("rows hidden by Open tasks only are skipped", async () => {
    const { document, deps } = await page();
    init(document, deps);
    tree.reveal(document, "task-002-beta-T001");
    document.querySelector('[data-region="tree"]').setAttribute("data-filter", "open");
    highlight(document, square(document, "002-beta/T001"));
    // the done task and its complete phase are hidden; the feature row is the deepest visible one
    assert.deepEqual(hl(document), { "002-beta": "deepest" });
  });
});

describe("taskmap click (FR-026)", () => {
  test("click reveals the task in the tree and prevents the jump", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const gamma = document.querySelector('[data-region="tree"] details[data-key="003-gamma"]');
    assert.equal(gamma.open, false);
    const event = click(window, square(document, "003-gamma/T004"));
    assert.equal(event.defaultPrevented, true);
    assert.equal(gamma.open, true);
    assert.equal(document.querySelector('[data-region="tree"] details[data-key="003-gamma/p2"]').open, true);
    assert.deepEqual([...document.querySelectorAll("[data-selected]")].map((el) => el.id), ["task-003-gamma-T004"]);
  });

  test("Enter reveals the task too", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const event = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    square(document, "002-beta/T005").dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual([...document.querySelectorAll("[data-selected]")].map((el) => el.id), ["task-002-beta-T005"]);
  });

  test("a tap does the same, without a tooltip", async () => {
    const { window, document, deps, timers } = await page();
    init(document, deps);
    const sq = square(document, "003-gamma/T001");
    pointer(window, "pointerover", sq, "touch");
    pointer(window, "pointerdown", sq, "touch");
    click(window, sq);
    timers.tick(1000);
    assert.equal(tip(document).hidden, true);
    assert.equal(document.getElementById("task-003-gamma-T001").hasAttribute("data-selected"), true);
  });

  test("without a matching tree row the link is left alone", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    const sq = square(document, "003-gamma/T001");
    sq.setAttribute("href", "#nowhere");
    assert.equal(click(window, sq).defaultPrevented, false);
  });
});

describe("taskmap mode (FR-021, FR-028)", () => {
  const map = (document) => document.querySelector('[data-region="taskmap"]');
  const button = (document) => document.querySelector('button[data-part="map-mode"]');

  test("init un-hides the toggle and keeps the server layout without a stored mode", async () => {
    const { document, deps } = await page();
    assert.equal(button(document).hidden, true);
    init(document, deps);
    assert.equal(button(document).hidden, false);
    assert.equal(map(document).dataset.layout, "stacked");
    assert.equal(button(document).getAttribute("aria-pressed"), "false");
    assert.equal(button(document).textContent.trim(), MODE_LABELS.stacked);
  });

  test("clicks toggle By feature / Stack all and store the mode", async () => {
    const { window, document, deps, storage } = await page();
    init(document, deps);
    click(window, button(document));
    assert.equal(map(document).dataset.layout, "grouped");
    assert.equal(button(document).getAttribute("aria-pressed"), "true");
    assert.equal(button(document).textContent.trim(), "Stack all");
    assert.equal(storage.data.get("sk-map"), "grouped");
    click(window, button(document));
    assert.equal(map(document).dataset.layout, "stacked");
    assert.equal(button(document).textContent.trim(), "By feature");
    assert.equal(storage.data.get("sk-map"), "stacked");
  });

  test("the stored mode is applied on load and after a live swap", async () => {
    const { document, deps } = await page({ "sk-map": "grouped" });
    init(document, deps);
    assert.equal(map(document).dataset.layout, "grouped");
    document.querySelector("main").innerHTML = await overviewHtml();
    init(document, deps);
    assert.equal(map(document).dataset.layout, "grouped");
    assert.equal(button(document).hidden, false);
  });

  test("init is idempotent: one click toggles once", async () => {
    const { window, document, deps } = await page();
    init(document, deps);
    init(document, deps);
    click(window, button(document));
    assert.equal(map(document).dataset.layout, "grouped");
  });

  test("a bars layout keeps its layout and has no toggle", async () => {
    const window = new Window();
    windows.push(window);
    const { document } = window;
    document.body.innerHTML = '<main><section data-region="taskmap" data-layout="bars"><div data-part="card"></div></section></main>';
    init(document, { document, storage: memoryStorage({ "sk-map": "stacked" }) });
    assert.equal(document.querySelector('[data-region="taskmap"]').dataset.layout, "bars");
  });

  test("applyMode sets the layout and the toggle", async () => {
    const { document } = await page();
    applyMode(map(document), "grouped");
    assert.equal(map(document).dataset.layout, "grouped");
    assert.equal(button(document).getAttribute("aria-pressed"), "true");
  });

  test("does nothing on a page without a map", () => {
    const window = new Window();
    windows.push(window);
    window.document.body.innerHTML = "<main><p>x</p></main>";
    assert.doesNotThrow(() => init(window.document, { document: window.document, storage: null }));
  });
});
