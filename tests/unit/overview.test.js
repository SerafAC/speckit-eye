import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  renderOverview,
  phaseHeading,
  groupHeading,
  phaseItems,
  featureStatus,
  elementIds,
  ORDER_LABELS,
} from "../../src/render/overview.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";
import { renderFeaturePage } from "../../src/render/feature.js";

async function model(files, options) {
  return buildModel(await scan(createFakeReader(files, options), "proj"));
}

const render = (project) => renderOverview(project, { base: "/" }).value;

/** n task lines, the first `done` checked. */
function lines(n, done, { start = 1, label = "" } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const id = `T${String(start + i).padStart(3, "0")}`;
    return `- [${i < done ? "x" : " "}] ${id}${label ? ` [${label}]` : ""} task ${id}`;
  });
}

const spec = (title, stories) =>
  [`# Feature Specification: ${title}`, ...stories.map(([n, t, p]) => `### User Story ${n} - ${t} (Priority: ${p})`)].join("\n");

/** Same shape as tests/fixtures/projects/mixed: 30/30, 10/20, 0/15, spec only. */
const MIXED = {
  ".specify/memory/constitution.md": "# Constitution",
  "specs/001-alpha/spec.md": spec("Alpha", [[1, "Alpha overview", "P1"], [2, "Alpha details", "P2"]]),
  "specs/001-alpha/plan.md": "# Plan",
  "specs/001-alpha/tasks.md": [
    "## Phase 1: Setup",
    ...lines(5, 5),
    "## Phase 2: User Story 1",
    ...lines(15, 15, { start: 6, label: "US1" }),
    "## Phase 3: User Story 2",
    ...lines(10, 10, { start: 21, label: "US2" }),
  ].join("\n"),
  "specs/002-beta/spec.md": spec("Beta", [[1, "Beta listing", "P1"], [2, "Beta details", "P2"], [3, "Beta search", "P3"]]),
  "specs/002-beta/plan.md": "# Plan",
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
  ].join("\n"),
  "specs/003-gamma/spec.md": spec("Gamma", [[1, "Gamma import", "P1"]]),
  "specs/003-gamma/plan.md": "# Plan",
  "specs/003-gamma/tasks.md": ["## Phase 1: Setup", ...lines(5, 0), "## Phase 2: Import", ...lines(10, 0, { start: 6, label: "US1" })].join(
    "\n",
  ),
  "specs/004-delta/spec.md": spec("Delta", [[1, "Delta export", "P1"]]),
};

const COMPLETE = {
  "specs/001-first/spec.md": spec("First", [[1, "First thing", "P1"]]),
  "specs/001-first/tasks.md": ["## Phase 1: Setup", ...lines(2, 2), "## Phase 2: Story", ...lines(2, 2, { start: 3, label: "US1" })].join("\n"),
  "specs/002-second/spec.md": spec("Second", [[1, "Second thing", "P1"]]),
  "specs/002-second/tasks.md": ["## Phase 1: Setup", "- [X] T001 Setup", "## Phase 2: More", "- [x] T002 More"].join("\n"),
};

/** The opening tag of the element carrying `data-key="<key>"` inside `region`. */
function tagOf(doc, region, key) {
  const part = regionHtml(doc, region);
  const m = new RegExp(`<[a-z]+ [^>]*data-key="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>`).exec(part);
  return m ? m[0] : null;
}

/** The HTML of a region. */
function regionHtml(doc, region) {
  const start = doc.indexOf(`data-region="${region}"`);
  assert.ok(start >= 0, `region ${region} present`);
  const rest = doc.slice(start);
  if (region === "tree") return rest.slice(0, rest.indexOf('data-region="taskmap"'));
  if (region === "stats" || region === "up-next") return rest.slice(0, rest.indexOf("</section>"));
  if (region === "page-head") return rest.slice(0, rest.indexOf("</header>"));
  return rest;
}

/** The text of the `<summary>` of the details element with `key`. */
function summaryOf(doc, key) {
  const i = doc.indexOf(`data-key="${key}"`);
  const rest = doc.slice(i);
  const m = /<summary>([\s\S]*?)<\/summary>/.exec(rest);
  return m ? m[1].replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/^\||\|$/g, "") : null;
}

const text = (h) => h.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const openKeys = (doc) => [...regionHtml(doc, "tree").matchAll(/<details data-key="([^"]+)"[^>]*\sopen>/g)].map((m) => m[1]);

