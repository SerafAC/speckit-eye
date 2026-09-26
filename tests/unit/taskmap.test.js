import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  renderTaskMap,
  mapLayout,
  squareTitle,
  MAP_GROUPED_THRESHOLD,
  MAP_BARS_THRESHOLD,
  MODE_LABELS,
} from "../../src/render/taskmap.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

async function model(files, options) {
  return buildModel(await scan(createFakeReader(files, options), "proj"));
}

const render = (project) => renderTaskMap(project, { base: "/" }).value;

/** n task lines, the first `done` checked. */
function lines(n, done, { start = 1, label = "" } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const id = `T${String(start + i).padStart(3, "0")}`;
    return `- [${i < done ? "x" : " "}] ${id}${label ? ` [${label}]` : ""} task ${id}`;
  });
}

const spec = (title, stories) =>
  [`# Feature Specification: ${title}`, ...stories.map(([n, t, p]) => `### User Story ${n} - ${t} (Priority: ${p})`)].join("\n");

/** Same shape as tests/fixtures/projects/mixed (30/30, 10/20, 0/15, spec only), plus a checkbox without an ID. */
const MIXED = {
  "specs/001-alpha/spec.md": spec("Alpha", [[1, "Alpha overview", "P1"]]),
  "specs/001-alpha/tasks.md": ["## Phase 1: Setup", ...lines(5, 5), "## Phase 2: User Story 1", ...lines(25, 25, { start: 6, label: "US1" })].join("\n"),
  "specs/002-beta/spec.md": spec("Beta", [[1, "Beta listing", "P1"], [2, "Beta details", "P2"], [3, "Beta search", "P3"]]),
  "specs/002-beta/tasks.md": [
    "## Phase 1: Setup",
    ...lines(7, 7),
    "## Phase 3: User Story 1",
    "- [x] T008 [US1] List view model",
    "- [x] T009 [US1] List renderer",
    "- [x] T010 [US1] List tests",
    "- [ ] T011 [US1] List paging",
    "- [ ] T012 [US1] List sorting",
    "- [ ] T013 [US1] List empty state",
    "## Phase 4: Mixed",
    "- [ ] T014 [US2] Detail model",
    "- [ ] T015 [US2] Detail renderer",
    "- [ ] T016 [US2] Detail tests",
    "- [ ] T017 [US3] Search index",
    "- [ ] T018 [US3] Search box, depends on T011",
    "- [ ] T019 Shared docs <update>",
    "- [ ] T020 [US3] Search tests",
    "- [ ] Checkbox without an ID",
  ].join("\n"),
  "specs/003-gamma/spec.md": spec("Gamma", [[1, "Gamma import", "P1"]]),
  "specs/003-gamma/tasks.md": ["## Phase 1: Setup", ...lines(5, 0), "## Phase 2: Import", ...lines(10, 0, { start: 6, label: "US1" })].join("\n"),
  "specs/004-delta/spec.md": spec("Delta", [[1, "Delta export", "P1"]]),
};

const squares = (doc) => [...doc.matchAll(/<a data-key="([^"]+)"[^>]*data-state="([^"]+)"[^>]*>/g)];
const squareTag = (doc, key) => squares(doc).find((m) => m[1] === key)?.[0] ?? null;

