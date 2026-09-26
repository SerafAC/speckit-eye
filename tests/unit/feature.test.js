import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderFeaturePage, phaseCounts, phaseIds, openPhaseKey, emptyStageText } from "../../src/render/feature.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

async function model(files) {
  return buildModel(await scan(createFakeReader(files), "proj"));
}

const FILES = {
  "specs/001-done/spec.md": "# Feature Specification: Done <b>thing</b>",
  "specs/001-done/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n## Phase 2: Core\n- [x] T002 two",
  "specs/002-mid/spec.md": "# Feature Specification: Middle",
  "specs/002-mid/plan.md": "# Plan",
  "specs/002-mid/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n## Phase 2: Core\n- [ ] T002 two\n- [ ] T003 three\n## Phase 3: Empty\n",
  "specs/003-bare/spec.md": "# Feature Specification: Bare",
};

const render = async (dir, base = "/") => {
  const m = await model(FILES);
  const f = m.features.find((x) => x.dir === dir);
  return renderFeaturePage(f, m, { base }).value;
};

describe("renderFeaturePage (T022, FR-030)", () => {
  test("header: breadcrumb, status pill, dir, title and counts", async () => {
    const out = await render("002-mid", "/repo/");
    assert.match(out, /^<header data-region="feature-head">/);
    assert.match(out, /<nav data-part="breadcrumb" aria-label="Breadcrumb"><a href="\/repo\/index\.html">Overview<\/a> <span data-part="sep">\/<\/span> <span>Features<\/span><\/nav>/);
    // 002-mid is the active feature, so its pill says "N open".
    assert.match(out, /<span class="pill" data-status="in-progress">2 open<\/span> <code>002-mid<\/code>/);
    assert.match(out, /<h1>Middle<\/h1>/);
    assert.match(out, /1 \/ 3 tasks · 1 of 2 phases/);
  });

  test("a complete feature and a feature without tasks", async () => {
    const done = await render("001-done");
    assert.match(done, /<span class="pill" data-status="done">Complete<\/span>/);
    assert.match(done, /2 \/ 2 tasks · 2 of 2 phases/);
    assert.match(done, /<h1>Done &lt;b&gt;thing&lt;\/b&gt;<\/h1>/);
    const bare = await render("003-bare");
    assert.match(bare, /<span class="pill" data-status="no-tasks">Specified<\/span>/);
    assert.match(bare, /0 \/ 0 tasks · 0 of 0 phases/);
  });

  test("phaseCounts counts only phases with tasks", async () => {
    const m = await model(FILES);
    assert.deepEqual(phaseCounts(m.features[1]), { completed: 1, total: 2 });
    assert.deepEqual(phaseCounts({ phases: undefined }), { completed: 0, total: 0 });
  });
});

const FULL = {
  "specs/001-full/spec.md": "# Feature Specification: Full",
  "specs/001-full/plan.md": "# Plan",
  "specs/001-full/research.md": "# Research",
  "specs/001-full/data-model.md": "# Data model",
  "specs/001-full/quickstart.md": "# Quickstart",
  "specs/001-full/contracts/a.md": "# Contract A",
  "specs/001-full/contracts/b.md": "# Contract B",
  "specs/001-full/contracts/c.md": "# Contract C",
  "specs/001-full/contracts/d.md": "# Contract D",
  "specs/001-full/checklists/requirements.md": "# Requirements checklist",
  "specs/001-full/decisions.md": "# Decisions",
  "specs/001-full/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n## Phase 2: Core\n- [ ] T002 two",
  "specs/002-two/spec.md": "# Feature Specification: Two",
  "specs/002-two/checklists/requirements.md": "# R",
  "specs/002-two/checklists/ux.md": "# UX",
  "specs/002-two/tasks.md": "## Phase 1: Only\n- [x] T001 one",
};

const renderOf = async (files, dir, base = "/") => {
  const m = await model(files);
  const f = m.features.find((x) => x.dir === dir);
  return renderFeaturePage(f, m, { base }).value;
};

const tabLabels = (out) => {
  const nav = out.slice(out.indexOf('<nav data-region="tabs"'), out.indexOf('<section data-region="tasks"'));
  return [...nav.matchAll(/data-part="tab"[^>]*>(.*?)<\/(?:a|summary)>/g)].map((m) => m[1].replace(/<[^>]*>/g, ""));
};

