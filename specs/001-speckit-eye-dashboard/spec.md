# Feature Specification: speckit-eye — Zero-Setup Spec Kit Progress Dashboard

**Feature Branch**: `001-speckit-eye-dashboard` (spec directory; no branch was created by a hook — work continues on `main` until a feature branch is cut)

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: handoff from `.specify/assessments/speckit-dashboard/decision.md` (verdict: go, Option A). Spec Kit users cannot see at a glance where a project stands (overall progress, the active feature, phase, and story, and what is left), cannot follow progress live during long autopilot runs, and cannot easily share status or artifacts with people who do not have the repo. `speckit-eye` is a command-line tool, run with one command against any Spec Kit project with nothing to install or configure inside that project. It has a local live mode (`--serve <dir>`) and a static-site build mode (`--build <dir> --out <folder>`), a top-down overview (overall progress → specs → phases → user stories, only the active item expanded), readable pages for every artifact, a consistent polished visual style with light animations, and a multi-module code structure.

## Clarifications

### Session 2026-09-24

- Q: How should the overview nest phases and user stories when most phases hold exactly one story? → A: Merge them: a phase whose tasks all belong to one story is shown as a single row titled with both (for example "Phase 3 · US1 – See status (P1)") with its tasks directly underneath; a story sub-level appears only when a phase mixes tasks from several stories.
- Q: How should the overview page be laid out, ordered, and styled as most features become finished? → A: A header with the project name and links to project-level artifacts; below it the overall progress bar and three small counters (specs, phases, tasks: completed / total); then a two-column main area: on the left a tree of all specs in folder order (completed ones collapsed, the current one expanded and highlighted, started-but-incomplete ones blue, not-started ones dark grey), and on the right a grid of small squares, one per task across all specs, colored by task state, showing the task on hover and highlighting its parent in the tree. Click behavior and how the grid copes with very many tasks are left open for development.
- Q: What should make a task show as blocked in the task grid? → A: An open task is blocked when its description declares dependencies in the standard wording ("depends on T012, T013") and at least one of those tasks is still open.
- Q: What accessibility level should the pages meet? → A: No specific target in v1; best effort only, to be revisited later.
- Q: What is the largest project the overview must handle within the time targets? → A: 50 features and 2,000 tasks in total.
- Q: When every task is done but `.specify/feature.json` (or the git branch) names a feature, is anything active? → A: Yes: that feature stays active and is shown completed (green, done mark), expanded, and highlighted as current; no phase, story, or task is active or next, and the page still states that all tasks are complete (FR-014, FR-018).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where the project stands at a glance (Priority: P1)

A Spec Kit user runs one command against their project folder and opens the printed address in a browser. The first page opens with a header showing the project name and links to project-level artifacts, then an overall progress bar with small counters for completed specs, phases, and tasks. Below that, a tree on the left lists every feature (spec): finished ones are collapsed, the current one is expanded to its phases and stories and highlighted, and the colors show at once which features are done, in progress, or not started. On the right, a grid of small squares shows every task in the project, colored by state; hovering a square names the task and highlights where it sits in the tree. The next open task is clearly marked. Without reading any file, the user can say how far along the project is, what is being worked on, and what comes next.

**Why this priority**: This is the core problem. Without the overview there is no product; live updates, artifact pages, and hosting all build on it. On its own it already replaces counting checkboxes across `tasks.md` files by hand.

**Independent Test**: Run the tool in serve mode against a fixture project with several features in different states (spec only, planned, partly done, fully done). Open the page and confirm that the overall percentage, per-feature, per-phase, and per-story counts match the checkbox counts in the fixture files, that exactly the active chain is expanded, and that the next open task is shown.

**Acceptance Scenarios**:

