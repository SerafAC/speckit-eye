import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { selectActive } from "../../src/model/active.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

/** Scans the fake project and returns the selection with scan-derived inputs. */
async function active(files, { gitBranch } = {}) {
  const gitHead = gitBranch ? `ref: refs/heads/${gitBranch}` : null;
  const result = await scan(createFakeReader(files, { gitHead }), "proj");
  return selectActive(buildModel(result), { featureDirectory: result.featureDirectory, gitBranch: result.gitBranch });
}

const featureJson = (dir) => JSON.stringify({ feature_directory: `specs/${dir}` });
const OPEN = "## Phase 1: Setup\n- [x] T001 a\n- [ ] T002 b\n- [ ] T003 c";
const DONE = "## Phase 1: Setup\n- [x] T001 a\n- [x] T002 b";
const NONE = { phaseKey: null, storyLabel: null, nextTaskKey: null };

describe("rule 1: feature.json", () => {
  test("names a feature with open tasks → that feature, even when an earlier one is open", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": OPEN,
      "specs/002-b/tasks.md": OPEN,
      ".specify/feature.json": featureJson("002-b"),
    });
    assert.deepEqual(sel, { featureDir: "002-b", phaseKey: "002-b/p1", storyLabel: null, nextTaskKey: "002-b/T002", source: "feature.json" });
  });

  test("a missing feature is ignored and the next rule applies", async () => {
    const sel = await active({ "specs/001-a/tasks.md": OPEN, ".specify/feature.json": featureJson("999-z") });
    assert.equal(sel.source, "first-open");
    assert.equal(sel.featureDir, "001-a");
  });
});

describe("rule 2: git branch", () => {
  test("a branch equal to a feature folder selects it", async () => {
    const sel = await active({ "specs/001-a/tasks.md": OPEN, "specs/002-b/tasks.md": OPEN }, { gitBranch: "002-b" });
    assert.deepEqual([sel.featureDir, sel.source], ["002-b", "git-branch"]);
  });

  test("feature.json wins over the branch", async () => {
    const sel = await active(
      { "specs/001-a/tasks.md": OPEN, "specs/002-b/tasks.md": OPEN, ".specify/feature.json": featureJson("001-a") },
      { gitBranch: "002-b" },
    );
    assert.deepEqual([sel.featureDir, sel.source], ["001-a", "feature.json"]);
  });

  test("the branch is used when the feature.json candidate is complete", async () => {
    const sel = await active(
      { "specs/001-a/tasks.md": DONE, "specs/002-b/tasks.md": OPEN, "specs/003-c/tasks.md": OPEN, ".specify/feature.json": featureJson("001-a") },
      { gitBranch: "003-c" },
    );
    assert.deepEqual([sel.featureDir, sel.source], ["003-c", "git-branch"]);
  });

  test("a branch that names no feature (main, detached HEAD) is ignored", async () => {
    const sel = await active({ "specs/001-a/tasks.md": OPEN }, { gitBranch: "main" });
    assert.equal(sel.source, "first-open");
  });
});

describe("rule 3: first feature with open tasks", () => {
  test("skips complete candidates and features without open tasks", async () => {
    const sel = await active(
      {
        "specs/001-done/tasks.md": DONE,
        "specs/002-spec-only/spec.md": "# Feature Specification: S",
        "specs/003-open/tasks.md": OPEN,
        ".specify/feature.json": featureJson("001-done"),
      },
      { gitBranch: "001-done" },
    );
    assert.deepEqual(sel, { featureDir: "003-open", phaseKey: "003-open/p1", storyLabel: null, nextTaskKey: "003-open/T002", source: "first-open" });
  });

  test("a candidate whose tasks.md has no tasks is skipped while others are open", async () => {
    const sel = await active({ "specs/001-a/tasks.md": "# empty", "specs/002-b/tasks.md": OPEN, ".specify/feature.json": featureJson("001-a") });
    assert.deepEqual([sel.featureDir, sel.source], ["002-b", "first-open"]);
  });
});

describe("rule 4: nothing open (FR-018)", () => {
  const ALL_DONE = { "specs/001-a/tasks.md": DONE, "specs/002-b/tasks.md": DONE };

  test("feature.json candidate stays active although complete, with no phase/story/task", async () => {
    const sel = await active({ ...ALL_DONE, ".specify/feature.json": featureJson("002-b") });
    assert.deepEqual(sel, { featureDir: "002-b", ...NONE, source: "feature.json" });
  });

  test("otherwise the branch candidate", async () => {
    const sel = await active(ALL_DONE, { gitBranch: "001-a" });
    assert.deepEqual(sel, { featureDir: "001-a", ...NONE, source: "git-branch" });
  });

  test("otherwise nothing is active", async () => {
    assert.deepEqual(await active(ALL_DONE), { featureDir: null, ...NONE, source: "none" });
  });

  test("a project without any tasks and no candidate has no active item", async () => {
    assert.deepEqual(await active({ "specs/001-a/spec.md": "# Feature Specification: A" }), { featureDir: null, ...NONE, source: "none" });
  });

  test("an empty project has no active item", () => {
    assert.deepEqual(selectActive({ features: [] }, {}), { featureDir: null, ...NONE, source: "none" });
  });
});

