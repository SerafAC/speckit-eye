# Data Model: Dashboard Redesign

Phase 1 of [plan.md](./plan.md). The redesign keeps the project model of spec 001 — Project, Feature, Phase, StoryGroup, Story, Task, Artifact, Assessment, Warning, Counts/Totals, ActiveSelection, Stage and TaskState — exactly as defined in [001 data-model.md](../001-speckit-eye-dashboard/data-model.md). This page only lists what is **added** or **changed**. Everything here is derived by pure functions from the model; nothing is stored.

```text
Project (001)
├── overview: OverviewStats            (new, FR-011)
│   └── segments: FeatureSegment[]
├── features: Feature[] (001)
│   ├── status: FeatureStatus          (new)
│   ├── number: string | null          (new)
│   ├── ranks: FeatureRanks            (new, FR-012)
│   ├── warningGroups: WarningGroup[]  (new, FR-015, FR-033)
│   ├── documents: DocumentGroups      (new, FR-031, FR-039)
│   ├── phaseShares: number[]          (new, FR-032)
│   ├── spec: SpecStructure | null     (new, FR-042)
│   └── phases[].tasks[] Task (001)
│       ├── display: TaskDisplayState  (new name for 001 TaskState)
│       ├── waitingOn: string[]        (new, FR-036)
│       ├── files: string[]            (new, FR-035, FR-037)
│       ├── kind: TaskKind | null      (new)
│       └── refs: string[]             (new)
└── searchIndex: SearchEntry[]         (new, built in render, FR-049a)
```

## Changed entities

### Task (001) — added fields