1. **Given** a Spec Kit project with three features whose `tasks.md` files contain 10/20, 0/15, and 30/30 checked tasks, **When** the user runs the tool in serve mode and opens the printed address, **Then** the overall progress bar shows 40 of 65 tasks (62%), and each feature shows its own count and percentage.
2. **Given** the same project, **When** the page loads, **Then** only the active feature, its active phase, and (if that phase has a story sub-level) its active user story are expanded, and all other items are collapsed with their progress visible.
3. **Given** a collapsed feature, phase, or story, **When** the user activates it, **Then** it expands with a short animation to show its children and tasks, and activating it again collapses it.
4. **Given** a feature folder that has a spec but no `tasks.md`, **When** the overview loads, **Then** the feature is listed with a stage label (for example "Specified" or "Planned", derived from which artifacts exist) and is not counted in the overall task total.
5. **Given** one fully completed feature and one partly done feature, **When** the overview loads, **Then** each shows its "open / total" counter (for example "0 open / 30" and "10 open / 20"), and the completed feature is styled visibly differently from the incomplete one, also when collapsed.
6. **Given** `.specify/feature.json` names the second feature and that feature still has open tasks, **When** the overview loads, **Then** that feature is the active one even if an earlier feature has open tasks; **Given** it names a feature whose tasks are all done, **Then** the first feature with open tasks is active instead.
7. **Given** a project with every task checked and neither `.specify/feature.json` nor the git branch naming a feature, **When** the overview loads, **Then** the overall bar shows 100%, no item is marked active, and the page states that all tasks are complete; **Given** the same project with `.specify/feature.json` naming one of its features, **Then** that feature is the active one: it is expanded, highlighted as current, and styled as completed (green, with the done mark), no phase, story, or task is marked active or next, and the page still states that all tasks are complete.
8. **Given** a project with one completed feature, one in-progress feature, and one not-started feature, **When** the overview loads, **Then** the header shows the project name and links to the constitution and assessments, the counters show specs, phases, and tasks as completed / total, the tree shows the completed feature collapsed with a done mark, the in-progress (active) feature expanded and highlighted, and the not-started feature in dark grey, and the task grid shows one square per task colored by state.
9. **Given** the overview with scripts enabled, **When** the user hovers a task square, **Then** the task ID and description are shown and the task's feature and phase are highlighted in the tree.
10. **Given** a user with no prior setup and a network connection, **When** they run the single documented command against a Spec Kit project folder, **Then** the tool starts, prints a local address, and the overview is viewable without creating, installing, or changing any file in the project.

---

### User Story 2 - Follow progress live during a long run (Priority: P2)

While an autopilot run (or the user in an editor) ticks tasks and writes artifacts, the user keeps the overview open. Each time a Spec Kit Markdown file is saved, the open page updates by itself within about a second or two. The user keeps their scroll position and whatever they had expanded, and the items whose status just changed are briefly highlighted so the change is easy to spot.

**Why this priority**: Watching unattended runs is the second most painful gap in the problem statement. It depends on the overview (US1) but adds a distinct capability.

**Independent Test**: Start serve mode against a fixture project, open the overview in a headless browser, expand a non-active feature and scroll down, then check a task box in a fixture `tasks.md` on disk. Confirm the progress numbers update within 2 seconds, the scroll position and expanded feature are unchanged, and the changed item is highlighted.

**Acceptance Scenarios**:

1. **Given** the overview is open, **When** a task checkbox is changed from `[ ]` to `[x]` in a `tasks.md` file and saved, **Then** within about 2 seconds the page shows the new counts without the user doing anything.
2. **Given** the user has scrolled and expanded items the tool would not expand by default, **When** the page updates after a file change, **Then** the scroll position and the user's expanded and collapsed choices are kept.
3. **Given** a file change that changes a task, story, phase, or feature status, **When** the page updates, **Then** the changed items are briefly highlighted, and the progress bars animate to their new values.
4. **Given** an artifact page (for example a `plan.md`) is open, **When** that file is saved with new content, **Then** the artifact page shows the new content within about 2 seconds, keeping its scroll position.
5. **Given** a new feature folder is created while the overview is open, **When** its first Spec Kit Markdown file is saved, **Then** the feature appears in the overview without restarting the tool.
6. **Given** an editor or agent that saves by writing a temporary file and renaming it, or that writes several files in quick succession, **When** those saves happen, **Then** the page still updates once the writes settle, showing the final content.
7. **Given** the tool is stopped while a page is open, **When** the connection is lost, **Then** the page shows a visible notice that live updates have stopped and keeps showing the last content; **When** the tool is started again on the same address, **Then** the page resumes live updates.

---

### User Story 3 - Read any artifact in two steps or fewer (Priority: P2)

From the overview, the user opens any artifact that exists in the project (feature spec, plan, research, data model, quickstart, contracts, checklists, tasks, the constitution, and the others) and reads it as a well-typeset page: headings, tables, task lists, code blocks, and links render cleanly. Every artifact is reachable from the overview in at most two navigation steps, either through a menu or through links on the feature.

