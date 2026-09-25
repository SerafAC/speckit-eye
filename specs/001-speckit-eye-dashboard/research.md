# Research: speckit-eye (Phase 0)

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-24

Each entry resolves one open technical question from the spec's Assumptions ("Deferred to planning") or from the Technical Context. Format: Decision / Rationale / Alternatives considered.

---

## R1. Runtime and minimum Node.js version

- **Decision**: Node.js **≥ 22** (`"engines": { "node": ">=22" }`). Develop and test on Node 22 and 24. Plain JavaScript ES modules, no TypeScript build.
- **Rationale**: On 2026-09-24 Node 20 is end-of-life (April 2026). Node 22 (maintenance LTS until April 2027) and Node 24 (active LTS) are the supported lines. Node 22 provides everything needed without dependencies: recursive `fs.watch` on Linux, macOS, and Windows; `util.parseArgs`; the `node:test` runner; JSON import attributes for reading `package.json` (one source of the version, §III). Plain JS with JSDoc comments avoids a compile step for the server code (§I); the only build step is CSS.
- **Alternatives considered**: Node ≥ 20: EOL, and its recursive watcher on Linux had known bugs in early 20.x. TypeScript: better types, but it adds a compile step and a dependency for a small codebase; JSDoc gives most of the readability benefit.

## R2. File watching

- **Decision**: Node's built-in `fs.watch(dir, { recursive: true })` on `specs/`, `.specify/memory/`, `.specify/assessments/`. The single-file inputs to the active item (`.specify/feature.json`, and `HEAD` in the gitdir) are watched through their parent folders without recursion, filtered by file name, because git and many editors replace files by rename and a watch on the file itself (inotify follows the inode) goes silent after the first replace. The project root and `.specify/` are also watched without recursion so that roots created after startup (`specs/`, `.specify/assessments/`, …) are added on the next event. Any relevant event triggers a **debounced full rescan** (100 ms quiet period, 500 ms maximum wait during bursts). No watcher dependency.
- **Rationale**: A spike on Linux with Node 24 (2026-09-24) showed events for file writes, new folders created after the watch started, and save-by-rename (temp file + rename), all within ~2 ms. A full rescan, instead of applying individual events, makes rename-saves, deletes, and bursts correct by construction (FR-029) and costs a few milliseconds even at the 50-feature / 2,000-task size. Debouncing keeps latency far below the 2 s target (SC-002).
- **Known limitation (to be documented)**: on WSL, files under `/mnt/c/...` edited from Windows do not raise Linux file events, and network drives may not either. The documented guidance is to keep the project on the Linux file system under WSL. A cross-platform check (macOS, Windows, WSL) is a task in `tasks.md`. If it fails, the fallback is a `chokidar` dependency with polling for those paths, which needs a new Complexity Tracking entry.
- **Cross-platform check (T043, T075, done 2026-09-25)**: The built-in watcher works on every supported platform, so no `chokidar` fallback is needed. In CI run 36128401217 (commit c97f8d0, Node 22), the full E2E suite passed on ubuntu-latest, macos-latest and windows-latest. The CI `wsl` job ran `us2-live.spec.js` on Ubuntu 24.04 under real WSL2 (kernel 6.18.33.2-microsoft-standard-WSL2), with the project on the Linux file system: 10 tests passed. That job runs on every push, so WSL needs no manual check. The two earlier Windows-only failures were test issues, now fixed: `child.kill()` gives no exit code on Windows (`tests/e2e/helpers.js`), and the US4 test mishandled CRLF line endings.
- **Alternatives considered**: `chokidar` v4 (one transitive dependency, supports polling). Not needed where the built-in watcher works, and §I asks for justification. `@parcel/watcher`: native binaries, which slow `npx` and can fail to install. A timed poll: out of scope (spec forbids a timed refresh).

## R3. Markdown rendering

- **Decision**: **`markdown-it` 15** as the only runtime dependency, with `html: false` and `linkify: false`. Add two small in-house rules: (1) GitHub task-list checkboxes (`[ ]`, `[x]`) rendered as disabled checkboxes; (2) link rewriting: relative links to a known artifact go to that artifact's page URL, and any other relative link is rendered as plain text (FR-023). Heading ids come from a small in-house slug function. Fenced blocks, including ` ```mermaid `, render as escaped code (spec assumption: diagrams as code in v1).
- **Rationale**: `html: false` escapes all raw HTML in the source, so no script or active content from a file reaches the page (FR-024) without a separate sanitizer. `markdown-it`'s built-in `validateLink` already rejects `javascript:`, `vbscript:`, and `data:` (except images). Tables and strikethrough are built in. It is mature, fast, and pure JS (fast `npx`, R8). Its transitive dependencies are small pure-JS packages.
- **Alternatives considered**: `marked`: passes raw HTML through, which would need DOMPurify plus a DOM on the server. `micromark` + GFM extensions: more packages, and its HTML output is harder to customize for link rewriting. `markdown-it-task-lists` plugin: unmaintained, and the rule is ~20 lines in-house. Rendering Mermaid on the client: a large script, listed as a rabbit hole in the concept.

