import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseSpecStructure, answerBadge, splitScenario, requestText } from "../../src/parse/spec-structure.js";
import { SAMPLES, FULL, DEVIANT, EMPTY, NO_SECTIONS, EXCERPT_001 } from "./spec-samples.js";

/**
 * The coverage invariant (contracts/spec-md-structure.md "Invariant"):
 * blocks in file order, disjoint, covering every line.
 * @param {string} text
 */
function assertCovers(text) {
  const { blocks } = parseSpecStructure(text);
  const lines = text.split("\n").length;
  let next = 1;
  for (const b of blocks) {
    assert.equal(b.from, next, `block ${b.kind} starts at ${b.from}, expected ${next}`);
    assert.ok(b.to >= b.from, `block ${b.kind} ${b.from}-${b.to} is not empty`);
    next = b.to + 1;
  }
  assert.equal(next, lines + 1, "the blocks reach the last line");
  // Plain blocks carry their source unchanged.
  const src = text.split("\n");
  for (const b of blocks) {
    if (b.kind === "plain") assert.equal(b.markdown, src.slice(b.from - 1, b.to).join("\n"));
  }
}

const kinds = (text) => parseSpecStructure(text).blocks.map((b) => b.kind);
const find = (text, kind) => parseSpecStructure(text).blocks.filter((b) => b.kind === kind);

describe("parseSpecStructure: coverage invariant", () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    test(`${name}: blocks are disjoint and cover every line`, () => assertCovers(text));
  }

  test("CRLF line endings keep the invariant and the plain source", () => {
    assertCovers(FULL.replace(/\n/g, "\r\n"));
    assert.equal(find(FULL.replace(/\n/g, "\r\n"), "story").length, 2);
  });

  test("never throws on odd input", () => {
    for (const bad of [null, undefined, 42, {}, "\n\n\n", "## ", "###", "- Q: → A:", "**Input**:"]) {
      const s = parseSpecStructure(/** @type {any} */ (bad));
      assert.ok(Array.isArray(s.blocks));
    }
    assertCovers("\n\n\n");
  });

  test("an empty file is one plain block", () => {
    assert.deepEqual(parseSpecStructure(EMPTY), { metadata: null, request: null, blocks: [{ kind: "plain", from: 1, to: 1, markdown: "" }] });
  });

  test("a file without ## headings: title and one plain block", () => {
    assert.deepEqual(kinds(NO_SECTIONS), ["title", "plain"]);
  });
});