describe("feature page header and ring (T047, FR-030)", () => {
  test("in progress: pill, counts and a ring at the percentage", async () => {
    const out = await renderOf(FULL, "001-full");
    assert.match(out, /1 \/ 2 tasks · 1 of 2 phases/);
    assert.match(out, /<div data-part="ring" data-complete="false">/);
    assert.match(out, /stroke-dasharray="50 100"/);
    assert.match(out, /<span data-part="ring-label">50 %<\/span>/);
  });

  test("complete: Complete pill, full ring and a check mark", async () => {
    const out = await renderOf(FULL, "002-two");
    assert.match(out, /<span class="pill" data-status="done">Complete<\/span> <code>002-two<\/code>/);
    assert.match(out, /1 \/ 1 tasks · 1 of 1 phases/);
    assert.match(out, /data-complete="true"/);
    assert.match(out, /stroke-dasharray="100 100"/);
    assert.match(out, /<span data-part="ring-label"><svg[^>]*aria-label="Complete"/);
  });
});

describe("document tabs (T047, FR-031, FR-008)", () => {
  test("the full tab set in order, Tasks current", async () => {
    const out = await renderOf(FULL, "001-full", "/repo/");
    assert.deepEqual(tabLabels(out), [
      "Tasks 2",
      "Specification",
      "Plan",
      "Research",
      "Data model",
      "Quickstart",
      "Contracts 4",
      "Quality checklist",
      "More 1",
    ]);
    assert.match(out, /<a data-part="tab" href="\/repo\/features\/001-full\/index\.html" aria-current="page">Tasks <span data-part="count">2<\/span><\/a>/);
    assert.match(out, /<a data-part="tab" href="\/repo\/features\/001-full\/research\.html">Research<\/a>/);
    assert.match(out, /<a data-part="tab" href="\/repo\/features\/001-full\/checklists\/requirements\.html">Quality checklist<\/a>/);
  });

  test("Contracts 4 is a menu listing its documents without a navigation", async () => {
    const out = await renderOf(FULL, "001-full", "/repo/");
    const menu = out.slice(out.indexOf('<details data-part="tab-menu">'), out.indexOf("</details>", out.indexOf('<details data-part="tab-menu">')));
    assert.match(menu, /<summary data-part="tab">Contracts <span data-part="count">4<\/span><\/summary>/);
    assert.equal([...menu.matchAll(/<a href="\/repo\/features\/001-full\/contracts\/[a-d]\.html">Contract [A-D]<\/a>/g)].length, 4);
  });

  test("no Research tab without research.md; Checklists 2 for several checklists", async () => {
    const out = await renderOf(FULL, "002-two");
    assert.deepEqual(tabLabels(out), ["Tasks 1", "Specification", "Checklists 2"]);
  });

  test("a feature without tasks.md still has its Tasks tab", async () => {
    assert.deepEqual(tabLabels(await render("003-bare")), ["Tasks 0", "Specification"]);
  });
});

const TASKS = {
  "specs/001-x/spec.md": "# Feature Specification: X\n### User Story 1 - List (Priority: P1)",
  "specs/001-x/tasks.md": [
    "# Tasks", // 1
    "## Phase 1: Setup", // 2
    "- [x] T001 Create `src/list.go`", // 3
    "- [x] Checkbox without ID", // 4
    "## Phase 2: Empty", // 5
    "## Phase 3: User Story 1 - List (Priority: P1)", // 6
    "- [ ] T002 [US1] Write `src/list_test.go` for FR-001", // 7
    "- [ ] T003 [P] [US1] Build `web/List.vue` and `src/list.go`, depends on T002", // 8
    "- [ ] T004 [US1] Plain <b>task</b>", // 9
  ].join("\n"),
};

