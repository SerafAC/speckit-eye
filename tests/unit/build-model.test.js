import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildModel, makeCounts, deriveStage } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

async function model(files, options) {
  return buildModel(await scan(createFakeReader(files, options), "proj"));
}

/** n task lines, the first `done` of them checked, ids starting at `start`. */
function taskLines(n, done, { start = 1, label = "" } = {}) {
  return Array.from({ length: n }, (_, i) => {
    const id = `T${String(start + i).padStart(3, "0")}`;
    return `- [${i < done ? "x" : " "}] ${id}${label ? ` [${label}]` : ""} task ${id}`;
  });
}

const SPEC = [
  "# Feature Specification: Shiny Feature",
  "### User Story 1 - First (Priority: P1)",
  "### User Story 2 - Second (Priority: P2)",
].join("\n");

describe("makeCounts", () => {
  test("40/65 → 62 %", () => assert.deepEqual(makeCounts(40, 65), { done: 40, total: 65, open: 25, percent: 62 }));
  test("199/200 → 99 % (capped while open)", () => assert.equal(makeCounts(199, 200).percent, 99));
  test("200/200 → 100 %", () => assert.equal(makeCounts(200, 200).percent, 100));
  test("0/0 → 0 %", () => assert.deepEqual(makeCounts(0, 0), { done: 0, total: 0, open: 0, percent: 0 }));
  test("1/3 → 33 %, 2/3 → 67 %", () => {
    assert.equal(makeCounts(1, 3).percent, 33);
    assert.equal(makeCounts(2, 3).percent, 67);
  });
});

describe("stage", () => {
  const rows = [
    ["empty: no spec, no tasks", { "specs/001-x/notes.md": "n" }, "empty"],
    ["specified: spec only", { "specs/001-x/spec.md": SPEC }, "specified"],
    ["planned: plan, no tasks", { "specs/001-x/spec.md": SPEC, "specs/001-x/plan.md": "# Plan" }, "planned"],
    ["planned: plan without spec", { "specs/001-x/plan.md": "# Plan" }, "planned"],
    ["ready: tasks, none done", { "specs/001-x/tasks.md": ["## Phase 1: P", ...taskLines(3, 0)].join("\n") }, "ready"],
    ["in-progress: some done", { "specs/001-x/tasks.md": ["## Phase 1: P", ...taskLines(3, 1)].join("\n") }, "in-progress"],
    ["complete: all done", { "specs/001-x/tasks.md": ["## Phase 1: P", ...taskLines(3, 3)].join("\n") }, "complete"],
    ["empty tasks.md with plan stays planned", { "specs/001-x/plan.md": "p", "specs/001-x/tasks.md": "# Tasks" }, "planned"],
    ["empty tasks.md with spec stays specified", { "specs/001-x/spec.md": SPEC, "specs/001-x/tasks.md": "" }, "specified"],
    ["empty tasks.md alone stays empty", { "specs/001-x/tasks.md": "" }, "empty"],
  ];
  for (const [name, files, stage] of rows) {
    test(name, async () => assert.equal((await model(files)).features[0].stage, stage));
  }

  test("empty tasks.md raises W8 on the feature", async () => {
    const f = (await model({ "specs/001-x/plan.md": "p", "specs/001-x/tasks.md": "# Tasks" })).features[0];
    assert.equal(f.hasTasks, true);
    assert.deepEqual(f.warnings.map((w) => w.code), ["W8"]);
  });

  test("deriveStage covers a feature without tasks.md but with counts", () => {
    assert.equal(deriveStage({ hasSpec: true, hasPlan: false, hasTasks: false, counts: makeCounts(0, 0) }), "specified");
  });
});

