/**
 * In-memory `spec.md` samples for the structured reader tests
 * (contracts/spec-md-structure.md). Unit tests never read files (§IV); the
 * same checks over the real files of the fixtures and of this repository's
 * `specs/` run end to end (tests/e2e/us5-reader.spec.js, SC-012).
 */

/** A spec that follows the Spec Kit template in every part. */
export const FULL = `# Feature Specification: Byte Flow <Studio>

**Feature Branch**: \`005-byte-flow\` (created by the hook)

**Created**: 2026-01-15

**Status**: Draft

**Input**: User description: "Build a *visual* editor for byte flows. Keep it <script>alert(1)</script> simple."

## Clarifications

### Session 2026-01-16

- Q: Is USB input required? → A: No. Deferred to v2.
- Q: Should flows autosave? → A: Yes, every 5 seconds.
- Q: How should phases nest? → A: Merge them: one level only.
- Q: Which export format? -> A: JSON, with a
  version field on the first line.
- Q: Undo depth? → A: 50 steps.

### Session 2026-01-20

- Q: Dark mode? → A: yes — follow the OS.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a flow (Priority: P1)

A user drags blocks onto a canvas.

A second paragraph of description.

**Why this priority**: It is the core of the product.

**Independent Test**: Open the editor and add two blocks.

**Acceptance Scenarios**:

1. **Given** a blank canvas, **When** the user adds a block, **Then** a flow forms.
2. **Given** a flow with two blocks, **When** the user links them;
   **Then** the link is drawn,
3. **Given** A, **Then** B; **Given** C, **Then** D.

---

### User Story 2 - Share a flow (Priority: P2)

Users share flows by link.

**Why this priority**: Sharing comes second.

**Independent Test**: Copy a link and open it.

**Acceptance Scenarios**:

1. **Given** a saved flow, **When** the user copies its link, **Then** the link opens the flow.

---

### Edge Cases

- What happens when the canvas is empty?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-000**: The editor MUST start in under a second.

**Editing**

- **FR-001**: Users MUST be able to add blocks; blocks MUST NOT overlap.
- **FR-002**: The editor SHOULD snap blocks to a grid and SHOULD NOT hide the grid.
  It MAY show guides while dragging.

**Sharing**

- **FR-003**: Links MUST open read-only. \`MUST\` in code stays plain.

Some text that is not a requirement.

### Key Entities

- **Flow**: an ordered set of blocks and links.
- **Block**: one step of a flow.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A flow is built in under a minute.
`;

/**
 * Every deviation of the contract: non-template sections, clarifications
 * not in `Q: … → A:` form, scenarios without a single Given/When/Then, and
 * fences and HTML comments holding look-alike lines.
 */
export const DEVIANT = `Intro text before any heading.

# Feature Specification: Odd One

**Created**: 2026-02-01
**Owner**: someone

## Clarifications

Answers were collected in a meeting.

- Q: Something without an answer arrow
- A question in prose? Yes, answered in prose.

### Session 2026-02-02

- Q: Real one? → A: Neutral answer here.
Free text in the session.

## User Scenarios

Free text under "User Scenarios" without any story heading.

\`\`\`md
### User Story 9 - Inside a fence (Priority: P1)
## Not a section
- Q: fenced? → A: No
\`\`\`

<!--
### User Story 8 - Inside a comment (Priority: P2)
## Hidden section
-->

### User Story 1 - Loose story (Priority: P3)

**Acceptance Scenarios**:

1. The user does something and sees something.
2. **Given** X, **Given** Y, **When** Z, **Then** W.
3. Before **Given** A, **When** B, **Then** C.

Trailing paragraph after the list.

### Requirements

- **FR-001**: Under a non-template heading, so plain.

## Notes
Plain notes with a table:

| A | B |
|---|---|
| 1 | 2 |
`;

/** An empty file. */
export const EMPTY = "";

/** A file without any `## ` heading. */
export const NO_SECTIONS = `# Just a title

Some text.

- a list
- of things
`;

/**
 * The structure of this repository's 001 spec: metadata with a code span in
 * the branch, an unquoted request, one session, stories separated by `---`,
 * requirement areas, key entities, success criteria and assumptions.
 */
