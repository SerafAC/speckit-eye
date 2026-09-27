import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { search, queryWords, isMac, init, openSearch, GROUP_SIZE } from "../../src/client/search.js";
import { buildSearchIndex } from "../../src/render/search-index.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

const task = (label, detail, extra = {}) => ({
  type: "task",
  label,
  detail,
  context: "002 · Beta",
  state: "open",
  url: `features/002-beta/index.html#task-002-beta-${label}`,
  terms: `${label} ${detail}`.toLowerCase(),
  ...extra,
});
const feature = (label, detail = "Ready · 0/3") => ({
  type: "feature",
  label,
  detail,
  url: `features/${label.replace(/\W+/g, "-")}/index.html`,
  terms: label.toLowerCase().replace(" · ", " "),
});
const doc = (label, detail = "plan.md") => ({
  type: "document",
  label,
  detail,
  context: "002 · Beta",
  url: "features/002-beta/plan.html",
  terms: `${label} ${detail}`.toLowerCase(),
});
const heading = (label, detail = "Implementation Plan") => ({
  type: "heading",
  label,
  detail,
  context: "002 · Beta",
  url: `features/002-beta/plan.html#${label.toLowerCase().replace(/\W+/g, "-")}`,
  terms: label.toLowerCase(),
});

const ENTRIES = [
  feature("001 · Moving Average Filter"),
  task("T001", "Compute the moving average"),
  task("T017", "Search index", { state: "done" }),
  task("T018", "Search box, depends on T011", { state: "blocked" }),
  task("T180", "Something else mentioning t018 too"),
  doc("Implementation Plan"),
  heading("Moving average window"),
  heading("Technical Context"),
  feature("002 · Beta"),
];

const labels = (result) => result.groups.map((g) => [g.name, g.items.map((e) => e.label), g.more]);

describe("search(): matching (contracts/search-index.md)", () => {
  test("an empty or blank query shows nothing", () => {
    assert.deepEqual(search(ENTRIES, ""), { groups: [], empty: false });
    assert.deepEqual(search(ENTRIES, "   \t "), { groups: [], empty: false });
    assert.deepEqual(queryWords("  Moving   AVERAGE "), ["moving", "average"]);
  });

  test("ignores case; every word must occur in the terms, in any group", () => {
    assert.deepEqual(labels(search(ENTRIES, "MOVING average")), [
      ["Tasks", ["T001"], 0],
      ["Features", ["001 · Moving Average Filter"], 0],
      ["Documents", ["Moving average window"], 0],
    ]);
    assert.deepEqual(labels(search(ENTRIES, "moving context")), []);
  });

  test("words are substrings: order does not matter", () => {
    assert.deepEqual(labels(search(ENTRIES, "average mov")), labels(search(ENTRIES, "moving average")));
  });

  test("groups are Tasks, Features, Documents; documents and headings share a group; empty groups are left out", () => {
    const r = search(ENTRIES, "plan");
    assert.deepEqual(labels(r), [["Documents", ["Implementation Plan"], 0]]);
    const all = search(ENTRIES, "e");
    assert.deepEqual(all.groups.map((g) => g.name), ["Tasks", "Features", "Documents"]);
  });

  test("a task ID typed in full comes first, even when others start with it; then labels starting with the first word; then page order", () => {
    const entries = [task("T0180", "t018 before in page order"), task("T001", "mentions t018"), task("T018", "the one"), task("T0181", "x t018")];
    assert.deepEqual(search(entries, "t018").groups[0].items.map((e) => e.label), ["T018", "T0180", "T0181", "T001"]);
    assert.deepEqual(search(entries, "T018").groups[0].items[0].label, "T018");
  });

  test("label-start ranking uses the first word; ties keep page order", () => {
    const entries = [heading("Overview of search"), heading("Search box"), heading("Deep search"), heading("Search API")];
    assert.deepEqual(search(entries, "search").groups[0].items.map((e) => e.label), ["Search box", "Search API", "Overview of search", "Deep search"]);
    assert.deepEqual(search(entries, "of search").groups[0].items.map((e) => e.label), ["Overview of search"]);
  });

  test("each group shows its first 8 and how many more (the rest in order)", () => {
    const many = Array.from({ length: 11 }, (_, i) => task(`T1${String(i).padStart(2, "0")}`, "common word"));
    const r = search([...many, feature("003 · common word")], "common");
    assert.equal(GROUP_SIZE, 8);
    assert.equal(r.groups[0].items.length, 8);
    assert.equal(r.groups[0].more, 3);
    assert.deepEqual(r.groups[0].rest.map((e) => e.label), ["T108", "T109", "T110"]);
    assert.deepEqual([r.groups[1].items.length, r.groups[1].more, r.groups[1].rest.length], [1, 0, 0]);
  });

  test("no match anywhere → empty", () => {
    assert.deepEqual(search(ENTRIES, "zebrafish"), { groups: [], empty: true });
    assert.deepEqual(search([], "x"), { groups: [], empty: true });
  });

  test("works on a real index: T018 first, a body-only word finds nothing", async () => {
    const files = {
      "specs/002-beta/spec.md": "# Feature Specification: Beta\n\n## Overview\n\nThe quokka lives here.",
      "specs/002-beta/tasks.md": "## Phase 1: A\n- [ ] T011 List paging\n- [ ] T018 Search box, depends on T011\n- [ ] T0181 about T018",
    };
    const { entries } = buildSearchIndex(buildModel(await scan(createFakeReader(files), "proj")));
    const r = search(entries, "T018");
    assert.equal(r.groups[0].name, "Tasks");
    assert.equal(r.groups[0].items[0].label, "T018");
    assert.deepEqual(search(entries, "quokka"), { groups: [], empty: true });
    assert.deepEqual(labels(search(entries, "beta")), [["Features", ["002 · Beta"], 0], ["Documents", ["Feature Specification: Beta"], 0]]);
  });
});