| Field | Type | Rule |
|---|---|---|
| `display` | `done` \| `next` \| `blocked` \| `open` | The 001 `TaskState` under the names the redesign shows: `completed → done`, `current → next`, `blocked → blocked`, `future → open`. Same rules and precedence as 001 (next beats blocked). |
| `waitingOn` | string[] | For a `blocked` task: the IDs in `dependsOn` whose tasks are still open, in the order written. Empty otherwise. Shown as "Waiting on T012, T013" (FR-036). |
| `files` | string[] | Backticked spans of `description` that contain `/` and end in a file name: `/^[^\s`]*\/[^\s`]*[A-Za-z0-9_-]\.[A-Za-z0-9]+$/` or end in a known extension-less file name (`Makefile`, `Dockerfile`). In order of appearance, duplicates removed (FR-037). |
| `kind` | TaskKind \| null | From `files[0]`; `null` when `files` is empty. |
| `refs` | string[] | `FR-\d+[a-z]?` and `SC-\d+` references in `description`, in order, duplicates removed. |
| `anchor` | string | `task-` + `key` with `/` and `@` replaced by `-` (for example `task-001-x-T012-L57`); the fragment used by the tree, the map and the feature page (contracts/routes.md). |

`description` is never changed; formatting is applied only when rendering (contracts/routes.md "Inline task text").

### Feature (001) — added fields

| Field | Type | Rule |
|---|---|---|
| `number` | string \| null | Leading digits of `dir` (`001-x` → `001`), or the timestamp prefix; `null` when the folder name has no numeric prefix (the chip is then omitted). |
| `status` | FeatureStatus | See State. |
| `ranks` | FeatureRanks | See below. |
| `warningGroups` | WarningGroup[] | See below. |
| `documents` | DocumentGroups | See below. |
| `phaseShares` | integer[] | Percent share of each phase with tasks in `counts.total`, by largest remainder (sum = 100); phases without tasks get 0 and are rendered at the minimum width (FR-032). |
| `spec` | SpecStructure \| null | Parsed `spec.md` (contracts/spec-md-structure.md); `null` without `spec.md`. |

## New entities

### FeatureStatus

| Value | Condition (001 Stage) | Dot | Pill |
|---|---|---|---|
| `done` | `complete` | filled green | "Complete" |
| `in-progress` | `in-progress` | blue ring | "N open" |
| `not-started` | `ready` | grey | "Ready" (or "N open" when it is the active feature) |
| `no-tasks` | `empty`, `specified`, `planned` | grey | the stage label ("Specified", "Planned", "Empty") |

### FeatureRanks (FR-012)

Integer position of the feature (0-based) under each order; the browser sorts by these and never re-implements the rules (research D10).

| Order | Key | Rule |
|---|---|---|
| In progress first (default) | `progress` | Group 1: features with open tasks — `in-progress` before `not-started`; group 2: features without tasks (`no-tasks`); group 3: complete features. Inside each group (and sub-group): `dir` descending (highest number first). |
| Number | `number` | `dir` ascending (folder order, 001 FR-008). |
| Least complete | `least` | `counts.percent` ascending, then `counts.open` descending, then `dir` ascending; features without tasks last, by `dir`. |
| Name A–Z | `name` | `title` compared with `localeCompare(…, "en", {sensitivity: "base"})`, then `dir`. |

The sidebar Features list always uses `progress` (FR-006).

### OverviewStats (FR-011)

| Field | Rule |
|---|---|
| `percent`, `done`, `total` | `project.totals.tasks` (001 rounding: capped at 99 % while any task is open). |
| `features` | `{completed: totals.specs.completed, total: totals.specs.total, inProgress: count(status == in-progress)}` |
| `phases` | `{completed, total, remaining: total - completed}` from `totals.phases` |
| `openTasks` | `{count: totals.tasks.open, features: count(features with counts.open > 0)}` |
| `segments` | FeatureSegment[] for features with `counts.total > 0`, in `dir` order |
| `legend` | `{done, open, blocked, next}` counts over all tasks (`open` excludes blocked and next) |

### FeatureSegment

| Field | Rule |
|---|---|
| `dir`, `number`, `title` | From the feature |
| `share` | Percent of all project tasks, largest remainder across segments (sum = 100) |
| `parts` | `{done, open, next}` percents of the segment's own tasks by largest remainder; blocked tasks count as `open` (spec FR-011); a non-zero part is never rounded to 0 (it takes 1 from the largest part) |
| `showLabel` | `share >= 4` (a 3-digit label fits); otherwise the number appears only in the hover title |

### Percent shares (largest remainder)

`shares(values: number[]) → integer[]`: floor each `value * 100 / sum`, then give the remaining points to the entries with the largest fractional parts (ties: earlier entry first). The result always sums to 100 (or is all zeros for an empty or zero sum). One function, used by segments, parts and phase shares.

### WarningGroup (FR-015, FR-033)

| Field | Rule |
|---|---|
| `code` | The warning code of 001 ([tasks-md-format.md](../001-speckit-eye-dashboard/contracts/tasks-md-format.md), `W1`–`W12`; for example `W1` checkbox without a task ID) |
| `file` | Project-relative path |
| `count` | Number of warnings with this code in this file |
| `title` | Plain sentence with the count, for example "6 checkboxes without a task ID in tasks.md" |
| `note` | Short consequence, for example "counted, not linkable" (W1) |
| `lines` | `{from, to}[]`: the warnings' lines sorted and merged into ranges of consecutive numbers (23, 254, 255, 256, 257, 258 → `[23–23, 254–258]`), rendered "L23", "L254–258" |
| `sourceLines` | For "Show lines" on the feature page: `{line, text}[]` of the raw lines concerned (from the file content already read) |

Groups are ordered by the first line; warnings without a line form their own group per code.

### DocumentGroups (FR-031, FR-039)

The feature's artifacts (001 Artifact, 001 ordering) placed into reader groups and feature-page tabs:

| Artifact kind | Reader group | Feature-page tab |
|---|---|---|
| `spec` | Define | Specification |
| `checklist` | Define | "Quality checklist" when it is the only checklist and its file is `checklists/requirements.md`; otherwise "Checklists (N)" |
| `plan` | Design | Plan |
| `research` | Design | Research |
| `data-model` | Design | Data model |
| `quickstart` | Design | Quickstart |
| `contract` | Contracts | Contracts (N) |
| `tasks` | Build | (the Tasks tab is the feature page itself) |
| `other` | Other | More (N) |

A tab with N > 1 documents renders as a `<details>` menu listing them (FR-008). Project documents (constitution, assessments) form a project document list: "Project" (Constitution) and one group per assessment.

### TaskKind (FR-035)

`{label: string, test: boolean}` from `files[0]`:

- **test** when the file name matches `/(^|[._-])(test|spec)s?([._-]|$)/i` or a folder in its path is `test`, `tests`, `__tests__` or `e2e`.
- **label** from the extension: `.go` Go, `.vue` Vue, `.js`/`.mjs`/`.cjs` JavaScript, `.jsx` JSX, `.ts`/`.mts`/`.cts` TypeScript, `.tsx` TSX, `.py` Python, `.rb` Ruby, `.rs` Rust, `.java` Java, `.kt` Kotlin, `.swift` Swift, `.cs` C#, `.php` PHP, `.css` CSS, `.scss` SCSS, `.html` HTML, `.svelte` Svelte, `.md` Markdown, `.json` JSON, `.yml`/`.yaml` YAML, `.toml` TOML, `.sh` Shell, `.sql` SQL; any other extension → the extension without the dot, upper-cased (`.proto` → PROTO); `Makefile`/`Dockerfile` → the name.
- The chip text is `label` or `label + " test"` (for example "Go test"). The feature page's kind filter chips are the distinct chip texts of the feature's tasks without " test", in order of first appearance; "Tests" is the separate `test == true` filter.

### SpecStructure (FR-042)

Defined with its recognition rules in [contracts/spec-md-structure.md](./contracts/spec-md-structure.md). Shape:

```text
SpecStructure
├── metadata: {branch, created, status} | null
├── request: string | null                       original request text
└── blocks: Block[]                               in file order; line ranges disjoint and covering every line
    Block = { kind, from, to, … }
      kind "title"          text
      kind "section"        number (01, 02 …), heading, anchor
      kind "clarifications" sessions: {date, heading, items: {question, answer, badge: yes|no|neutral, from, to}[]}[]
      kind "story"          id (US1), priority (P1), title, description, why, test, scenarios: {given, when, then, raw}[], phase links
      kind "requirements"   areas: {name, requirements: {id, text}[]}[]
      kind "entities"       items: {name, description}[]
      kind "plain"          markdown source of the range (rendered by the 001 Markdown renderer)
```

A story's **phase links** are the phases whose `mergedStory` or groups carry the story's label, each with its counts (FR-042 "the phase implementing the story").

### SearchEntry (FR-049a)

Defined in [contracts/search-index.md](./contracts/search-index.md): `{type: task|feature|document|heading, label, detail, terms, url, state?}`.

### View preferences and view state

| Name | Where | Values | Default |
|---|---|---|---|
| `sk-theme` | localStorage | `light` \| `dark` \| `system` | `system` |
| `sk-order` | localStorage | `progress` \| `number` \| `least` \| `name` | `progress` |
| `sk-filter` | localStorage | `all` \| `open` | `all` |
| `sk-map` | localStorage | `stacked` \| `grouped` | `stacked`; `grouped` is the default above 1,000 tasks |
| depth, opened/closed items, feature filters and text, selected task, raw view, "show more", scroll positions | per page, in memory across live updates (research D2) | — | server defaults |

## State

### Task display state

```text
task.done ────────────────────────────────────────► done
open, key == active.nextTaskKey ─────────────────► next
open, waitingOn non-empty ───────────────────────► blocked
open, otherwise ─────────────────────────────────► open
```

Unchanged from 001 except the names. A live update recomputes everything from the files, so a blocked task becomes `open` as soon as the last task it waits on is checked.

### Change signature

001's `data-sig` stays on every tree node and map square; it now also appears on stats counters (`data-key="stat:<name>"`), segments (`seg:<dir>`), feature-page task rows and sidebar entries, so these are highlighted after a change as well (FR-051).