## R4. HTML generation (templating)

- **Decision**: No template engine. Pages are built from JavaScript functions that use a tagged template literal `html\`…\`` which escapes every interpolated value by default. Trusted fragments, such as rendered Markdown or nested templates, are wrapped explicitly with `raw()`.
- **Rationale**: About six page parts (layout, header, tree, grid, artifact, menu) do not justify an engine (§I). Escaping by default is the safest pattern, and the functions are pure, so unit tests are easy (§IV).
- **Alternatives considered**: EJS, Handlebars, or Nunjucks: an extra dependency and a separate syntax. JSX with Preact rendered on the server: needs a build step.

## R5. Server and live updates

- **Decision**: `node:http` with a fixed route table built from the artifact index; no framework. Live updates use **Server-Sent Events** at `/__events`. After each rescan, the server sends `event: change` with a new model version. A small vanilla client script (`live.js`, serve mode only) fetches the current page, swaps `<main>`, keeps the viewer's own expand/collapse choices and scroll position, highlights items whose `data-sig` changed, and animates `<progress>` bars from their old values to their new ones (no inline `style` attributes, so the serve-mode CSP `style-src 'self'` holds). `EventSource` reconnects on its own; while it is disconnected, the page shows a "live updates paused" banner (FR-030).
- **Rationale**: Updates only go from server to browser, and `EventSource` is built into browsers and reconnects automatically, so WebSockets are unnecessary. Swapping `<main>` instead of reloading the page makes FR-027 and FR-028 easy: the old DOM is still there to compare with. The route table lists only the tool's own pages and assets, and no URL is ever mapped to a file path, so files outside the Spec Kit artifacts cannot be served (FR-007, SC-008). The server binds to `127.0.0.1`. The default port is 4747; if it is busy, the server asks the operating system for a free port and prints the actual address.
- **Alternatives considered**: WebSocket (`ws`): a dependency and two-way traffic that is not needed. Full page reload plus state saved in `sessionStorage`: simpler, but the highlight and progress-bar animation would then need the previous state stored in the browser. Express or Fastify: a dependency for about five routes. A DOM morphing library (idiomorph): would reset the viewer's `open` state from the server's markup, so a custom swap is needed anyway.

## R6. Styling stack

- **Decision**: **Tailwind CSS v4** (`tailwindcss` + `@tailwindcss/cli`) with **`@tailwindcss/typography`** for rendered Markdown (`prose`). No component layer. The CSS is compiled from `src/styles/input.css` into `dist/styles.css` when the package is packed (`prepack`) and ships in the npm package. All three are **devDependencies**. Animations use `motion-safe:` variants plus a global `@media (prefers-reduced-motion: reduce)` rule (FR-036). Expand/collapse uses native `<details>`/`<summary>`, so it works without scripts (FR-037). Status colors come from one set of CSS custom properties (`--status-done` green, `--status-active`, `--status-started` blue, `--status-not-started` dark grey, `--status-blocked`) used by both the tree and the grid (§III, FR-015b).
- **Rationale**: This is the owner's direction (a utility framework compiled at publish time, typography plugin). Progress bars, a tree, and a grid of squares are a few lines of utilities each, so a component layer would add rules and a dependency without saving real work (§I, §II). Everything is a devDependency: adopters download only the compiled CSS (~20–40 KB), nothing is fetched from third parties at view time (FR-038), and `npx` stays fast.
- **Alternatives considered**: Tailwind + daisyUI: ready-made `progress` and `collapse` components, but a second styling vocabulary, a theme system the spec excludes (no theme switching), and it gains little for three simple widgets. Hand-written CSS: ruled out by the owner. CSS from a CDN at view time: breaks offline use and FR-038.

## R7. Testing

- **Decision**: **Unit tests** use the built-in `node:test` runner and `node:assert` (no dependency), with coverage from `node --test --experimental-test-coverage`. **End-to-end tests** use **`@playwright/test`** with Chromium only, running the real CLI (`bin/speckit-eye.js`) as a child process against fixture projects copied to a temp folder, and driving the pages in a headless browser. Each E2E test name carries its story or requirement id (for example `US2 FR-027 keeps scroll and expanded items on live update`), which gives the traceability §V requires.
- **Rationale**: §V requires E2E coverage of every user story. US2 (live updates, scroll, highlight) and FR-015b (hover highlight) need a real browser engine: `EventSource`, layout, `details` state, scrolling. Playwright is the standard choice, is a devDependency only, and runs headless in CI. Chromium alone keeps CI time and download size down. §IV unit isolation: parsing, model, and rendering are pure functions over strings. File access goes through a small `ProjectReader` interface (`list(dir)`, `read(path)`), which tests replace with an in-memory fake. Only the E2E tests touch the real file system.
- **Alternatives considered**: jsdom + node:test for "E2E": no real layout, weak `EventSource` support, not a user-level test. Puppeteer: similar weight, but a weaker test runner and fixtures. Vitest or Jest for unit tests: an extra dependency that `node:test` makes unnecessary.