describe("features", () => {
  test("title from spec.md, otherwise the folder name", async () => {
    const p = await model({ "specs/001-a/spec.md": SPEC, "specs/002-b/plan.md": "# Plan" });
    assert.deepEqual(p.features.map((f) => [f.dir, f.title]), [
      ["001-a", "Shiny Feature"],
      ["002-b", "002-b"],
    ]);
    assert.deepEqual(p.features[0].stories.map((s) => s.label), ["US1", "US2"]);
  });

  test("counts include unphased tasks", async () => {
    const f = (await model({ "specs/001-x/tasks.md": ["- [x] T001 early", "## Phase 1: P", "- [ ] T002 a"].join("\n") }))
      .features[0];
    assert.deepEqual(f.counts, makeCounts(1, 2));
    assert.equal(f.phases[0].number, null);
    assert.equal(f.phases[0].key, "001-x/pu");
  });

  test("40 of 65 tasks gives 62 % overall", async () => {
    const p = await model({ "specs/001-x/tasks.md": ["## Phase 1: P", ...taskLines(65, 40)].join("\n") });
    assert.equal(p.totals.tasks.percent, 62);
    assert.equal(p.features[0].counts.percent, 62);
  });

  test("199 of 200 tasks gives 99 %", async () => {
    const p = await model({ "specs/001-x/tasks.md": ["## Phase 1: P", ...taskLines(200, 199)].join("\n") });
    assert.equal(p.totals.tasks.percent, 99);
  });

  test("artifacts are classified, titled, mapped to URLs and ordered", async () => {
    const f = (
      await model({
        "specs/001-x/tasks.md": "# Tasks: X",
        "specs/001-x/zz.md": "no heading",
        "specs/001-x/contracts/cli.md": "# CLI",
        "specs/001-x/spec.md": SPEC,
        "specs/001-x/plan.md": "# Implementation Plan",
      })
    ).features[0];
    assert.deepEqual(
      f.artifacts.map((a) => [a.kind, a.title, a.source, a.url]),
      [
        ["spec", "Feature Specification: Shiny Feature", "specs/001-x/spec.md", "features/001-x/spec.html"],
        ["plan", "Implementation Plan", "specs/001-x/plan.md", "features/001-x/plan.html"],
        ["tasks", "Tasks: X", "specs/001-x/tasks.md", "features/001-x/tasks.html"],
        ["contract", "CLI", "specs/001-x/contracts/cli.md", "features/001-x/contracts/cli.html"],
        ["other", "zz.md", "specs/001-x/zz.md", "features/001-x/zz.html"],
      ],
    );
    assert.equal(f.artifacts[0].content, SPEC);
  });

  test("scan warnings go to their feature; others stay on the project", async () => {
    const p = await model({
      "specs/001-x/spec.md": SPEC,
      "specs/001-x/bad.md": new Error("EIO"),
      "specs/bad name/spec.md": "x",
      ".specify/feature.json": "{",
    });
    assert.deepEqual(p.features[0].warnings.map((w) => `${w.code} ${w.file}`), ["W9 specs/001-x/bad.md"]);
    assert.deepEqual(p.warnings.map((w) => `${w.code} ${w.file}`).sort(), [
      "W10 .specify/feature.json",
      "W11 specs/bad name",
    ]);
  });
});

describe("phases and story groups", () => {
  const TASKS = [
    "## Phase 1: Setup",
    "- [x] T001 setup",
    "## Phase 2: Empty",
    "## Phase 3: User Story 1",
    "- [x] T002 [US1] a",
    "- [ ] T003 [P] [US1] b",
    "## Phase 4: Mixed",
    "- [ ] T004 unlabeled first",
    "- [x] T005 [US2] x",
    "- [ ] T006 [US1] y",
    "- [ ] T007 [US2] z",
    "- [x] T008 unlabeled last",
    "## Phase 5: Unknown story",
    "- [ ] T009 [US7] q",
  ].join("\n");

  test("merged vs grouped phases", async () => {
    const f = (await model({ "specs/001-x/spec.md": SPEC, "specs/001-x/tasks.md": TASKS })).features[0];
    const [setup, empty, us1, mixed, unknown] = f.phases;

    assert.deepEqual(setup.storyLabels, []);
    assert.equal(setup.mergedStory, null);
    assert.deepEqual(setup.groups, []);
    assert.equal(setup.key, "001-x/p1");

    assert.deepEqual(empty.tasks, []);
    assert.equal(empty.mergedStory, null);
    assert.deepEqual(empty.counts, makeCounts(0, 0));

    assert.deepEqual(us1.storyLabels, ["US1"]);
    assert.deepEqual(us1.mergedStory, { label: "US1", title: "First", priority: "P1" });
    assert.deepEqual(us1.groups, []);
    assert.deepEqual(us1.counts, makeCounts(1, 2));

    assert.deepEqual(mixed.storyLabels, ["US2", "US1"]);
    assert.equal(mixed.mergedStory, null);
    assert.deepEqual(
      mixed.groups.map((g) => [g.label, g.story?.title, g.tasks.map((t) => t.id), g.counts.open, g.key]),
      [
        ["US2", "Second", ["T005", "T007"], 1, "001-x/p4/US2"],
        ["US1", "First", ["T006"], 1, "001-x/p4/US1"],
      ],
    );
    assert.deepEqual(mixed.tasks.filter((t) => !t.story).map((t) => t.id), ["T004", "T008"]);
    assert.deepEqual(mixed.counts, makeCounts(2, 5));

    assert.deepEqual(unknown.mergedStory, { label: "US7", title: null, priority: null });
  });

  test("a phase whose labeled tasks share one label but has unlabeled tasks is not merged", async () => {
    const f = (
      await model({ "specs/001-x/spec.md": SPEC, "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] T001 [US1] a\n- [ ] T002 b" })
    ).features[0];
    assert.equal(f.phases[0].mergedStory, null);
    assert.deepEqual(f.phases[0].groups, []);
  });

  test("W4 once per unknown story label", async () => {
    const f = (
      await model({
        "specs/001-x/spec.md": SPEC,
        "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] T001 [US7] a\n- [ ] T002 [US7] b\n- [ ] T003 [US1] c",
      })
    ).features[0];
    assert.deepEqual(f.warnings, [
      { code: "W4", file: "specs/001-x/tasks.md", line: 2, message: "story label US7 has no matching user story in spec.md" },
    ]);
  });

  test("W4 when spec.md is missing", async () => {
    const f = (await model({ "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] T001 [US1] a" })).features[0];
    assert.deepEqual(f.warnings.map((w) => w.code), ["W4"]);
  });

  test("tasks carry parsed fields, a key and no state yet", async () => {
    const f = (await model({ "specs/001-x/tasks.md": "## Phase 1: P\n- [ ] T001 [P] a\n- [x] no id depends on T001" }))
      .features[0];
    assert.deepEqual(f.phases[0].tasks, [
      { id: "T001", done: false, parallel: true, story: null, description: "a", dependsOn: [], line: 2, key: "001-x/T001", state: null },
      { id: null, done: true, parallel: false, story: null, description: "no id depends on T001", dependsOn: ["T001"], line: 3, key: "001-x/L3", state: null },
    ]);
  });
});

