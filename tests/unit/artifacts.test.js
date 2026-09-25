import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isValidName,
  classifyKind,
  sortFeatureArtifacts,
  sortAssessmentArtifacts,
  artifactTitle,
  sourceToUrl,
  compareStrings,
} from "../../src/project/artifacts.js";

describe("isValidName", () => {
  test("accepts letters, digits, dot, underscore and hyphen", () => {
    for (const n of ["001-speckit-eye", "spec.md", "data_model.md", "A.b-C_9"]) assert.equal(isValidName(n), true, n);
  });
  test("rejects anything else, including dot-only names", () => {
    for (const n of ["my spec.md", "ünï.md", "a/b", "a\\b", "", "x?.md", "<b>.md", ".", ".."]) {
      assert.equal(isValidName(n), false, JSON.stringify(n));
    }
  });
});

describe("classifyKind", () => {
  const cases = {
    "specs/001-x/spec.md": "spec",
    "specs/001-x/plan.md": "plan",
    "specs/001-x/research.md": "research",
    "specs/001-x/data-model.md": "data-model",
    "specs/001-x/quickstart.md": "quickstart",
    "specs/001-x/tasks.md": "tasks",
    "specs/001-x/contracts/cli.md": "contract",
    "specs/001-x/contracts/sub/api.md": "contract",
    "specs/001-x/checklists/requirements.md": "checklist",
    "specs/001-x/notes.md": "other",
    "specs/001-x/docs/spec.md": "other",
    ".specify/memory/constitution.md": "constitution",
    ".specify/assessments/a1/intake.md": "assessment",
    "README.md": "other",
  };
  for (const [source, kind] of Object.entries(cases)) {
    test(`${source} → ${kind}`, () => assert.equal(classifyKind(source), kind));
  }
});

describe("sortFeatureArtifacts", () => {
  test("orders by kind, contracts and checklists by name, the rest by path", () => {
    const sources = [
      "specs/x/zeta.md",
      "specs/x/checklists/ux.md",
      "specs/x/tasks.md",
      "specs/x/contracts/routes.md",
      "specs/x/alpha.md",
      "specs/x/checklists/requirements.md",
      "specs/x/quickstart.md",
      "specs/x/contracts/cli.md",
      "specs/x/data-model.md",
      "specs/x/research.md",
      "specs/x/plan.md",
      "specs/x/spec.md",
    ];
    const list = sources.map((source) => ({ source, kind: classifyKind(source) }));
    const sorted = sortFeatureArtifacts(list).map((a) => a.source);
    assert.deepEqual(sorted, [
      "specs/x/spec.md",
      "specs/x/plan.md",
      "specs/x/research.md",
      "specs/x/data-model.md",
      "specs/x/quickstart.md",
      "specs/x/tasks.md",
      "specs/x/contracts/cli.md",
      "specs/x/contracts/routes.md",
      "specs/x/checklists/requirements.md",
      "specs/x/checklists/ux.md",
      "specs/x/alpha.md",
      "specs/x/zeta.md",
    ]);
  });
  test("does not mutate its input", () => {
    const list = [{ source: "specs/x/plan.md", kind: "plan" }, { source: "specs/x/spec.md", kind: "spec" }];
    sortFeatureArtifacts(list);
    assert.equal(list[0].kind, "plan");
  });
});

describe("sortAssessmentArtifacts", () => {
  test("puts intake, research, problem, concept, decision first, then the rest by name", () => {
    const base = ".specify/assessments/a1/";
    const list = ["notes.md", "decision.md", "appendix.md", "concept.md", "problem.md", "research.md", "intake.md"].map(
      (n) => ({ source: base + n }),
    );
    assert.deepEqual(
      sortAssessmentArtifacts(list).map((a) => a.source.slice(base.length)),
      ["intake.md", "research.md", "problem.md", "concept.md", "decision.md", "appendix.md", "notes.md"],
    );
  });
});

describe("artifactTitle", () => {
  test("uses the first level-1 heading", () => {
    assert.equal(artifactTitle("intro\n## Sub\n# Implementation Plan: X\n# Second", "plan.md"), "Implementation Plan: X");
  });
  test("handles CRLF and closing hashes", () => {
    assert.equal(artifactTitle("# Title #\r\nbody", "a.md"), "Title");
  });
  test("ignores headings inside fenced code", () => {
    assert.equal(artifactTitle("```md\n# Not this\n```\n# This", "a.md"), "This");
    assert.equal(artifactTitle("~~~\n# Not this\n~~~", "a.md"), "a.md");
  });
  test("falls back to the file name", () => {
    assert.equal(artifactTitle("no heading\n##Also not", "notes.md"), "notes.md");
    assert.equal(artifactTitle("#NoSpace", "n.md"), "n.md");
    assert.equal(artifactTitle("", "empty.md"), "empty.md");
  });
});

describe("sourceToUrl", () => {
  test("maps the constitution, feature and assessment sources", () => {
    assert.equal(sourceToUrl(".specify/memory/constitution.md"), "constitution.html");
    assert.equal(sourceToUrl("specs/001-x/plan.md"), "features/001-x/plan.html");
    assert.equal(sourceToUrl("specs/001-x/contracts/cli.md"), "features/001-x/contracts/cli.html");
    assert.equal(sourceToUrl(".specify/assessments/a1/intake.md"), "assessments/a1/intake.html");
    assert.equal(sourceToUrl(".specify/assessments/a1/sub/x.md"), "assessments/a1/sub/x.html");
  });
  test("returns null for sources without a page", () => {
    assert.equal(sourceToUrl("README.md"), null);
    assert.equal(sourceToUrl("specs/001-x/image.png"), null);
    assert.equal(sourceToUrl(".specify/memory/other.md"), null);
  });
});

test("compareStrings returns 0 for equal strings", () => {
  assert.equal(compareStrings("a", "a"), 0);
});

test("compareStrings is a plain code-unit compare", () => {
  assert.deepEqual(["b", "B", "a", "10", "9"].sort(compareStrings), ["10", "9", "B", "a", "b"]);
});
