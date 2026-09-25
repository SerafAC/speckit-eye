---

description: "Task list for speckit-eye — Zero-Setup Spec Kit Progress Dashboard"
---

# Tasks: speckit-eye — Zero-Setup Spec Kit Progress Dashboard

**Input**: Design documents from `specs/001-speckit-eye-dashboard/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution §IV (unit tests for all code) and §V (E2E coverage of every user story) are non-negotiable. Each logic task names its unit test file and ships the module and its tests together; each story phase has its own Playwright suite. E2E test names MUST start with the story/requirement ids they cover, for example `US2 FR-027 keeps scroll and expanded items on live update` (§V traceability).

**Organization**: Tasks are grouped by user story so each story can be implemented and tested as its own increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1–US4)
- All paths are relative to the repository root

## Conventions that apply to every task

- Plain JavaScript ES modules with JSDoc, Node.js ≥ 22, no TypeScript (research R1).
- All HTML is produced with the `html` tagged template from `src/render/html.js`; only trusted fragments go through `raw()` (R4).
- Unit tests use `node:test` + `node:assert/strict`, live in `tests/unit/`, and never touch the real file system, network, or a browser (§IV). All I/O is injected: `fs` into `createReader` (T009) and `writeSite` (T053), `http.createServer` into `startServer` (T028), `fs.watch`/timers into the watcher (T035), and `document`/`window`/`EventSource`/`fetch`/`DOMParser` into the client scripts (T026, T039). File input for scan/model tests goes through the fake reader from T009. Only one-line entry points with no logic (`bin/speckit-eye.js`, the client bootstraps) are left to the E2E tests.
- The target project is never written (FR-006). Only `src/project/reader.js` reads input files; only `src/build/build.js` writes output files.
- Status colors exist once, as CSS custom properties in `src/styles/input.css` (§III).
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (§VI).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package, tooling, CI and developer docs skeleton

- [X] T001 Create `package.json` at the repo root: `"name": "speckit-eye"`, `"version": "0.1.0"` (the only place the version is defined, §III), `"type": "module"`, `"bin": {"speckit-eye": "bin/speckit-eye.js"}`, `"engines": {"node": ">=22"}`, `"files": ["bin/", "src/", "!src/styles/", "dist/styles.css", "README.md", "CHANGELOG.md", "LICENSE"]`, `"dependencies": {"markdown-it": "^15"}`, `"devDependencies": {"tailwindcss": "^4", "@tailwindcss/cli": "^4", "@tailwindcss/typography": "^0.5", "@playwright/test": "^1.63"}`, scripts `build:css` = `tailwindcss -i src/styles/input.css -o dist/styles.css --minify`, `prepack` = `npm run build:css`, `test` = `node --test "tests/unit/**/*.test.js"`, `test:coverage` = `node --test --experimental-test-coverage "tests/unit/**/*.test.js"`, `test:e2e` = `npm run build:css && playwright test`; then run `npm install` to create `package-lock.json`
- [X] T002 [P] Create `.gitignore` with `node_modules/`, `dist/`, `test-results/`, `playwright-report/`, `coverage/`
- [X] T003 [P] Create `src/styles/input.css` with `@import "tailwindcss";`, `@plugin "@tailwindcss/typography";`, `@source "../render";` and `@source "../client";`, a `:root` block defining `--status-done` (green), `--status-active` (highlight), `--status-started` (blue), `--status-not-started` (dark grey, also used for `future` tasks), `--status-blocked`, and a global `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }` rule (FR-036); confirm `npm run build:css` writes `dist/styles.css`
- [X] T004 [P] Create `playwright.config.js`: `testDir: "tests/e2e"`, one project using Chromium only (R7), `workers: 1` (all E2E servers use the default port 4747 and US2 AC7 restarts on the same address), `retries: process.env.CI ? 1 : 0`, `reporter: [["list"], ["html", {open: "never"}]]`, `timeout: 30_000`
- [X] T005 [P] Create `CHANGELOG.md` in Keep a Changelog 1.1.0 format with an intro paragraph stating the project follows SemVer and an empty `## [Unreleased]` section (§VI)
- [X] T006 [P] Create `.github/workflows/ci.yml`: on push and pull_request; job `unit` on ubuntu-latest with a Node `[22, 24]` matrix running `npm ci` and `npm test`; job `e2e` with an OS matrix `[ubuntu-latest, macos-latest, windows-latest]` on Node 22 running `npm ci`, `npx playwright install --with-deps chromium`, `npm run test:e2e`, and uploading `playwright-report/` on failure (plan risk: watcher on macOS/Windows)
- [X] T007 [P] Create `DEVELOPMENT.md` skeleton with sections Setup (Node ≥ 22, `npm ci`, `npx playwright install chromium`), Build (`npm run build:css`), Tests (`npm test`, `npm run test:coverage`, `npm run test:e2e`, E2E naming rule `USn FR-xxx …`), Conventions (the list under "Conventions that apply to every task" above), and placeholder headings "Project structure" and "Release process" to be completed in T069 (§IX)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Pure input → model pipeline and shared rendering primitives that every story uses

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T008 [P] Implement `src/render/html.js`: export `escapeHtml(s)` (escapes `& < > " '`), `raw(s)` (wraps a trusted string in a `Raw` object), and the tagged template `html` that escapes every interpolated value except `Raw` values, flattens arrays (joined with `""`), renders `null`/`undefined`/`false` as `""`, and returns a `Raw`; add `tests/unit/html.test.js` covering escaping, nesting, arrays, and falsy values
- [X] T009 [P] Implement the ProjectReader boundary: `src/project/reader.js` exports `createReader(root, fs)` (`fs` defaults to `node:fs/promises`; the parameter takes any object with `readdir`, `readFile`, `stat`) returning `{ list(relDir) → Promise<{name, isDir}[]> ([] when the folder is missing), read(relPath) → Promise<string> (decodes with `new TextDecoder("utf-8", {fatal: true})` so invalid UTF-8 throws), exists(relPath) → Promise<boolean>, readGitHead() → Promise<{ gitDir, head } | null> }`; every path goes through a pure exported helper `resolveInside(root, relPath)` that throws when the resolved path leaves `root`, except `readGitHead`, which reads `.git/HEAD`, or, when `.git` is a file containing `gitdir: <path>` (worktree), reads exactly the file `HEAD` inside that gitdir (the only read allowed outside `root`, research R9), returning null when neither exists; create `tests/unit/fake-reader.js` exporting `createFakeReader(files, { gitHead })` where `files` is `{ "specs/001-x/spec.md": "…", "bad.md": new Error("EIO") }` implementing the same interface; add `tests/unit/reader.test.js` testing `resolveInside` (including `..` and absolute paths), `createReader` with an in-memory fake `fs` (missing folder → `[]`, invalid UTF-8 throws, `exists`, `readGitHead` for a normal repo, a worktree `.git` file, and no repo), and the fake reader
- [X] T010 [P] Implement `src/project/artifacts.js` per data-model.md "Artifact" and contracts/routes.md: `isValidName(name)` (`/^[A-Za-z0-9._-]+$/`, W11 otherwise), `classifyKind(source)` → one of `spec | plan | research | data-model | quickstart | tasks | contract | checklist | constitution | assessment | other`, `sortFeatureArtifacts(list)` (order: spec, plan, research, data-model, quickstart, tasks, contracts by name, checklists by name, then the rest by path), `sortAssessmentArtifacts(list)` (intake, research, problem, concept, decision first, then the rest by name), `artifactTitle(markdown, fileName)` (first `# ` heading else file name), `sourceToUrl(source)` (`.specify/memory/constitution.md` → `constitution.html`; `specs/<dir>/<rel>.md` → `features/<dir>/<rel>.html`; `.specify/assessments/<slug>/<rel>.md` → `assessments/<slug>/<rel>.html`); add `tests/unit/artifacts.test.js`
- [X] T011 Implement `src/project/scan.js` (depends on T009, T010): export `isSpecKitProject(reader)` (true when `specs/` or `.specify/` exists) and `scan(reader, projectName)` returning `{ name, features: [{ dir, files: Map<relPath, content> }] (direct subfolders of specs/ sorted by plain string compare, FR-008; every *.md recursively), constitution: {source, content} | null, assessments: [{ slug, files: Map }], featureDirectory: string | null (basename of `feature_directory` from `.specify/feature.json`; W10 when unreadable or naming a missing feature), gitBranch: string | null (from `reader.readGitHead()` `ref: refs/heads/<branch>`; null on detached HEAD or no repo, R9), gitDir: string | null (for the watcher, T035), warnings }`; skip names failing `isValidName` with W11 `name not supported for a page (skipped)`, and files whose read throws with W9 `could not read file (skipped)`; add `tests/unit/scan.test.js` using the fake reader (worktree `.git` file, detached HEAD, bad names, unreadable file, missing `specs/`)
- [X] T012 [P] Implement `src/parse/tasks.js` exactly per contracts/tasks-md-format.md: `parseTasks(text, file)` → `{ phases: [{number, title, tasks}], tasks, warnings }`; split on `\n` and strip trailing `\r`; skip fenced blocks (``` and `~~~`) and HTML comments including multi-line ones; phase regex `^##\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$`; task regex `^\s*[-*]\s+\[( |x|X)\]\s+(.*)$`; ID `^(T\d+)\b`; `[P]` and `[USn]` markers directly after the ID in any order; dependencies `/depends on\s+(T\d+(?:\s*(?:,\s*and|,|and|&)\s*T\d+)*)/i` (accepts `T1, T2`, `T1 and T2`, `T1, and T2`, `T1 & T2`); tasks before the first phase go into a synthetic phase with `number: null`, title `Unphased` (W3); raise W1, W2, W3, W5, W6 (drop unknown dependency IDs), W8, W12 (repeated phase number) with the contract's exact messages and 1-based line numbers; every task line counts (M5); never throw; add `tests/unit/parse-tasks.test.js` covering every table row, every warning, CRLF, fences, comments, and "total equals number of checkboxes outside code and comments"
- [X] T013 [P] Implement `src/parse/spec.js`: `parseSpec(text)` → `{ title: string | null, stories: [{label: "US<n>", title, priority}] }` using `^#\s+Feature Specification:\s*(.+)$` (first match) and `^###\s+User Story\s+(\d+)\s*[-–—]\s*(.+?)\s*\(Priority:\s*(P\d+)\)\s*$`, skipping fenced blocks; add `tests/unit/parse-spec.test.js` (hyphen, en dash, em dash, missing priority line ignored)
- [X] T014 Implement `src/model/build-model.js` (depends on T011–T013): `buildModel(scanResult)` → `Project` per data-model.md; Feature `title` from spec title else `dir`; Phase fields `number`, `title`, `tasks`, `storyLabels` (first-appearance order), `mergedStory` (set when every task carries the same single label), `groups` (only when `storyLabels.length > 1`; unlabeled tasks stay on the phase), `key` = `<featureDir>/p<number or 'u'>`, with `@L<line>` appended to every occurrence of a repeated phase number; StoryGroup `key` = `<phaseKey>/<label>`; Task `key` = `<featureDir>/<id or 'L'+line>`, with `@L<line>` appended to every occurrence of a duplicated ID, so all keys are unique (data-model.md); `Counts = { done, total, open = total - done, percent = total ? min(round(done*100/total), open ? 99 : 100) : 0 }`; `Totals = { tasks: Counts, specs: {completed, total}, phases: {completed, total} }` where a spec is completed when `hasTasks && counts.total > 0 && counts.open == 0` and every feature counts toward `specs.total`, and a phase is completed when `counts.total > 0 && counts.open == 0`, with only phases where `counts.total > 0` counted in `phases.total`; Stage per the data-model table (`empty`, `specified`, `planned`, `ready`, `in-progress`, `complete`; `tasks.md` with `total == 0` stays `planned`/`specified`/`empty`); W4 `story label USn has no matching user story in spec.md`; build artifact lists with `sortFeatureArtifacts`/`sortAssessmentArtifacts`; add `tests/unit/build-model.test.js` including 40/65 → 62 %, 199/200 → 99 %, merged vs grouped phases, stage for every row, a phase with no tasks excluded from `phases.total`, and unique keys for duplicate task IDs and repeated phase numbers
- [X] T015 Implement `src/model/active.js` (depends on T014): `selectActive(project, {featureDirectory, gitBranch})` → `{ featureDir, phaseKey, storyLabel, nextTaskKey, source: "feature.json" | "git-branch" | "first-open" | "none" }` following data-model.md "ActiveSelection" rules 1–6 verbatim (while any feature has open tasks, a candidate is skipped when `hasTasks && open == 0`; when no feature has open tasks, candidate A else B stays active even if complete, with null phase/story/task, else `none` (FR-018); feature without `tasks.md` can be active with null phase/task; `storyLabel` only when the active phase has groups; next task = first open task in file order within the active group, or within the phase when it has no groups); add `tests/unit/active.test.js` with one test per rule plus spec US1 AC6 both cases and AC7 both cases (all done without feature.json → `none`; all done with feature.json naming a feature → that feature, `source: "feature.json"`, null phase/story/task)
- [X] T016 Implement `src/model/task-state.js` (depends on T015): `applyTaskStates(project)` sets each task's `state` in the order completed → current (`key == active.nextTaskKey`) → blocked (any `dependsOn` task open) → future, adds W7 `next task Tnnn depends on open task Tmmm` when the current task has an open dependency, and sets `sig` on the project, every feature, phase, group, and task (short string from counts, stage/state, and the active flag, data-model.md "Change signature"); make `buildModel` call `selectActive` and `applyTaskStates` so it returns a complete Project; add `tests/unit/task-state.test.js`
- [X] T017 [P] Implement `src/cli/args.js` per contracts/cli.md: `parseCliArgs(argv)` using `util.parseArgs` strict mode with options `serve`, `build`, `out`, `base`, `help`/`-h`, `version`/`-v`; returns `{mode: "serve" | "build" | "help" | "version", dir, out, base}` or `{error: string}` for unknown options, both modes, no mode, `--out` missing in build, `--out`/`--base` with serve; `normalizeBase` turns `repo` → `/repo/`, default `/`; export a `USAGE` string with the synopsis; add `tests/unit/args.test.js`
- [X] T018 Implement `src/render/layout.js` (depends on T008): `renderPage({ title, base, mode, project, main, version, generatedAt })` returns a full HTML document: `<body data-mode="serve|static" data-version="…">`, `<header data-region="header">` with the project name (links to `{base}index.html`) and links to the constitution and each assessment's first artifact at `{base}` + url, `<link rel="stylesheet" href="{base}assets/styles.css">`, `<script src="{base}assets/overview.js" defer>`, the given `main`, and `<footer>` with the version; all links absolute with `base` (R10); add `tests/unit/layout.test.js`

**Checkpoint**: `npm test` passes; `buildModel(scan(fakeReader))` yields a complete Project for any fixture

---

## Phase 3: User Story 1 - See where the project stands at a glance (Priority: P1) 🎯 MVP

**Goal**: `speckit-eye --serve <dir>` prints a local address whose overview shows the header, overall bar and counters, the feature tree with only the active chain expanded, and the task grid.

**Independent Test**: Serve `tests/fixtures/projects/mixed`; the overall bar reads 40 / 65 (62 %), per-feature/phase/story counts match the fixture checkboxes, only the active chain is open, the next task is shown, and the project folder is unchanged.

### Fixtures for User Story 1

- [X] T019 [P] [US1] Create fixture `tests/fixtures/projects/mixed/`: `.specify/memory/constitution.md`; `.specify/assessments/speckit-dashboard/intake.md` and `decision.md`; `specs/001-alpha/` (spec.md with US1–US2, plan.md, tasks.md with 30/30 done); `specs/002-beta/` (spec.md with US1–US3, plan.md, tasks.md with 10/20 done: Phase 1 Setup unlabeled, Phase 3 all `[US1]` (merged row), Phase 4 mixing `[US2]`, `[US3]` and one unlabeled task, one open task whose description says `depends on T0xx` naming an open task so it is blocked); `specs/003-gamma/` (spec.md, plan.md, tasks.md with 0/15 done); `specs/004-delta/` (spec.md only → stage `specified`); document expected counts per feature/phase/story in `tests/fixtures/projects/README.md`
- [X] T020 [P] [US1] Create fixtures `tests/fixtures/projects/complete/` (two features, every task `[x]` or `[X]`, constitution) and `tests/fixtures/projects/empty/` (empty `specs/` kept with a `.gitkeep`, plus `.specify/memory/constitution.md`); add their expectations to `tests/fixtures/projects/README.md`
- [X] T021 [P] [US1] Create fixture `tests/fixtures/projects/nonstandard/specs/001-odd/` with spec.md and a tasks.md that triggers W1, W2, W3, W4 (`[US9]`), W5, W6, W7, a duplicated task ID and a repeated `## Phase 2:` heading (W12), plus a checkbox inside a fenced block and inside an HTML comment (both not counted); add `specs/002-emptytasks/tasks.md` with no task lines (W8); record expected totals and warning codes/lines in `tests/fixtures/projects/README.md`

### Implementation for User Story 1

- [X] T022 [US1] Implement the progress section in `src/render/overview.js`: `renderOverview(project, {base})` returns the `<main>` inner HTML beginning with `<section data-region="progress">` containing the overall bar as `<progress data-key="project" data-sig value="<done>" max="<total>">` (no inline `style` attribute anywhere, since the serve-mode CSP blocks them; contracts/routes.md) with the text "done / total tasks (pct %)", three counters `[data-counter="specs|phases|tasks"]` each "completed / total", a "Next: T012 · description" line for `active.nextTaskKey` (FR-017), an "All tasks are complete" message when `totals.tasks.total > 0 && totals.tasks.open == 0`, whether or not a feature is active (FR-018), and a short explanation instead of an empty page when there are no features (edge case "Empty project"); add `tests/unit/overview.test.js`
- [X] T023 [US1] Add the feature tree to `src/render/overview.js` (`<div data-region="tree">`): one `<details data-key data-sig data-status="done|started|not-started" [data-active]>` per feature in folder order with `<summary>` = title · stage label · "N open / M" (FR-019a); `open` only on the active feature, active phase, and active group (FR-016); completed items are never `open`, except a completed active feature when all tasks are done (FR-018), which gets `open` and `data-active` while its phases stay closed; phases as nested `<details>` titled "Phase N · USn – Title (Pn)" when `mergedStory` is set, otherwise "Phase N: Title" with a group sub-level per story and unlabeled tasks directly under the phase (FR-015a); tasks as `<li data-key data-state>` with ID, description, and a "next" mark on the current task; a warning block on the feature listing `file:line message` (FR-019); extend `tests/unit/overview.test.js` (including the completed active feature: `data-status="done"`, `data-active`, `open`, no open phase, no "next" mark)
- [X] T024 [US1] Add the task grid to `src/render/overview.js` (`<div data-region="grid">`): one `<a tabindex="0" data-key data-state="completed|current|blocked|future" data-parents="<featureDir> <phaseKey> [groupKey]" title="T012 · description — feature › phase">` per task in tree order, no `href` until the click decision in T034 (FR-015b); extend `tests/unit/overview.test.js`
- [X] T025 [US1] Style the overview in `src/styles/input.css`: the `<progress>` bar (track and value via `::-webkit-progress-bar`, `::-webkit-progress-value`, `::-moz-progress-bar`); tree status colors from the `--status-*` tokens (`done` green with a ✓ mark, `[data-active]` highlighted and combinable with `done`, `started` blue, `not-started` dark grey); `details` open/close animation under `motion-safe`; grid of small squares colored by `data-state` using the same tokens; two-column layout from the `md` breakpoint, stacked tree-first below it (FR-015, FR-035); a `[data-highlight]` style for tree items highlighted from the grid
- [X] T026 [P] [US1] Implement `src/client/overview.js`: export `parentKeys(dataParents)` and `attachHover(doc)`, which registers `mouseover`/`focusin` on `[data-region="grid"]` to set `data-highlight` on the tree elements whose `data-key` is listed in the target cell's `data-parents`, and clears them on `mouseout`/`focusout`; the file ends with the one-line bootstrap `if (typeof document !== "undefined") attachHover(document);`; add `tests/unit/client-overview.test.js` covering `parentKeys` and `attachHover` with small fake element/document objects (`addEventListener`, `querySelector`, `setAttribute`, `removeAttribute`)
- [X] T027 [US1] Implement `src/render/site.js`: `renderSite(project, { base, mode, version, generatedAt, assets })` → `Map<path, {type, body}>` containing `index.html` (layout + overview) and `assets/styles.css` and `assets/overview.js` from the passed-in `assets` strings (site.js stays pure; callers read the files); this is the only place that decides which pages exist (FR-031, §III); add `tests/unit/site.test.js`
- [X] T028 [US1] Implement the server in two modules. `src/serve/handler.js`: `createHandler({ getSite })` returns a pure `(req, res)` function: map `/` to `index.html`, strip the leading `/`, look the path up in `getSite()`; unknown paths (including any containing `..` or encoded variants) → 404 without touching the file system (FR-007); only GET and HEAD (others → 405); headers `Content-Type` by extension, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:`; add `tests/unit/handler.test.js` with fake `req`/`res` objects (routes, 404 cases, 405, HEAD without body, every header). `src/serve/server.js`: `startServer({ handler, host: "127.0.0.1", port: 4747, createServer = http.createServer })` only listens: bind to `host`, on `EADDRINUSE` retry once with port 0, resolve with the actual `{ url, close }`; add `tests/unit/server.test.js` with a fake `createServer` whose `listen` emits `EADDRINUSE` or succeeds (no socket is opened, §IV)
- [X] T029 [US1] Implement serve mode in `src/cli/main.js`: `run(argv, { stdout, stderr, createReader, startServer, readAsset, onSignal })` with real defaults; handle `help` (usage to stdout, 0), `version` (from `package.json` via `import pkg from "../../package.json" with { type: "json" }`, 0), usage errors (usage to stderr, 2), missing dir or not a Spec Kit project (message naming the expected `specs/` or `.specify/`, 2); then scan → buildModel → renderSite(mode `serve`, base `/`) → `createHandler` → `startServer`; print `speckit-eye <version> — serving <abs dir>`, `  Local: <url>`, `  Watching specs/ and .specify/ for changes (Ctrl+C to stop)` and each warning to stderr as `warning: <file>:<line> <message>`; exit 0 on SIGINT/SIGTERM, 1 on unexpected errors (contracts/cli.md); add `tests/unit/main.test.js` with injected fakes
- [X] T030 [US1] Create `bin/speckit-eye.js` with `#!/usr/bin/env node`, importing `run` from `../src/cli/main.js` and setting `process.exitCode` from its result; mark it executable (`chmod +x`, and `git update-index --chmod=+x`)
- [X] T031 [US1] Create `tests/e2e/helpers.js`: `copyFixture(name)` copies `tests/fixtures/projects/<name>` to a fresh `os.tmpdir()` folder; `startServe(dir)` spawns `node bin/speckit-eye.js --serve <dir>`, resolves `{ url, stdout, stderr, stop() }` once a `Local:` line appears (15 s timeout), and fails at once with `E2E tests need port 4747 free` when that line shows another port (the server fell back because 4747 was busy); `runCli(args)` resolves `{ code, stdout, stderr }`; `hashTree(dir)` returns a digest of every file path + content for FR-006 checks
- [X] T032 [US1] Write `tests/e2e/us1-overview.spec.js` covering spec US1 AC1–AC10 one test each (AC1 also asserts the bar's `value`/`max` are 40/65; AC6 writes `.specify/feature.json` into the temp copy; AC7 uses `complete` twice: without `feature.json` nothing is active, and with `feature.json` naming its second feature that feature is `open`, `data-active`, `data-status="done"`, no phase is open, no "Next" line, and the complete message is shown; AC9 hovers a grid square and asserts the `title` and `data-highlight` on its feature and phase), plus `US1 SC-001` (at a 1280×720 viewport the progress section, the active feature's summary, and the "Next" line are inside the viewport without scrolling), `US1 FR-015c` (the dependent task in `mixed` has `data-state="blocked"` in the grid and the tree), `US1 FR-036` (a context with `reducedMotion: "reduce"`: computed `transition-duration` and `animation-name` of the bar and a `details` element are `0s`/`none`), `US1 FR-038` (every request made while loading and using the overview goes to the server's own origin, and no `securitypolicyviolation` event fires), `US1 FR-013` (nonstandard fixture: server keeps running, warnings shown on the feature and on stderr, totals equal checkbox counts), `US1 FR-015` (narrow viewport 375 px stacks tree above grid), empty project (0 % with explanation), `FR-005` (missing dir and non-Spec-Kit dir exit 2, no args exit 2, `--help` exit 0), and `FR-006` (`hashTree` unchanged after the run)
- [X] T033 [US1] Create `docs/usage.md` (serve mode: `npx speckit-eye --serve <dir>`, what the overview shows, stage labels, status colors, active-item rules FR-014 in plain words, link to [contracts/cli.md](../specs/001-speckit-eye-dashboard/contracts/cli.md) for options/exit codes) and `README.md` (what it is, `npx speckit-eye --serve .` example, prerequisites Node ≥ 22, links to `docs/` and `DEVELOPMENT.md`; no developer content, §VIII); add "Added: serve mode with overview" to `CHANGELOG.md`
- [X] T034 [US1] Visual review (owner gate — needs a human decision): run `node bin/speckit-eye.js --serve tests/fixtures/projects/mixed` and against this repository, present screenshots, ask the owner (a) what clicking a tree item or grid square does and (b) the threshold and fallback for very large grids; record the decisions in `specs/001-speckit-eye-dashboard/spec.md` under Assumptions "Open design items" and append implementation tasks for them to this file after T070

**Checkpoint**: US1 is a usable MVP: `npm test` and `npx playwright test tests/e2e/us1-overview.spec.js` pass

---

## Phase 4: User Story 2 - Follow progress live during a long run (Priority: P2)

**Goal**: In serve mode, every open page updates within ~2 s of a Spec Kit Markdown file settling, keeping scroll and expanded items, highlighting changed items, and showing a banner while disconnected.

**Independent Test**: Serve a temp copy of `mixed`, expand a non-active feature and scroll, tick a task on disk; within 2 s the counts update, scroll and expansion are unchanged, and the changed items carry `data-changed`.

### Implementation for User Story 2

- [X] T035 [P] [US2] Implement `src/serve/watcher.js`: `createWatcher({ root, gitDir, watch = fs.watch, exists, setTimeout, clearTimeout, onChange, onError })` watching `specs/`, `.specify/memory/`, `.specify/assessments/` with `{ recursive: true }`; the single-file inputs through their parent folders without recursion, filtered by file name (`.specify/` → `feature.json`; `gitDir` → `HEAD`), because rename-saves make a watch on the file itself go silent (R2); and the project root and `.specify/` without recursion so that a recursive root created after startup (`specs`, `memory`, `assessments`) is added on the next event (`refreshRoots()` is idempotent and uses the injected `exists`); missing roots are skipped until then; any relevant event triggers a debounced `onChange()` with a 100 ms quiet period and a 500 ms maximum wait during bursts (R2); watcher `error` events go to `onError` and do not crash; `close()` stops all watchers and timers; add `tests/unit/watcher.test.js` with a fake `watch`, a fake `exists`, and `node:test` mock timers (single event, burst capped at 500 ms, `HEAD` replaced by rename still fires, unrelated file in `.git/` ignored, `specs/` created after start gets watched, close)
- [X] T036 [P] [US2] Implement `src/serve/events.js`: `createEventHub({ setInterval, clearInterval })` with `add(req, res)` (writes `Content-Type: text/event-stream`, `Cache-Control: no-store`, then `event: hello\ndata: {"version": <n>}\n\n`, removes the client on `close`), `broadcast(version)` (writes `event: change\ndata: {"version": <n>}\n\n` to every client), a `: ping` comment every 25 s, and `close()`; add `tests/unit/events.test.js` with fake response objects
- [X] T037 [US2] Add `GET /__events` to `src/serve/handler.js` (`createHandler({ getSite, events })`, routed to `events.add`), exempt from the site-map lookup; extend `tests/unit/handler.test.js`
- [X] T038 [US2] In `src/render/layout.js` add, only when `mode == "serve"`, `<script src="{base}assets/live.js" defer>` and `<div data-region="live-status" hidden>Live updates paused — reconnecting…</div>`; in `src/render/site.js` add `assets/live.js` to the map only in serve mode; extend `tests/unit/layout.test.js` and `tests/unit/site.test.js` asserting both are absent in static mode
- [X] T039 [US2] Implement `src/client/live.js` per contracts/routes.md "Live-update protocol" as `createLiveClient({ document, window, EventSource, fetch, DOMParser, setTimeout, requestAnimationFrame })` with `start()`: track the viewer's own toggles (`toggle` events on `details[data-key]` → `Map<key, open>`); on `change`: record `scrollY`, `data-sig` per `data-key`, and `<progress>` values, `fetch(location.pathname)`, parse with `DOMParser`, replace `<main>`, re-apply the viewer's toggles, restore `scrollY`, set `data-changed` for 1.5 s on elements whose `data-sig` differs, animate each `<progress>` `value` from old to new with `requestAnimationFrame` (skipped when `matchMedia("(prefers-reduced-motion: reduce)")` matches); on 404 show a notice linking to the overview; on `EventSource` `error` unhide `[data-region="live-status"]`, on the next `hello` hide it and fetch once (FR-030); also export the helpers `collectSigs(elements)`, `changedKeys(oldSigs, newSigs)`, `applyToggles(detailsList, toggles)`; the file ends with the one-line bootstrap `if (typeof document !== "undefined") createLiveClient({ document, window, EventSource, fetch, DOMParser, setTimeout, requestAnimationFrame }).start();`; add `tests/unit/client-live.test.js` covering the helpers and `createLiveClient` with fake document/window/EventSource/fetch/DOMParser objects and mock timers (swap keeps toggles and scroll, `data-changed` set and cleared, value animation and its reduced-motion skip, 404 notice, banner on `error` and hidden plus one fetch on `hello`)
- [X] T040 [US2] Wire live updates in `src/cli/main.js`: create the event hub and the watcher (passing `gitDir` from the scan result, and re-creating the watcher when a rescan reports a different `gitDir`); on change rescan → buildModel → renderSite; if any page body changed, increment the model version and `broadcast(version)`; print `updated (<n> features, <done>/<total> tasks)` per rescan and each new or changed warning once; a failing rescan logs to stderr and keeps the last site; close watcher and hub on SIGINT/SIGTERM; extend `tests/unit/main.test.js` with fake watcher/hub
- [X] T041 [US2] Add live-update styles to `src/styles/input.css`: `[data-changed]` highlight animation (~1.5 s, `motion-safe` only), `[data-region="live-status"]` fixed banner, and the 404 notice
- [X] T042 [US2] Write `tests/e2e/us2-live.spec.js` covering spec US2 AC1–AC7 one test each, with ≤ 2 s assertions: AC1 tick a task with `fs.writeFile`, then repeat 20 single ticks one after another and assert at least 19 appear within 2 s (`US2 SC-002`, 95th percentile); AC2 expand a non-active feature, scroll, tick, assert `scrollY` and `open` unchanged; AC3 assert `data-changed` on the changed task/phase/feature and the bar's new `value`; AC4 artifact page update — mark `test.fixme` until US3 is done; AC5 create `specs/005-new/spec.md`, then `US2 FR-026` delete that folder and assert the feature disappears from the tree; AC6 write a temp file and `rename` over `tasks.md`, then 10 writes in 200 ms, assert the final content; AC7 stop the CLI, assert the banner is visible, restart on the same dir (same port 4747), assert the banner hides and content catches up
- [ ] T043 [US2] Cross-platform watcher check (plan risk R2): confirm `us2-live.spec.js` passes in the CI e2e matrix on ubuntu, macOS, and Windows (T006), and run it once under WSL with the project on the Linux file system; record the results and date under R2 in `specs/001-speckit-eye-dashboard/research.md`; if any platform fails, stop and request a plan amendment for the `chokidar` fallback instead of adding it
- [X] T044 [US2] Add a "Live updates" section to `docs/usage.md` (what triggers an update, ~2 s latency, banner meaning, WSL note: keep the project on the Linux file system, files under `/mnt/c` edited from Windows do not raise events); add "Added: live updates in serve mode" to `CHANGELOG.md`

**Checkpoint**: US1 and US2 pass their E2E suites independently

---

## Phase 5: User Story 3 - Read any artifact in two steps or fewer (Priority: P2)

**Goal**: Every Markdown artifact in the project has a safe, well-typeset page reachable from the overview in ≤ 2 steps via the menu or feature links.

**Independent Test**: Serve the `artifacts` fixture; every artifact opens within two clicks from the overview, tables/task lists/code render, relative links go to rendered pages, and no script from a file runs.

### Implementation for User Story 3

- [X] T045 [P] [US3] Create fixture `tests/fixtures/projects/artifacts/`: `.specify/memory/constitution.md`; `.specify/assessments/idea-x/` with `intake.md`, `decision.md`, `notes.md`; `specs/001-full/` with `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, `tasks.md`, `contracts/cli.md`, `checklists/requirements.md` (with checkboxes that must not count), `decisions.md`, `run-log.md`, and `bad name.md` (W11); `specs/002-partial/` with only `spec.md` and `plan.md`; `plan.md` must contain a table, a task list, a fenced `js` block, a ` ```mermaid ` block, `<script>alert(1)</script>`, `<img src=x onerror=alert(1)>`, `[spec](./spec.md)`, `[cli](./contracts/cli.md#synopsis)`, `[src](../../src/index.js)`, `[x](javascript:alert(1))`, and `[docs](https://example.com)`
- [X] T046 [P] [US3] Implement `src/render/markdown.js`: `createMarkdown({ artifactsBySource, base })` returns `render(source, text)` using `markdown-it` with `html: false`, `linkify: false` (R3); an in-house core rule turning list items starting with `[ ]`/`[x]`/`[X]` into `<input type="checkbox" disabled>` (checked when done); link rewriting: resolve relative hrefs against the source file's folder, keep the `#fragment`, map known artifact sources to `{base}` + url, keep `http:`, `https:`, `mailto:` links, render every other relative link as plain text (FR-023); heading `id`s from an in-house slug (lowercase, runs of non-`[a-z0-9]` → `-`, trimmed, duplicates suffixed `-1`, `-2`); fenced blocks (including `mermaid`) rendered as escaped `<pre><code class="language-x">`; add `tests/unit/markdown.test.js` covering script/img escaping, `javascript:` rejected, table, task list, link rewrite cases, slugs
- [X] T047 [US3] Implement `src/render/artifact.js`: `renderArtifact(artifact, bodyHtml, { base, feature })` → `<main>` containing a breadcrumb (Overview › feature title › artifact title) and `<article class="prose" data-region="artifact" data-key="<source path>">`; add `tests/unit/artifact.test.js`
- [X] T048 [US3] Add the site-wide menu to `src/render/layout.js`: a `<details data-region="menu">` in the header (works without scripts) listing Overview, Constitution, each assessment with its artifacts, and each feature with its artifacts in data-model order, plus an always-visible "Overview" link on every page (FR-022, FR-025); extend `tests/unit/layout.test.js`
- [X] T049 [US3] In `src/render/overview.js` list links to each present artifact (title, in data-model order) inside every feature's `<details>`, above its phases; no link for missing artifacts (US3 AC1, AC5); extend `tests/unit/overview.test.js`
- [X] T050 [US3] Extend `src/render/site.js` to add one page per artifact (constitution, every feature artifact, every assessment artifact) using `createMarkdown` and `renderArtifact`, keyed by its url; extend `tests/unit/site.test.js` asserting the page set equals the artifact set and W11 names are absent
- [X] T051 [US3] Write `tests/e2e/us3-artifacts.spec.js` covering spec US3 AC1–AC6 one test each, plus `US3 SC-004 FR-022` (breadth-first crawl from the overview following at most 2 link clicks reaches every artifact page listed in the fixture), `US3 FR-024` (no dialog event fires on the plan page; `<script>` appears as text), `US3 FR-023` (the `../../src/index.js` link is plain text and `/src/index.js` returns 404), and `US3 FR-020` (mermaid block shown as code); `US3 FR-038` (every request while loading artifact pages goes to the server's own origin); then remove `test.fixme` from US2 AC4 in `tests/e2e/us2-live.spec.js` and make it pass, and add `US2 FR-026` there: with the `research.md` page open, delete the file and assert the notice linking to the overview appears within 2 s
- [X] T052 [US3] Add an "Artifact pages" section to `docs/usage.md` (which files are listed, order, menu, link behaviour, diagrams shown as code); add "Added: artifact pages and site menu" to `CHANGELOG.md`

**Checkpoint**: US1–US3 pass their E2E suites; header links to constitution/assessments now resolve

---

## Phase 6: User Story 4 - Publish a shareable snapshot from CI (Priority: P3)

**Goal**: `speckit-eye --build <dir> --out <folder> [--base /repo/]` writes the same pages as a static site that works under a sub-path, without scripts, and without live updates.

**Independent Test**: Build `mixed` with `--base /my-repo/`, serve the output under `/my-repo/` from a plain static server; overview and every artifact page load directly, links and styles work, expand/collapse works with JavaScript disabled, and no `__events` request is made.

### Implementation for User Story 4

- [X] T053 [P] [US4] Implement `src/build/build.js`: `writeSite({ site, out, projectRoot, fs })` with injected `fs/promises`-like `fs`; reject `out` equal to `projectRoot` or inside `<projectRoot>/specs` or `<projectRoot>/.specify` (usage error); if `out` exists, is not empty, and has no `.speckit-eye-build` → return `{ error, code: 2 }` having written nothing (FR-033); if the marker exists, remove the folder's contents first; write every page (creating folders), then the `.speckit-eye-build` marker; return `{ pages: <count> }`; add `tests/unit/build.test.js` with an in-memory fake fs (fresh folder, rebuild removes stale page, foreign folder untouched, out inside specs/)
- [X] T054 [US4] Static mode in `src/render/layout.js` and `src/render/site.js`: when `mode == "static"`, render `generated at <ISO time>` from `generatedAt` in the footer, omit `live.js`, the live-status banner, and anything referencing `__events`, and prefix every link and asset with `base`; add a unit test in `tests/unit/site.test.js` asserting that serve and static `<main>` HTML are identical for the same model with base `/` (FR-031)
- [X] T055 [US4] Implement build mode in `src/cli/main.js`: scan → buildModel → renderSite(mode `static`, `base`, `generatedAt = new Date().toISOString()`) → `writeSite`; print `speckit-eye <version> — building <abs dir> → <out> (base <base>)`, `  wrote <n> pages`, `  <n> warnings (see above)` when any, and the two-line public-exposure note from contracts/cli.md (FR-034); exit 0 on success, 2 for usage/marker errors, 1 when writing fails; extend `tests/unit/main.test.js`
- [X] T056 [US4] Add to `tests/e2e/helpers.js`: `runBuild(dir, out, base)` and `serveStatic(rootDir, mountPath)` — a test-only `node:http` static file server on port 0 that maps `<mountPath>*` to files under `rootDir` (directory → `index.html`, unknown → 404)
- [X] T057 [US4] Write `tests/e2e/us4-build.spec.js` covering spec US4 AC1–AC5 one test each: AC1 page count and exit 0 with summary; AC2 deep link `/my-repo/features/001-alpha/plan.html` loads with styles; AC3 overview matches serve mode (compare `[data-region=progress]`, tree and grid text), footer shows generated time, no request to `__events` and every request stays on the static server's origin (`US4 FR-038`), expand/collapse works in a context with `javaScriptEnabled: false` (`US4 FR-037`); AC4 see T059; AC5 rebuild after deleting an artifact leaves no stale page, and a foreign non-empty folder yields exit 2 with contents unchanged; plus `US4 FR-006` (`hashTree` of the project unchanged) and `US4 FR-034` (stdout contains the exposure note)
- [X] T058 [US4] Create `docs/hosting.md`: a GitHub Pages workflow sample (`actions/checkout@v4`, `actions/setup-node@v4` with Node 22, `npx speckit-eye --build . --out _site --base /${{ github.event.repository.name }}/`, `actions/upload-pages-artifact@v3`, `actions/deploy-pages@v4`, `pages: write` and `id-token: write` permissions), a prominent warning next to it that a hosted build makes the specs, research, constitution and assessments readable by anyone who can reach the site unless the host restricts access (FR-034), a note that `.specify/feature.json` is git-ignored and that CI checks out `main` (push) or a detached HEAD (pull requests), which rarely matches a feature folder name, so the active feature usually falls back to the first feature with open tasks (R9), and a short Netlify note; add a "Publish a snapshot" section to `README.md` with the build command, the same warning, and a link to `docs/hosting.md`; add build options to `docs/usage.md`; add "Added: static build mode" to `CHANGELOG.md`
- [X] T059 [US4] Add `US4 AC4 FR-039` to `tests/e2e/us4-build.spec.js`: read `docs/hosting.md`, extract the `npx speckit-eye --build …` line from the YAML sample, substitute `node bin/speckit-eye.js` and a concrete base, run it against a temp copy of `mixed`, and assert exit 0 and a loadable `index.html` under the base

**Checkpoint**: All four user stories pass their E2E suites independently

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Security and scale verification, self-check, docs, and release readiness

- [ ] T060 [P] Write `tests/e2e/security.spec.js` (FR-006, FR-007, FR-024, SC-008): serving `mixed`, raw HTTP requests (via `node:http`, not the browser, so paths are not normalized) for `/../package.json`, `/%2e%2e/package.json`, `/specs/001-alpha/spec.md`, `/.specify/memory/constitution.md`, `/.env`, `/src/cli/main.js`, `/features/../../package.json` all return 404; every page response has the CSP and `nosniff` headers, and no `securitypolicyviolation` event fires on the overview or any artifact page; the server is not reachable on a non-loopback interface address from `os.networkInterfaces()` (skip when none exists); `hashTree` of the project is unchanged after serve, a live update, and a build
- [ ] T061 [P] Create `tests/fixtures/generate-large.js` (`node tests/fixtures/generate-large.js <dir>` writes 50 features × 40 tasks with spec.md, plan.md, tasks.md in 4 phases, about half the tasks checked) and `tests/e2e/scale.spec.js` (`SC-010`): overview `load` event ≤ 2 s after navigation, a checkbox change visible ≤ 2 s, `--build` completes ≤ 30 s
- [ ] T062 [P] Write `tests/e2e/self-counts.spec.js` (`SC-005`): build this repository's own project into a temp folder and assert, for each `specs/*/tasks.md`, that the feature's "open / total" in the built overview equals the checkbox counts computed in the test by the contract's task regex outside fenced blocks and HTML comments
- [ ] T063 [P] Create `docs/architecture.md`: module list by folder with one-line responsibilities, the one-way data flow `project → parse → model → render → serve/build`, why `render/site.js` is the single page decider, the live-update sequence (watcher → rescan → version → SSE → client swap), and links to [contracts/](../specs/001-speckit-eye-dashboard/contracts/) and [data-model.md](../specs/001-speckit-eye-dashboard/data-model.md) instead of copying them (§III, §VII)
- [ ] T064 Complete `README.md`: add a screenshot `docs/screenshot.png` captured with Playwright from the `mixed` fixture, a feature list, both commands, and links to `docs/usage.md`, `docs/hosting.md`, `docs/architecture.md`, `DEVELOPMENT.md`, and `CHANGELOG.md`; keep developer content out (§VIII)
- [ ] T065 Run `npm run test:coverage` and add unit tests to the corresponding `tests/unit/*.test.js` files for any uncovered branch in `src/`; the only lines allowed to stay uncovered are the one-line bootstraps at the end of `src/client/*.js` (§IV)
- [ ] T066 Verify packaging: run `npm pack --dry-run` and confirm the tarball contains `bin/`, `src/` without `src/styles/`, `dist/styles.css`, `README.md`, `CHANGELOG.md`, `LICENSE`, and nothing else; install the tarball in a temp folder and run `npx speckit-eye --serve <path to mixed fixture>` to confirm it starts with one runtime dependency tree (FR-001, SC-007); record the result in `DEVELOPMENT.md` release checklist
- [ ] T067 Run every scenario in `specs/001-speckit-eye-dashboard/quickstart.md` (1–6) by hand and fix any mismatch between the quickstart, the docs, and the behaviour
- [ ] T068 Grep `src/` for unused exports, dead code, and TODOs and remove them; confirm `package.json` `dependencies` lists only `markdown-it` (§I, §II)
- [ ] T069 Complete `DEVELOPMENT.md`: "Project structure" (short tree of `src/`, `tests/`, `docs/` linking to `docs/architecture.md`) and "Release process" (update `CHANGELOG.md` `[Unreleased]` → `[X.Y.Z] - date`, bump `version` in `package.json` only, `npm pack --dry-run` check from T066, `git tag vX.Y.Z`, `npm publish`) (§VI, §IX)
- [ ] T070 Prepare the first release: move the `[Unreleased]` entries in `CHANGELOG.md` to `## [1.0.0] - <date>`, set `"version": "1.0.0"` in `package.json`; leave tagging and `npm publish` to the owner (plan §VI)

### Owner decisions from the T034 visual review (spec Assumptions "Open design items")

These tasks do not depend on T070 and can run any time after US1. Do them before T065–T070 so coverage, docs and the release include them.

- [ ] T071 [US1] Grid click in `src/render/overview.js`: give each tree task `<li>` an `id` built from its `data-key` (a stable, attribute-safe form such as `task-` + the key with every character outside `[A-Za-z0-9_-]` replaced by `-`, with a numeric suffix when two keys collide) and give each grid square `href="#<that id>"`, so a click jumps to the task with or without JavaScript (browsers open closed `<details>` ancestors of a fragment target); update the doc comment that says "No `href` until … T034"; extend `tests/unit/overview.test.js` (every square's `href` matches exactly one tree `id`, ids are unique for repeated task IDs)
- [ ] T072 [US1] Grid click in `src/client/overview.js`: export `attachClick(doc)` (and call it from the bootstrap line next to `attachHover`), which on `click` of a grid square prevents the default jump, sets `open` on the feature, phase and group `<details>` listed in its `data-parents`, then calls `scrollIntoView({ block: "center" })` on the target task (behavior `smooth` unless `matchMedia("(prefers-reduced-motion: reduce)")` matches, FR-036) and marks it with `data-highlight` until the next click; tree items keep their native toggle and get no click handler; extend `tests/unit/client-overview.test.js` with fakes (parents opened, target scrolled, default prevented, reduced-motion uses `auto`)
- [ ] T073 [US1] Large-grid fallback in `src/render/overview.js` and `src/styles/input.css`: when `totals.tasks.total` ≤ 1,000 keep the single grid; above 1,000 render `data-layout="rows"` with one row per feature (a feature label, then its squares, smaller via a `[data-layout="rows"]` style); above 5,000 render `data-layout="bars"` with one `<progress data-key="<featureDir>" value max>` bar per feature labelled "title · done / total", linking to the feature's tree item; keep `data-key`, `data-state`, `data-parents`, `title` and `href` on squares in both square layouts so hover (T026), click (T072) and live updates still work; export the thresholds as named constants; extend `tests/unit/overview.test.js` (1,000 → single grid, 1,001 → rows, 5,001 → bars) and add the new styles with no inline `style` attribute (CSP)
- [ ] T074 [US1] Add E2E tests to `tests/e2e/us1-overview.spec.js`: `US1 FR-015b click` (in `mixed`, with the task's phase collapsed, clicking a grid square opens its feature, phase and story and the task is inside the viewport; the same with `javaScriptEnabled: false` reaches the task through the fragment, FR-037) and `US1 FR-015b large grid` (using `tests/fixtures/generate-large.js` from T061 with 2,000 tasks the grid has `data-layout="rows"` and one row per feature); update `docs/usage.md` (what a grid click does, how large grids are shown) and add "Added: click a grid square to jump to its task; compact grid for large projects" to `CHANGELOG.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup (T001 for `markdown-it`/`node:test` scripts). BLOCKS all stories
- **US1 (Phase 3)**: depends on Foundational. MVP
- **US2 (Phase 4)**: depends on US1 (server, CLI serve mode, overview DOM contract, E2E helpers)
- **US3 (Phase 5)**: depends on US1 (server, site.js, layout, E2E helpers). Independent of US2 except T051 un-fixme-ing US2 AC4
- **US4 (Phase 6)**: depends on US1; its artifact deep-link checks need US3's artifact pages. Independent of US2 (live parts are simply omitted)
- **Polish (Phase 7)**: depends on all stories

### User Story Dependency Graph

```text
Setup → Foundational → US1 ─┬─→ US2 ─────────────┐
                            ├─→ US3 ─┬───────────┼─→ Polish
                            │        └─→ US4 ────┘
                            └─→ (T034 visual review: owner gate, can run alongside US2/US3)
```

### Within Foundational

- T008, T009, T010, T012, T013, T017 are independent
- T011 needs T009 + T010; T014 needs T011–T013; T015 needs T014; T016 needs T015; T018 needs T008

### Within Each Story

- Fixtures before E2E specs; pure modules before `site.js`; `site.js` + `server.js` before `main.js`; `main.js` + `bin` before E2E specs
- Tasks editing the same file (`overview.js` T022→T023→T024→T049; `layout.js` T018→T038→T048→T054; `site.js` T027→T038→T050→T054; `main.js` T029→T040→T055; `handler.js` T028→T037) run in that order

### Parallel Opportunities

- Setup: T002–T007 in parallel after T001
- Foundational: T008, T009, T010, T012, T013, T017 in parallel
- US1: fixtures T019–T021 and T026 in parallel with T022–T025
- US2: T035 and T036 in parallel
- US3: T045 and T046 in parallel; US3 can run alongside US2 once US1 is done (different files except `layout.js`/`site.js`, so sequence T038 and T048/T050)
- Polish: T060–T063 in parallel

---

## Parallel Example: Foundational

```bash
Task: "Implement src/render/html.js with tests/unit/html.test.js"                (T008)
Task: "Implement src/project/reader.js + tests/unit/fake-reader.js"              (T009)
Task: "Implement src/project/artifacts.js with tests/unit/artifacts.test.js"     (T010)
Task: "Implement src/parse/tasks.js with tests/unit/parse-tasks.test.js"         (T012)
Task: "Implement src/parse/spec.js with tests/unit/parse-spec.test.js"           (T013)
Task: "Implement src/cli/args.js with tests/unit/args.test.js"                   (T017)
```

## Parallel Example: User Story 1

```bash
Task: "Create fixture tests/fixtures/projects/mixed/"                            (T019)
Task: "Create fixtures complete/ and empty/"                                     (T020)
Task: "Create fixture nonstandard/"                                              (T021)
Task: "Implement src/client/overview.js hover highlight"                         (T026)
```

## Parallel Example: User Story 2

```bash
Task: "Implement src/serve/watcher.js with fake fs.watch + mock timers"          (T035)
Task: "Implement src/serve/events.js SSE hub"                                    (T036)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational
2. Phase 3 US1 → `npm test` + `us1-overview.spec.js` green
3. **STOP and VALIDATE** with quickstart Scenario 1; run T034 visual review with the owner

### Incremental Delivery

1. Setup + Foundational → the model is correct and unit-tested
2. US1 → local overview (MVP)
3. US2 → live updates (the watcher cross-platform check T043 is the main risk; resolve before moving on)
4. US3 → artifact pages (can overlap with US2)
5. US4 → static hosting
6. Polish → security, scale, docs, release prep

---

## Notes

- [P] = different files, no dependency on an unfinished task
- Every E2E test name starts with its `USn` and/or `FR-xxx`/`SC-xxx` ids (§V)
- A task is done only when its unit tests (or E2E spec) pass and `CHANGELOG.md`/docs are updated where it says so
- T034 and T043 may stop the run for an owner decision or a plan amendment; do not work around them
- Commit after each task or logical group