describe("isMac", () => {
  test("from userAgentData or platform", () => {
    assert.equal(isMac({ platform: "MacIntel" }), true);
    assert.equal(isMac({ userAgentData: { platform: "macOS" } }), true);
    assert.equal(isMac({ platform: "iPhone" }), true);
    assert.equal(isMac({ platform: "Linux x86_64" }), false);
    assert.equal(isMac({ userAgentData: { platform: "Windows" }, platform: "Win32" }), false);
    assert.equal(isMac(undefined), false);
  });
});

/** @type {Window[]} */
const windows = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.close();
});

const SHELL = `<aside data-region="sidebar"><button type="button" data-part="search" hidden><span>Search tasks, specs…</span><kbd>⌘K</kbd></button></aside>
<nav data-region="rail"><button type="button" data-part="search" aria-label="Search" title="Search (⌘K)" hidden></button></nav>
<main><a id="focus-me" href="#x">link</a></main>
<dialog data-region="search" aria-label="Search"></dialog>`;

const MANY = [...ENTRIES, ...Array.from({ length: 10 }, (_, i) => task(`T2${String(i).padStart(2, "0")}`, "search more"))];

function page({ base = "/", platform = "Linux x86_64", entries = MANY, fail = false } = {}) {
  const window = new Window({ url: `http://localhost${base}index.html` });
  windows.push(window);
  const { document } = window;
  document.body.dataset.base = base;
  document.body.innerHTML = SHELL;
  const fetched = [];
  const fetch = async (url) => {
    fetched.push(url);
    if (fail) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ version: 1, entries }) };
  };
  const assigned = [];
  const fakeWindow = { location: { assign: (u) => assigned.push(u) } };
  const deps = { document, window: fakeWindow, fetch, navigator: { platform } };
  init(document, deps);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const dialog = () => $('dialog[data-region="search"]');
  const input = () => $('input[data-part="query"]');
  const key = (target, k, opts = {}) => target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));
  const type = (text) => {
    input().value = text;
    input().dispatchEvent(new window.Event("input"));
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const options = () => $$('[role="option"]');
  const active = () => document.getElementById(input().getAttribute("aria-activedescendant") ?? "");
  return { window, document, deps, $, $$, dialog, input, key, type, flush, options, active, fetched, assigned };
}