## R8. Package name and distribution

- **Decision**: Publish as **`speckit-eye`** (unscoped) with bin `speckit-eye`. `npm view speckit-eye` returned 404 on 2026-09-24, so the name is free. Usage: `npx speckit-eye --serve .`. The published files are `bin/`, `src/` (without `src/styles`), `dist/styles.css`, README, CHANGELOG, and LICENSE. The version is defined only in `package.json`, and the CLI reads it from there (§III, §VI).
- **Rationale**: The unscoped name matches the repository and keeps the `npx` command short (M7). There is one runtime dependency tree (markdown-it, ~7 small packages), so the first `npx` run is a few seconds.
- **Alternatives considered**: `@<scope>/speckit-eye`: only needed if the name is taken before first publish. Re-check at release time.

## R9. Active item inputs on hosted builds

- **Decision**: FR-014 inputs are read directly from files: `.specify/feature.json` (`feature_directory`), then `.git/HEAD` (`ref: refs/heads/<branch>`, following a `.git` *file* with `gitdir:` for worktrees). The gitdir of a worktree usually lies outside the project folder, so `ProjectReader` has one narrow method, `readGitHead()`, which may read exactly the file named `HEAD` in that gitdir and nothing else; all other reads stay inside the project root. The `git` binary is never called.
- **Finding**: `.specify/feature.json` is git-ignored by Spec Kit (`.specify/.gitignore`), and `actions/checkout` creates a local branch for push events (usually `main`) but a detached HEAD for pull requests. Since branch names rarely equal a feature folder name, hosted builds will normally fall back to rule 3 (the first feature with open tasks), which is acceptable and matches the spec. This will be noted in the hosting docs.
- **Alternatives considered**: running `git rev-parse`: needs git installed and spawns a process on every rescan; reading the file is enough.

## R10. URL scheme and static hosting

- **Decision**: Every page is a real `.html` file at a stable path (see [contracts/routes.md](./contracts/routes.md)), for example `index.html` and `features/001-x/plan.html`. All internal links are absolute and start with the base path (`/` in serve mode, `--base` in build mode). Serve mode serves the same paths. A build writes the marker file `.speckit-eye-build` at the output root; FR-033 checks it before replacing the folder's contents.
- **Rationale**: Real files mean direct links work on any static host without rewrite rules (FR-032). Using one path scheme for both modes keeps a single renderer (§III, FR-031).
- **Alternatives considered**: relative links (`../plan.html`): no base path needed, but fragile across nesting levels, and the spec asks for a base path option. Hash routing: needs scripts, which conflicts with FR-037.

## R11. Parsing rules (standard template)

- **Decision**: A line-based parser that skips fenced code blocks. The grammar and warnings are in [contracts/tasks-md-format.md](./contracts/tasks-md-format.md). Summary: phase = `^## Phase (\d+): (.+)$`; task = `^\s*- \[( |x|X)\] (T\d+)\b(.*)$` with optional `[P]` and `[USn]` markers; dependencies = `depends on T\d+(, T\d+)*` anywhere in the description. Checkbox lines without an ID, and tasks before the first phase heading, are counted with a warning (warn and degrade, FR-013). Story titles come from `spec.md` headings `### User Story N - Title (Priority: Pn)`.
- **Rationale**: This matches `.specify/templates/tasks-template.md` and `spec-template.md` as installed (Spec Kit 1.0.10). Line numbers make warnings precise, and the rules are small enough to unit-test completely (M5).
- **Alternatives considered**: parsing the Markdown into a syntax tree with markdown-it and walking it: harder to report exact lines, and it couples counting to the renderer.

## R12. Performance at 50 features / 2,000 tasks (SC-010)

- **Decision**: No caching layers. Each rescan reads every artifact file and rebuilds the whole model. Pages are rendered on request in serve mode and all at once in build mode. A generated fixture of 50 features and 2,000 tasks is used in an E2E timing test.
- **Rationale**: Reading ~500 small files and parsing 2,000 lines takes tens of milliseconds, far inside the 2 s budget. Caching would add invalidation bugs without a measured need (§I, §II).
- **Alternatives considered**: incremental model updates per changed file: premature.

## Open design items (not resolved here, per spec)

- What clicking a tree item or a task square does, and how the grid handles too many tasks. These are settled during development with visual review (spec Assumptions). The plan keeps the grid as one square per task (a CSS grid of `<a>`/`<span>` cells with `title` tooltips), so either decision can be added later without changing the model.