describe("rule 5: phase, story and next task within the active feature", () => {
  test("active phase is the first phase with open tasks; next task is the first open one", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": "## Phase 1: A\n- [x] T001 a\n## Phase 2: Empty\n## Phase 3: B\n- [x] T002 b\n- [ ] T003 c\n- [ ] T004 d\n## Phase 4: C\n- [ ] T005 e",
    });
    assert.deepEqual(sel, { featureDir: "001-a", phaseKey: "001-a/p3", storyLabel: null, nextTaskKey: "001-a/T003", source: "first-open" });
  });

  test("merged single-story phase has no story label", async () => {
    const sel = await active({ "specs/001-a/tasks.md": "## Phase 3: US1\n- [ ] T001 [US1] a\n- [ ] T002 [US1] b" });
    assert.equal(sel.storyLabel, null);
    assert.equal(sel.nextTaskKey, "001-a/T001");
  });

  test("grouped phase: first group with open tasks, next task within that group", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": [
        "## Phase 1: Mixed",
        "- [ ] T001 unlabeled open",
        "- [x] T002 [US1] a",
        "- [ ] T003 [US2] b",
        "- [x] T004 [US1] c",
        "- [ ] T005 [US2] d",
        "- [ ] T006 [US1] e",
      ].join("\n"),
    });
    assert.deepEqual(sel, { featureDir: "001-a", phaseKey: "001-a/p1", storyLabel: "US1", nextTaskKey: "001-a/T006", source: "first-open" });
  });

  test("grouped phase with only unlabeled tasks open: no story, next is the first open task in the phase", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": "## Phase 1: Mixed\n- [x] T001 [US1] a\n- [x] T002 [US2] b\n- [ ] T003 unlabeled",
    });
    assert.deepEqual([sel.phaseKey, sel.storyLabel, sel.nextTaskKey], ["001-a/p1", null, "001-a/T003"]);
  });

  test("unphased tasks come first when they are open", async () => {
    const sel = await active({ "specs/001-a/tasks.md": "- [ ] T001 early\n## Phase 1: A\n- [ ] T002 a" });
    assert.deepEqual([sel.phaseKey, sel.nextTaskKey], ["001-a/pu", "001-a/T001"]);
  });

  test("duplicate task IDs: the next task key points at exactly one occurrence", async () => {
    const sel = await active({ "specs/001-a/tasks.md": "## Phase 1: A\n- [x] T001 a\n- [ ] T001 b\n- [ ] T001 c" });
    assert.equal(sel.nextTaskKey, "001-a/T001@L3");
  });
});

describe("rule 6: feature without tasks.md", () => {
  test("can be active through feature.json with null phase and task while others are open", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": OPEN,
      "specs/002-b/spec.md": "# Feature Specification: B",
      ".specify/feature.json": featureJson("002-b"),
    });
    assert.deepEqual(sel, { featureDir: "002-b", ...NONE, source: "feature.json" });
  });

  test("can be active through the git branch", async () => {
    const sel = await active({ "specs/001-a/tasks.md": OPEN, "specs/002-b/plan.md": "# Plan" }, { gitBranch: "002-b" });
    assert.deepEqual(sel, { featureDir: "002-b", ...NONE, source: "git-branch" });
  });
});

describe("spec acceptance scenarios", () => {
  test("US1 AC6 (a): feature.json names the second feature with open tasks → it is active", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": OPEN,
      "specs/002-b/tasks.md": OPEN,
      ".specify/feature.json": featureJson("002-b"),
    });
    assert.deepEqual([sel.featureDir, sel.source], ["002-b", "feature.json"]);
  });

  test("US1 AC6 (b): feature.json names a complete feature → first feature with open tasks", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": OPEN,
      "specs/002-b/tasks.md": DONE,
      ".specify/feature.json": featureJson("002-b"),
    });
    assert.deepEqual([sel.featureDir, sel.source, sel.nextTaskKey], ["001-a", "first-open", "001-a/T002"]);
  });

  test("US1 AC7 (a): all done without feature.json or branch → none", async () => {
    const sel = await active({ "specs/001-a/tasks.md": DONE, "specs/002-b/tasks.md": DONE }, { gitBranch: "main" });
    assert.deepEqual(sel, { featureDir: null, ...NONE, source: "none" });
  });

  test("US1 AC7 (b): all done with feature.json naming a feature → that feature, no phase/story/task", async () => {
    const sel = await active({
      "specs/001-a/tasks.md": DONE,
      "specs/002-b/tasks.md": DONE,
      ".specify/feature.json": featureJson("001-a"),
    });
    assert.deepEqual(sel, { featureDir: "001-a", ...NONE, source: "feature.json" });
  });
});