describe("client/search.js: opening and closing (FR-049)", () => {
  test("un-hides every search entry; shows Ctrl K off macOS and ⌘K on macOS", () => {
    const p = page();
    const entries = p.$$('[data-part="search"]');
    assert.equal(entries.length, 2);
    for (const e of entries) assert.equal(e.hidden, false);
    assert.equal(p.$('[data-part="search"] kbd').textContent, "Ctrl K");
    assert.equal(p.$('[data-region="rail"] [data-part="search"]').getAttribute("title"), "Search (Ctrl+K)");
    const mac = page({ platform: "MacIntel" });
    assert.equal(mac.$('[data-part="search"] kbd').textContent, "⌘K");
  });

  test("Ctrl+K opens the dialog with the cursor in the box; Escape closes it and focus returns", async () => {
    const p = page();
    const link = p.$("#focus-me");
    link.focus();
    assert.equal(p.key(p.document, "k", { ctrlKey: true }), false, "the shortcut is taken over");
    assert.equal(p.dialog().open, true);
    assert.equal(p.document.activeElement, p.input());
    p.key(p.input(), "Escape");
    assert.equal(p.dialog().open, false);
    assert.equal(p.document.activeElement, link);
  });

  test("⌘K on macOS; Ctrl+K there, ⌘K elsewhere and other keys do nothing", () => {
    const mac = page({ platform: "MacIntel" });
    mac.key(mac.document, "k", { ctrlKey: true });
    assert.equal(mac.dialog().open, false);
    mac.key(mac.document, "k", { metaKey: true });
    assert.equal(mac.dialog().open, true);
    const linux = page();
    linux.key(linux.document, "k", { metaKey: true });
    linux.key(linux.document, "j", { ctrlKey: true });
    linux.key(linux.document, "k");
    assert.equal(linux.dialog().open, false);
  });

  test("the sidebar entry opens it too, and focus returns to the entry", async () => {
    const p = page();
    const entry = p.$('aside [data-part="search"]');
    entry.focus();
    entry.click();
    assert.equal(p.dialog().open, true);
    assert.equal(p.document.activeElement, p.input());
    p.dialog().close();
    assert.equal(p.document.activeElement, entry);
  });

  test("the dialog is built once, with text only (textContent) and a combobox bound to the listbox", () => {
    const p = page();
    init(p.document, p.deps);
    init(p.document, p.deps);
    assert.equal(p.$$('input[data-part="query"]').length, 1);
    assert.equal(p.input().getAttribute("role"), "combobox");
    assert.equal(p.input().getAttribute("aria-controls"), p.$('[role="listbox"]').id);
  });

  test("init is idempotent: one click opens once, one shortcut opens once", async () => {
    const p = page();
    init(p.document, p.deps);
    p.key(p.document, "k", { ctrlKey: true });
    await p.flush();
    assert.equal(p.fetched.length, 1);
  });
});

describe("client/search.js: index loading (FR-049c)", () => {
  test("fetches the index on first use relative to the base, once", async () => {
    const p = page({ base: "/eye/" });
    assert.deepEqual(p.fetched, [], "nothing is fetched before search is used");
    await openSearch(p.document);
    assert.deepEqual(p.fetched, ["/eye/assets/search-index.json"]);
    p.dialog().close();
    await openSearch(p.document);
    assert.equal(p.fetched.length, 1);
  });

  test("fetches again on the next use after a live update (sk:change)", async () => {
    const p = page();
    await openSearch(p.document);
    p.dialog().close();
    p.document.dispatchEvent(new p.window.CustomEvent("sk:change"));
    assert.equal(p.fetched.length, 1, "not fetched at the live update itself");
    await openSearch(p.document);
    assert.equal(p.fetched.length, 2);
    p.dialog().close();
    await openSearch(p.document);
    assert.equal(p.fetched.length, 2);
  });

  test("results typed before the index arrives appear once it is loaded; new tasks are found after reloading", async () => {
    let entries = [task("T001", "old task")];
    const p = page();
    p.deps.fetch = async (url) => {
      p.fetched.push(url);
      return { ok: true, json: async () => ({ version: 1, entries }) };
    };
    init(p.document, p.deps);
    const loaded = openSearch(p.document);
    p.type("fresh");
    await loaded;
    assert.equal(p.$('[data-part="status"]').textContent, 'No results for "fresh"');
    p.dialog().close();
    entries = [...entries, task("T002", "fresh task")];
    p.document.dispatchEvent(new p.window.CustomEvent("sk:change"));
    await openSearch(p.document);
    assert.deepEqual(p.options().map((o) => o.querySelector('[data-part="id"]').textContent), ["T002"]);
  });

  test("a failed load says so and is retried on the next use", async () => {
    const p = page({ fail: true });
    await openSearch(p.document);
    p.type("x");
    assert.equal(p.$('[data-part="status"]').textContent, "Search is not available right now.");
    p.dialog().close();
    await openSearch(p.document);
    assert.equal(p.fetched.length, 2);
  });
});