/** The value and detail text of a stats counter. */
function stat(doc, name) {
  const m = new RegExp(`<div data-stat="${name}"[^>]*>([\\s\\S]*?)</div>`).exec(regionHtml(doc, "stats"));
  assert.ok(m, `stat ${name}`);
  const part = (p) => (new RegExp(`<span data-part="${p}">([^<]*)</span>`).exec(m[1]) ?? [])[1];
  return { value: part("value"), detail: part("detail"), label: part("label") };
}

describe("renderOverview: page head (T027, FR-010)", () => {
  test("project name, title and the hidden view filter", async () => {
    const doc = render(await model(MIXED));
    assert.match(doc, /^<header data-region="page-head">/);
    const head = regionHtml(doc, "page-head");
    assert.match(head, /<p data-part="project-name">proj<\/p>/);
    assert.match(head, /<h1>Project overview<\/h1>/);
    assert.match(head, /<div role="group" aria-label="Show" data-part="view-filter" hidden>/);
    assert.match(head, /data-filter="all" aria-pressed="true">All features</);
    assert.match(head, /data-filter="open" aria-pressed="false">Open tasks only</);
  });

  test("regions in order: page head, stats, up next, then tree left of the task map", async () => {
    const doc = render(await model(MIXED));
    const at = (r) => doc.indexOf(`data-region="${r}"`);
    const order = ["page-head", "stats", "up-next", "columns", "features", "tree", "taskmap"].map(at);
    assert.ok(order.every((v) => v >= 0));
    assert.deepEqual([...order].sort((a, b) => a - b), order);
  });
});

