import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { init, save, copyText, COPIED_MS } from "../../src/client/feature.js";
import { renderFeaturePage } from "../../src/render/feature.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

/** Like the `mixed` fixture's 002-beta, with a few file paths. */
const FILES = {
  "specs/002-beta/spec.md": "# Feature Specification: Beta",
  "specs/002-beta/tasks.md": [
    "# Tasks: Beta", // 1
    "", // 2
    "## Phase 1: Setup", // 3
    "- [x] T001 Create `src/list.go`", // 4
    "- [x] T002 [P] Add lint config", // 5
    "## Phase 2: Empty", // 6
    "## Phase 3: Listing", // 7
    "- [x] T008 List view model", // 8
    "- [ ] T011 List paging in `src/list.go`", // 9
    "- [ ] T012 List tests in `src/list_test.go`", // 10
    "## Phase 4: Search", // 11
    "- [ ] T017 Search index in `web/Search.vue`", // 12
    "- [ ] T018 Search box, depends on T011 and T012", // 13
    "- [ ] T019 Simulator docs", // 14
  ].join("\n"),
};

let cached = null;
async function featureHtml() {
  if (!cached) {
    const m = buildModel(await scan(createFakeReader(FILES), "proj"));
    cached = renderFeaturePage(m.features[0], m, { base: "/" }).value;
  }
  return cached;
}

/** @type {Window[]} */
const windows = [];
afterEach(() => {
  for (const w of windows.splice(0)) w.close();
});

async function page({ hash = "", state, navigator, timers } = {}) {
  const window = new Window({ url: `http://localhost/features/002-beta/index.html${hash}` });
  windows.push(window);
  const { document } = window;
  document.body.innerHTML = `<main>${await featureHtml()}</main>`;
  const pending = [];
  const setTimeout = timers ?? ((fn, ms) => pending.push({ fn, ms }));
  const deps = { document, window, navigator: navigator ?? window.navigator, setTimeout, state };
  init(document, deps);
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const phase = (n) => $(`#phase-${n}`);
  const row = (id) => $(`details[data-part="task"][data-id="${id}"]`);
  const chip = (v) => $(`button[data-filter-chip="${v}"]`);
  const count = (v) => chip(v).querySelector('[data-part="count"]').textContent;
  const visibleRows = () => $$('details[data-part="task"]').filter((r) => !r.hasAttribute("data-filtered-out")).map((r) => r.getAttribute("data-id"));
  const panel = () => $('[data-region="detail"]');
  const typeText = (text) => {
    const input = $('input[data-part="text-filter"]');
    input.value = text;
    input.dispatchEvent(new window.Event("input"));
  };
  return { window, document, deps, $, $$, phase, row, chip, count, visibleRows, panel, typeText, pending };
}

describe("client/feature.js: rail and accordion (FR-032)", () => {
  test("shows the filter bar; the active phase is open and current in the rail", async () => {
    const p = await page();
    assert.equal(p.$('[data-part="filters"]').hidden, false);
    assert.equal(p.phase(3).open, true);
    assert.equal(p.$('a[href="#phase-3"]').getAttribute("aria-current"), "true");
    assert.equal(p.$('[data-part="caption"] [data-part="selected"]').textContent, "Phase 3: Listing");
  });

  test("choosing another rail block opens it and closes the open one; choosing it again closes it", async () => {
    const p = await page();
    p.$('a[href="#phase-4"]').click();
    assert.equal(p.phase(4).open, true);
    assert.equal(p.phase(3).open, false);
    assert.equal(p.$('a[href="#phase-4"]').getAttribute("aria-current"), "true");
    assert.equal(p.$('a[href="#phase-3"]').hasAttribute("aria-current"), false);
    assert.equal(p.$('[data-part="caption"] [data-part="selected"]').textContent, "Phase 4: Search");
    assert.equal(p.window.location.hash, "", "rail clicks do not change the address");
    p.$('a[href="#phase-4"]').click();
    assert.equal(p.phase(4).open, false);
    assert.equal(p.$('[data-part="caption"] [data-part="selected"]').textContent, "None");
  });

  test("choosing a phase row in the list closes the others too", async () => {
    const p = await page();
    p.phase(1).querySelector(":scope > summary").click();
    assert.equal(p.phase(1).open, true);
    assert.equal(p.phase(3).open, false);
    assert.equal(p.$('a[href="#phase-1"]').getAttribute("aria-current"), "true");
    p.phase(1).querySelector(":scope > summary").click();
    assert.equal(p.phase(1).open, false);
    assert.equal(p.$('[data-part="caption"] [data-part="selected"]').textContent, "None");
  });

  test("init is idempotent: a second init adds no second listener", async () => {
    const p = await page();
    init(p.document, p.deps);
    p.$('a[href="#phase-4"]').click();
    assert.equal(p.phase(4).open, true, "one click, one toggle");
  });
});