**Why this priority**: Reading artifacts without opening the repo is part of both the "where are we" and the "share with others" needs, and it is required by M4. It is independent of live updates.

**Independent Test**: Run serve mode against a fixture project containing every artifact type. From the overview, follow menu and feature links and confirm every present artifact opens in two or fewer clicks and renders its headings, tables, task-list checkboxes, and code blocks correctly.

**Acceptance Scenarios**:

1. **Given** a feature folder containing `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `tasks.md`, a `contracts/` folder, and a `checklists/` folder, **When** the user expands that feature, **Then** links to each of those artifacts are shown, and each opens a rendered page in one further step.
2. **Given** the project has a constitution, **When** the user opens the menu from any page, **Then** the constitution is listed and opens in one step.
3. **Given** an artifact containing a table, a GitHub-style task list, fenced code, and relative links to other artifacts, **When** it is rendered, **Then** the table and task list display correctly, code keeps its formatting, and links to other artifacts open the rendered page of that artifact.
4. **Given** an artifact containing raw HTML or script tags, **When** it is rendered, **Then** no script from the file runs in the viewer's browser.
5. **Given** a feature lacks an artifact type (for example no `research.md`), **When** the feature is expanded, **Then** no link to a missing artifact is shown.
6. **Given** an artifact page, **When** the user wants to return, **Then** a link back to the overview and the menu are available on every page.

---

### User Story 4 - Publish a shareable snapshot from CI (Priority: P3)

A team lead adds a short CI job, copied from the tool's documentation, to their Spec Kit repository. On each push, the job runs the tool in build mode and publishes the output folder to a static host such as GitHub Pages or Netlify, under the repository's sub-path. Stakeholders without repo access open the hosted link and see the same overview and artifact pages as the local view, with the time the snapshot was generated, but without live updates.

**Why this priority**: Sharing status is a real need but a secondary one for the owner, and it reuses everything from US1 and US3. It is the last slice needed for the full problem statement.

**Independent Test**: Run build mode against a fixture project with a sub-path base (for example `/my-repo/`), serve the output folder from a plain static file server under that sub-path, and confirm that the overview and every artifact page load, all internal links and styles work, expand and collapse work, and no request is made for live updates.

**Acceptance Scenarios**:

1. **Given** a Spec Kit project, **When** the user runs build mode with an output folder, **Then** the folder contains a complete static site with the overview and one page per present artifact, and the command exits successfully with a summary of pages written and any warnings.
2. **Given** a base path is supplied (for example `/my-repo/`), **When** the site is served under that path, **Then** every page, link, stylesheet, and asset loads correctly, including when a page is opened directly by its address.
3. **Given** the hosted site, **When** a visitor opens it, **Then** the overview matches what serve mode shows for the same files, shows when it was generated, has working expand and collapse, and makes no attempt to connect for live updates.
4. **Given** the documentation, **When** a user follows the sample CI job for one supported host, **Then** a push to the repository produces an updated hosted view within that single CI run.
5. **Given** an output folder that already exists and contains a previous build from this tool, **When** build mode runs again, **Then** the previous output is replaced and no stale pages remain; **Given** an output folder that exists, is not empty, and was not produced by this tool, **Then** the build stops with a clear error and changes nothing.

---

### Edge Cases

- **Not a Spec Kit project**: the given folder has neither a `specs/` folder nor a `.specify/` folder → the tool exits with a non-zero status and a message explaining what it expected. A folder that does not exist gets the same treatment.
- **Empty project**: `specs/` exists but contains no features → the overview shows 0% with a short explanation instead of an empty page.
- **`tasks.md` not following the standard template** (for example no `## Phase N:` headings, no task IDs, or unrecognized story labels) → the tool warns and degrades: checkbox items it can recognize still count toward progress, items it cannot place in a phase or story are grouped under the feature, and a visible warning on the feature (and in the command output) names the file and line(s) it could not interpret. The tool never stops because of one malformed file.
- **Checkbox variants**: `[x]` and `[X]` both count as done; `[ ]` counts as open. Checkbox items inside checklists or other artifacts do not count toward task progress.
- **`.specify/feature.json` or the git branch points to a feature folder that does not exist** → ignored; the next rule in FR-014 applies. No git repository → the branch rule is skipped.
- **Tasks without a story label** (setup, foundational, polish phases) → shown directly under their phase, not under a story.
- **Story labels with no matching user story in `spec.md`** → shown under the label (for example "US7") with a warning.
- **Dependency text naming a task ID that does not exist** in the same `tasks.md` → that reference is ignored for the blocked state and a warning is shown. A task that is itself the next open task is shown as current even if a dependency is open, and a warning notes the inconsistency.
- **Duplicate task IDs or repeated phase numbers** in one `tasks.md` → each is counted once per line as written, each occurrence is shown as its own item (at most one can be the next task), and a warning is shown.
- **Phases with no tasks** (a phase heading with no checkbox lines under it) → shown in the tree, but counted in neither the completed nor the total phase counter.
- **Large projects** up to 50 features and 2,000 tasks in total → the overview still loads and updates within the same time targets (SC-010). Larger projects still work but without a time guarantee.
- **Unreadable, binary, or deleted-mid-read files** → skipped with a warning; the rest of the view still renders.
- **Default local port already in use** → the tool uses a free port and prints the actual address.
- **Requests for files outside the Spec Kit artifacts** (for example source code, `.env`, or paths using `..`) in serve mode → refused; only Spec Kit artifacts and the tool's own assets are ever served.
- **Diagram blocks** (for example Mermaid) → shown as readable code blocks in v1, not as rendered diagrams.
- **Reduced-motion preference** set in the viewer's operating system or browser → animations (expand/collapse, progress fill, change highlight) are turned off or reduced; the information is still shown.
- **Browser with scripts disabled** viewing the hosted site → overview, progress, and artifact pages are still readable, and expand and collapse still work.

