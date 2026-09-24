# Contract: Recognized `tasks.md` and `spec.md` Format

This contract defines what the parser recognizes (FR-009, FR-011, FR-013, FR-015c) and the warnings it raises for anything else. It follows Spec Kit 1.0.10 `tasks-template.md` and `spec-template.md`.

## General

- Lines are split on `\n`; a trailing `\r` is ignored.
- Lines inside fenced code blocks (from a ```` ``` ```` or `~~~` opener to the matching closer) are ignored. HTML comments (`<!-- … -->`, including multi-line ones) are ignored too; the template's sample tasks are inside comments in some versions.
- Everything is case-sensitive unless stated otherwise.

## tasks.md

| Element | Pattern (JS regex, applied per line) | Result |
|---|---|---|
| Phase heading | `^##\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$` | Starts a new Phase(number, title). Other `##`/`###` headings are ignored (for example `### Tests for User Story 1`). |
| Task line | `^\s*[-*]\s+\[( \|x\|X)\]\s+(.*)$` | A checkbox item. Everything below applies to the captured rest `R`. |
| Task ID | `^(T\d+)\b` at the start of `R` | `id`; if missing → task with `id = null` and **W1**. |
| Markers | `\[P\]` and `\[(US\d+)\]` tokens directly after the ID, in any order | `parallel`, `story`. A second story label → the first one is used, plus **W2**. |
| Dependencies | `depends on\s+(T\d+(?:\s*(?:,\s*and\|,\|and\|&)\s*T\d+)*)` (case-insensitive, anywhere in the description; accepts `T1, T2`, `T1 and T2`, `T1, and T2`, `T1 & T2`) | `dependsOn` IDs. |
| Description | `R` without the ID and markers, trimmed | `description` |

Counting rule (M5): **every** task line counts: `done` for `x`/`X`, open for a space. This includes lines that raise a warning. That way the totals always equal the number of checkboxes in the file outside code blocks and comments.

## spec.md (stories only)

| Element | Pattern | Result |
|---|---|---|
| Title | `^#\s+Feature Specification:\s*(.+)$` (first match) | Feature `title` |
| User story | `^###\s+User Story\s+(\d+)\s*[-–—]\s*(.+?)\s*\(Priority:\s*(P\d+)\)\s*$` | Story(`US<n>`, title, priority) |

## Warnings

| Code | Condition | Message (to stderr and the feature in the tree) |
|---|---|---|
| W1 | Task line without a `T###` ID | `checkbox without a task ID (counted)` |
| W2 | More than one `[USn]` on a task | `task has several story labels; using <first>` |
| W3 | Task before the first phase heading | `task outside any "## Phase N:" section (shown under Unphased)` |
| W4 | `[USn]` with no matching story in `spec.md` | `story label USn has no matching user story in spec.md` |
| W5 | Duplicate task ID in one file | `duplicate task ID Tnnn (both counted)` |
| W12 | Same phase number used by more than one `## Phase N:` heading | `duplicate phase number N (both shown)` |
| W6 | `depends on` names an ID not in this file | `dependency Tnnn not found (ignored)` |
| W7 | The next open task has an open dependency | `next task Tnnn depends on open task Tmmm` |
| W8 | `tasks.md` exists but has no task lines | `tasks.md contains no tasks` |
| W9 | File unreadable or not valid UTF-8 | `could not read file (skipped)` |
| W10 | `feature.json` unreadable, or names a missing feature | `.specify/feature.json does not name an existing feature (ignored)` |
| W11 | File or folder name outside `[A-Za-z0-9._-]` | `name not supported for a page (skipped)` |

The parser never throws on content. Only read errors from the file system turn into W9.