describe("renderOverview: stats card (T027, FR-011)", () => {
  test("mixed shape: 62 %, 40 of 65 tasks, features, phases, open tasks", async () => {
    const doc = render(await model(MIXED));
    assert.deepEqual(stat(doc, "percent"), { value: "62 %", detail: "40 of 65 tasks", label: undefined });
    assert.deepEqual(stat(doc, "features"), { value: "1 / 4", detail: "1 in progress", label: "Features" });
    assert.deepEqual(stat(doc, "phases"), { value: "4 / 8", detail: "4 remaining", label: "Phases" });
    assert.deepEqual(stat(doc, "open"), { value: "25", detail: "across 2 features", label: "Open tasks" });
    for (const name of ["percent", "features", "phases", "open"]) {
      assert.match(regionHtml(doc, "stats"), new RegExp(`data-stat="${name}" data-key="stat:${name}" data-sig="[^"]+"`));
    }
  });

  test("the spec example: 96 %, 233 of 242, 2 / 4 with 2 in progress, 9 across 2 features", async () => {
    const f = (done, total) => ["## Phase 1: Work", ...lines(total, done)].join("\n");
    const doc = render(
      await model({
        "specs/001-a/tasks.md": f(123, 123),
        "specs/002-b/tasks.md": f(24, 32),
        "specs/003-c/tasks.md": f(72, 72),
        "specs/004-d/tasks.md": f(14, 15),
      }),
    );
    assert.equal(stat(doc, "percent").value, "96 %");
    assert.equal(stat(doc, "percent").detail, "233 of 242 tasks");
    assert.deepEqual([stat(doc, "features").value, stat(doc, "features").detail], ["2 / 4", "2 in progress"]);
    assert.deepEqual([stat(doc, "open").value, stat(doc, "open").detail], ["9", "across 2 features"]);
    const segs = [...regionHtml(doc, "stats").matchAll(/<a data-key="seg:([^"]+)"[^>]*class="w-pct-(\d+) min-w-\[3px\]"/g)].map((m) => [m[1], Number(m[2])]);
    assert.deepEqual(segs, [
      ["001-a", 51],
      ["002-b", 13],
      ["003-c", 30],
      ["004-d", 6],
    ]);
  });

  test("segments: widths and parts as classes, hover title, labels and legend", async () => {
    const doc = render(await model(MIXED));
    const stats = regionHtml(doc, "stats");
    const segs = [...stats.matchAll(/<a data-key="seg:([^"]+)" data-sig="[^"]*" href="#([^"]+)" class="w-pct-(\d+) min-w-\[3px\]" title="([^"]+)"/g)].map((m) => m.slice(1));
    assert.deepEqual(segs, [
      ["001-alpha", "feature-001-alpha", "46", "001 · Alpha — 30 done, 0 open, 0 next"],
      ["002-beta", "feature-002-beta", "31", "002 · Beta — 10 done, 9 open, 1 next"],
      ["003-gamma", "feature-003-gamma", "23", "003 · Gamma — 0 done, 15 open, 0 next"],
    ]);
    assert.match(stats, /data-key="seg:002-beta"[^>]*><span data-part="done" class="w-pct-50"><\/span><span data-part="open" class="w-pct-45"><\/span><span data-part="next" class="w-pct-5"><\/span><\/a>/);
    assert.deepEqual([...stats.matchAll(/<span class="w-pct-\d+ min-w-\[3px\]">([^<]*)<\/span>/g)].map((m) => m[1]), ["001", "002", "003"]);
    assert.match(stats, /<ul data-part="legend"><li data-state="done">Done<\/li><li data-state="open">Open<\/li><li data-state="next">Next up<\/li><\/ul>/);
  });

  test("a segment too narrow for a label keeps its width but shows no number", async () => {
    const doc = render(
      await model({
        "specs/001-big/tasks.md": ["## Phase 1: W", ...lines(300, 0)].join("\n"),
        "specs/002-small/tasks.md": ["## Phase 1: W", ...lines(5, 0)].join("\n"),
      }),
    );
    const labels = [...regionHtml(doc, "stats").matchAll(/<span class="w-pct-(\d+) min-w-\[3px\]">([^<]*)<\/span>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(labels, [
      ["98", "001"],
      ["2", ""],
    ]);
  });

  test("never emits an inline style attribute (CSP)", async () => {
    for (const files of [MIXED, COMPLETE, { "specs/.gitkeep": "" }]) {
      assert.doesNotMatch(render(await model(files)), /\sstyle=/);
    }
  });

  test("empty project: 0 %, an explanation and no bar", async () => {
    const doc = render(await model({ "specs/.gitkeep": "" }));
    assert.equal(stat(doc, "percent").value, "0 %");
    assert.equal(stat(doc, "percent").detail, "0 of 0 tasks");
    assert.match(regionHtml(doc, "stats"), /data-part="empty">This project has no features yet/);
    assert.doesNotMatch(doc, /data-part="segments"/);
  });

  test("features without tasks: 0 % and an explanation", async () => {
    const doc = render(await model({ "specs/001-x/spec.md": spec("X", []) }));
    assert.match(regionHtml(doc, "stats"), /data-part="empty">No feature has tasks yet/);
    assert.doesNotMatch(doc, /data-part="segments"/);
  });

  test("all complete: 100 %", async () => {
    const doc = render(await model(COMPLETE));
    assert.equal(stat(doc, "percent").value, "100 %");
    assert.equal(stat(doc, "open").value, "0");
  });
});

describe("renderOverview: Up next bar (T027, FR-013)", () => {
  test("next task: ID chip, full text with title, feature › phase, View task link", async () => {
    const doc = render(await model(MIXED));
    const bar = regionHtml(doc, "up-next");
    assert.match(bar, /^data-region="up-next" class="always-dark" aria-label="Up next" data-key="up-next" data-sig="002-beta\/T011">/);
    assert.match(bar, /<span data-part="id" class="chip">T011<\/span>/);
    assert.match(bar, /<span data-part="text" title="List paging">List paging<\/span>/);
    assert.match(bar, /<span data-part="where" title="Beta › Phase 3 · User Story 1">Beta › Phase 3 · User Story 1<\/span>/);
    assert.match(bar, /<a data-part="view-task" class="btn" href="\/features\/002-beta\/index.html#task-002-beta-T011">View task/);
    assert.doesNotMatch(bar, /Open quickstart/);
  });

  test("Open quickstart only when the active feature has a quickstart", async () => {
    const doc = render(await model({ ...MIXED, "specs/002-beta/quickstart.md": "# Quickstart" }));
    assert.match(regionHtml(doc, "up-next"), /<a data-part="quickstart" class="btn" href="\/features\/002-beta\/quickstart.html">Open quickstart<\/a>/);
    const other = render(await model({ ...MIXED, "specs/003-gamma/quickstart.md": "# Quickstart" }));
    assert.doesNotMatch(regionHtml(other, "up-next"), /quickstart/);
  });

  test("text is escaped and kept exactly as written", async () => {
    const files = { "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] T001 <script>alert(1)</script> `code` **b**" };
    const doc = render(await model(files));
    assert.doesNotMatch(doc, /<script>/);
    assert.match(regionHtml(doc, "up-next"), /<span data-part="text" title="&lt;script&gt;alert\(1\)&lt;\/script&gt; `code` \*\*b\*\*">/);
  });

  test("all complete: says so, no task", async () => {
    const doc = render(await model(COMPLETE));
    const bar = regionHtml(doc, "up-next");
    assert.match(bar, /data-empty="complete"/);
    assert.match(bar, /Every task is complete/);
    assert.doesNotMatch(bar, /View task/);
  });

  test("no tasks: says so", async () => {
    for (const files of [{ "specs/.gitkeep": "" }, { "specs/001-x/spec.md": spec("X", []) }]) {
      const bar = regionHtml(render(await model(files)), "up-next");
      assert.match(bar, /data-empty="no-tasks"/);
      assert.match(bar, /No tasks yet/);
    }
  });

  test("an unknown next-task key shows the empty state", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a" });
    p.active = { ...p.active, nextTaskKey: "001-x/T999" };
    assert.match(regionHtml(render(p), "up-next"), /data-empty=/);
  });
});

