import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildModel } from "../../src/model/build-model.js";
import { applyTaskStates, statusOf, DISPLAY_LABEL } from "../../src/model/task-state.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";
import { makeCounts } from "../../src/model/build-model.js";

async function model(files, options) {
  return buildModel(await scan(createFakeReader(files, options), "proj"));
}

const states = (feature) => feature.phases.flatMap((p) => p.tasks.map((t) => [t.id, t.state]));

describe("task states", () => {
  test("completed, current, blocked, future in rule order", async () => {
    const p = await model({
      "specs/001-x/tasks.md": [
        "## Phase 1: A",
        "- [x] T001 done",
        "- [ ] T002 next",
        "- [ ] T003 waits, depends on T002",
        "- [ ] T004 free",
        "- [ ] T005 depends on T001", // dependency done → future
      ].join("\n"),
    });
    assert.deepEqual(states(p.features[0]), [
      ["T001", "completed"],
      ["T002", "current"],
      ["T003", "blocked"],
      ["T004", "future"],
      ["T005", "future"],
    ]);
    assert.deepEqual(p.features[0].warnings, []);
  });

  test("a done task with an open dependency is still completed", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a\n- [x] T002 depends on T001" });
    assert.deepEqual(states(p.features[0]), [["T001", "current"], ["T002", "completed"]]);
  });

  test("a task in a later group waiting on the next task is blocked", async () => {
    const p = await model({
      "specs/001-x/spec.md": "# Feature Specification: X\n### User Story 1 - A (Priority: P1)\n### User Story 2 - B (Priority: P2)",
      "specs/001-x/tasks.md": [
        "## Phase 1: A", // 1
        "- [ ] T001 [US2] later", // 2
        "- [ ] T002 [US1] first, depends on T001 and T003", // 3
        "- [x] T003 [US1] done", // 4
      ].join("\n"),
    });
    const f = p.features[0];
    // Group US2 comes first in file order, so T001 is next; nothing blocks it.
    assert.equal(p.active.nextTaskKey, "001-x/T001");
    assert.deepEqual(states(f), [["T001", "current"], ["T002", "blocked"], ["T003", "completed"]]);
    assert.deepEqual(f.warnings, []);
  });

  test("W7 names the open dependency of the current task", async () => {
    const p = await model({
      "specs/001-x/tasks.md": [
        "## Phase 1: A", // 1
        "- [x] T001 a", // 2
        "- [ ] T002 next depends on T001, T003", // 3
        "- [ ] T003 later", // 4
      ].join("\n"),
    });
    const f = p.features[0];
    assert.deepEqual(states(f), [["T001", "completed"], ["T002", "current"], ["T003", "future"]]);
    assert.deepEqual(f.warnings, [
      { code: "W7", file: "specs/001-x/tasks.md", line: 3, message: "next task T002 depends on open task T003" },
    ]);
  });

  test("only the active feature has a current task", async () => {
    const tasks = "## Phase 1: A\n- [ ] T001 a\n- [ ] T002 b";
    const p = await model({ "specs/001-a/tasks.md": tasks, "specs/002-b/tasks.md": tasks });
    assert.deepEqual(states(p.features[0]), [["T001", "current"], ["T002", "future"]]);
    assert.deepEqual(states(p.features[1]), [["T001", "future"], ["T002", "future"]]);
  });

  test("with duplicate IDs only one occurrence is current", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a\n- [ ] T001 b" });
    assert.deepEqual(states(p.features[0]), [["T001", "current"], ["T001", "future"]]);
  });

  test("everything done: all completed, no current", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [x] T001 a\n- [X] T002 b" });
    assert.deepEqual(states(p.features[0]), [["T001", "completed"], ["T002", "completed"]]);
    assert.equal(p.active.source, "none");
  });

  test("W7 names a next task without an ID by its line", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] first depends on T002\n- [ ] T002 b" });
    const w7 = p.features[0].warnings.filter((w) => w.code === "W7");
    assert.deepEqual(w7.map((w) => w.message), ["next task L2 depends on open task T002"]);
  });

  test("a project without an active selection gets no current task", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a" });
    delete p.active;
    applyTaskStates(p);
    assert.deepEqual(states(p.features[0]), [["T001", "future"]]);
    assert.match(p.sig, /:-$/);
  });

  test("applyTaskStates is idempotent (no duplicate W7)", async () => {
    const p = await model({ "specs/001-x/tasks.md": "## Phase 1: A\n- [ ] T001 a depends on T002\n- [ ] T002 b" });
    assert.equal(p.features[0].warnings.filter((w) => w.code === "W7").length, 1);
    applyTaskStates(p);
    assert.equal(p.features[0].warnings.filter((w) => w.code === "W7").length, 1);
  });
});

describe("statusOf", () => {
  test("not-started, started, done", () => {
    assert.equal(statusOf(makeCounts(0, 0)), "not-started");
    assert.equal(statusOf(makeCounts(0, 3)), "not-started");
    assert.equal(statusOf(makeCounts(1, 3)), "started");
    assert.equal(statusOf(makeCounts(3, 3)), "done");
  });
});