describe("renderTaskMap (T035, FR-021)", () => {
  test("one square per task, including checkboxes without an ID", async () => {
    const p = await model(MIXED);
    const doc = render(p);
    assert.equal(squares(doc).length, 66);
    assert.equal(squares(doc).length, p.totals.tasks.total);
    const noId = squares(doc).filter((m) => /title="No ID · /.test(m[0]));
    assert.equal(noId.length, 1);
    assert.match(noId[0][0], /title="No ID · Open — Checkbox without an ID — Beta"/);
  });

  test("folder and task order, independent of the tree ranks and story groups", async () => {
    const p = await model(MIXED);
    const keys = squares(render(p)).map((m) => m[1]);
    assert.equal(keys[0], "001-alpha/T001");
    assert.equal(keys[29], "001-alpha/T030");
    assert.equal(keys[30], "002-beta/T001");
    // task order within the phase, not grouped by story
    assert.deepEqual(keys.slice(43, 50), ["002-beta/T014", "002-beta/T015", "002-beta/T016", "002-beta/T017", "002-beta/T018", "002-beta/T019", "002-beta/T020"]);
    // ranks put 002-beta first in the tree; the map ignores them
    const reversed = { ...p, features: p.features.map((f) => ({ ...f, ranks: { progress: 9, number: 9, least: 9, name: 9 } })) };
    assert.deepEqual(squares(render(reversed)).map((m) => m[1]), keys);
    assert.deepEqual([...render(p).matchAll(/<div data-part="group" data-key="map:([^"]+)"/g)].map((m) => m[1]), ["001-alpha", "002-beta", "003-gamma"]);
  });

  test("square attributes: state, parents, href to the tree row, title and aria-label", async () => {
    const doc = render(await model(MIXED));
    const blocked = squareTag(doc, "002-beta/T018");
    assert.match(blocked, /data-state="blocked"/);
    assert.match(blocked, /data-parents="002-beta 002-beta\/p4 002-beta\/p4\/US3"/);
    assert.match(blocked, /href="#task-002-beta-T018"/);
    assert.match(blocked, /title="T018 · Blocked — Search box, depends on T011 — Beta"/);
    assert.match(blocked, /aria-label="T018 · Blocked — Search box, depends on T011 — Beta"/);
    const next = squareTag(doc, "002-beta/T011");
    assert.match(next, /data-state="next"/);
    assert.match(next, /data-parents="002-beta 002-beta\/p3"/);
    assert.match(squareTag(doc, "001-alpha/T001"), /data-state="done"/);
    assert.match(squareTag(doc, "003-gamma/T001"), /data-state="open"/);
    assert.match(squareTag(doc, "002-beta/T019"), /data-parents="002-beta 002-beta\/p4"/);
    assert.match(squareTag(doc, "002-beta/T019"), /title="T019 · Open — Shared docs &lt;update&gt; — Beta"/);
  });

  test("header above the card with the hidden mode toggle; grouped blocks with name and done/total", async () => {
    const doc = render(await model(MIXED));
    assert.match(doc, /^<section data-region="taskmap" data-layout="stacked" aria-labelledby="taskmap-heading">\s*<header data-part="taskmap-head"><h2 id="taskmap-heading">Task map<\/h2><button type="button" class="btn" data-part="map-mode" aria-pressed="false" hidden>/);
    assert.match(doc, /<span data-part="mode-label">By feature<\/span>/);
    assert.ok(doc.indexOf("</header>") < doc.indexOf('<div data-part="card">'));
    assert.match(doc, /<div data-part="group-head"><span data-part="name" title="Beta">Beta<\/span><span data-part="count">10\/21<\/span><\/div>/);
    assert.deepEqual(MODE_LABELS, { stacked: "By feature", grouped: "Stack all" });
  });

  test("legend: Done, Open, Blocked, Next counts summing to the total, and 1 dot = 1 task", async () => {
    const p = await model(MIXED);
    const doc = render(p);
    const counts = Object.fromEntries([...doc.matchAll(/<li data-state="(\w+)"><span data-part="swatch"><\/span>(\w+) <span data-part="count">(\d+)<\/span><\/li>/g)].map((m) => [m[1], [m[2], Number(m[3])]]));
    assert.deepEqual(counts, { done: ["Done", 40], open: ["Open", 24], blocked: ["Blocked", 1], next: ["Next", 1] });
    assert.equal(40 + 24 + 1 + 1, p.totals.tasks.total);
    assert.match(doc, /<li data-part="unit">1 dot = 1 task<\/li><\/ul>/);
  });

  test("the legend is computed from the tasks when the model has no overview", async () => {
    const p = await model(MIXED);
    delete p.overview;
    assert.match(render(p), /<li data-state="blocked"><span data-part="swatch"><\/span>Blocked <span data-part="count">1<\/span>/);
  });

  test("empty project: an empty state, no squares, no legend", async () => {
    const doc = render(await model({ "specs/001-x/spec.md": spec("X", [[1, "x", "P1"]]) }));
    assert.match(doc, /<p data-part="empty">No tasks yet\./);
    assert.equal(squares(doc).length, 0);
    assert.doesNotMatch(doc, /data-part="legend"/);
  });

  test("never emits an inline style attribute (CSP)", async () => {
    assert.doesNotMatch(render(await model(MIXED)), /\sstyle=/);
  });
});

describe("renderTaskMap: large projects (T035, FR-027)", () => {
  /** A project with `n` tasks spread over features of at most 400 tasks, plus one without tasks. */
  async function big(n) {
    const files = {};
    let left = n;
    for (let f = 1; left > 0; f++) {
      const count = Math.min(400, left);
      left -= count;
      files[`specs/${String(f).padStart(3, "0")}-f/tasks.md`] = ["## Phase 1: Work", ...lines(count, Math.floor(count / 2))].join("\n");
    }
    files["specs/999-empty/spec.md"] = spec("Empty", [[1, "Nothing", "P1"]]);
    return render(await model(files));
  }
  const layoutOf = (doc) => /data-region="taskmap" data-layout="(\w+)"/.exec(doc)[1];

  test("thresholds and mapLayout", () => {
    assert.equal(MAP_GROUPED_THRESHOLD, 1000);
    assert.equal(MAP_BARS_THRESHOLD, 5000);
    assert.equal(mapLayout(0), "stacked");
    assert.equal(mapLayout(1000), "stacked");
    assert.equal(mapLayout(1001), "grouped");
    assert.equal(mapLayout(5000), "grouped");
    assert.equal(mapLayout(5001), "bars");
  });

  test("1,000 tasks: stacked", async () => {
    const doc = await big(1000);
    assert.equal(layoutOf(doc), "stacked");
    assert.equal(squares(doc).length, 1000);
  });

  test("1,001 tasks: grouped, one block per feature with tasks, toggle reads Stack all", async () => {
    const doc = await big(1001);
    assert.equal(layoutOf(doc), "grouped");
    assert.equal(squares(doc).length, 1001);
    assert.equal([...doc.matchAll(/<div data-part="group" /g)].length, 3);
    assert.match(doc, /data-part="map-mode" aria-pressed="true" hidden>[\s\S]*?<span data-part="mode-label">Stack all<\/span>/);
  });

  test("5,000 tasks: still grouped", async () => {
    assert.equal(layoutOf(await big(5000)), "grouped");
  });

  test("5,001 tasks: one progress bar per feature, no squares, no toggle, legend unit names bars", async () => {
    const doc = await big(5001);
    assert.equal(layoutOf(doc), "bars");
    assert.equal(squares(doc).length, 0);
    assert.doesNotMatch(doc, /data-part="map-mode"/);
    const bars = [...doc.matchAll(/<a data-part="bar" data-key="map:([^"]+)" data-sig="[^"]*" href="#([^"]+)" title="([^"]+)"><span data-part="label">[^<]+<\/span><span data-part="track"><span class="w-pct-(\d+)"><\/span><\/span><\/a>/g)];
    assert.equal(bars.length, 13);
    assert.deepEqual(bars[0].slice(1), ["001-f", "feature-001-f", "001-f · 200 / 400", "50"]);
    assert.deepEqual(bars[12].slice(1), ["013-f", "feature-013-f", "013-f · 100 / 201", "50"]);
    assert.match(doc, /<li data-part="unit">1 bar = 1 feature<\/li>/);
  });

  test("no layout uses an inline style attribute (CSP)", async () => {
    for (const n of [1001, 5001]) assert.doesNotMatch(await big(n), /\sstyle=/);
  });
});

describe("squareTitle", () => {
  test("ID or No ID, state label, text and feature", () => {
    const feature = { title: "Beta" };
    assert.equal(squareTitle({ id: "T001", description: "Do it", display: "done" }, feature), "T001 · Done — Do it — Beta");
    assert.equal(squareTitle({ id: null, description: "Loose", display: "open" }, feature), "No ID · Open — Loose — Beta");
    assert.equal(squareTitle({ id: "T002", description: "Wait", state: "blocked" }, feature), "T002 · Blocked — Wait — Beta");
  });
});
