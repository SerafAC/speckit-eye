import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSpec } from "../../src/parse/spec.js";

test("reads the first Feature Specification title", () => {
  const { title } = parseSpec("# Feature Specification: speckit-eye — Dashboard  \n# Feature Specification: Second");
  assert.equal(title, "speckit-eye — Dashboard");
});

test("title is null without a matching heading", () => {
  assert.equal(parseSpec("# Something else\n## Feature Specification: no").title, null);
  assert.equal(parseSpec("").title, null);
});

test("reads user stories with hyphen, en dash and em dash", () => {
  const { stories } = parseSpec(
    [
      "### User Story 1 - See progress at a glance (Priority: P1)",
      "### User Story 2 – Live updates (Priority: P2)",
      "### User Story 3 — Read artifacts (Priority: P3)",
      "###   User Story 10-Tight spacing(Priority:P1)",
    ].join("\n"),
  );
  assert.deepEqual(stories, [
    { label: "US1", title: "See progress at a glance", priority: "P1" },
    { label: "US2", title: "Live updates", priority: "P2" },
    { label: "US3", title: "Read artifacts", priority: "P3" },
    { label: "US10", title: "Tight spacing", priority: "P1" },
  ]);
});

test("ignores story headings without a priority or with the wrong level", () => {
  const { stories } = parseSpec(
    [
      "### User Story 1 - No priority",
      "## User Story 2 - Wrong level (Priority: P1)",
      "### User Story 3 - Priority text (Priority: high)",
      "### User Story 4: colon instead of dash (Priority: P1)",
    ].join("\n"),
  );
  assert.deepEqual(stories, []);
});

test("skips fenced code blocks and HTML comments, handles CRLF", () => {
  const { title, stories } = parseSpec(
    [
      "```markdown",
      "# Feature Specification: Template",
      "### User Story 9 - Example (Priority: P1)",
      "```",
      "<!-- ### User Story 8 - Commented (Priority: P1) -->",
      "# Feature Specification: Real",
      "### User Story 1 - Real story (Priority: P2)",
    ].join("\r\n"),
  );
  assert.equal(title, "Real");
  assert.deepEqual(stories, [{ label: "US1", title: "Real story", priority: "P2" }]);
});

test("never throws on odd input", () => {
  for (const input of [undefined, null, 5, "```", "<!--"]) {
    assert.deepEqual(parseSpec(input), { title: null, stories: [] });
  }
});

test("parses this repository's own spec format", () => {
  const spec = "# Feature Specification: X\n\n## User Scenarios & Testing *(mandatory)*\n\n### User Story 1 - Overview (Priority: P1)\n\nText\n";
  assert.deepEqual(parseSpec(spec), { title: "X", stories: [{ label: "US1", title: "Overview", priority: "P1" }] });
});
