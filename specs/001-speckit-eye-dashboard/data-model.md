# Data Model: speckit-eye

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

The model is built in memory from the project's files on every scan. Nothing is saved anywhere (the spec has no progress store). All paths below are POSIX-style and relative to the project root.

## Overview

```text
Project
├── constitution?: Artifact
├── assessments: Assessment[] ── artifacts: Artifact[]
├── features: Feature[] (folder order)
│   ├── artifacts: Artifact[]
│   ├── stories: Story[]            (from spec.md)
│   ├── phases: Phase[]             (from tasks.md)
│   │   ├── groups: StoryGroup[]    (only when the phase mixes stories)
│   │   └── tasks: Task[]
│   └── warnings: Warning[]
├── active: ActiveSelection
├── totals: Totals
└── warnings: Warning[] (project-level)
```

## Entities

### Project

| Field | Type | Rule / source |
|---|---|---|
| `name` | string | Base name of the project folder (FR-015). |
| `root` | string | Absolute path. Used only by the reader; never rendered. |
| `features` | Feature[] | One per direct subfolder of `specs/`, sorted by folder name with a plain string compare (FR-008). |
| `constitution` | Artifact \| null | `.specify/memory/constitution.md` if it exists. |
| `assessments` | Assessment[] | One per direct subfolder of `.specify/assessments/`, sorted by name. |
| `active` | ActiveSelection | See the rules below (FR-014). |
| `totals` | Totals | Aggregated over `features` (FR-010, FR-015). |
| `warnings` | Warning[] | Problems not tied to a single feature (for example an invalid `feature.json`). |

**Validation**: the folder is a Spec Kit project if `specs/` or `.specify/` exists; otherwise the CLI exits with code 2 (see [contracts/cli.md](./contracts/cli.md)).

### Feature

| Field | Type | Rule / source |
|---|---|---|
| `dir` | string | Folder name, for example `001-speckit-eye-dashboard`. Unique; used as the key. |
| `title` | string | The `# Feature Specification: X` heading of `spec.md` if present, otherwise `dir`. |
| `artifacts` | Artifact[] | Every `*.md` under `specs/<dir>/`, recursively (FR-021). Ordering: see Artifact. |
| `stories` | Story[] | Parsed from `spec.md` (may be empty). |
| `phases` | Phase[] | Parsed from `tasks.md` (empty if the file is missing). |
| `hasTasks` | boolean | `tasks.md` exists. |
| `counts` | Counts | Sum over all tasks, including unphased ones. |
| `stage` | Stage | Derived; see State below. |
| `warnings` | Warning[] | From parsing this feature's files. |

### Phase

| Field | Type | Rule / source |
|---|---|---|
| `number` | integer \| null | From `## Phase N: …`; `null` for the synthetic "Unphased" phase (tasks before the first phase heading, with a warning). |
| `title` | string | Heading text after `N:`. |
| `tasks` | Task[] | In file order. |
| `storyLabels` | string[] | Distinct `USn` labels among the tasks, in order of first appearance. |
| `mergedStory` | Story \| null | Set when every task carries the same single label (FR-015 merged row). |
| `groups` | StoryGroup[] | Only when `storyLabels.length > 1`: one group per label. Unlabeled tasks stay directly on the phase. |
| `counts` | Counts | |
| `key` | string | `<featureDir>/p<number or 'u'>`, used for `data-key` in the DOM. When the same phase number appears more than once in a file, every occurrence gets `@L<line>` appended (for example `001-x/p3@L40`), so keys stay unique. |

### Story (from spec.md)

| Field | Type | Rule / source |
|---|---|---|
| `label` | string | `US<n>` from `### User Story <n> - <title> (Priority: P<k>)`. |
| `title` | string | |
| `priority` | string \| null | `P1`, `P2`, … |

A `[USn]` label with no matching Story is still shown under its label, with a warning (spec edge case).

### StoryGroup

| Field | Type |
|---|---|
| `label` | string |
| `story` | Story \| null |
| `tasks` | Task[] |
| `counts` | Counts |
| `key` | `<phaseKey>/<label>` |

### Task

| Field | Type | Rule / source |
|---|---|---|
| `id` | string \| null | `T\d+`; `null` for a checkbox line without an ID (counted, with a warning). |
| `done` | boolean | `[x]` or `[X]` → true; `[ ]` → false. |
| `parallel` | boolean | `[P]` marker present. |
| `story` | string \| null | `USn` label. |
| `description` | string | The rest of the line with the markers removed. |
| `dependsOn` | string[] | IDs from `depends on T012, T013` (FR-015c). IDs that are unknown in the same file are dropped, with a warning. |
| `line` | integer | 1-based source line (for warnings and for the tasks.md link). |
| `state` | TaskState | Derived; see below. |
| `key` | string | `<featureDir>/<id or 'L'+line>`; when the ID is duplicated in the file, every occurrence gets `@L<line>` appended (for example `001-x/T012@L57`). |

**Uniqueness**: task IDs should be unique within one `tasks.md`. Duplicates are all counted, and a warning is raised (W5). Keys are always unique (see `key`), so each duplicate is its own DOM item and at most one task is `current`.