describe("unique keys", () => {
  test("duplicate task IDs and repeated phase numbers get @L<line> on every occurrence", async () => {
    const f = (
      await model({
        "specs/001-x/tasks.md": [
          "## Phase 1: A", // 1
          "- [ ] T001 a", // 2
          "- [ ] T002 b", // 3
          "## Phase 1: B", // 4
          "- [ ] T002 c", // 5
          "- [ ] T003 d", // 6
          "## Phase 2: C", // 7
          "- [ ] T002 e", // 8
        ].join("\n"),
      })
    ).features[0];
    assert.deepEqual(f.phases.map((p) => p.key), ["001-x/p1@L1", "001-x/p1@L4", "001-x/p2"]);
    const keys = f.phases.flatMap((p) => p.tasks.map((t) => t.key));
    assert.deepEqual(keys, ["001-x/T001", "001-x/T002@L3", "001-x/T002@L5", "001-x/T003", "001-x/T002@L8"]);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("keys are unique across the whole project", async () => {
    const tasks = "## Phase 1: A\n- [ ] T001 a [US1]\n- [ ] T001 [US2] b\n- [ ] T002 [US1] c\n## Phase 1: B\n- [ ] no id";
    const p = await model({ "specs/001-x/tasks.md": tasks, "specs/002-y/tasks.md": tasks, "specs/001-x/spec.md": SPEC });
    const keys = p.features.flatMap((f) => [
      f.dir,
      ...f.phases.flatMap((ph) => [ph.key, ...ph.groups.map((g) => g.key), ...ph.tasks.map((t) => t.key)]),
    ]);
    assert.equal(new Set(keys).size, keys.length);
  });
});

describe("totals", () => {
  test("specs and phases totals follow the completion rules", async () => {
    const p = await model({
      "specs/001-done/tasks.md": ["## Phase 1: A", ...taskLines(2, 2), "## Phase 2: No tasks"].join("\n"),
      "specs/002-part/tasks.md": ["## Phase 1: A", ...taskLines(2, 2), "## Phase 2: B", ...taskLines(2, 1, { start: 3 })].join("\n"),
      "specs/003-spec-only/spec.md": SPEC,
      "specs/004-empty-tasks/tasks.md": "# nothing",
    });
    assert.deepEqual(p.totals.specs, { completed: 1, total: 4 });
    assert.deepEqual(p.totals.phases, { completed: 2, total: 3 });
    assert.deepEqual(p.totals.tasks, makeCounts(5, 6));
  });

  test("an empty project has zero totals", async () => {
    const p = await model({ ".specify/memory/constitution.md": "# Constitution" });
    assert.deepEqual(p.totals, {
      tasks: makeCounts(0, 0),
      specs: { completed: 0, total: 0 },
      phases: { completed: 0, total: 0 },
    });
  });
});

describe("project", () => {
  test("name, constitution, assessments and placeholders", async () => {
    const p = await model({
      ".specify/memory/constitution.md": "# Proj Constitution",
      ".specify/assessments/a1/notes.md": "# Notes",
      ".specify/assessments/a1/intake.md": "# Intake",
      "specs/001-x/spec.md": SPEC,
    });
    assert.equal(p.name, "proj");
    assert.equal(p.root, null);
    assert.equal(p.active, null);
    assert.deepEqual(
      [p.constitution.kind, p.constitution.title, p.constitution.url],
      ["constitution", "Proj Constitution", "constitution.html"],
    );
    assert.deepEqual(
      p.assessments.map((a) => [a.slug, a.artifacts.map((x) => [x.kind, x.title, x.url])]),
      [["a1", [["assessment", "Intake", "assessments/a1/intake.html"], ["assessment", "Notes", "assessments/a1/notes.html"]]]],
    );
  });

  test("no constitution gives null", async () => {
    assert.equal((await model({ "specs/001-x/spec.md": SPEC })).constitution, null);
  });
});
