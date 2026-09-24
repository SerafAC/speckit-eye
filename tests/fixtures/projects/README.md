# Fixture projects

Small Spec Kit projects used by the unit and end-to-end tests. Each folder is a
complete project root. E2E tests copy a fixture to a temporary folder before
running the tool against it (`tests/e2e/helpers.js`), so the files here are
never modified. If you change a fixture, update the expectations below and the
tests that rely on them.

Counts are written as `done/total`. "Open" is `total - done`.

## `mixed/`

Four features in different states, a constitution, and one assessment. This is
the main US1 fixture (spec US1 AC1, AC2, AC5, AC8).

| Path | Content |
|---|---|
| `.specify/memory/constitution.md` | Constitution |
| `.specify/assessments/speckit-dashboard/intake.md`, `decision.md` | Assessment `speckit-dashboard` |
| `specs/001-alpha/` | `spec.md` (US1, US2), `plan.md`, `tasks.md` |
| `specs/002-beta/` | `spec.md` (US1–US3), `plan.md`, `tasks.md` |
| `specs/003-gamma/` | `spec.md` (US1), `plan.md`, `tasks.md` |
| `specs/004-delta/` | `spec.md` only |

Project totals: tasks **40/65 (62 %)**, 25 open; specs completed **1/4**; phases
completed **5/9**. No `.specify/feature.json` and no git repository, so the
active feature is the first feature with open tasks (`source: first-open`).

| Feature | Stage | Tasks | Status in tree |
|---|---|---|---|
| `001-alpha` | complete | 30/30 (0 open / 30) | done, collapsed |
| `002-beta` | in-progress | 10/20 (10 open / 20) | started, **active**, expanded |
| `003-gamma` | ready | 0/15 (15 open / 15) | not-started, collapsed |
| `004-delta` | specified | 0/0 (no `tasks.md`, not in the task total) | not-started, collapsed |

Phases and stories:

| Phase key | Title | Tasks | Story display |
|---|---|---|---|
| `001-alpha/p1` | Setup | 5/5 | unlabeled |
| `001-alpha/p2` | User Story 1 … | 15/15 | merged `US1` (Alpha overview, P1) |
| `001-alpha/p3` | User Story 2 … | 10/10 | merged `US2` (Alpha details, P2) |
| `002-beta/p1` | Setup | 4/4 | unlabeled |
| `002-beta/p2` | Foundational | 3/3 | unlabeled |
| `002-beta/p3` | User Story 1 … | 3/6 | merged `US1` (Beta listing, P1); **active phase** |
| `002-beta/p4` | User Stories 2 and 3 | 0/7 | groups `US2` 0/3, `US3` 0/3, plus unlabeled `T019` directly under the phase |
| `003-gamma/p1` | Setup | 0/5 | unlabeled |
| `003-gamma/p2` | User Story 1 … | 0/10 | merged `US1` (Gamma import, P1) |

Active selection: feature `002-beta`, phase `002-beta/p3`, no story label
(the phase has no groups), next task `002-beta/T011` ("List paging").

Task states in `002-beta`: `T001`–`T010` completed, `T011` current, `T018`
("Search box, depends on T011") **blocked** because `T011` is open, every
other open task future. No warnings.

## `complete/`

Two features with every task checked (a mix of `[x]` and `[X]`) and a
constitution (spec US1 AC7).

| Feature | Stage | Tasks | Phases |
|---|---|---|---|
| `001-first` | complete | 4/4 | `p1` Setup 2/2; `p2` merged `US1` 2/2 |
| `002-second` | complete | 4/4 | `p1` Setup 1/1; `p2` groups `US1` 1/1, `US2` 1/1, unlabeled `T004` |

Project totals: tasks **8/8 (100 %)**; specs **2/2**; phases **4/4**.

- Without `.specify/feature.json`: nothing is active (`source: none`), no
  "Next" line, and the page states that all tasks are complete.
- With `.specify/feature.json` naming `specs/002-second` (written by the E2E
  test into its temporary copy): `002-second` is active (`source:
  feature.json`), expanded, `data-active`, `data-status="done"`; no phase,
  story or next task; the all-complete message is still shown.

No warnings.

## `empty/`

An empty `specs/` folder (kept in git by `specs/.gitkeep`) and
`.specify/memory/constitution.md`. Zero features; totals tasks **0/0 (0 %)**,
specs 0/0, phases 0/0; nothing active. The overview shows a short explanation
instead of an empty tree (edge case "Empty project").

## `nonstandard/`

Exercises the parser's warn-and-degrade behavior (FR-013).

`specs/001-odd/` has `spec.md` (US1, US2) and a `tasks.md` that breaks the
template on purpose. `specs/002-emptytasks/` has only a `tasks.md` with a phase
heading and no task lines.

Totals: tasks **5/9 (56 %)**, 4 open; specs completed **0/2**; phases
completed **2/4** (the empty phase of `002-emptytasks` is not counted). The
checkbox inside the fenced block (`T100`) and the one inside the HTML comment
(`T101`) are **not** counted.

| Feature | Stage | Tasks |
|---|---|---|
| `001-odd` | in-progress | 5/9, active |
| `002-emptytasks` | empty | 0/0 (has `tasks.md` with no tasks; one phase `p1` with no tasks) |

Phases of `001-odd`:

| Phase key | Title | Tasks | Notes |
|---|---|---|---|
| `001-odd/pu` | Unphased | 1/1 | `T001` before the first phase heading |
| `001-odd/p1` | Setup | 3/3 | includes the ID-less checkbox (key `001-odd/L10`) and `T003` with two labels |
| `001-odd/p2@L13` | Core | 1/4 | groups `US1` 1/3 and `US9` 0/1; **active phase**, active story `US1` |
| `001-odd/p2@L28` | Core again | 0/1 | repeated phase number 2 |

Active selection: feature `001-odd`, phase `001-odd/p2@L13`, story `US1`, next
task `001-odd/T004` (current, although its dependency `T005` is open, hence
W7). The duplicated `T005` gets keys `001-odd/T005@L16` (open, future) and
`001-odd/T005@L17` (done).

Expected warnings (file `specs/<feature>/tasks.md`, 1-based line):

| Code | Feature | Line | Message |
|---|---|---|---|
| W3 | 001-odd | 5 | `task outside any "## Phase N:" section (shown under Unphased)` |
| W1 | 001-odd | 10 | `checkbox without a task ID (counted)` |
| W2 | 001-odd | 11 | `task has several story labels; using US1` |
| W7 | 001-odd | 15 | `next task T004 depends on open task T005` |
| W5 | 001-odd | 17 | `duplicate task ID T005 (both counted)` |
| W6 | 001-odd | 18 | `dependency T999 not found (ignored)` |
| W4 | 001-odd | 18 | `story label US9 has no matching user story in spec.md` |
| W12 | 001-odd | 28 | `duplicate phase number 2 (both shown)` |
| W8 | 002-emptytasks | — | `tasks.md contains no tasks` |