describe("change signatures", () => {
  const SPEC = "# Feature Specification: X\n### User Story 1 - A (Priority: P1)\n### User Story 2 - B (Priority: P2)";
  const TASKS = [
    "## Phase 1: Setup",
    "- [x] T001 a",
    "## Phase 2: Mixed",
    "- [x] T002 [US1] b",
    "- [ ] T003 [US1] c",
    "- [ ] T004 [US2] d",
  ].join("\n");

  test("every node carries a sig built from counts, status and the active flag", async () => {
    const p = await model({ "specs/001-x/spec.md": SPEC, "specs/001-x/tasks.md": TASKS, "specs/002-y/spec.md": SPEC });
    const [f, g] = p.features;
    assert.equal(p.sig, "2/4:0/2:1/2:001-x");
    assert.equal(f.sig, "2/4:in-progress:a");
    assert.equal(g.sig, "0/0:specified");
    assert.deepEqual(f.phases.map((ph) => ph.sig), ["1/1:done", "1/3:started:a"]);
    assert.deepEqual(f.phases[1].groups.map((gr) => gr.sig), ["1/2:started:a", "0/1:not-started"]);
    assert.deepEqual(f.phases.flatMap((ph) => ph.tasks.map((t) => t.sig)), ["completed", "completed", "current:a", "future"]);
  });

  test("sig changes when a task is ticked", async () => {
    const before = await model({ "specs/001-x/spec.md": SPEC, "specs/001-x/tasks.md": TASKS });
    const after = await model({
      "specs/001-x/spec.md": SPEC,
      "specs/001-x/tasks.md": TASKS.replace("- [ ] T003", "- [x] T003"),
    });
    assert.notEqual(before.sig, after.sig);
    assert.notEqual(before.features[0].sig, after.features[0].sig);
    assert.equal(before.features[0].phases[0].sig, after.features[0].phases[0].sig);
    assert.notEqual(before.features[0].phases[1].groups[1].sig, after.features[0].phases[1].groups[1].sig);
  });
});

describe("display names and waitingOn (002 data-model Task)", () => {
  const view = (feature) => feature.phases.flatMap((p) => p.tasks.map((t) => [t.id, t.display, t.waitingOn]));

  test("display maps completed → done, current → next, blocked → blocked, future → open", async () => {
    const p = await model({
      "specs/001-x/tasks.md": [
        "## Phase 1: A",
        "- [x] T001 done",
        "- [ ] T002 next",
        "- [ ] T003 waits, depends on T002",
        "- [ ] T004 free",
      ].join("\n"),
    });
    const tasks = p.features[0].phases[0].tasks;
    assert.deepEqual(tasks.map((t) => [t.state, t.display]), [
      ["completed", "done"],
      ["current", "next"],
      ["blocked", "blocked"],
      ["future", "open"],
    ]);
    assert.deepEqual(view(p.features[0]), [
      ["T001", "done", []],
      ["T002", "next", []],
      ["T003", "blocked", ["T002"]],
      ["T004", "open", []],
    ]);
  });

  test("T020 depends on T012 + T013 with only T012 open → waitingOn [T012]", async () => {
    const p = await model({
      "specs/001-x/tasks.md": [
        "## Phase 1: A",
        "- [ ] T011 first open task",
        "- [ ] T012 open",
        "- [x] T013 done",
        "- [ ] T020 needs both (depends on T012, T013)",
      ].join("\n"),
    });
    const t020 = p.features[0].phases[0].tasks.find((t) => t.id === "T020");
    assert.deepEqual(t020.dependsOn, ["T012", "T013"]);
    assert.equal(t020.display, "blocked");
    assert.deepEqual(t020.waitingOn, ["T012"]);
  });

  test("waitingOn keeps the written order of the open dependencies", async () => {
    const p = await model({
      "specs/001-x/tasks.md": [
        "## Phase 1: A",
        "- [ ] T001 first",
        "- [ ] T002 a",
        "- [ ] T003 b",
        "- [ ] T004 depends on T003, T002",
      ].join("\n"),
    });
    const t004 = p.features[0].phases[0].tasks.find((t) => t.id === "T004");
    assert.deepEqual(t004.waitingOn, ["T003", "T002"]);
  });

  test("next beats blocked: the next task has an empty waitingOn even with open dependencies", async () => {
    const p = await model({
      "specs/001-x/tasks.md": ["## Phase 1: A", "- [ ] T001 depends on T002", "- [ ] T002 later"].join("\n"),
    });
    const [t001, t002] = p.features[0].phases[0].tasks;
    assert.equal(t001.display, "next");
    assert.deepEqual(t001.waitingOn, []);
    assert.equal(t002.display, "open");
    assert.ok(p.features[0].warnings.some((w) => w.code === "W7"));
  });

  test("a dependency on a missing ID is ignored", async () => {
    const p = await model({
      "specs/001-x/tasks.md": ["## Phase 1: A", "- [ ] T001 first", "- [ ] T002 x", "- [ ] T003 y"].join("\n"),
    });
    const [, t002, t003] = p.features[0].phases[0].tasks;
    // Set on the model directly: the parser already drops unknown IDs.
    t002.dependsOn = ["T999", "T001"];
    t003.dependsOn = ["T999"];
    applyTaskStates(p);
    assert.equal(t002.display, "blocked");
    assert.deepEqual(t002.waitingOn, ["T001"]);
    assert.equal(t003.display, "open");
    assert.deepEqual(t003.waitingOn, []);
  });

  test("a done task and a task whose dependencies are done wait on nothing", async () => {
    const p = await model({
      "specs/001-x/tasks.md": ["## Phase 1: A", "- [ ] T001 a", "- [x] T002 depends on T001", "- [x] T003 c", "- [ ] T004 depends on T003"].join("\n"),
    });
    const tasks = p.features[0].phases[0].tasks;
    assert.deepEqual(tasks.map((t) => [t.id, t.display, t.waitingOn]), [
      ["T001", "next", []],
      ["T002", "done", []],
      ["T003", "done", []],
      ["T004", "open", []],
    ]);
  });

  test("DISPLAY_LABEL names each display state", () => {
    assert.deepEqual(DISPLAY_LABEL, { done: "Done", next: "Next", blocked: "Blocked", open: "Open" });
    assert.ok(Object.isFrozen(DISPLAY_LABEL));
  });
});
