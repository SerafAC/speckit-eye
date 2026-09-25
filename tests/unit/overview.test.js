import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  renderOverview,
  phaseHeading,
  groupHeading,
  phaseItems,
  featureStatus,
  elementIds,
  gridLayout,
  GRID_ROWS_THRESHOLD,
  GRID_BARS_THRESHOLD,
} from "../../src/render/overview.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

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

/** The HTML of a region (progress section or tree/grid div). */
function regionHtml(doc, region) {
  const start = doc.indexOf(`data-region="${region}"`);
  assert.ok(start >= 0, `region ${region} present`);
  const rest = doc.slice(start);
  if (region === "tree") return rest.slice(0, rest.indexOf('data-region="grid"'));
  if (region === "progress") return rest.slice(0, rest.indexOf("</section>"));
  return rest;
}

/** The `<summary>` text of the details element with `key`. */
function summaryOf(doc, key) {
  const i = doc.indexOf(`data-key="${key}"`);
  const rest = doc.slice(i);
  const m = /<summary>([\s\S]*?)<\/summary>/.exec(rest);
  return m ? m[1].replace(/<[^>]+>/g, "") : null;
}

const openKeys = (doc) => [...regionHtml(doc, "tree").matchAll(/<details data-key="([^"]+)"[^>]*\sopen>/g)].map((m) => m[1]);

