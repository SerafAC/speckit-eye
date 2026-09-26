import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseTasks, MSG } from "../../src/parse/tasks.js";

const FILE = "specs/001-x/tasks.md";
const parse = (lines) => parseTasks(Array.isArray(lines) ? lines.join("\n") : lines, FILE);
const brief = (warnings) => warnings.map((w) => `${w.code}@${w.line}`);

describe("phase headings", () => {
  test("recognizes ## Phase N: title and ignores other headings", () => {
    const { phases } = parse([
      "# Tasks: X",
      "## Phase 1: Setup (Shared Infrastructure)",
      "- [ ] T001 a",
      "### Tests for User Story 1",
      "- [ ] T002 b",
      "##   Phase  2 :  Foundational  ",
      "- [ ] T003 c",
      "## Phase X: not a phase",
      "## Phase 3 missing colon",
      "- [ ] T004 d",
    ]);
    assert.deepEqual(
      phases.map((p) => [p.number, p.title, p.line, p.tasks.map((t) => t.id)]),
      [
        [1, "Setup (Shared Infrastructure)", 2, ["T001", "T002"]],
        [2, "Foundational", 6, ["T003", "T004"]],
      ],
    );
  });

  test("keeps a phase with no tasks", () => {
    const { phases } = parse(["## Phase 1: Empty", "## Phase 2: Full", "- [ ] T001 a"]);
    assert.deepEqual(phases.map((p) => p.tasks.length), [0, 1]);
  });

  test("W12 for a repeated phase number, both phases kept", () => {
    const { phases, warnings } = parse(["## Phase 3: A", "- [ ] T001 a", "## Phase 3: B", "- [ ] T002 b"]);
    assert.deepEqual(phases.map((p) => p.title), ["A", "B"]);
    assert.deepEqual(warnings, [{ code: "W12", file: FILE, line: 3, message: "duplicate phase number 3 (both shown)" }]);
  });
});

describe("task lines", () => {
  test("parses done state for space, x and X, with - or * bullets and indentation", () => {
    const { tasks } = parse(["## Phase 1: P", "- [ ] T001 open", "- [x] T002 done", "* [X] T003 done too", "   - [ ] T004 indented"]);
    assert.deepEqual(tasks.map((t) => [t.id, t.done, t.line]), [
      ["T001", false, 2],
      ["T002", true, 3],
      ["T003", true, 4],
      ["T004", false, 5],
    ]);
  });

  test("ignores lines that are not checkbox items", () => {
    const { tasks } = parse(["## Phase 1: P", "- T001 no box", "-[ ] T002 no space", "- [y] T003 bad mark", "- [ ]T004 no space after", "1. [ ] T005 numbered", "text - [ ] T006"]);
    assert.deepEqual(tasks, []);
  });

  test("extracts [P] and [USn] markers in any order and strips them from the description", () => {
    const { tasks } = parse([
      "## Phase 3: User Story 1",
      "- [ ] T010 [P] [US1] Create model in src/a.js",
      "- [ ] T011 [US2] [P] Other order",
      "- [ ] T012 [US1] No parallel",
      "- [ ] T013 Plain [P] later marker is text",
    ]);
    assert.deepEqual(
      tasks.map((t) => [t.id, t.parallel, t.story, t.description]),
      [
        ["T010", true, "US1", "Create model in src/a.js"],
        ["T011", true, "US2", "Other order"],
        ["T012", false, "US1", "No parallel"],
        ["T013", false, null, "Plain [P] later marker is text"],
      ],
    );
  });

  test("task ID requires a word boundary", () => {
    const { tasks, warnings } = parse(["## Phase 1: P", "- [ ] T12a not an id", "- [ ] T12 an id"]);
    assert.deepEqual(tasks.map((t) => t.id), [null, "T12"]);
    assert.deepEqual(brief(warnings), ["W1@2"]);
  });

  test("W1 for a checkbox without an ID, still counted, markers still read", () => {
    const { tasks, warnings } = parse(["## Phase 1: P", "- [x] [P] Just a checkbox"]);
    assert.deepEqual(tasks, [{ id: null, done: true, parallel: true, story: null, description: "Just a checkbox", dependsOn: [], line: 2 }]);
    assert.deepEqual(warnings, [{ code: "W1", file: FILE, line: 2, message: MSG.W1() }]);
    assert.equal(MSG.W1(), "checkbox without a task ID (counted)");
  });

  test("W2 for several story labels, first one used", () => {
    const { tasks, warnings } = parse(["## Phase 1: P", "- [ ] T001 [US2] [US3] Both", "- [ ] T002 [US1] [US1] Same twice"]);
    assert.equal(tasks[0].story, "US2");
    assert.equal(tasks[0].description, "Both");
    assert.equal(tasks[1].story, "US1");
    assert.deepEqual(warnings, [{ code: "W2", file: FILE, line: 2, message: "task has several story labels; using US2" }]);
  });

  test("W3 and the synthetic Unphased phase for tasks before the first phase", () => {
    const { phases, warnings } = parse(["# Tasks", "- [ ] T001 early", "- [x] T002 early too", "## Phase 1: P", "- [ ] T003 later"]);
    assert.deepEqual(phases.map((p) => [p.number, p.title, p.line, p.tasks.map((t) => t.id)]), [
      [null, "Unphased", null, ["T001", "T002"]],
      [1, "P", 4, ["T003"]],
    ]);
    assert.deepEqual(warnings, [
      { code: "W3", file: FILE, line: 2, message: 'task outside any "## Phase N:" section (shown under Unphased)' },
      { code: "W3", file: FILE, line: 3, message: 'task outside any "## Phase N:" section (shown under Unphased)' },
    ]);
  });

  test("W5 for duplicate task IDs, both counted", () => {
    const { tasks, warnings } = parse(["## Phase 1: P", "- [ ] T001 a", "- [x] T001 b", "- [ ] T001 c"]);
    assert.equal(tasks.length, 3);
    assert.deepEqual(warnings, [
      { code: "W5", file: FILE, line: 3, message: "duplicate task ID T001 (both counted)" },
      { code: "W5", file: FILE, line: 4, message: "duplicate task ID T001 (both counted)" },
    ]);
  });

  test("warnings are sorted by line, a warning without a line (W8) first", () => {
    const { warnings } = parse(["# Tasks", "## Phase 1: A", "## Phase 1: B"]);
    assert.deepEqual(brief(warnings), ["W8@null", "W12@3"]);
  });

  test("W8 when there are no task lines", () => {
    for (const text of ["", "# Tasks\n\n## Phase 1: Setup\n", "```\n- [ ] T001 in code\n```"]) {
      const { phases, tasks, warnings } = parseTasks(text, FILE);
      assert.equal(tasks.length, 0);
      assert.deepEqual(warnings.filter((w) => w.code === "W8"), [{ code: "W8", file: FILE, line: null, message: "tasks.md contains no tasks" }]);
      assert.ok(phases.length <= 1);
    }
  });
});