## Requirements *(mandatory)*

### Functional Requirements

**Running the tool**

- **FR-001**: Users MUST be able to run the tool with a single command from the public package registry, without installing it permanently and without creating, installing, or modifying anything in the target project.
- **FR-002**: The tool MUST provide a serve mode, invoked as `--serve <dir>`, that starts a local web server for the Spec Kit project at `<dir>` and prints the address to open.
- **FR-003**: The tool MUST provide a build mode, invoked as `--build <dir> --out <folder>`, that writes the same pages as a static site to `<folder>` and exits.
- **FR-004**: Build mode MUST accept a base path option so the site works when hosted under a sub-path (for example `https://user.github.io/repo/`).
- **FR-005**: The tool MUST exit with a non-zero status and an explanatory message when `<dir>` is missing or is not a Spec Kit project, when arguments are invalid, or when build output cannot be written; it MUST print usage help when asked or when called without a mode.
- **FR-006**: The tool MUST only read the target project; it MUST NOT write, move, or delete any file inside it (build output is written only to the folder the user names).
- **FR-007**: In serve mode, the server MUST be reachable only from the local machine by default and MUST serve only Spec Kit artifacts and the tool's own assets; any other path MUST be refused.

**Reading project state**

- **FR-008**: The tool MUST discover every feature folder under `specs/` and order them by their folder name (which carries the sequential or timestamp prefix).
- **FR-009**: The tool MUST parse `tasks.md` files that follow the standard Spec Kit tasks template: phase headings (`## Phase N: …`), checkbox task lines with task IDs (`- [ ] T001 …`), optional parallel markers (`[P]`), and user story labels (`[USn]`).
- **FR-010**: For each feature, phase, and user story, the tool MUST compute done and total task counts and a percentage; the project's overall progress MUST equal the sum of done tasks over the sum of all tasks across every `tasks.md`, and MUST match the checkbox counts in those files exactly for standard-template files.
- **FR-011**: The tool MUST associate user story labels with the user story titles and priorities in the same feature's `spec.md` where they exist.
- **FR-012**: For features without a `tasks.md`, the tool MUST show a stage derived from the artifacts present (for example "Specified" when only a spec exists, "Planned" when a plan exists) and MUST exclude them from task totals.
- **FR-013**: For `tasks.md` files that do not follow the standard template, the tool MUST warn and degrade (see Edge Cases): count recognizable checkbox tasks, show a visible warning on the affected feature naming the file and lines, and report the same warnings in the command output. It MUST NOT stop.
- **FR-014**: The tool MUST determine the single active feature, phase, and user story as follows. The active feature is, in order of preference: (1) the feature folder named in `.specify/feature.json`; (2) the feature folder whose name matches the project's current git branch; (3) the first feature, in folder order, that still has open tasks. A candidate from (1) or (2) is skipped when all its tasks are done, unless no feature in the project has open tasks (see FR-018). Within the active feature, the active phase is the first phase with open tasks, and the active user story is the first story in that phase with open tasks. A feature without a `tasks.md` can be active; it then has no active phase or story. Determining the active item only reads files and never changes the project.