describe("renderOverview: progress section (T022)", () => {
  test("starts with the progress section and draws the bar with <progress>", async () => {
    const doc = render(await model(MIXED));
    assert.match(doc, /^<section data-region="progress">/);
    assert.match(doc, /<progress data-key="project" data-sig="[^"]+" value="40" max="65">/);
    assert.match(regionHtml(doc, "progress"), /40 \/ 65 tasks \(62 %\)/);
  });

  test("never emits an inline style attribute (CSP)", async () => {
    for (const files of [MIXED, COMPLETE, { "specs/.gitkeep": "" }]) {
      assert.doesNotMatch(render(await model(files)), /\sstyle=/);
    }
  });

  test("counters show completed / total for specs, phases and tasks", async () => {
    const doc = render(await model(MIXED));
    const counter = (name) => new RegExp(`data-counter="${name}"[^>]*>[\\s\\S]*?<span data-part="value">([^<]*)</span>`).exec(doc)[1];
    assert.equal(counter("specs"), "1 / 4");
    assert.equal(counter("phases"), "4 / 8");
    assert.equal(counter("tasks"), "40 / 65");
  });

  test("shows the next task with ID and description (FR-017)", async () => {
    const doc = render(await model(MIXED));
    assert.match(regionHtml(doc, "progress"), /Next: <strong>T011<\/strong> · List paging/);
    assert.doesNotMatch(doc, /All tasks are complete/);
  });

  test("all complete without an active feature: message, no next line (FR-018)", async () => {
    const doc = render(await model(COMPLETE));
    assert.match(doc, /value="6" max="6"/);
    assert.match(regionHtml(doc, "progress"), /All tasks are complete/);
    assert.doesNotMatch(doc, /Next:/);
  });

  test("all complete with feature.json: message still shown, no next line", async () => {
    const files = { ...COMPLETE, ".specify/feature.json": JSON.stringify({ feature_directory: "specs/002-second" }) };
    const doc = render(await model(files));
    assert.match(regionHtml(doc, "progress"), /All tasks are complete/);
    assert.doesNotMatch(doc, /Next:/);
  });

  test("no complete message when there are no tasks at all", async () => {
    const doc = render(await model({ "specs/001-x/spec.md": spec("X", []) }));
    assert.doesNotMatch(doc, /All tasks are complete/);
  });

  test("empty project explains itself instead of rendering nothing", async () => {
    const doc = render(await model({ "specs/.gitkeep": "" }));
    assert.match(doc, /value="0" max="0"/);
    assert.match(doc, /0 \/ 0 tasks \(0 %\)/);
    assert.match(doc, /data-part="empty"[^>]*>This project has no features yet/);
  });

  test("escapes task descriptions", async () => {
    const files = { "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] T001 <script>alert(1)</script>" };
    const doc = render(await model(files));
    assert.doesNotMatch(doc, /<script>/);
    assert.match(doc, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });
});

describe("renderOverview: feature tree (T023)", () => {
  test("one details per feature in folder order with title · stage · open/total", async () => {
    const doc = render(await model(MIXED));
    const tree = regionHtml(doc, "tree");
    const features = [...tree.matchAll(/<details data-key="(\d{3}-[a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(features, ["001-alpha", "002-beta", "003-gamma", "004-delta"]);
    assert.equal(summaryOf(tree, "001-alpha"), "Alpha · Complete · 0 open / 30");
    assert.equal(summaryOf(tree, "002-beta"), "Beta · In progress · 10 open / 20");
    assert.equal(summaryOf(tree, "003-gamma"), "Gamma · Ready · 15 open / 15");
    assert.equal(summaryOf(tree, "004-delta"), "Delta · Specified · 0 open / 0");
  });

  test("status per feature and data-active only on the active one", async () => {
    const doc = render(await model(MIXED));
    assert.match(tagOf(doc, "tree", "001-alpha"), /data-status="done"/);
    assert.match(tagOf(doc, "tree", "002-beta"), /data-status="started"/);
    assert.match(tagOf(doc, "tree", "003-gamma"), /data-status="not-started"/);
    assert.match(tagOf(doc, "tree", "004-delta"), /data-status="not-started"/);
    const active = [...regionHtml(doc, "tree").matchAll(/data-key="([^"]+)"[^>]*data-active/g)].map((m) => m[1]);
    assert.deepEqual(active, ["002-beta", "002-beta/p3"]);
  });

  test("only the active feature and phase are open (FR-016)", async () => {
    assert.deepEqual(openKeys(render(await model(MIXED))), ["002-beta", "002-beta/p3"]);
  });

  test("active story group is open when the active phase has groups", async () => {
    const files = {
      "specs/001-x/spec.md": spec("X", [[1, "One", "P1"], [2, "Two", "P2"]]),
      "specs/001-x/tasks.md": ["## Phase 1: Mixed", "- [x] T001 [US1] a", "- [ ] T002 [US2] b", "- [ ] T003 [US1] c"].join("\n"),
    };
    const doc = render(await model(files));
    assert.deepEqual(openKeys(doc), ["001-x", "001-x/p1", "001-x/p1/US1"]);
    assert.match(tagOf(doc, "tree", "001-x/p1/US1"), /data-active/);
    assert.doesNotMatch(tagOf(doc, "tree", "001-x/p1/US2"), /data-active/);
    assert.match(tagOf(doc, "tree", "001-x/p1/US1"), /data-status="started"/);
    assert.equal(summaryOf(doc, "001-x/p1/US2"), "US2 – Two (P2) · 1 open / 1");
  });

  test("merged phase title vs plain phase title (FR-015a)", async () => {
    const doc = render(await model(MIXED));
    assert.equal(summaryOf(doc, "002-beta/p3"), "Phase 3 · US1 – Beta listing (P1) · 3 open / 6");
    assert.equal(summaryOf(doc, "002-beta/p1"), "Phase 1: Setup · 0 open / 7");
    assert.equal(summaryOf(doc, "002-beta/p4"), "Phase 4: Mixed · 7 open / 7");
  });

  test("mixed phase: a group per story, unlabeled tasks directly under the phase", async () => {
    const doc = render(await model(MIXED));
    const tree = regionHtml(doc, "tree");
    const p4 = tree.slice(tree.indexOf('data-key="002-beta/p4"'), tree.indexOf('data-key="003-gamma"'));
    assert.match(p4, /<details data-key="002-beta\/p4\/US2"/);
    assert.match(p4, /<details data-key="002-beta\/p4\/US3"/);
    assert.equal(summaryOf(doc, "002-beta/p4/US3"), "US3 – Beta search (P3) · 3 open / 3");
    // T019 (unlabeled) sits after the US3 group closes, directly in the phase list.
    assert.match(p4, /<\/details><\/li><li data-key="002-beta\/T019"/);
    assert.ok(p4.indexOf('data-key="002-beta/T019"') > p4.indexOf('data-key="002-beta/p4/US3"'));
    assert.match(p4, /Shared docs &lt;update&gt;/);
  });

  test("tasks carry data-key, data-state and a next mark on the current task", async () => {
    const doc = render(await model(MIXED));
    assert.match(tagOf(doc, "tree", "002-beta/T011"), /^<li [^>]*data-state="current"/);
    assert.match(tagOf(doc, "tree", "002-beta/T018"), /data-state="blocked"/);
    assert.match(tagOf(doc, "tree", "002-beta/T010"), /data-state="completed"/);
    assert.match(tagOf(doc, "tree", "002-beta/T012"), /data-state="future"/);
    const nextMarks = [...doc.matchAll(/<span data-part="next">next<\/span>/g)];
    assert.equal(nextMarks.length, 1);
    assert.match(doc, /data-key="002-beta\/T011"[^>]*>[^\n]*?<span data-part="next">next<\/span><\/li>/);
  });

  test("feature without tasks.md says so", async () => {
    const doc = render(await model(MIXED));
    const delta = doc.slice(doc.indexOf('data-key="004-delta"'));
    assert.match(delta, /No tasks\.md yet/);
  });

  test("warnings are listed on their feature as file:line message (FR-019)", async () => {
    const files = {
      "specs/001-odd/tasks.md": ["## Phase 1: P", "- [ ] no id here", "- [ ] T002 [US9] x"].join("\n"),
      "specs/002-ok/tasks.md": "## Phase 1: P\n- [ ] T001 fine",
    };
    const doc = render(await model(files));
    const odd = doc.slice(doc.indexOf('data-key="001-odd"'), doc.indexOf('data-key="002-ok"'));
    assert.match(odd, /<ul data-part="warnings"><li>specs\/001-odd\/tasks\.md:2 checkbox without a task ID \(counted\)<\/li>/);
    assert.match(odd, /specs\/001-odd\/tasks\.md:3 story label US9 has no matching user story in spec\.md/);
    assert.match(summaryOf(doc, "001-odd"), /2 warnings$/);
    const ok = doc.slice(doc.indexOf('data-key="002-ok"'));
    assert.doesNotMatch(ok.slice(0, ok.indexOf("</details>")), /data-part="warnings"/);
  });

  test("warning without a line shows only the file", async () => {
    const doc = render(await model({ "specs/001-x/tasks.md": "# nothing" }));
    assert.match(doc, /<li>specs\/001-x\/tasks\.md tasks\.md contains no tasks<\/li>/);
  });

  test("project-level warnings are shown in the tree region", async () => {
    const files = { ...COMPLETE, ".specify/feature.json": JSON.stringify({ feature_directory: "specs/999-missing" }) };
    const doc = render(await model(files));
    assert.match(regionHtml(doc, "tree"), /\.specify\/feature\.json does not name an existing feature/);
  });

  test("completed items are never open when nothing is active", async () => {
    assert.deepEqual(openKeys(render(await model(COMPLETE))), []);
    assert.doesNotMatch(render(await model(COMPLETE)), /data-active/);
  });

  test("completed active feature: done, data-active, open, no open phase, no next mark (FR-018)", async () => {
    const files = { ...COMPLETE, ".specify/feature.json": JSON.stringify({ feature_directory: "specs/002-second" }) };
    const doc = render(await model(files));
    const tag = tagOf(doc, "tree", "002-second");
    assert.match(tag, /data-status="done"/);
    assert.match(tag, /data-active/);
    assert.match(tag, /\sopen>$/);
    assert.deepEqual(openKeys(doc), ["002-second"]);
    assert.doesNotMatch(doc, /data-part="next"/);
    assert.doesNotMatch(tagOf(doc, "tree", "001-first"), /data-active|\sopen/);
  });

  test("unphased phase and phases without tasks", async () => {
    const files = { "specs/001-x/tasks.md": ["- [ ] T001 early", "## Phase 1: Empty", "## Phase 2: Later", "- [ ] T002 x"].join("\n") };
    const doc = render(await model(files));
    assert.equal(summaryOf(doc, "001-x/pu"), "Unphased · 1 open / 1");
    assert.match(doc.slice(doc.indexOf('data-key="001-x/p1"')), /^[^]*?No tasks in this phase\./);
  });
});

/** The HTML inside the feature `<details>` with `dir`, up to its phases list. */
function featureHead(doc, dir) {
  const start = doc.indexOf(`<details data-key="${dir}"`);
  assert.ok(start >= 0, `feature ${dir} present`);
  const rest = doc.slice(start);
  const end = rest.search(/<ul data-part="phases">|<p data-part="no-tasks">/);
  return rest.slice(0, end);
}

const hrefs = (part) => [...part.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

const FULL = {
  "specs/001-full/tasks.md": "## Phase 1: Setup\n- [ ] T001 one",
  "specs/001-full/checklists/requirements.md": "# Requirements\n- [x] CHK001 x",
  "specs/001-full/run-log.md": "# Run Log",
  "specs/001-full/quickstart.md": "# Quickstart",
  "specs/001-full/contracts/cli.md": "# CLI <Contract>",
  "specs/001-full/spec.md": "# Feature Specification: Full",
  "specs/001-full/data-model.md": "# Data Model",
  "specs/001-full/decisions.md": "# Decisions",
  "specs/001-full/plan.md": "# Plan",
  "specs/001-full/research.md": "# Research",
  "specs/002-partial/spec.md": "# Feature Specification: Partial",
  "specs/002-partial/plan.md": "# Partial plan",
};

describe("renderOverview: artifact links (T049, US3)", () => {
  test("every present artifact is linked inside its feature, in data-model order, above the phases (AC1)", async () => {
    const doc = render(await model(FULL));
    const head = featureHead(doc, "001-full");
    assert.match(head, /<\/summary>\n<ul data-part="artifacts">/);
    assert.deepEqual(hrefs(head), [
      "/features/001-full/spec.html",
      "/features/001-full/plan.html",
      "/features/001-full/research.html",
      "/features/001-full/data-model.html",
      "/features/001-full/quickstart.html",
      "/features/001-full/tasks.html",
      "/features/001-full/contracts/cli.html",
      "/features/001-full/checklists/requirements.html",
      "/features/001-full/decisions.html",
      "/features/001-full/run-log.html",
    ]);
    assert.match(head, /<a href="\/features\/001-full\/contracts\/cli.html" data-kind="contract">CLI &lt;Contract&gt;<\/a>/);
    assert.ok(doc.indexOf('data-part="artifacts"') < doc.indexOf('data-part="phases"'));
  });

  test("no link for missing artifacts (AC5)", async () => {
    const head = featureHead(render(await model(FULL)), "002-partial");
    assert.deepEqual(hrefs(head), ["/features/002-partial/spec.html", "/features/002-partial/plan.html"]);
    assert.doesNotMatch(head, /research|tasks\.html/);
  });

  test("a feature with no Markdown files has no artifact list", async () => {
    const doc = render(await model({ "specs/001-x/notes.txt": "x" }));
    assert.doesNotMatch(featureHead(doc, "001-x"), /data-part="artifacts"/);
  });

  test("links use the base path", async () => {
    const doc = renderOverview(await model(FULL), { base: "/repo/" }).value;
    for (const h of hrefs(featureHead(doc, "001-full"))) assert.ok(h.startsWith("/repo/features/001-full/"), h);
  });

  test("checklist checkboxes do not count as tasks", async () => {
    const doc = render(await model(FULL));
    assert.match(regionHtml(doc, "progress"), /0 \/ 1 tasks/);
  });
});

describe("renderOverview: task grid (T024)", () => {
  test("one square per task in tree order with state, parents and title", async () => {
    const doc = render(await model(MIXED));
    const grid = regionHtml(doc, "grid");
    const cells = [...grid.matchAll(/<a href="[^"]*" data-key="([^"]+)"[^>]*>/g)];
    assert.equal(cells.length, 65);
    const beta = cells.map((m) => m[1]).filter((k) => k.startsWith("002-beta/T0")).slice(13);
    // Phase 4: US2 group, then US3 group (T017, T018, T020), then the unlabeled T019.
    assert.deepEqual(beta, ["002-beta/T014", "002-beta/T015", "002-beta/T016", "002-beta/T017", "002-beta/T018", "002-beta/T020", "002-beta/T019"]);
  });

  test("cell attributes", async () => {
    const doc = render(await model(MIXED));
    const cell = tagOf(doc, "grid", "002-beta/T018");
    assert.match(cell, /data-state="blocked"/);
    assert.match(cell, /data-parents="002-beta 002-beta\/p4 002-beta\/p4\/US3"/);
    assert.match(cell, /title="T018 · Search box, depends on T011 — Beta › Phase 4: Mixed"/);
    const current = tagOf(doc, "grid", "002-beta/T011");
    assert.match(current, /data-state="current"/);
    assert.match(current, /data-parents="002-beta 002-beta\/p3"/);
    assert.match(current, /title="T011 · List paging — Beta › Phase 3 · US1 – Beta listing \(P1\)"/);
    assert.match(tagOf(doc, "grid", "001-alpha/T001"), /data-state="completed"/);
    assert.match(tagOf(doc, "grid", "003-gamma/T001"), /data-state="future"/);
    assert.match(tagOf(doc, "grid", "002-beta/T019"), /data-parents="002-beta 002-beta\/p4"/);
  });

  test("escapes the title", async () => {
    const doc = render(await model(MIXED));
    assert.match(tagOf(doc, "grid", "002-beta/T019"), /title="T019 · Shared docs &lt;update&gt; — /);
  });

  test("empty grid for an empty project", async () => {
    const doc = render(await model({ "specs/.gitkeep": "" }));
    assert.match(doc, /<div data-region="grid"><\/div>/);
  });

  test("the tree and the grid sit side by side in one columns wrapper", async () => {
    const doc = render(await model(MIXED));
    assert.match(doc, /<div data-region="columns">\s*<div data-region="tree">[\s\S]*<div data-region="grid">[\s\S]*<\/div>\s*<\/div>$/);
  });
});

describe("renderOverview: grid click targets (T071)", () => {
  const treeIds = (doc) => [...regionHtml(doc, "tree").matchAll(/<li data-key="[^"]+"[^>]* id="([^"]+)"/g)].map((m) => m[1]);
  const hrefs = (doc) => [...regionHtml(doc, "grid").matchAll(/<a href="#([^"]+)" data-key/g)].map((m) => m[1]);

  test("every square's href matches exactly one tree task id", async () => {
    const doc = render(await model(MIXED));
    const ids = treeIds(doc);
    const targets = hrefs(doc);
    assert.equal(targets.length, 65);
    for (const target of targets) assert.equal(ids.filter((id) => id === target).length, 1, target);
    assert.match(tagOf(doc, "tree", "002-beta/T018"), /id="task-002-beta-T018"/);
    assert.match(tagOf(doc, "grid", "002-beta/T018"), /href="#task-002-beta-T018"/);
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

  test("features get an id for links from the bar layout", async () => {
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

describe("renderOverview: large grids (T073)", () => {
  /** A project with `n` tasks spread over features of at most 400 tasks. */
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
  const gridOpen = (doc) => /<div data-region="grid"[^>]*>/.exec(doc)[0];

  test("thresholds and gridLayout", () => {
    assert.equal(GRID_ROWS_THRESHOLD, 1000);
    assert.equal(GRID_BARS_THRESHOLD, 5000);
    assert.equal(gridLayout(0), "single");
    assert.equal(gridLayout(1000), "single");
    assert.equal(gridLayout(1001), "rows");
    assert.equal(gridLayout(5000), "rows");
    assert.equal(gridLayout(5001), "bars");
  });

  test("1,000 tasks keep the single grid", async () => {
    const doc = await big(1000);
    assert.equal(gridOpen(doc), '<div data-region="grid">');
    assert.equal([...regionHtml(doc, "grid").matchAll(/<a href=/g)].length, 1000);
    assert.doesNotMatch(regionHtml(doc, "grid"), /data-part="row"/);
  });

  test("1,001 tasks give one row per feature with its squares", async () => {
    const doc = await big(1001);
    assert.equal(gridOpen(doc), '<div data-region="grid" data-layout="rows">');
    const grid = regionHtml(doc, "grid");
    const rows = grid.split('<div data-part="row">').slice(1);
    assert.equal(rows.length, 3); // 400 + 400 + 201; the feature without tasks has no row
    assert.match(rows[0], /^<span data-part="label">001-f<\/span><div data-part="cells">/);
    assert.equal([...rows[2].matchAll(/<a href="#task-003-f-T\d+" data-key="003-f\/T\d+" data-sig="[^"]*" data-state="\w+" data-parents="003-f 003-f\/p1" title="[^"]+"><\/a>/g)].length, 201);
    assert.equal([...grid.matchAll(/<a href=/g)].length, 1001);
  });

  test("5,001 tasks give one progress bar per feature linking to its tree item", async () => {
    const doc = await big(5001);
    assert.equal(gridOpen(doc), '<div data-region="grid" data-layout="bars">');
    const grid = regionHtml(doc, "grid");
    assert.doesNotMatch(grid, /data-state=/);
    const bars = [...grid.matchAll(/<a data-part="bar" href="#([^"]+)"><span data-part="label">([^<]+)<\/span><progress data-key="([^"]+)" value="(\d+)" max="(\d+)">/g)];
    assert.equal(bars.length, 13);
    assert.deepEqual(bars[0].slice(1), ["feature-001-f", "001-f · 200 / 400", "001-f", "200", "400"]);
    assert.deepEqual(bars[12].slice(1), ["feature-013-f", "013-f · 100 / 201", "013-f", "100", "201"]);
    assert.match(tagOf(doc, "tree", "001-f"), /id="feature-001-f"/);
  });

  test("no layout uses an inline style attribute (CSP)", async () => {
    for (const n of [10, 1001, 5001]) assert.doesNotMatch(await big(n), /\sstyle=/);
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
    assert.match(out, /<progress data-key="project" data-sig=""/);
    assert.match(out, /<details data-key="001-x" data-sig=""/);
    assert.match(out, /<li data-key="001-x\/T001" data-sig="" data-state="future"/);
    assert.match(out, /<a href="#task-001-x-T001" data-key="001-x\/T001" data-sig="" data-state="future"/);
    assert.doesNotMatch(out, /data-part="artifacts"/);
  });

  test("project warnings with a line show file:line", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a" });
    p.warnings = [{ code: "W10", file: ".specify/feature.json", line: 3, message: "odd" }];
    assert.match(render(p), /<li>\.specify\/feature\.json:3 odd<\/li>/);
  });

  test("a next-task key that matches no task shows no next line", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a" });
    const before = render(p);
    assert.match(before, /data-part="next"/);
    p.active = { ...p.active, nextTaskKey: "001-x/T999" };
    assert.doesNotMatch(render(p), /data-part="next"/);
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
    assert.equal(featureStatus({ stage: "in-progress" }), "started");
    for (const stage of ["empty", "specified", "planned", "ready"]) assert.equal(featureStatus({ stage }), "not-started");
  });
});