describe("renderOverview: feature tree (T028)", () => {
  test("features in progress-first order with rank attributes", async () => {
    const doc = render(await model(MIXED));
    const tree = regionHtml(doc, "tree");
    const rows = [...tree.matchAll(/<li data-feature="([^"]+)" data-rank-progress="(\d+)" data-rank-number="(\d+)" data-rank-least="(\d+)" data-rank-name="(\d+)"( data-complete)?>/g)].map((m) => [m[1], ...m.slice(2, 6).map(Number), Boolean(m[6])]);
    assert.deepEqual(rows, [
      ["002-beta", 0, 1, 1, 1, false],
      ["003-gamma", 1, 2, 0, 3, false],
      ["004-delta", 2, 3, 3, 2, false],
      ["001-alpha", 3, 0, 2, 0, true],
    ]);
  });

  test("header controls are hidden until the script runs", async () => {
    const doc = render(await model(MIXED));
    assert.match(doc, /<button type="button" class="btn" data-part="order" data-order="progress" hidden><svg[\s\S]*?<\/svg><span data-part="order-label">In progress first<\/span><\/button>/);
    assert.match(doc, /<div role="group" aria-label="Depth" data-part="depth" hidden><button type="button" class="btn" data-depth="features" aria-pressed="false">Features<\/button><button [^>]*data-depth="phases"[^>]*>Phases<\/button><button [^>]*data-depth="tasks"[^>]*>Tasks<\/button><\/div>/);
    assert.match(doc, /<div data-region="tree" data-keep-scroll="tree" data-filter="all">/);
    assert.deepEqual(ORDER_LABELS, { progress: "In progress first", number: "Number", least: "Least complete", name: "Name A–Z" });
  });

  test("feature rows: dot, number chip, title, pill, mini bar, done/total, feature page link", async () => {
    const doc = render(await model(MIXED));
    assert.equal(summaryOf(doc, "002-beta"), "002|Beta|10 open|10/20");
    assert.equal(summaryOf(doc, "001-alpha"), "001|Alpha|Complete|30/30");
    assert.equal(summaryOf(doc, "003-gamma"), "003|Gamma|Ready|0/15");
    assert.equal(summaryOf(doc, "004-delta"), "004|Delta|Specified");
    const beta = doc.slice(doc.indexOf('<details data-key="002-beta"'));
    const sum = beta.slice(0, beta.indexOf("</summary>"));
    assert.match(sum, /<span data-part="dot" data-status="in-progress"><\/span><span data-part="number" class="chip">002<\/span><span data-part="title" title="Beta">Beta<\/span>/);
    assert.match(sum, /<span data-part="pill" class="pill" data-status="in-progress">10 open<\/span><span data-part="bar"><span class="w-pct-50"><\/span><\/span><span data-part="count">10\/20<\/span>/);
    assert.match(sum, /<a data-part="open-feature" href="\/features\/002-beta\/index.html" aria-label="Open feature page: Beta"/);
    const delta = doc.slice(doc.indexOf('<details data-key="004-delta"'));
    assert.doesNotMatch(delta.slice(0, delta.indexOf("</summary>")), /data-part="bar"/);
  });

  test("no number chip for a folder without a numeric prefix", async () => {
    const doc = render(await model({ "specs/misc/tasks.md": "## Phase 1: P\n- [ ] T001 a" }));
    assert.doesNotMatch(regionHtml(doc, "tree"), /data-part="number"/);
  });

  test("status and data-active: only the active chain is open (001 FR-016)", async () => {
    const doc = render(await model(MIXED));
    assert.match(tagOf(doc, "tree", "001-alpha"), /data-status="done"/);
    assert.match(tagOf(doc, "tree", "002-beta"), /data-status="in-progress"/);
    assert.match(tagOf(doc, "tree", "003-gamma"), /data-status="not-started"/);
    assert.match(tagOf(doc, "tree", "004-delta"), /data-status="no-tasks"/);
    assert.deepEqual(openKeys(doc), ["002-beta", "002-beta/p3"]);
    const active = [...regionHtml(doc, "tree").matchAll(/data-key="([^"]+)"[^>]*data-active/g)].map((m) => m[1]);
    assert.deepEqual(active, ["002-beta", "002-beta/p3"]);
  });

  test("active story group is open when the active phase has groups", async () => {
    const files = {
      "specs/001-x/spec.md": spec("X", [[1, "One", "P1"], [2, "Two", "P2"]]),
      "specs/001-x/tasks.md": ["## Phase 1: Mixed", "- [x] T001 [US1] a", "- [ ] T002 [US2] b", "- [ ] T003 [US1] c"].join("\n"),
    };
    const doc = render(await model(files));
    assert.deepEqual(openKeys(doc), ["001-x", "001-x/p1", "001-x/p1/US1"]);
    assert.equal(summaryOf(doc, "001-x/p1/US2"), "US2|Two|P2|0/1");
  });

  test("phase rows: Phase N, title, priority badge only for one-story phases, done/total and check", async () => {
    const doc = render(await model(MIXED));
    assert.equal(summaryOf(doc, "002-beta/p3"), "Phase 3|User Story 1|P1|3/6");
    assert.equal(summaryOf(doc, "002-beta/p4"), "Phase 4|Mixed|0/7");
    assert.equal(summaryOf(doc, "001-alpha/p2"), "Phase 2|User Story 1|P1|15/15");
    assert.match(tagOf(doc, "tree", "001-alpha/p2"), /data-complete/);
    const p2 = doc.slice(doc.indexOf('data-key="001-alpha/p2"'));
    assert.match(p2.slice(0, p2.indexOf("</summary>")), /<span data-part="count">15\/15<\/span><span data-part="done-mark"><svg[^>]*aria-label="Complete"/);
    assert.match(doc, /<span data-part="priority" data-priority="P1">P1<\/span>/);
  });

  test("an empty phase shows — and no chevron", async () => {
    const files = { "specs/001-x/tasks.md": ["- [ ] T001 early", "## Phase 1: Empty", "## Phase 2: Later", "- [ ] T002 x"].join("\n") };
    const doc = render(await model(files));
    const row = /<div data-key="001-x\/p1"[^>]*data-empty>([\s\S]*?)<\/div>/.exec(doc);
    assert.ok(row);
    assert.match(row[1], /<span data-part="count">—<\/span>/);
    assert.doesNotMatch(row[1], /<svg/);
    assert.equal(summaryOf(doc, "001-x/pu"), "Unphased|0/1");
  });

  test("task rows: mark, ID link to the feature page, raw text with title, NEXT badge, display states", async () => {
    const doc = render(await model(MIXED));
    assert.match(tagOf(doc, "tree", "002-beta/T011"), /^<li data-key="002-beta\/T011" id="task-002-beta-T011" data-state="next" data-sig="[^"]*" data-next>/);
    assert.match(tagOf(doc, "tree", "002-beta/T018"), /data-state="blocked"/);
    assert.match(tagOf(doc, "tree", "002-beta/T010"), /data-state="done"/);
    assert.match(tagOf(doc, "tree", "002-beta/T012"), /data-state="open"/);
    assert.match(doc, /id="task-002-beta-T018" data-state="blocked" data-sig="[^"]*"><span data-part="mark" data-state="blocked" role="img" aria-label="Blocked"><\/span><a data-part="id" href="\/features\/002-beta\/index.html#task-002-beta-T018">T018<\/a><span data-part="text" title="Search box, depends on T011">Search box, depends on T011<\/span><\/li>/);
    assert.equal([...doc.matchAll(/<span data-part="next">NEXT<\/span>/g)].length, 1);
    assert.match(doc, /data-key="002-beta\/T011"[^\n]*?<span data-part="next">NEXT<\/span><\/li>/);
    assert.match(doc, /Shared docs &lt;update&gt;/);
  });

  test("a task without an ID shows No ID as plain text", async () => {
    const doc = render(await model({ "specs/001-x/tasks.md": "## Phase 1: P\n- [x] no id\n- [ ] T002 b" }));
    assert.match(doc, /id="task-001-x-L2" data-state="done"[^>]*><span data-part="mark"[^>]*><\/span><span data-part="id">No ID<\/span>/);
  });

  test("mixed phase: a group per story, unlabeled tasks directly under the phase", async () => {
    const doc = render(await model(MIXED));
    const tree = regionHtml(doc, "tree");
    const p4 = tree.slice(tree.indexOf('data-key="002-beta/p4"'), tree.indexOf('data-key="003-gamma"'));
    assert.match(p4, /<details data-key="002-beta\/p4\/US2"/);
    assert.match(p4, /<details data-key="002-beta\/p4\/US3"/);
    assert.equal(summaryOf(doc, "002-beta/p4/US3"), "US3|Beta search|P3|0/3");
    assert.ok(p4.indexOf('data-key="002-beta/T019"') > p4.indexOf('data-key="002-beta/p4/US3"'));
  });

  test("warning rows: one amber row per group with title, note, line chips and Details; badge on the feature", async () => {
    const tasks = ["## Phase 1: Work"];
    for (let line = 2; line <= 258; line++) {
      const noId = line === 23 || (line >= 254 && line <= 258);
      tasks.push(noId ? "- [ ] no id here" : `- [ ] T${String(line).padStart(3, "0")} task`);
    }
    const doc = render(await model({ "specs/001-odd/tasks.md": tasks.join("\n"), "specs/002-ok/tasks.md": "## Phase 1: P\n- [ ] T001 fine" }));
    const odd = doc.slice(doc.indexOf('<details data-key="001-odd"'));
    const head = odd.slice(0, odd.indexOf('<ul data-part="phases">'));
    assert.match(head, /<span data-part="warnings-badge" class="pill" data-status="warning">6 warnings<\/span>/);
    const rows = [...head.matchAll(/<a data-part="warning" data-code="(W\d+)" href="([^"]+)">([\s\S]*?)<\/a>/g)];
    assert.equal(rows.length, 1);
    assert.equal(rows[0][1], "W1");
    assert.equal(rows[0][2], "/features/001-odd/index.html#warnings");
    assert.equal(text(rows[0][3]), "6 checkboxes without a task ID in tasks.md — counted, not linkable L23 L254–258 Details");
    assert.deepEqual([...rows[0][3].matchAll(/<span class="chip" data-part="line">([^<]+)<\/span>/g)].map((m) => m[1]), ["L23", "L254–258"]);
    const ok = doc.slice(doc.indexOf('<details data-key="002-ok"'));
    assert.doesNotMatch(ok.slice(0, ok.indexOf("</details>")), /data-part="warning"/);
  });

  test("the warnings badge is singular for one warning", async () => {
    const doc = render(await model({ "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] no id\n- [ ] T002 b" }));
    assert.match(doc, />1 warning<\/span>/);
  });

  test("feature without tasks.md says so", async () => {
    const doc = render(await model(MIXED));
    const delta = doc.slice(doc.indexOf('data-key="004-delta"'));
    assert.match(delta, /No tasks\.md yet/);
  });

  test("project-level warnings are shown in the tree region", async () => {
    const files = { ...COMPLETE, ".specify/feature.json": JSON.stringify({ feature_directory: "specs/999-missing" }) };
    const doc = render(await model(files));
    assert.match(regionHtml(doc, "tree"), /\.specify\/feature\.json does not name an existing feature/);
  });

  test("completed items are never open when nothing is active; complete features are marked", async () => {
    const doc = render(await model(COMPLETE));
    assert.deepEqual(openKeys(doc), []);
    assert.doesNotMatch(doc, /data-active/);
    assert.equal([...doc.matchAll(/<li data-feature="[^"]+"[^>]* data-complete>/g)].length, 2);
  });

  test("completed active feature: done, data-active, open, no open phase, no NEXT (001 FR-018)", async () => {
    const files = { ...COMPLETE, ".specify/feature.json": JSON.stringify({ feature_directory: "specs/002-second" }) };
    const doc = render(await model(files));
    const tag = tagOf(doc, "tree", "002-second");
    assert.match(tag, /data-status="done"/);
    assert.match(tag, /data-active open>$/);
    assert.deepEqual(openKeys(doc), ["002-second"]);
    assert.doesNotMatch(doc, /NEXT/);
  });

  test("empty project: no feature rows", async () => {
    const doc = render(await model({ "specs/.gitkeep": "" }));
    assert.doesNotMatch(regionHtml(doc, "tree"), /data-feature=/);
  });

  test("links use the base path", async () => {
    const doc = renderOverview(await model(MIXED), { base: "/repo/" }).value;
    const hrefs = [...regionHtml(doc, "tree").matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length > 0);
    for (const h of hrefs) assert.ok(h.startsWith("/repo/features/"), h);
    assert.match(regionHtml(doc, "up-next"), /href="\/repo\/features\/002-beta\/index.html#task-002-beta-T011"/);
  });
});

describe("renderOverview: task map (T036)", () => {
  test("the tree and the task map sit side by side in one columns wrapper", async () => {
    const doc = render(await model(MIXED));
    assert.match(doc, /<div data-region="columns">\s*<section data-region="features"[\s\S]*<div data-region="tree"[\s\S]*<section data-region="taskmap" data-layout="stacked"[\s\S]*<\/section>\s*<\/div>$/);
    assert.doesNotMatch(doc, /data-region="grid"|data-region="map-column"/);
  });
});

describe("renderOverview: map click targets (T071)", () => {
  const treeIds = (doc) => [...regionHtml(doc, "tree").matchAll(/<li data-key="[^"]+" id="([^"]+)"/g)].map((m) => m[1]);
  const hrefs = (doc) => [...regionHtml(doc, "taskmap").matchAll(/<a data-key="[^"]+"[^>]* href="#([^"]+)"/g)].map((m) => m[1]);

  test("every square's href matches exactly one tree task id", async () => {
    const doc = render(await model(MIXED));
    const ids = treeIds(doc);
    const targets = hrefs(doc);
    assert.equal(targets.length, 65);
    for (const target of targets) assert.equal(ids.filter((id) => id === target).length, 1, target);
    assert.match(tagOf(doc, "tree", "002-beta/T018"), /id="task-002-beta-T018"/);
    assert.match(tagOf(doc, "taskmap", "002-beta/T018"), /href="#task-002-beta-T018"/);
  });

  test("ids are unique for repeated task IDs", async () => {
    const doc = render(await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a\n- [ ] T001 again\n- [ ] T001 third" }));
    const ids = treeIds(doc);
    assert.equal(ids.length, 3);
    assert.equal(new Set(ids).size, 3);
    const targets = hrefs(doc);
    for (const target of targets) assert.equal(ids.filter((id) => id === target).length, 1, target);
    for (const id of ids) assert.match(id, /^task-[A-Za-z0-9_-]+$/);
  });

  test("features get an id for links from the map's bar layout", async () => {
    const doc = render(await model(MIXED));
    assert.match(tagOf(doc, "tree", "002-beta"), /id="feature-002-beta"/);
  });

  test("elementIds replaces unsafe characters and suffixes collisions", () => {
    const ids = elementIds(["a/b@L3", "a-b-L3", "a b.L3", "a/b@L3", "ok_1"], "task-");
    assert.deepEqual(
      [...ids],
      [
        ["a/b@L3", "task-a-b-L3"],
        ["a-b-L3", "task-a-b-L3-2"],
        ["a b.L3", "task-a-b-L3-3"],
        ["ok_1", "task-ok_1"],
      ],
    );
  });
});

describe("renderOverview: links into feature pages (T051)", () => {
  /** Every `features/<dir>/index.html#<anchor>` link of a region. */
  const links = (doc, region) =>
    [...regionHtml(doc, region).matchAll(/href="\/features\/([^/"]+)\/index\.html#(task-[^"]+)"/g)].map((m) => [m[1], m[2]]);

  async function check(files, { region, min }) {
    const m = await model(files);
    const doc = render(m);
    const found = links(doc, region);
    assert.ok(found.length >= min, `${region}: ${found.length} links`);
    const pages = new Map(m.features.map((f) => [f.dir, renderFeaturePage(f, m, { base: "/" }).value]));
    for (const [dir, anchor] of found) {
      const page = pages.get(dir);
      assert.ok(page, dir);
      const rows = [...page.matchAll(new RegExp(`<details[^>]* data-part="task"[^>]* id="${anchor}"`, "g"))];
      assert.equal(rows.length, 1, `${dir}#${anchor} is one task row of the feature page`);
    }
    return found;
  }

  test("Up next View task opens the next task's row on its feature page", async () => {
    const found = await check(MIXED, { region: "up-next", min: 1 });
    assert.deepEqual(found, [["002-beta", "task-002-beta-T011"]]);
  });

  test("every tree task ID links to its own row on its feature page", async () => {
    await check(MIXED, { region: "tree", min: 65 });
  });

  test("repeated task IDs link to distinct rows", async () => {
    const found = await check({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a\n- [ ] T001 again\n- [ ] T001 third" }, { region: "tree", min: 3 });
    assert.equal(new Set(found.map(([, a]) => a)).size, 3);
  });
});

describe("renderOverview: partial models", () => {
  test("a model without sigs, states, artifact or warning lists still renders", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [x] T001 a\n- [ ] T002 [US1] b\n- [ ] T003 [US2] c" });
    delete p.sig;
    delete p.warnings;
    for (const f of p.features) {
      delete f.sig;
      delete f.artifacts;
      for (const ph of f.phases) {
        delete ph.sig;
        for (const g of ph.groups) delete g.sig;
        for (const t of ph.tasks) {
          delete t.sig;
          delete t.state;
        }
      }
    }
    const out = render(p);
    assert.match(out, /<details data-key="001-x" data-sig=""/);
    assert.match(out, /<li data-key="001-x\/T001" id="task-001-x-T001" data-state="done" data-sig=""/);
    assert.match(out, /<a data-key="001-x\/T001" data-sig="" data-state="done" data-parents="001-x 001-x\/p1" href="#task-001-x-T001"/);
  });

  test("project warnings with a line show file:line", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a" });
    p.warnings = [{ code: "W10", file: ".specify/feature.json", line: 3, message: "odd" }];
    assert.match(render(p), /<li>\.specify\/feature\.json:3 odd<\/li>/);
  });

  test("a model without ranks, statuses, display states or overview stats still renders", async () => {
    const p = await model(MIXED);
    delete p.overview;
    for (const f of p.features) {
      delete f.ranks;
      delete f.status;
      delete f.warningGroups;
      for (const ph of f.phases) for (const t of ph.tasks) delete t.display;
    }
    const out = render(p);
    assert.deepEqual([...out.matchAll(/<li data-feature="([^"]+)"/g)].map((m) => m[1]), ["001-alpha", "002-beta", "003-gamma", "004-delta"]);
    assert.match(tagOf(out, "tree", "002-beta"), /data-status="in-progress"/);
    assert.match(tagOf(out, "tree", "002-beta/T011"), /data-state="next"/);
    assert.match(out, /<span data-part="value">62 %<\/span>/);
    assert.doesNotMatch(out, /data-part="segments"/);
  });
});

describe("helpers", () => {
  const phase = (over) => ({ number: 2, title: "Core", tasks: [], groups: [], mergedStory: null, ...over });
  test("phaseHeading", () => {
    assert.equal(phaseHeading(phase()), "Phase 2: Core");
    assert.equal(phaseHeading(phase({ number: null, title: "Unphased" })), "Unphased");
    assert.equal(phaseHeading(phase({ mergedStory: { label: "US1", title: "See it", priority: "P1" } })), "Phase 2 · US1 – See it (P1)");
    assert.equal(phaseHeading(phase({ mergedStory: { label: "US9", title: null, priority: null } })), "Phase 2 · US9 – Core");
  });
  test("groupHeading", () => {
    assert.equal(groupHeading({ label: "US9", story: null }), "US9");
    assert.equal(groupHeading({ label: "US1", story: { label: "US1", title: "A", priority: "P2" } }), "US1 – A (P2)");
    assert.equal(groupHeading({ label: "US1", story: { label: "US1", title: "A", priority: null } }), "US1 – A");
  });
  test("phaseItems places each group at its first task", () => {
    const t = (id, story) => ({ id, story });
    const tasks = [t("T1", null), t("T2", "US2"), t("T3", "US1"), t("T4", null), t("T5", "US2")];
    const groups = [
      { label: "US2", tasks: [tasks[1], tasks[4]] },
      { label: "US1", tasks: [tasks[2]] },
    ];
    const items = phaseItems(phase({ tasks, groups }));
    assert.deepEqual(items.map((i) => (i.task ? i.task.id : i.group.label)), ["T1", "US2", "US1", "T4"]);
    assert.deepEqual(phaseItems(phase({ tasks })).map((i) => i.task.id), ["T1", "T2", "T3", "T4", "T5"]);
  });
  test("featureStatus", () => {
    assert.equal(featureStatus({ stage: "complete" }), "done");
    assert.equal(featureStatus({ stage: "in-progress" }), "in-progress");
    assert.equal(featureStatus({ stage: "ready" }), "not-started");
    for (const stage of ["empty", "specified", "planned"]) assert.equal(featureStatus({ stage }), "no-tasks");
    assert.equal(featureStatus({ stage: "ready", status: "done" }), "done");
  });
});