**Overview page**

- **FR-015**: The overview MUST be laid out, from top to bottom, as: (1) a header with the project name (taken from the project folder name) and links to the project-level artifacts (constitution, assessments); (2) the overall progress bar with done/total tasks and percentage, and below it three small counters: specs completed / total, phases completed / total, and tasks completed / total; (3) a main area with the feature tree on the left (FR-015a) and the task grid on the right (FR-015b). On narrow screens the two columns stack, tree first. A spec or phase counts as completed when it has tasks and all of them are done; features without a `tasks.md` count toward the spec total but not as completed (so the specs counter can stay below its total while the task bar shows 100%); phases without tasks count toward neither number.
- **FR-015a**: The feature tree MUST list every feature in folder order, each with its stage and open/total counter (FR-019a); each feature expands to its phases, and each phase to its tasks. A phase whose tasks all carry the same story label is shown as one merged row titled with the phase and the story (title and priority), with its tasks directly under it. Only a phase that mixes tasks from several stories shows a story sub-level, each story with its own progress and tasks; unlabeled tasks in such a phase sit directly under the phase.
- **FR-015b**: The task grid MUST show one small square per task across all features, in the same order as the tree, colored by task state (see Task in Key Entities) with the same color language as the tree. Hovering or focusing a square MUST show the task ID, description, and its feature and phase, and MUST highlight that task's parent items in the tree. Behavior on click and how the grid is presented when a project has very many tasks were settled by the owner (see Assumptions, "Open design items").
- **FR-015c**: The tool MUST read task dependencies from the standard "depends on T###[, T###…]" wording in a task's description and use them only to decide the blocked state; tasks with no such wording are never blocked.
- **FR-016**: On load, only the active feature, the active phase, and, where the phase has a story sub-level (FR-015), the active user story MUST be expanded; every other item MUST be collapsed and expandable on demand. A completed active feature (FR-018) is expanded, its completed phases stay collapsed.
- **FR-017**: The overview MUST clearly mark the active feature, phase, and story, and show the next open task (its ID and description) as "next".
- **FR-018**: When all tasks are complete (no feature has open tasks and at least one task exists), the overview MUST say so and MUST NOT mark any phase, story, or task as active or next. If `.specify/feature.json` or the git branch names an existing feature (FR-014 rules 1–2), that feature is still the active feature: it is expanded, highlighted as current, and styled with its own status (completed features: green with the done mark). Otherwise no item is active.
- **FR-019**: Warnings found while reading the project MUST be visible on the overview, attached to the feature they concern.
- **FR-019a**: Every feature, phase, and user story in the tree MUST show a counter of open tasks out of total tasks (for example "7 open / 10"), and its status MUST be visible from its styling, also when collapsed: completed items green with a done mark and collapsed by default (except a completed active feature, FR-018); the active item highlighted; started-but-incomplete items in blue; not-started items (no task done yet, or no `tasks.md`) in dark grey.

**Artifact pages**

- **FR-020**: The tool MUST render each artifact as a readable page, supporting headings, tables, GitHub-style task lists, fenced code blocks, block quotes, and links; diagram code blocks are shown as code.
- **FR-021**: The artifacts listed and rendered MUST be: every Markdown file found anywhere under each feature folder (covering spec, plan, research, data-model, quickstart, tasks, `contracts/`, `checklists/`, and autopilot files such as `decisions.md` and `run-log.md`); the project constitution; and every Markdown file under `.specify/assessments/`, grouped per assessment. Standard artifacts are listed first in a fixed order, other files after them by path. The same set is what live updates watch (FR-026).
- **FR-022**: Every listed artifact MUST be reachable from the overview in two or fewer navigation steps, through a site-wide menu and/or links on each feature.
- **FR-023**: Relative links between artifacts MUST lead to the rendered page of the target artifact; links to files that are not artifacts MUST NOT expose those files.
- **FR-024**: Rendered artifact content MUST NOT be able to run scripts or inject active content into the viewer's page.
- **FR-025**: Every page MUST provide the menu and a way back to the overview.