describe("dependencies", () => {
  const head = ["## Phase 1: P", "- [ ] T001 a", "- [ ] T002 b", "- [ ] T003 c", "- [ ] T013 d"];

  test("accepts every separator form, case-insensitively, anywhere in the description", () => {
    const { tasks, warnings } = parse([
      ...head,
      "- [ ] T020 X (depends on T001)",
      "- [ ] T021 X depends on T001, T002",
      "- [ ] T022 X depends on T001 and T002",
      "- [ ] T023 X Depends On T001, and T002 and T003",
      "- [ ] T024 X depends on T001 & T013",
      "- [ ] T025 X depends on T001; depends on T002",
      "- [ ] T026 X depends on T001,T002 ,T003",
      "- [ ] T027 X dependson T001",
    ]);
    assert.deepEqual(
      tasks.slice(4).map((t) => [t.id, t.dependsOn]),
      [
        ["T020", ["T001"]],
        ["T021", ["T001", "T002"]],
        ["T022", ["T001", "T002"]],
        ["T023", ["T001", "T002", "T003"]],
        ["T024", ["T001", "T013"]],
        ["T025", ["T001", "T002"]],
        ["T026", ["T001", "T002", "T003"]],
        ["T027", []],
      ],
    );
    assert.deepEqual(warnings, []);
  });

  test("keeps the depends-on text in the description", () => {
    const { tasks } = parse([...head, "- [ ] T030 [P] Build it (depends on T001–T003)"]);
    assert.equal(tasks[4].description, "Build it (depends on T001–T003)");
    assert.deepEqual(tasks[4].dependsOn, ["T001"]);
  });

  test("may refer to a task defined later in the file", () => {
    const { tasks } = parse(["## Phase 1: P", "- [ ] T001 depends on T002", "- [ ] T002 b"]);
    assert.deepEqual(tasks[0].dependsOn, ["T002"]);
  });

  test("W6 drops unknown dependency IDs", () => {
    const { tasks, warnings } = parse([...head, "- [ ] T040 depends on T001, T099 and T100"]);
    assert.deepEqual(tasks[4].dependsOn, ["T001"]);
    assert.deepEqual(warnings, [
      { code: "W6", file: FILE, line: 6, message: "dependency T099 not found (ignored)" },
      { code: "W6", file: FILE, line: 6, message: "dependency T100 not found (ignored)" },
    ]);
  });
});