export const EXCERPT_001 = `# Feature Specification: speckit-eye — Zero-Setup Spec Kit Progress Dashboard

**Feature Branch**: \`001-speckit-eye-dashboard\` (spec directory; no branch was created by a hook — work continues on \`main\` until a feature branch is cut)

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: handoff from \`.specify/assessments/speckit-dashboard/decision.md\` (verdict: go, Option A). Spec Kit users cannot see at a glance where a project stands.

## Clarifications

### Session 2026-09-24

- Q: Which Node.js version? → A: Node.js 22 or newer.
- Q: Should the tool write into the project? → A: No; it only reads.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where the project stands at a glance (Priority: P1)

A Spec Kit user runs one command and sees the overview.

**Why this priority**: The overview is the product.

**Independent Test**: Run against a fixture and compare the numbers.

**Acceptance Scenarios**:

1. **Given** a project with 3 features, **When** the overview opens, **Then** it lists 3 features.
2. **Given** an active feature, **When** the page loads, **Then** only it is expanded; **When** the user clicks another, **Then** that one opens.

---

### User Story 2 - Follow progress live during a long run (Priority: P2)

The page updates while tasks are checked.

**Why this priority**: Long runs need it.

**Independent Test**: Check a box and watch the page.

**Acceptance Scenarios**:

1. **Given** serve mode, **When** a task is checked, **Then** the page updates within 2 s.

---

### Edge Cases

- A \`tasks.md\` without phases.

## Requirements *(mandatory)*

### Functional Requirements

**Running the tool**

- **FR-001**: The tool MUST run with one command.
- **FR-002**: The tool MUST NOT write into the project.

**Documentation**

- **FR-040**: The README SHOULD explain usage.

### Key Entities

- **Project**: the folder the tool reads.
- **Feature**: one folder under \`specs/\`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The overview loads in under 2 s.

## Assumptions

- Users have Node.js installed.
`;

/** Every sample by name, for tests that run over all of them. */
export const SAMPLES = { FULL, DEVIANT, EMPTY, NO_SECTIONS, EXCERPT_001 };

/** Joins the parts of a source line that the view shows apart. */
const SEP = "\u0000";

/**
 * The parts of one source line that must appear in the formatted view
 * (SC-012), each as a list of lower-case words. Markdown syntax, link
 * targets and the template labels the view turns into structure (story
 * heading prefix and priority, `Q:` / `→ A:`, `**Given**` / `**When**` /
 * `**Then**`, `**Input**: User description:`, list numbers and task boxes)
 * separate parts instead of being words; fence delimiter lines have none.
 * @param {string} line
 * @returns {string[][]}
 */
export function lineParts(line) {
  if (/^\s*(`{3,}|~{3,})/.test(line)) return [];
  const s = line
    .replace(/^\s*#{1,6}\s+User Story\s+\d+\s*[-–—]\s*/, SEP)
    .replace(/\(Priority:\s*P\d+\)\s*$/, SEP)
    .replace(/^\s*[-*+]\s+Q:\s*/, SEP)
    .replace(/\s*(→|->)\s*A:\s*/g, SEP)
    .replace(/\*\*(Given|When|Then)\*\*/g, SEP)
    .replace(/^\s*\*\*Input\*\*:\s*(User description:\s*)?/, SEP)
    .replace(/^\s*(>\s*)*\d+[.)]\s+/, SEP)
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, SEP)
    .replace(/\]\([^)]*\)/g, "]");
  return s
    .split(SEP)
    .map((part) => (part.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.toLowerCase()))
    .filter((words) => words.length > 0);
}

/**
 * The words of an HTML fragment's text, lower-cased, tags removed and the
 * five escapes of `html.js` decoded.
 * @param {string} html
 * @returns {string[]}
 */
export function htmlWords(html) {
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.toLowerCase());
}

/**
 * The non-blank source lines of `source` with a part missing from `words`
 * (each part must appear as a contiguous run of words).
 * @param {string} source
 * @param {string[]} words the view's words (htmlWords, or a page's text)
 * @returns {string[]} the lines not found, empty when every line appears
 */
export function missingLines(source, words) {
  const hay = ` ${words.join(" ")} `;
  return source
    .split("\n")
    .filter((line) => line.trim() !== "")
    .filter((line) => lineParts(line).some((part) => !hay.includes(` ${part.join(" ")} `)));
}
