# Contract: Recognized `spec.md` Structure

How `src/parse/spec-structure.js` turns a `spec.md` into the blocks the reader renders (FR-042, FR-043, research D13). It extends the "spec.md" part of [001 tasks-md-format.md](../../001-speckit-eye-dashboard/contracts/tasks-md-format.md), which still decides the feature title and the story list used by the tree.

## Invariant

The parser returns `blocks` in file order. Every block has `from` and `to` (1-based, inclusive). **The ranges are disjoint and together cover every line of the file.** Any line the rules below do not claim ends up in a `plain` block, which the 001 Markdown renderer renders. The parser never throws and never drops or rewrites text; unit tests assert the invariant for every fixture and for every `spec.md` in this repository (SC-012).

Lines inside fenced code blocks and HTML comments (001 `visibleLines`) are never matched by the rules below; they stay in whatever block contains them, which is a `plain` block unless they sit inside a recognized item's text.

## Rules

Line patterns are matched on the trimmed line. "Section" means the lines from a `## ` heading up to the next `## ` heading or the end of the file.

| Block | Recognized when | Content |
|---|---|---|
| `title` | First line `# Feature Specification: <title>` (or any first `# ` heading) | the heading text |
| metadata | Lines `**Feature Branch**: …`, `**Created**: …`, `**Status**: …` before the first `## ` heading | `{branch, created, status}` — each value's inline Markdown, code spans unwrapped for `branch`. Missing fields are omitted; no metadata card when none is present. |
| request | A line `**Input**: …` before the first `## ` heading. A leading `User description:` and one pair of surrounding quotes (`"…"`, `“…”`) are removed for display only | pull quote text |
| `section` | Every `## ` heading | `number` = position among `## ` headings, two digits (`01`); `heading`; `anchor` (001 slug) |
| `clarifications` | Section heading `## Clarifications` | Sessions: each `### Session <date>` heading (`<date>` is the rest of the line). Items: lines `- Q: <question> → A: <answer>` (also `->`), continued by following indented lines. |
| answer badge | First word of `<answer>` after trimming punctuation | `Yes` → `yes`; `No` → `no`; anything else → `neutral` (shown as "A"). The answer text is shown in full, including its first word. |
| `story` | `### User Story <n> - <title> (Priority: P<k>)` (001 pattern) up to the next `### `, `## ` or `---` line | `id` = `US<n>`, `priority`, `title`; `description` = paragraphs before the first labelled part; `**Why this priority**: …` → `why`; `**Independent Test**: …` → `test`; `**Acceptance Scenarios**:` followed by a numbered list → `scenarios` |
| scenario | One numbered list item (continuation lines included) | If the item has exactly one `**Given**`, one `**When**` and one `**Then**`, in that order: `given`, `when`, `then` = the text between them with trailing `,`/`;` trimmed. Otherwise `raw` = the whole item, shown as one full-width row. |
| `requirements` | `### Functional Requirements` up to the next `### ` or `## ` | Areas: a paragraph consisting only of `**<Area>**` starts an area. Requirements: list items starting with `**FR-<id>**:` (continuation lines included). Requirements before the first area heading form an unnamed area. Lines that are neither become `plain` blocks between them. |
| normative keywords | Inside requirement text | `MUST NOT`, `MUST`, `SHOULD NOT`, `SHOULD`, `MAY` as whole upper-case words are wrapped in a highlight (longest match first) |
| `entities` | `### Key Entities` up to the next `### ` or `## ` | Items: list items `- **<name>**: <description>`; anything else becomes `plain` |
| `plain` | Everything else | The Markdown source of the range |

Any `### ` heading not listed above (for example `### Edge Cases`, `### Measurable Outcomes`) stays inside a `plain` block with its content.

## Rendering notes

- All text parts are rendered with the shared `markdown-it` instance (raw HTML off, 001 link rules), so they are safe exactly as the plain blocks are (001 FR-024).
- First clarification session open, others collapsed; per session the first three items visible, the rest behind "Show N more answers" (a `<details>`, so it works without JS).
- First user story open as a card; others as collapsed `<details>` rows with ID, priority, title and scenario count.
- Requirements: all areas rendered in order with area headings (no JS); with JS the area chips filter them, "All" selected by default.
- Contents panel entries: every `section` block, and under the user-scenarios section every `story` block (`US1 · <title>`).

## Examples

| Source | Result |
|---|---|
| `- Q: Is USB input required? → A: No. Deferred to v2.` | badge `no`, answer "No. Deferred to v2." |
| `- Q: How should phases nest? → A: Merge them: …` | badge `neutral`, answer "Merge them: …" |
| `1. **Given** a blank canvas, **When** the user adds a block, **Then** a flow forms.` | given "a blank canvas", when "the user adds a block", then "a flow forms." |
| `1. **Given** A, **Then** B; **Given** C, **Then** D.` | `raw` row (no single Given/When/Then) |
| `### Requirements` (non-template heading) | stays in a `plain` block |