### Artifact

| Field | Type | Rule / source |
|---|---|---|
| `kind` | enum | `spec`, `plan`, `research`, `data-model`, `quickstart`, `tasks`, `contract`, `checklist`, `constitution`, `assessment`, `other` |
| `title` | string | The first `# ` heading, otherwise the file name. |
| `source` | string | Project-relative path (for example `specs/001-x/contracts/cli.md`). |
| `url` | string | Page path without the base path (see [contracts/routes.md](./contracts/routes.md)). |

**Ordering inside a feature**: spec, plan, research, data-model, quickstart, tasks, contracts (by name), checklists (by name), then the rest by path (FR-021).

### Assessment

| Field | Type |
|---|---|
| `slug` | folder name under `.specify/assessments/` |
| `artifacts` | Artifact[]: its `*.md` files; intake, research, problem, concept, decision first, then the rest by name |

### Warning

| Field | Type |
|---|---|
| `file` | project-relative path |
| `line` | integer \| null |
| `message` | string (a short plain-language sentence) |

Warnings are shown on the feature in the tree (FR-019), and serve mode and build mode print them to stderr as `warning: <file>:<line> <message>`.

### Counts / Totals

- `Counts = { done, total, open = total - done, percent = total ? min(round(done*100/total), open ? 99 : 100) : 0 }`. Rounded to the nearest whole number (40/65 → 62 %, as in spec US1), but capped at 99 % while any task is open.
- `Totals = { tasks: Counts, specs: {completed, total}, phases: {completed, total} }`
  - a spec is completed when `hasTasks && counts.total > 0 && counts.open == 0`; every feature counts toward `specs.total`.
  - a phase is completed when `counts.total > 0 && counts.open == 0`; only phases with `counts.total > 0` count toward `phases.total`.

### ActiveSelection (FR-014)

| Field | Type |
|---|---|
| `featureDir` | string \| null |
| `phaseKey` | string \| null |
| `storyLabel` | string \| null (only when the active phase has groups) |
| `nextTaskKey` | string \| null |
| `source` | `feature.json` \| `git-branch` \| `first-open` \| `none` |

**Rules**:
1. Candidate A is `basename(feature.json.feature_directory)`, if the file parses and names an existing feature.
2. Candidate B is the current branch from the git `HEAD` file (`.git/HEAD`, or `HEAD` in a worktree's gitdir, research R9), if it equals an existing feature's `dir`.
3. If at least one feature has `open > 0`: a candidate is skipped when `hasTasks && open == 0`. If both are skipped or missing, the active feature is the first feature in order with `open > 0` (`source = first-open`).
4. If no feature has `open > 0` (all complete, FR-018): candidate A, else candidate B, is the active feature even when it is complete, with `phaseKey = storyLabel = nextTaskKey = null`. It is expanded, highlighted, and keeps its own status style (a complete feature is green with the done mark). If neither candidate exists, `featureDir = null` and `source = none`. The "all tasks are complete" message depends on `totals.tasks.total > 0 && totals.tasks.open == 0`, not on `source`.
5. Within the active feature: the active phase is the first phase with `open > 0`; if it has groups, the active story is the first group with `open > 0`; the next task is the first open task in the active group, or in the phase when it has no groups. (Unlabeled tasks in a mixed phase come before the groups only if they come first in file order; file order decides.)
6. A feature without `tasks.md` can be active, with `phaseKey = nextTaskKey = null`.

## State

### Stage (feature, FR-012 / FR-019a)

| Stage | Condition | Tree style |
|---|---|---|
| `empty` | no `spec.md`, no `tasks.md` | not started (dark grey) |
| `specified` | `spec.md`, no `plan.md`, no `tasks.md` | not started |
| `planned` | `plan.md`, no `tasks.md` | not started |
| `ready` | `tasks.md`, `done == 0`, `total > 0` | not started |
| `in-progress` | `tasks.md`, `0 < done < total` | started (blue) |
| `complete` | `tasks.md`, `total > 0`, `open == 0` | done (green, check mark, collapsed unless it is the active feature, FR-018) |

A feature whose `tasks.md` has no tasks at all (`total == 0`) stays `planned`, or `specified`/`empty`, and gets a warning. The active feature is additionally styled as highlighted, whatever its stage.

In the DOM, a feature's `data-status` is `done` (complete), `started` (in-progress), or `not-started` (every other stage); the active feature carries `data-active` in addition, so a complete active feature is both green and highlighted.

Phases and story groups use the same not-started / started / done styles, based on their counts.

### TaskState (FR-015b)

```text
done ──────────────────────────────► completed
open, key == active.nextTaskKey ───► current
open, any dependsOn task open ─────► blocked
open, otherwise ───────────────────► future
```

Rules are checked in this order, so the next task is shown as `current` even if a dependency is open (with a warning, per the spec's edge case).

## Change signature (live updates)

Every rendered tree node and grid cell carries `data-key` (stable identity) and `data-sig` (a short string built from the counts, the stage or state, and whether it is active). After a live swap, the client highlights the elements whose `data-sig` differs from the previous one for the same `data-key` (FR-028). The details are in [contracts/routes.md](./contracts/routes.md).
