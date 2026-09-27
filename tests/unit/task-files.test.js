import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { taskFiles, taskKind, kindChip, taskRefs, kindChips } from "../../src/model/task-files.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

describe("taskFiles (FR-037)", () => {
  test("backticked spans with a / that end in a file name, in order", () => {
    assert.deepEqual(taskFiles("Add `internal/input/simulator_test.go` and `web/List.vue`"), [
      "internal/input/simulator_test.go",
      "web/List.vue",
    ]);
  });

  test("duplicates removed", () => {
    assert.deepEqual(taskFiles("`src/a.js` then `src/b.js` then `src/a.js`"), ["src/a.js", "src/b.js"]);
  });

  test("no file: plain code, names without a folder, folders, spans with spaces", () => {
    assert.deepEqual(taskFiles("Run `npm test`, edit `README.md`, see `src/`, `a / b.js` and plain src/x.js"), []);
    assert.deepEqual(taskFiles("no code at all"), []);
    assert.deepEqual(taskFiles(undefined), []);
  });

  test("URL-like spans without / are ignored; with / they need a file name", () => {
    assert.deepEqual(taskFiles("Use `example.com` and `https://example.com/`"), []);
  });

  test("Makefile and Dockerfile in a folder count as files", () => {
    assert.deepEqual(taskFiles("Edit `build/Makefile` and `docker/Dockerfile`, not `Makefiles/x`"), [
      "build/Makefile",
      "docker/Dockerfile",
    ]);
  });
});

describe("taskKind and kindChip (FR-035)", () => {
  const chip = (/** @type {string} */ f) => kindChip(taskKind(f));

  test("simulator_test.go → Go test", () => {
    assert.deepEqual(taskKind("internal/input/simulator_test.go"), { label: "Go", test: true });
    assert.equal(chip("internal/input/simulator_test.go"), "Go test");
  });

  test("labels from the extension table", () => {
    const cases = {
      "a/x.go": "Go",
      "a/X.vue": "Vue",
      "a/x.js": "JavaScript",
      "a/x.mjs": "JavaScript",
      "a/x.cjs": "JavaScript",
      "a/x.jsx": "JSX",
      "a/x.ts": "TypeScript",
      "a/x.tsx": "TSX",
      "a/x.py": "Python",
      "a/x.cs": "C#",
      "a/x.md": "Markdown",
      "a/x.yml": "YAML",
      "a/x.yaml": "YAML",
      "a/x.sh": "Shell",
      "a/x.SQL": "SQL",
    };
    for (const [file, label] of Object.entries(cases)) assert.equal(chip(file), label, file);
  });

  test("unknown extension → upper-cased extension", () => {
    assert.equal(chip("api/v1/service.proto"), "PROTO");
  });

  test("Makefile and Dockerfile → the name", () => {
    assert.equal(chip("build/Makefile"), "Makefile");
    assert.equal(chip("docker/Dockerfile"), "Dockerfile");
  });

  test("tests by name or folder", () => {
    assert.equal(chip("tests/e2e/x.spec.js"), "JavaScript test");
    assert.equal(chip("src/__tests__/a.js"), "JavaScript test");
    assert.equal(chip("e2e/login.ts"), "TypeScript test");
    assert.equal(chip("test/helpers.py"), "Python test");
    assert.equal(chip("pkg/test_utils.py"), "Python test");
    assert.equal(chip("pkg/list.tests.ts"), "TypeScript test");
    assert.equal(chip("src/latest.js"), "JavaScript");
    assert.equal(chip("src/contest/spectrum.js"), "JavaScript");
  });

  test("no file → null and an empty chip", () => {
    assert.equal(taskKind(undefined), null);
    assert.equal(kindChip(null), "");
  });
});

describe("taskRefs", () => {
  test("FR and SC references in order, deduplicated", () => {
    assert.deepEqual(taskRefs("Covers FR-015a, SC-004 and FR-002 (FR-015a again); not XFR-9"), ["FR-015a", "SC-004", "FR-002"]);
    assert.deepEqual(taskRefs("nothing"), []);
  });
});

describe("kindChips", () => {
  test("distinct labels without ' test', in first-appearance order", () => {
    const tasks = [
      { kind: { label: "Go", test: true } },
      { kind: null },
      { kind: { label: "Vue", test: false } },
      { kind: { label: "Go", test: false } },
    ];
    assert.deepEqual(kindChips(tasks), ["Go", "Vue"]);
  });
});

describe("build-model wiring", () => {
  test("tasks get files, kind and refs; the feature gets kindChips", async () => {
    const files = {
      "specs/001-x/spec.md": "# Feature Specification: X",
      "specs/001-x/tasks.md": [
        "## Phase 1: Core",
        "- [ ] T001 Write `internal/input/simulator_test.go` (FR-003)",
        "- [ ] T002 Build `internal/input/simulator.go` and `web/List.vue`",
        "- [ ] T003 Plain task",
      ].join("\n"),
    };
    const m = buildModel(await scan(createFakeReader(files), "proj"));
    const [t1, t2, t3] = m.features[0].phases[0].tasks;
    assert.deepEqual(t1.files, ["internal/input/simulator_test.go"]);
    assert.deepEqual(t1.kind, { label: "Go", test: true });
    assert.deepEqual(t1.refs, ["FR-003"]);
    assert.deepEqual(t2.files, ["internal/input/simulator.go", "web/List.vue"]);
    assert.deepEqual(t2.kind, { label: "Go", test: false });
    assert.deepEqual(t3.files, []);
    assert.equal(t3.kind, null);
    assert.deepEqual(m.features[0].kindChips, ["Go"]);
    assert.equal(t1.description, "Write `internal/input/simulator_test.go` (FR-003)");
  });
});