**Live updates (serve mode only)**

- **FR-026**: In serve mode, when any Spec Kit Markdown file is created, changed, renamed, or deleted, every open page MUST reflect the change within about 2 seconds of the file settling, without a timed refresh and without user action.
- **FR-027**: Updates MUST keep the viewer's scroll position and their expanded and collapsed items.
- **FR-028**: After an update, items whose status or counts changed MUST be briefly highlighted, and progress bars MUST animate to their new values.
- **FR-029**: Bursts of writes and save-by-rename MUST result in the page showing the final content, without errors or partial states that persist.
- **FR-030**: When the live connection is lost, the page MUST show a visible notice and keep the last content; it MUST resume updates automatically when the server is available again.

**Static build**

- **FR-031**: Build mode MUST produce pages whose overview and artifact content match what serve mode shows for the same files, plus the time the build was generated.
- **FR-032**: The static site MUST work on any plain static file host with no server-side logic, including when a page is opened directly by its address, and MUST NOT attempt live updates.
- **FR-033**: Build mode MUST replace a previous build of this tool in the output folder without leaving stale pages, and MUST refuse, changing nothing, to write into a non-empty folder not produced by the tool.
- **FR-034**: A build MUST include every listed artifact (FR-021); there is no option to exclude artifacts in v1. The README and the hosting guide MUST carry a prominent warning, next to the sample CI job, that a hosted build makes the specs, research, constitution, and assessments readable by anyone who can reach the site unless the host restricts access. Build mode MUST also print a one-line reminder of this when it finishes.

**Look and feel**

- **FR-035**: All pages MUST share one consistent visual style, including readable typography for rendered Markdown, and MUST be usable on common desktop and mobile screen widths.
- **FR-036**: Expand/collapse, progress fill, and change highlights MUST use short, light animations, and MUST honor the viewer's reduced-motion preference.
- **FR-037**: Overview information, the tree's expand/collapse, and the task grid's colors MUST remain usable without in-page scripts (so the hosted site works with scripts disabled); only live updates and the grid-to-tree hover highlight may depend on scripts.
- **FR-038**: The styling MUST ship with the tool; nothing is fetched from third-party servers at view time.

**Documentation**

- **FR-039**: The user documentation MUST include the one-command quick start for both modes, all options, a sample CI job for at least GitHub Pages, and guidance on what a hosted build exposes.

### Key Entities