describe("client/search.js: results and navigation (FR-049a, FR-049b)", () => {
  test("renders groups; tasks with state mark, ID, text and feature; features with name and status; documents with title and feature", async () => {
    const p = page();
    await openSearch(p.document);
    p.type("t018");
    const groups = p.$$('[data-part="group"]').map((g) => g.querySelector('[data-part="group-name"]').textContent);
    assert.deepEqual(groups, ["Tasks"]);
    const first = p.options()[0];
    assert.equal(first.getAttribute("href"), "/features/002-beta/index.html#task-002-beta-T018");
    assert.equal(first.querySelector('[data-part="mark"]').getAttribute("data-state"), "blocked");
    assert.equal(first.querySelector('[data-part="mark"]').getAttribute("aria-label"), "Blocked");
    assert.deepEqual(
      ["id", "text", "context"].map((part) => first.querySelector(`[data-part="${part}"]`).textContent),
      ["T018", "Search box, depends on T011", "002 · Beta"],
    );
    p.type("beta");
    const feat = p.$('[data-group="Features"] [role="option"]');
    assert.deepEqual([...feat.children].map((c) => c.textContent), ["002 · Beta", "Ready · 0/3"]);
    p.type("technical");
    const h = p.$('[data-group="Documents"] [role="option"]');
    assert.deepEqual([...h.children].map((c) => c.textContent), ["Technical Context", "Implementation Plan · 002 · Beta"]);
    assert.equal(h.getAttribute("href"), "/features/002-beta/plan.html#technical-context");
  });

  test("markup in the index stays text", async () => {
    const p = page({ entries: [task("T001", '<img src=x onerror="alert(1)"> box')] });
    await openSearch(p.document);
    p.type("box");
    assert.equal(p.$$("img").length, 0);
    assert.equal(p.$('[data-part="text"]').textContent, '<img src=x onerror="alert(1)"> box');
  });

  test("arrow keys move the active option (aria-activedescendant), wrapping; Enter opens it at base + url", async () => {
    const p = page({ base: "/eye/" });
    await openSearch(p.document);
    p.type("moving average");
    assert.equal(p.active(), p.options()[0], "the first result is active");
    assert.equal(p.active().getAttribute("aria-selected"), "true");
    p.key(p.input(), "ArrowDown");
    assert.equal(p.active(), p.options()[1]);
    assert.equal(p.options()[0].getAttribute("aria-selected"), "false");
    p.key(p.input(), "ArrowDown");
    p.key(p.input(), "ArrowDown");
    assert.equal(p.active(), p.options()[0], "wraps to the first");
    p.key(p.input(), "ArrowUp");
    assert.equal(p.active(), p.options()[2]);
    p.key(p.input(), "Enter");
    assert.deepEqual(p.assigned, ["/eye/features/002-beta/plan.html#moving-average-window"]);
    assert.equal(p.dialog().open, false);
  });

  test("Enter right after typing a full ID opens that task", async () => {
    const p = page();
    await openSearch(p.document);
    p.type("T018");
    p.key(p.input(), "Enter");
    assert.deepEqual(p.assigned, ["/features/002-beta/index.html#task-002-beta-T018"]);
  });

  test("Enter pressed while the index is still loading opens the first result once it arrives", async () => {
    const p = page();
    /** @type {(v: unknown) => void} */
    let release = () => {};
    const gate = new Promise((r) => (release = r));
    p.deps.fetch = async (url) => {
      p.fetched.push(url);
      await gate;
      return { ok: true, json: async () => ({ version: 1, entries: MANY }) };
    };
    init(p.document, p.deps);
    const loaded = openSearch(p.document);
    p.type("T018 search box");
    assert.equal(p.options().length, 0, "no results yet");
    assert.equal(p.key(p.input(), "Enter"), false, "the key is kept, not dropped");
    assert.deepEqual(p.assigned, []);
    release(undefined);
    await loaded;
    assert.deepEqual(p.assigned, ["/features/002-beta/index.html#task-002-beta-T018"]);
    assert.equal(p.dialog().open, false);
  });

  test("a pending Enter is dropped when typing goes on, arrows move, or the dialog closes", async () => {
    for (const cancel of ["type", "arrow", "close"]) {
      const p = page();
      /** @type {(v: unknown) => void} */
      let release = () => {};
      const gate = new Promise((r) => (release = r));
      p.deps.fetch = async () => {
        await gate;
        return { ok: true, json: async () => ({ version: 1, entries: MANY }) };
      };
      init(p.document, p.deps);
      const loaded = openSearch(p.document);
      p.type("T018");
      p.key(p.input(), "Enter");
      if (cancel === "type") p.type("T018 search");
      else if (cancel === "arrow") p.key(p.input(), "ArrowDown");
      else p.dialog().close();
      release(undefined);
      await loaded;
      assert.deepEqual(p.assigned, [], cancel);
    }
  });

  test("a pending Enter opens nothing when the index fails to load", async () => {
    const p = page();
    /** @type {(v: unknown) => void} */
    let release = () => {};
    const gate = new Promise((r) => (release = r));
    p.deps.fetch = async () => {
      await gate;
      return { ok: false, status: 500, json: async () => ({}) };
    };
    init(p.document, p.deps);
    const loaded = openSearch(p.document);
    p.type("T018");
    p.key(p.input(), "Enter");
    release(undefined);
    await loaded;
    assert.deepEqual(p.assigned, []);
    assert.equal(p.options().length, 0);
    assert.equal(p.dialog().open, true, "the dialog stays open showing the failure");
  });

  test("a click on a result opens it", async () => {
    const p = page();
    await openSearch(p.document);
    p.type("beta");
    p.$('[data-group="Features"] [data-part="context"]').click();
    assert.deepEqual(p.assigned, ["/features/002-Beta/index.html"]);
    assert.equal(p.dialog().open, false);
  });

  test("8 results and \"N more\"; choosing it (Enter or click) shows the whole group", async () => {
    const p = page();
    await openSearch(p.document);
    p.type("search");
    const tasks = () => p.$$('[data-group="Tasks"] [data-part="result"]');
    assert.equal(tasks().length, 8);
    const more = p.$('[data-group="Tasks"] [data-part="more"]');
    assert.equal(more.textContent, "4 more");
    const index = p.options().indexOf(more);
    for (let i = 0; i < index; i++) p.key(p.input(), "ArrowDown");
    assert.equal(p.active(), more);
    p.key(p.input(), "Enter");
    assert.equal(tasks().length, 12);
    assert.equal(p.$('[data-group="Tasks"] [data-part="more"]'), null);
    assert.equal(p.active(), tasks()[8], "the first newly shown result is active");
    assert.deepEqual(p.assigned, []);
    p.type("search m");
    p.$('[data-part="more"]').click();
    assert.equal(tasks().length, 10);
  });

  test("no match shows the message; an empty query shows nothing", async () => {
    const p = page();
    await openSearch(p.document);
    p.type("  zebrafish ");
    assert.equal(p.options().length, 0);
    const status = p.$('[data-part="status"]');
    assert.equal(status.hidden, false);
    assert.equal(status.textContent, 'No results for "zebrafish"');
    p.type("");
    assert.equal(status.hidden, true);
    assert.equal(p.options().length, 0);
    assert.equal(p.input().hasAttribute("aria-activedescendant"), false);
    p.key(p.input(), "Enter");
    assert.deepEqual(p.assigned, []);
  });
});