describe("client/feature.js: filters (FR-034)", () => {
  test("Open lists open tasks only, opens every phase with matches and hides the others", async () => {
    const p = await page();
    p.chip("open").click();
    assert.deepEqual(p.visibleRows(), ["T011", "T012", "T017", "T018", "T019"]);
    assert.equal(p.phase(1).hasAttribute("data-filtered-out"), true);
    assert.equal(p.phase(2).hasAttribute("data-filtered-out"), true, "the empty phase is hidden");
    assert.equal(p.phase(3).open && p.phase(4).open, true);
    assert.equal(p.chip("open").getAttribute("aria-pressed"), "true");
    assert.equal(p.chip("all").getAttribute("aria-pressed"), "false");
    assert.equal(p.count("open"), "5");
    assert.equal(p.count("all"), "8");
  });

  test("chips and text combine; counts follow the text; kind chips filter by kind", async () => {
    const p = await page();
    p.chip("kind:Go").click();
    assert.deepEqual(p.visibleRows(), ["T001", "T011", "T012"]);
    p.chip("tests").click();
    assert.deepEqual(p.visibleRows(), ["T012"]);
    p.chip("tests").click();
    p.chip("open").click();
    assert.deepEqual(p.visibleRows(), ["T011", "T012"]);
    p.typeText("paging");
    assert.deepEqual(p.visibleRows(), ["T011"]);
    assert.equal(p.count("all"), "1");
    assert.equal(p.count("tests"), "0");
    p.chip("all").click();
    assert.deepEqual(p.visibleRows(), ["T011"], "All clears the chips, the text stays");
  });

  test("the text filter matches ID, text and file names", async () => {
    const p = await page();
    p.typeText("t018");
    assert.deepEqual(p.visibleRows(), ["T018"]);
    p.typeText("Search.VUE");
    assert.deepEqual(p.visibleRows(), ["T017"]);
    p.typeText("simulator");
    assert.deepEqual(p.visibleRows(), ["T019"]);
  });

  test("nothing matches: the message shows and Clear filters restores the accordion", async () => {
    const p = await page();
    p.typeText("xyzzy");
    assert.deepEqual(p.visibleRows(), []);
    assert.equal(p.$('[data-part="no-match"]').hidden, false);
    p.$('button[data-part="clear"]').click();
    assert.equal(p.$('[data-part="no-match"]').hidden, true);
    assert.equal(p.$('input[data-part="text-filter"]').value, "");
    assert.equal(p.visibleRows().length, 8);
    assert.equal(p.$$("[data-filtered-out]").length, 0);
    assert.equal(p.phase(3).open, true, "the phase open before filtering is open again");
    assert.equal(p.phase(4).open, false);
    assert.equal(p.phase(3).getAttribute("name"), "phases");
  });
});

describe("client/feature.js: expand and collapse all", () => {
  test("Expand all opens every phase and task; Collapse all closes them", async () => {
    const p = await page();
    p.$('button[data-part="expand-all"]').click();
    assert.ok(p.$$('details[data-part="phase"]').every((d) => d.open));
    assert.ok(p.$$('details[data-part="task"]').every((d) => d.open));
    assert.equal(p.$('[data-part="caption"] [data-part="selected"]').textContent, "3 phases");
    p.$('button[data-part="collapse-all"]').click();
    assert.ok(p.$$("details").filter((d) => d.getAttribute("data-part") !== "tab-menu").every((d) => !d.open));
    p.phase(1).querySelector(":scope > summary").click();
    p.phase(4).querySelector(":scope > summary").click();
    assert.equal(p.phase(1).open, false, "the accordion is back");
  });
});