describe("Tasks tab (T048, FR-032 to FR-036)", () => {
  test("rail: one block per phase with w-pct classes, short names, counts; empty phase not openable", async () => {
    const out = await renderOf(TASKS, "001-x");
    const rail = out.slice(out.indexOf('<nav data-part="rail"'), out.indexOf("</nav>", out.indexOf('<nav data-part="rail"')));
    assert.match(rail, /<a data-part="block" href="#phase-1" class="w-pct-40" data-status="done" data-phase-key="001-x\/p1" title="Phase 1: Setup · 2 tasks"><span data-part="short">P1<\/span><span data-part="count">2<\/span><\/a>/);
    assert.match(rail, /<span data-part="block" class="w-pct-0" data-status="empty" data-empty title="Phase 2: Empty · 0 tasks"><span data-part="short">P2<\/span><span data-part="count">0<\/span><\/span>/);
    assert.match(rail, /href="#phase-3" class="w-pct-60" data-status="not-started"[^>]* aria-current="true">/);
    assert.match(out, /<p data-part="caption">Width = task count · Selected: <span data-part="selected">Phase 3: User Story 1 - List \(Priority: P1\)<\/span><\/p>/);
  });

  test("the active phase is open, the others closed; the empty phase has no details", async () => {
    const out = await renderOf(TASKS, "001-x");
    assert.match(out, /<details name="phases" data-part="phase" data-key="001-x\/p1" id="phase-1" data-status="done"[^>]*>/);
    assert.doesNotMatch(out.match(/<details name="phases"[^>]*id="phase-1"[^>]*>/)[0], / open/);
    assert.match(out, /<details name="phases"[^>]*id="phase-3"[^>]* open>/);
    assert.match(out, /<div data-part="phase" data-key="001-x\/p2" id="phase-2" data-status="empty" data-empty>/);
    assert.match(out, /<span data-part="priority" data-priority="P1">P1<\/span>/);
  });

  test("no phase is open when the feature has no open tasks", async () => {
    const out = await renderOf(FULL, "002-two");
    assert.doesNotMatch(out, /<details name="phases"[^>]* open>/);
    assert.match(out, /Selected: <span data-part="selected">None<\/span>/);
  });

  test("task rows carry the attributes the browser module needs", async () => {
    const out = await renderOf(TASKS, "001-x", "/repo/");
    const row = out.match(/<details data-part="task" data-key="001-x\/T003"[^>]*>/)[0];
    assert.match(row, / id="task-001-x-T003"/);
    assert.match(row, / data-state="blocked"/);
    assert.match(row, / data-id="T003"/);
    assert.match(row, / data-kind="Vue"/);
    assert.doesNotMatch(row, / data-test/);
    assert.match(row, / data-files="web\/List\.vue src\/list\.go"/);
    assert.match(row, / data-text="t003 build `web\/list\.vue` and `src\/list\.go`, depends on t002"/);
    assert.match(row, / data-waiting-on="T002"/);
    assert.match(row, / data-line="8"/);
    assert.match(row, / data-phase="Phase 3: User Story 1 - List \(Priority: P1\)"/);
    const test2 = out.match(/<details data-part="task" data-key="001-x\/T002"[^>]*>/)[0];
    assert.match(test2, / data-kind="Go" data-test /);
    assert.match(test2, / data-state="next"/);
  });

  test("row summary: mark, ID, formatted text, kind and file chips; body with markers", async () => {
    const out = await renderOf(TASKS, "001-x");
    const row = out.slice(out.indexOf('data-key="001-x/T003"'), out.indexOf("</details>", out.indexOf('data-key="001-x/T003"')));
    assert.match(row, /<span data-part="mark" data-state="blocked" role="img" aria-label="Blocked"><\/span><span data-part="id">T003<\/span>/);
    assert.match(row, /<code class="chip" data-part="code">web\/List\.vue<\/code>/);
    assert.match(row, /<span class="chip" data-part="kind" title="Vue">Vue<\/span><span class="chip" data-part="file" title="web\/List\.vue\nsrc\/list\.go">2 files<\/span><\/summary>/);
    assert.match(row, /<li class="tag" data-marker="story">US1<\/li><li class="tag" data-marker="parallel">Parallel<\/li>/);
    assert.match(row, /depends on T002/);
    const plain = out.slice(out.indexOf('data-key="001-x/T004"'), out.indexOf("</details>", out.indexOf('data-key="001-x/T004"')));
    assert.match(plain, /Plain &lt;b&gt;task&lt;\/b&gt;/);
    assert.match(plain, /<span class="chip" data-part="kind" data-empty><\/span><span class="chip" data-part="file" data-empty><\/span>/);
  });

  test("a checkbox without an ID shows No ID and has no address", async () => {
    const out = await renderOf(TASKS, "001-x");
    const row = out.match(/<details data-part="task" data-key="001-x\/L4"[^>]*>/)[0];
    assert.doesNotMatch(row, / id=/);
    assert.match(out, /<span data-part="id">No ID<\/span>/);
  });

  test("filter bar: hidden, All/Open/Tests and one chip per kind, with counts", async () => {
    const out = await renderOf(TASKS, "001-x");
    const bar = out.slice(out.indexOf('<div data-part="filters"'), out.indexOf("</div>", out.indexOf('<input type="search"')));
    assert.match(bar, /^<div data-part="filters" hidden>/);
    const chips = [...bar.matchAll(/data-filter-chip="([^"]+)" aria-pressed="(true|false)">([^<]*) <span data-part="count">(\d+)<\/span>/g)].map((m) => [m[1], m[3], Number(m[4]), m[2]]);
    assert.deepEqual(chips, [
      ["all", "All", 5, "true"],
      ["open", "Open", 3, "false"],
      ["tests", "Tests", 1, "false"],
      ["kind:Go", "Go", 2, "false"],
      ["kind:Vue", "Vue", 1, "false"],
    ]);
    assert.match(bar, /<input type="search" data-part="text-filter"/);
    assert.match(bar, /Expand all.*Collapse all/);
  });

  test("list, no-match message, hidden detail panel and the tasks.md link", async () => {
    const out = await renderOf(TASKS, "001-x", "/repo/");
    assert.match(out, /<div data-part="list" data-keep-scroll="tasks">/);
    assert.match(out, /<p data-part="no-match" hidden>No tasks match the filters\. <button type="button" data-part="clear">Clear filters<\/button><\/p>/);
    assert.match(out, /<aside data-region="detail" aria-label="Task details" data-source="\/repo\/features\/001-x\/tasks\.html" hidden>/);
    assert.match(out, /<a data-part="source-line" href="\/repo\/features\/001-x\/tasks\.html">View source line<\/a>/);
    assert.match(out, /<a data-part="source" href="\/repo\/features\/001-x\/tasks\.html">/);
    assert.doesNotMatch(out, /style=/);
  });

  test("warnings banner with line chips and Show lines", async () => {
    const out = await renderOf(TASKS, "001-x");
    const banner = out.slice(out.indexOf('<section id="warnings"'), out.indexOf("</section>", out.indexOf('<section id="warnings"')));
    assert.match(banner, /^<section id="warnings" data-part="warnings" aria-label="Warnings">/);
    assert.match(banner, /1 checkbox without a task ID in tasks\.md/);
    assert.match(banner, /<span class="chip" data-part="line">L4<\/span>/);
    assert.match(banner, /<details data-part="show-lines"><summary>Show lines<\/summary><ol><li><span data-part="line-no">L4<\/span> <code>- \[x\] Checkbox without ID<\/code><\/li><\/ol><\/details>/);
  });

  test("no banner without warnings", async () => {
    assert.doesNotMatch(await renderOf(FULL, "002-two"), /id="warnings"/);
  });

  test("a feature without tasks.md explains its stage", async () => {
    const out = await render("003-bare");
    assert.match(out, /<section data-region="tasks" aria-label="Tasks"><p data-part="empty-stage">Specified: this feature has a specification but no plan or tasks\.md yet\.<\/p><\/section>/);
    assert.doesNotMatch(out, /data-part="rail"/);
    assert.equal(emptyStageText({ hasTasks: true, stage: "ready" }), "tasks.md has no tasks yet.");
    assert.match(emptyStageText({ hasTasks: false, stage: "planned" }), /^Planned:/);
    assert.match(emptyStageText({ hasTasks: false, stage: "empty" }), /^Empty:/);
  });

  test("phaseIds: phase-<n>, phase-u, and suffixes for repeated numbers", () => {
    assert.deepEqual(phaseIds([{ number: 1 }, { number: 2 }, { number: 2 }, { number: null }]), ["phase-1", "phase-2", "phase-2-2", "phase-u"]);
  });

  test("openPhaseKey: first phase with open tasks for a non-active feature", async () => {
    const m = await model(FILES);
    const f = m.features.find((x) => x.dir === "002-mid");
    assert.equal(openPhaseKey(f, { ...m, active: { featureDir: "other" } }), "002-mid/p2");
    assert.equal(openPhaseKey(m.features[0], m), null);
  });
});