- **Project**: the Spec Kit folder the tool is pointed at; contains features under `specs/` and project-level artifacts such as the constitution.
- **Feature (spec)**: one folder under `specs/`; has a name and ordering prefix, a stage, a set of artifacts, optional task progress, and warnings.
- **Phase**: a section of a feature's `tasks.md` (for example "Phase 3: User Story 1"); has a number, title, tasks, and progress.
- **User Story**: a story label (`USn`) with its title and priority from `spec.md`; groups the tasks that carry its label within a phase. Shown merged into its phase when the phase contains only that story (FR-015).
- **Task**: one checkbox line in `tasks.md`; has an ID, done/open state, optional parallel marker, optional story label, description, and source line. Its display state in the task grid is one of: completed; current (the next open task, FR-017); blocked (open, and at least one task named in its "depends on …" text is still open); future (any other open task). Dependencies may only refer to task IDs in the same `tasks.md`.
- **Artifact**: a readable Markdown document belonging to a feature or to the project; has a type, title, source path, and rendered page address.
- **Warning**: a problem found while reading the project (non-standard `tasks.md`, unknown story label, unreadable file); has a file, line(s), and message.
- **Active item**: the single feature → phase → story chain that the overview expands and highlights, plus the next open task; chosen from `.specify/feature.json`, then the git branch, then the first feature with open tasks (FR-014). When all tasks are complete, only a feature named by `.specify/feature.json` or the git branch can be active, with no phase, story, or next task (FR-018).
- **Assessment**: an idea assessment folder under `.specify/assessments/` with its Markdown documents (intake, research, problem, concept, decision); listed as project-level artifacts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001 (M1)**: A first-time viewer can state the overall percentage, the active feature, phase, and story, and the next task within 10 seconds of the overview loading, without scrolling past the first screen on a desktop display.
- **SC-002 (M2)**: In serve mode, 95% of saved file changes appear in an open page within 2 seconds of the save, measured on Linux, macOS, Windows, and WSL.
- **SC-003 (M3)**: After a push to a repository using the documented CI job, the hosted view reflects the pushed files as soon as that single CI run finishes.
- **SC-004 (M4)**: 100% of artifacts present in a project are reachable from the overview in 2 or fewer navigation steps.
- **SC-005 (M5)**: On standard-template projects, overall, feature, phase, and story counts match the `tasks.md` checkbox counts exactly (zero discrepancies across the test fixtures and this repository's own specs).
- **SC-006 (M6, lagging)**: The tool is used to track at least one real Spec Kit project other than this repository.
- **SC-007 (M7)**: A user who has only the runtime prerequisites installed gets from nothing to a live view in about one minute on a typical broadband connection, using one documented command.
- **SC-008**: The tool never modifies the target project and, in serve mode, never returns a file that is not a Spec Kit artifact or one of its own assets (zero violations in the end-to-end security tests).
- **SC-009**: Every user story above has at least one passing end-to-end test that exercises it as a user would (constitution §V).
- **SC-010**: For a project of 50 features and 2,000 tasks, the overview loads within 2 seconds in serve mode, live updates still meet SC-002, and build mode completes within 30 seconds on a typical developer machine or CI runner.

## Assumptions

- **Users** are developers and their stakeholders working with GitHub Spec Kit projects; stakeholders reading the hosted site need no tools beyond a browser.
- **Runtime prerequisite**: adopters already have a recent long-term-support release of the language runtime the package targets (Node.js, per the owner's direction) and the package runner that comes with it. The exact minimum version is decided at planning.
- **Project layout**: features live in `specs/<prefix>-<name>/`, the constitution in `.specify/memory/constitution.md`, following the standard Spec Kit layout. Non-standard layouts are out of scope.
- **Read-only view**: the tool never edits artifacts, ticks tasks, or runs Spec Kit or autopilot commands; Spec Kit files remain the only source of truth, with no separate progress store.
- **Checklists** (`checklists/*.md`) are rendered as artifacts but do not count toward task progress.
- **Diagrams** (Mermaid and similar) are shown as code blocks in v1.
- **Accessibility**: no formal accessibility target (such as WCAG conformance) and no automated accessibility checks in v1; accessibility is best effort (reduced-motion support per FR-036 still applies) and will be revisited after v1.
- **Hosted exposure**: publishing every artifact by default is accepted by the owner; protecting a hosted site is the host's job, and the docs warn about it (FR-034).
- **Local-only serving**: serve mode is for the user's own machine; exposing it on a network is not a goal and needs no authentication. Hosted builds rely on the host for any access control.
- **Full-page or partial refresh** is an implementation choice, as long as scroll position and expanded items are kept (FR-027).
- **Out of scope for v1**: editing or running workflows from the view; project-management features (assignees, estimates, burndown, issue sync); built-in authentication; live updates on the hosted site; a timed refresh interval; search; theme or dark-mode switching; multi-project aggregation; anything installed or configured inside the target project; Python components; non-Spec Kit formats (OpenSpec, Kiro).
- **Open design items (settled by the owner on 2026-09-25 after the visual review, T034)**:
  - *Click behavior*: clicking a task square in the grid opens that task's feature, phase and story in the tree and scrolls the tree to the task. Tree items keep the native open/close behavior of `<details>` and do nothing else. No new pages are added for this, and the tree still works without JavaScript.
  - *Very large grids*: up to 1,000 tasks in total the grid shows one square per task, as in FR-015b. Above 1,000 tasks it shows one row per feature with smaller squares. Past that, when even the per-feature rows are no longer legible, it shows one progress bar per feature instead of squares. The second threshold is an implementation default, 5,000 tasks, checked visually with the large fixture.
- **Deferred to planning (technical decisions, not scope)**: the minimum runtime version and whether file watching needs a dependency (to be settled by a cross-platform spike); the package name (`speckit-eye` if available, otherwise a scoped name); the exact styling stack (a utility CSS framework compiled at publish time, with or without a component layer), to be justified in Complexity Tracking per constitution §I; the headless browser used for end-to-end tests and its justification under §I; and the multi-module code layout (owner direction: multi-module, not a single script).
- **Constitution deliverables**: README.md, DEVELOPMENT.md, CHANGELOG.md, and `./docs` do not yet exist and are created with this feature (constitution §VI–IX).