describe("client/feature.js: selection and detail panel (FR-036)", () => {
  test("opening a task selects it and fills the panel; Waiting on names only open dependencies", async () => {
    const p = await page();
    p.phase(4).querySelector(":scope > summary").click();
    p.row("T018").querySelector("summary").click();
    assert.equal(p.row("T018").open, true);
    assert.equal(p.row("T018").hasAttribute("data-selected"), true);
    const panel = p.panel();
    assert.equal(panel.hidden, false);
    assert.equal(panel.querySelector('[data-part="id"]').textContent, "T018");
    assert.equal(panel.querySelector('[data-part="status"]').textContent, "Blocked");
    assert.equal(panel.querySelector('[data-part="status"]').getAttribute("data-status"), "blocked");
    assert.equal(panel.querySelector('[data-part="waiting"]').hidden, false);
    assert.equal(panel.querySelector('[data-part="waiting"]').textContent, "Waiting on T011, T012");
    assert.equal(panel.querySelector('[data-part="phase"]').textContent, "Phase 4: Search");
    assert.match(panel.querySelector('[data-part="text"]').textContent, /Search box, depends on T011 and T012/);
    assert.match(panel.querySelector('[data-part="markers"]').textContent, /depends on T011, T012/);
    assert.deepEqual([...panel.querySelectorAll('[data-part="files"] li')].map((l) => l.textContent), ["—"]);
    assert.equal(panel.querySelector('[data-part="source-line"]').getAttribute("href"), "/features/002-beta/tasks.html#L13");
    assert.equal(p.window.location.hash, "#task-002-beta-T018");
  });

  test("a second click collapses the row; another row moves the selection; close hides the panel", async () => {
    const p = await page();
    p.row("T011").querySelector("summary").click();
    assert.equal(p.panel().querySelector('[data-part="waiting"]').hidden, true);
    assert.deepEqual([...p.panel().querySelectorAll('[data-part="files"] li')].map((l) => l.textContent), ["src/list.go"]);
    assert.equal(p.panel().querySelector('[data-part="status"]').textContent, "Next");
    p.row("T011").querySelector("summary").click();
    assert.equal(p.row("T011").open, false);
    p.row("T012").querySelector("summary").click();
    assert.equal(p.row("T011").hasAttribute("data-selected"), false);
    assert.equal(p.row("T012").hasAttribute("data-selected"), true);
    assert.equal(p.panel().querySelector('[data-part="id"]').textContent, "T012");
    p.panel().querySelector('button[data-part="close"]').click();
    assert.equal(p.panel().hidden, true);
    assert.equal(p.$$("[data-selected]").length, 0);
    assert.equal(p.window.location.hash, "");
  });

  test("a #task-… address opens its phase, expands and selects the task (US3 AC10)", async () => {
    const p = await page({ hash: "#task-002-beta-T017" });
    assert.equal(p.phase(4).open, true);
    assert.equal(p.phase(3).open, false);
    assert.equal(p.row("T017").open, true);
    assert.equal(p.row("T017").hasAttribute("data-selected"), true);
    assert.equal(p.panel().querySelector('[data-part="id"]').textContent, "T017");
    assert.equal(p.$('a[href="#phase-4"]').getAttribute("aria-current"), "true");
  });

  test("a hashchange to another task opens and selects it", async () => {
    const p = await page();
    p.window.history.replaceState(null, "", "/features/002-beta/index.html#task-002-beta-T001");
    p.window.dispatchEvent(new p.window.Event("hashchange"));
    assert.equal(p.phase(1).open, true);
    assert.equal(p.row("T001").hasAttribute("data-selected"), true);
    assert.equal(p.panel().querySelector('[data-part="status"]').textContent, "Done");
  });

  test("an unknown fragment is ignored", async () => {
    const p = await page({ hash: "#task-nope" });
    assert.equal(p.panel().hidden, true);
    assert.equal(p.phase(3).open, true);
  });
});

describe("client/feature.js: Copy ID", () => {
  test("uses the Clipboard API and shows a short confirmation", async () => {
    const written = [];
    const navigator = { clipboard: { writeText: async (t) => void written.push(t) } };
    const p = await page({ navigator });
    p.row("T018").querySelector("summary").click();
    p.panel().querySelector('button[data-part="copy"]').click();
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(written, ["T018"]);
    const note = p.panel().querySelector('[data-part="copied"]');
    assert.equal(note.hidden, false);
    assert.equal(note.textContent, "Copied T018");
    assert.equal(p.pending.at(-1).ms, COPIED_MS);
    p.pending.at(-1).fn();
    assert.equal(note.hidden, true);
  });

  test("falls back to a selected text area when the Clipboard API fails", async () => {
    const navigator = { clipboard: { writeText: async () => Promise.reject(new Error("denied")) } };
    const p = await page({ navigator });
    let copied = null;
    p.document.execCommand = (cmd) => {
      copied = cmd === "copy" ? p.document.querySelector("textarea").value : null;
      return true;
    };
    p.row("T011").querySelector("summary").click();
    p.panel().querySelector('button[data-part="copy"]').click();
    await new Promise((r) => setImmediate(r));
    assert.equal(copied, "T011");
    assert.equal(p.document.querySelector("textarea"), null, "the text area is removed");
    assert.equal(p.panel().querySelector('[data-part="copied"]').textContent, "Copied T011");
  });

  test("copyText reports failure without any copy mechanism", async () => {
    const window = new Window();
    windows.push(window);
    assert.equal(await copyText("T1", { document: window.document, navigator: {} }), false);
  });
});

describe("client/feature.js: save and init restore state across a live swap", () => {
  test("filters, text and the selected task come back", async () => {
    const p = await page();
    p.chip("open").click();
    p.typeText("list");
    p.row("T012").querySelector("summary").click();
    const state = save(p.document);
    assert.deepEqual(state, { chips: ["open"], text: "list", selected: "002-beta/T012" });

    const q = await page({ state });
    assert.equal(q.chip("open").getAttribute("aria-pressed"), "true");
    assert.equal(q.$('input[data-part="text-filter"]').value, "list");
    assert.deepEqual(q.visibleRows(), ["T011", "T012"]);
    assert.equal(q.row("T012").hasAttribute("data-selected"), true);
    assert.equal(q.panel().querySelector('[data-part="id"]').textContent, "T012");
  });

  test("a page without a Tasks section is left alone", () => {
    const window = new Window();
    windows.push(window);
    window.document.body.innerHTML = "<main><p>x</p></main>";
    init(window.document, { document: window.document, window });
    assert.deepEqual(save(window.document), { chips: [], text: "", selected: null });
  });
});