describe("general rules", () => {
  test("CRLF line endings are handled", () => {
    const { phases, tasks } = parseTasks("## Phase 1: Setup\r\n- [x] T001 [P] done\r\n- [ ] T002 open\r\n", FILE);
    assert.equal(phases[0].title, "Setup");
    assert.deepEqual(tasks.map((t) => [t.id, t.done, t.description]), [
      ["T001", true, "done"],
      ["T002", false, "open"],
    ]);
  });

  test("fenced code blocks (``` and ~~~) are skipped, including headings", () => {
    const { phases, tasks } = parse([
      "## Phase 1: P",
      "```text",
      "- [ ] T900 sample",
      "## Phase 9: sample",
      "```",
      "~~~~",
      "- [ ] T901 sample",
      "```",
      "- [ ] T902 still inside (``` does not close ~~~~)",
      "~~~~",
      "- [ ] T001 real",
    ]);
    assert.deepEqual(phases.map((p) => p.number), [1]);
    assert.deepEqual(tasks.map((t) => t.id), ["T001"]);
  });

  test("HTML comments are skipped, including multi-line ones", () => {
    const { tasks, phases } = parse([
      "## Phase 1: P",
      "<!-- - [ ] T900 one-line comment -->",
      "<!--",
      "## Phase 8: in comment",
      "- [ ] T901 in comment",
      "-->",
      "- [ ] T001 real <!-- trailing note -->",
      "<!-- a --> - [x] T002 after a comment",
      "- [ ] T003 before <!-- start",
      "- [ ] T902 hidden",
      "end --> tail",
    ]);
    assert.deepEqual(phases.map((p) => p.number), [1]);
    assert.deepEqual(tasks.map((t) => [t.id, t.description]), [
      ["T001", "real"],
      ["T002", "after a comment"],
      ["T003", "before"],
    ]);
  });

  test("line numbers stay 1-based across skipped fences and comments", () => {
    const { tasks } = parse(["```", "x", "```", "<!--", "-->", "## Phase 1: P", "- [ ] T001 a"]);
    assert.equal(tasks[0].line, 7);
  });

  test("never throws on odd input", () => {
    for (const input of [undefined, null, 42, "\n\n\r\n", "<!--", "```", "- [ ] ", "## Phase 1:  "]) {
      assert.doesNotThrow(() => parseTasks(input, FILE));
    }
    assert.equal(parseTasks("- [ ] ", FILE).tasks.length, 1);
  });

  test("M5: total equals the number of checkboxes outside code and comments, warnings included", () => {
    const text = [
      "- [ ] no id before phase",
      "## Phase 1: Setup",
      "- [x] T001 [P] a",
      "- [X] T001 dup",
      "- [ ] T002 [US1] [US2] labels",
      "- [ ] T003 depends on T999",
      "```",
      "- [ ] T100 fenced",
      "```",
      "<!-- - [ ] T101 commented -->",
      "## Phase 1: Again",
      "* [x] T004 star",
    ].join("\n");
    const { tasks, phases } = parseTasks(text, FILE);
    assert.equal(tasks.length, 6);
    assert.equal(tasks.filter((t) => t.done).length, 3);
    assert.equal(phases.reduce((n, p) => n + p.tasks.length, 0), 6);
  });

  test("warnings are ordered by line", () => {
    const { warnings } = parse(["- [ ] T001 depends on T404", "## Phase 1: P", "- [ ] no id", "## Phase 1: Q"]);
    assert.deepEqual(brief(warnings), ["W3@1", "W6@1", "W1@3", "W12@4"]);
  });
});

describe("taskLineNumbers (FR-044)", async () => {
  const { taskLineNumbers } = await import("../../src/parse/tasks.js");
  test("the lines parseTasks reads as tasks, fences and comments excluded", () => {
    const text = "## Phase 1: A\n- [ ] T001 a\n```\n- [ ] T002 b\n```\n<!-- - [x] T003 -->\n* [X] T004 d\n- item";
    assert.deepEqual([...taskLineNumbers(text)], [2, 7]);
    assert.deepEqual([...taskLineNumbers(undefined)], []);
  });
});