describe("parseSpecStructure: title, metadata and request", () => {
  test("title is the first # heading", () => {
    assert.deepEqual(find(FULL, "title"), [{ kind: "title", from: 1, to: 1, text: "Feature Specification: Byte Flow <Studio>" }]);
    assert.equal(find(DEVIANT, "title")[0].from, 3);
  });

  test("metadata: branch with code spans unwrapped, created, status", () => {
    const s = parseSpecStructure(FULL);
    assert.deepEqual(s.metadata, { branch: "005-byte-flow (created by the hook)", created: "2026-01-15", status: "Draft" });
    assert.deepEqual(
      s.blocks.filter((b) => b.kind === "metadata").map((b) => [b.field, b.from]),
      [["branch", 3], ["created", 5], ["status", 7]],
    );
  });

  test("missing fields are omitted; metadata is null when none is present", () => {
    assert.deepEqual(parseSpecStructure(DEVIANT).metadata, { created: "2026-02-01" });
    assert.equal(parseSpecStructure(NO_SECTIONS).metadata, null);
  });

  test("metadata lines after the first ## heading are plain", () => {
    const s = parseSpecStructure("# T\n\n## A\n\n**Status**: Draft\n");
    assert.equal(s.metadata, null);
    assert.deepEqual(s.blocks.map((b) => b.kind), ["title", "plain", "section", "plain"]);
  });

  test("request: User description and one pair of quotes removed", () => {
    const s = parseSpecStructure(FULL);
    assert.equal(s.request, "Build a *visual* editor for byte flows. Keep it <script>alert(1)</script> simple.");
    assert.deepEqual(find(FULL, "request").map((b) => b.from), [9]);
    assert.match(parseSpecStructure(EXCERPT_001).request, /^handoff from `\.specify/);
  });

  test("requestText examples", () => {
    assert.equal(requestText('User description: "Quoted"'), "Quoted");
    assert.equal(requestText("User description: “Curly”"), "Curly");
    assert.equal(requestText('"only one pair" "kept"'), 'only one pair" "kept');
    assert.equal(requestText("No prefix"), "No prefix");
  });
});

describe("parseSpecStructure: sections", () => {
  test("every ## heading is a numbered section with a 001 slug", () => {
    const sections = find(FULL, "section");
    assert.deepEqual(
      sections.map((s) => [s.number, s.heading, s.anchor]),
      [
        ["01", "Clarifications", "clarifications"],
        ["02", "User Scenarios & Testing *(mandatory)*", "user-scenarios-testing-mandatory"],
        ["03", "Requirements *(mandatory)*", "requirements-mandatory"],
        ["04", "Success Criteria *(mandatory)*", "success-criteria-mandatory"],
      ],
    );
  });

  test("repeated headings get unique anchors", () => {
    assert.deepEqual(find("## A\n## A\n## A\n", "section").map((s) => s.anchor), ["a", "a-1", "a-2"]);
  });

  test("lines inside fences and HTML comments are never matched", () => {
    const s = parseSpecStructure(DEVIANT);
    const headings = s.blocks.filter((b) => b.kind === "section").map((b) => b.heading);
    assert.deepEqual(headings, ["Clarifications", "User Scenarios", "Notes"]);
    assert.deepEqual(s.blocks.filter((b) => b.kind === "story").map((b) => b.id), ["US1"]);
    const plains = s.blocks.filter((b) => b.kind === "plain").map((b) => b.markdown).join("\n");
    assert.match(plains, /### User Story 9 - Inside a fence/);
    assert.match(plains, /### User Story 8 - Inside a comment/);
  });
});

describe("parseSpecStructure: clarifications", () => {
  test("sessions with their items, answered count", () => {
    const [c] = find(FULL, "clarifications");
    assert.equal(c.answered, 6);
    assert.deepEqual(c.sessions.map((s) => [s.date, s.heading, s.anchor, s.items.length]), [
      ["2026-01-16", "Session 2026-01-16", "session-2026-01-16", 5],
      ["2026-01-20", "Session 2026-01-20", "session-2026-01-20", 1],
    ]);
    assert.equal(c.from, 12);
    assert.equal(c.to, 25);
  });

  test("contract examples: badges and answers shown in full", () => {
    const items = find(FULL, "clarifications")[0].sessions.flatMap((s) => s.items);
    assert.deepEqual(items[0], { kind: "qa", question: "Is USB input required?", answer: "No. Deferred to v2.", badge: "no", from: 15, to: 15 });
    assert.equal(items[1].badge, "yes");
    assert.deepEqual([items[2].answer, items[2].badge], ["Merge them: one level only.", "neutral"]);
    assert.equal(items[5].badge, "yes");
  });

  test("-> arrows and indented continuation lines", () => {
    const item = find(FULL, "clarifications")[0].sessions[0].items[3];
    assert.equal(item.question, "Which export format?");
    assert.equal(item.answer, "JSON, with a\nversion field on the first line.");
    assert.deepEqual([item.from, item.to], [18, 19]);
  });

  test("answerBadge trims punctuation and looks at the first word only", () => {
    assert.equal(answerBadge("No. Deferred"), "no");
    assert.equal(answerBadge("**Yes**, always"), "yes");
    assert.equal(answerBadge("Yes: a ⌘K search"), "yes");
    assert.equal(answerBadge("Nope"), "neutral");
    assert.equal(answerBadge("Not now"), "neutral");
    assert.equal(answerBadge(""), "neutral");
  });

  test("items not in Q → A form stay as plain parts, in order", () => {
    const [c] = find(DEVIANT, "clarifications");
    assert.equal(c.answered, 1);
    const [intro, session] = c.sessions;
    assert.equal(intro.date, null);
    assert.equal(intro.heading, null);
    assert.deepEqual(intro.items.map((i) => i.kind), ["plain"]);
    assert.match(intro.items[0].markdown, /^Answers were collected in a meeting\.\n\n- Q: Something without an answer arrow\n- A question in prose/);
    assert.equal(session.items[0].answer, "Neutral answer here.\nFree text in the session.");
  });
});

describe("parseSpecStructure: user stories", () => {
  test("id, priority, title, description, why, test", () => {
    const [s1, s2] = find(FULL, "story");
    assert.equal(s1.id, "US1");
    assert.equal(s1.priority, "P1");
    assert.equal(s1.title, "Build a flow");
    assert.equal(s1.anchor, "user-story-1-build-a-flow-priority-p1");
    assert.equal(s1.description, "A user drags blocks onto a canvas.\n\nA second paragraph of description.");
    assert.equal(s1.why, "It is the core of the product.");
    assert.equal(s1.test, "Open the editor and add two blocks.");
    assert.equal(s2.id, "US2");
    assert.equal(s2.scenarios.length, 1);
  });

  test("a story ends before --- (the rule stays plain)", () => {
    const s = parseSpecStructure(FULL);
    const i = s.blocks.findIndex((b) => b.kind === "story");
    assert.equal(s.blocks[i + 1].kind, "plain");
    assert.match(s.blocks[i + 1].markdown, /^---/);
  });

  test("scenarios: exactly one Given/When/Then in order, trailing , and ; trimmed", () => {
    const [s1] = find(FULL, "story");
    assert.deepEqual(s1.scenarios[0], { number: 1, given: "a blank canvas", when: "the user adds a block", then: "a flow forms.", from: 40, to: 40 });
    assert.deepEqual(
      [s1.scenarios[1].given, s1.scenarios[1].when, s1.scenarios[1].then],
      ["a flow with two blocks", "the user links them", "the link is drawn"],
    );
    assert.deepEqual([s1.scenarios[1].from, s1.scenarios[1].to], [41, 42]);
    assert.deepEqual(s1.scenarios[2], { number: 3, raw: "**Given** A, **Then** B; **Given** C, **Then** D.", from: 43, to: 43 });
  });

  test("splitScenario contract examples", () => {
    assert.deepEqual(splitScenario("**Given** a blank canvas, **When** the user adds a block, **Then** a flow forms."), {
      given: "a blank canvas",
      when: "the user adds a block",
      then: "a flow forms.",
    });
    assert.equal(splitScenario("**Given** A, **Then** B; **Given** C, **Then** D."), null);
    assert.equal(splitScenario("**When** A, **Given** B, **Then** C"), null);
    assert.equal(splitScenario("Before **Given** A, **When** B, **Then** C"), null);
  });

  test("scenarios without a single Given/When/Then are raw; stray text keeps its place", () => {
    const [story] = find(DEVIANT, "story");
    assert.deepEqual(
      story.scenarios.map((s) => [s.number, s.raw]),
      [
        [1, "The user does something and sees something."],
        [2, "**Given** X, **Given** Y, **When** Z, **Then** W."],
        [3, "Before **Given** A, **When** B, **Then** C."],
        [null, "Trailing paragraph after the list."],
      ],
    );
    assert.equal(story.why, null);
    assert.equal(story.test, null);
  });
});

describe("parseSpecStructure: requirements and entities", () => {
  test("areas from bold-only paragraphs; items before the first area form an unnamed area", () => {
    const [r] = find(FULL, "requirements");
    assert.equal(r.heading, "Functional Requirements");
    assert.equal(r.anchor, "functional-requirements");
    assert.deepEqual(r.areas.map((a) => a.name), [null, "Editing", "Sharing"]);
    assert.deepEqual(r.areas[0].items.map((i) => i.id), ["FR-000"]);
    assert.deepEqual(r.areas[1].items.map((i) => i.id), ["FR-001", "FR-002"]);
    assert.equal(r.areas[1].items[1].text, "The editor SHOULD snap blocks to a grid and SHOULD NOT hide the grid.\nIt MAY show guides while dragging.");
    assert.deepEqual(r.areas[2].items.map((i) => i.kind), ["requirement", "plain"]);
    assert.equal(r.areas[2].items[1].markdown, "Some text that is not a requirement.");
  });

  test("requirements end at the next ### heading", () => {
    const s = parseSpecStructure(FULL);
    const r = s.blocks.find((b) => b.kind === "requirements");
    const e = s.blocks.find((b) => b.kind === "entities");
    assert.equal(e.from, r.to + 1);
  });

  test("key entities: name and description; other lines plain", () => {
    const [e] = find(FULL, "entities");
    assert.deepEqual(e.items.map((i) => [i.kind, i.name, i.description]), [
      ["entity", "Flow", "an ordered set of blocks and links."],
      ["entity", "Block", "one step of a flow."],
    ]);
    const [e2] = find("### Key Entities\n\nIntro.\n\n- **A**: a\n- plain item\n", "entities");
    assert.deepEqual(e2.items.map((i) => i.kind), ["plain", "entity", "plain"]);
  });

  test("a non-template ### heading stays in a plain block", () => {
    assert.equal(find(DEVIANT, "requirements").length, 0);
    assert.ok(find(DEVIANT, "plain").some((b) => /### Requirements\n\n- \*\*FR-001\*\*/.test(b.markdown)));
  });

  test("the 001 excerpt is recognized as a whole", () => {
    assert.deepEqual(
      kinds(EXCERPT_001).filter((k) => k !== "plain"),
      ["title", "metadata", "metadata", "metadata", "request", "section", "clarifications", "section", "story", "story", "section", "requirements", "entities", "section", "section"],
    );
    const s = parseSpecStructure(EXCERPT_001);
    assert.equal(s.metadata?.branch, "001-speckit-eye-dashboard (spec directory; no branch was created by a hook — work continues on main until a feature branch is cut)");
    const [r] = find(EXCERPT_001, "requirements");
    assert.deepEqual(r.areas.map((a) => [a.name, a.items.length]), [["Running the tool", 2], ["Documentation", 1]]);
  });
});
