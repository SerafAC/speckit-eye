# Concept: speckit-eye, a zero-setup Spec Kit dashboard (live locally, hosted from CI)

- **Slug**: speckit-dashboard
- **Created**: 2026-09-24 (revised the same day from the owner's adjusted requirements)
- **Recommended option**: Option A, a single Node CLI that renders HTML on the server and pushes a reload when files change

## Requirement Adjustments Applied (from the owner, 2026-09-24)

These replace parts of `problem.md` and the earlier concept. They should be carried into `/speckit-specify`.

- **Refresh is driven by changes, not a timer.** The local view updates on its own when a Spec Kit `.md` file changes. The 1s/5s/1m interval picker is no longer needed. This changes **G2** and **M2**: M2 becomes "delay from saving a file on disk to the view updating", with a target of about 1–2 s.
- **Node project.** The toolchain question in problem.md and research is settled: Node.js, published to npm.
- **Written from scratch.** The owner tested the existing tools (spec-ui and others from research §Prior Art) and none fits. Adopting or extending one is no longer an option.
- **No Python reuse.** `units.py` has moved to a separate project. The dashboard has its own `tasks.md` parser, so the earlier DRY concern about two parsers no longer applies inside this repo.
- **Install is one command**, for example `npx speckit-eye --serve ./my-speckit-project`. There is nothing to add to the target project: no `package.json`, config file, or scaffolding. This makes **M7 (setup effort)** concrete: about one minute from nothing to a live view.
- **Where it lives** (open in problem.md) is settled: this repo (`speckit-eye`), as a standalone npm package, not a Spec Kit extension.

## Options

### Option A: Single Node CLI, HTML rendered on the server, change push (smallest thing that could work)

- **Sketch**: `npx speckit-eye --serve <dir>` starts a local web server on the Spec Kit project. The first page shows an overall progress bar and then specs → phases → user stories, with only the active item expanded. Each item opens its details, and a menu links to every other artifact (spec, plan, research, constitution, checklists, and so on), each rendered as a readable page. When any Spec Kit `.md` file changes on disk, open browser tabs refresh by themselves within a second or two, keeping the reader's place. `npx speckit-eye --build <dir> --out <folder>` writes the same pages as a plain static site. A short CI job publishes that folder to GitHub Pages, Netlify, or similar hosts. Both modes use the same page renderer, so the hosted site looks the same as the local one; the hosted site simply has no live updates. Expand and collapse use native HTML, so they work on the static site without extra scripts.
- **Appetite**: small to medium. Budget about 1–2 weeks, including the unit and E2E tests the constitution requires.
- **Trade-offs**:
  - **Wins**: the fastest `npx` start (a small package with a few runtime dependencies). One code path for live and static output. No build toolchain for users. The overview layout is under our full control, which matters because the existing tools failed on layout and fit. The change-push model matches the new refresh requirement directly.
  - **Sacrifices**: no free docs-site features such as full-text search, theme switching, or a generated sidebar. The navigation and styling are ours to write and keep up to date. Every page change reloads the page instead of patching part of it, which is fine at this size but less smooth than a single-page app.
  - **Risks**: file watching behaves differently across operating systems (macOS, Windows, WSL, network drives, and editors that save by writing a temporary file and renaming it). Markdown rendering fidelity for what Spec Kit files contain (GitHub task lists, tables, Mermaid). The npm package name must be available.
- **Rabbit holes**: search; themes and dark mode; client-side rendering of Mermaid diagrams; keeping scroll and expand state across live reloads; aggregating several projects; detecting the "active" item from git; making sure the server exposes only Spec Kit files and never the rest of the repo; supporting old or custom `tasks.md` templates.

### Option B: CLI wrapping a Markdown docs framework (VitePress)

- **Sketch**: `npx speckit-eye --serve <dir>` starts VitePress in development mode, pointed at the project, with a bundled theme. The theme contains a custom overview page (progress bar and spec → phase → story tree). Every artifact becomes a docs page with sidebar and search built in. `--build` runs a VitePress build for Pages. Refresh on file change comes from the framework's hot reload.
- **Appetite**: medium (weeks). Scaffolding is quick. Most of the budget goes into bending the framework around a folder it does not own.
- **Trade-offs**:
  - **Wins**: polished artifact pages, a sidebar, and search at almost no cost (G4). Hot reload is already built in.
  - **Sacrifices**: the `npx` package pulls in Vite, Vue, and VitePress (tens of MB), so the first start is slow and the one-command promise feels heavy. It runs a development server as the product. Future VitePress upgrades are our problem.
  - **Risks**: VitePress expects to own a docs folder. Watching `specs/` and `.specify/` elsewhere in the project is a known limitation (research: issue #4221). Raw Spec Kit Markdown containing `{{ }}` or HTML-like text may be misread by Vue templates. Content loaded by `createContentLoader` does not render components (issue #4828). Generating config at runtime for a project we do not control is undocumented ground.
- **Rabbit holes**: routing Spec Kit's folder layout into VitePress; escaping Markdown safely for Vue; running VitePress from inside an `npx` package with a different working directory.

### Option C: Prebuilt single-page app plus a thin Node data server

- **Sketch**: The package ships a single-page app, compiled when the package is published (for example with Preact or Vue). The CLI serves it together with a JSON summary of the project and the raw artifact files, and sends change events over a live connection so that only the changed part of the view updates. `--build` writes the app plus a JSON snapshot for static hosting.
- **Appetite**: medium (weeks).
- **Trade-offs**:
  - **Wins**: the smoothest live experience (no full page reloads, state kept for free). Clean separation between data (the parser) and view. Adopters still have no toolchain, since the app is prebuilt.
  - **Sacrifices**: two codebases in one package (server and browser), a front-end build step for us, client-side routing and Markdown rendering to write, and a larger surface for E2E tests. Static hosts need workarounds so that direct links into client-side routes work.
  - **Risks**: turns a "least code" tool into a small front-end project; it grows by adding features.
- **Rabbit holes**: client routing under a Pages base path; state management; bundle size; framework choice churn.

### Considered and dropped

- **Do nothing / adopt an existing tool** (spec-ui, spec-kit-status, spectatui, VS Code extensions): ruled out by the owner after hands-on testing. The cost of inaction in problem.md still stands, but the owner has decided to build.
- **docmd**: same trade-offs as Option B, with less configuration, but research could not confirm it can show computed views such as progress totals without a custom plugin. Not carried separately.

### Comparison

| | A: CLI, server HTML | B: VitePress wrapper | C: SPA + data server |
|---|---|---|---|
| New code we own | small | small–medium (plus adaptation) | medium–large |
| `npx` first-run weight | light | heavy | light–medium |
| Live update on `.md` change | page reload pushed by the server | hot reload (framework) | partial update pushed by the server |
| Artifact pages, nav, search | ours, basic, no search | free | ours |
| Static output for Pages | same renderer | framework build | app + JSON; needs routing workarounds |
| Control over overview layout | full | inside the theme | full |
| Main risk | file watching across OSes | framework vs. foreign folder layout | scope growth |

## Recommendation

**Option A.** It fits the adjusted requirements most directly:

- **One-command install (M7)**: a small package with few dependencies makes `npx speckit-eye --serve ./project` start quickly. Option B's framework dependencies work against this.
- **Refresh on change (G2, M2)**: the server watches the project's Spec Kit files and tells open pages to reload. This works without a framework dev server.
- **Hosted sharing (G3, M3)**: `--build` uses the same renderer, so the Pages site matches the local view. The CI job is a few lines.
- **Top-down overview (G1, M1) and artifact reach (G4, M4)**: we control the layout completely, which was the gap that ruled out existing tools.
- **Low ongoing cost (G6)**: one code path and no front-end build keep the upkeep and the constitution's unit and E2E test load small.

Choose **Option C** if a later version needs richer interaction, since A's page-level design can grow toward it. Choose **Option B** only if search and docs-site polish become the priority, and only after a spike shows that VitePress can run cleanly from an `npx` package against a foreign folder.

## Out of Scope (for the recommended option)

- Editing artifacts, ticking tasks, or triggering Spec Kit or autopilot commands from the view. The view is read-only.
- Any separate progress store. Spec Kit files remain the only source of truth.
- Project-management features (assignees, estimates, burndown, issue-tracker sync).
- Built-in authentication or access control. Restricting a hosted view is up to the host.
- Live updates on the hosted site. It updates once per CI build.
- A user-selectable timed refresh interval. It is replaced by refresh on file change.
- Full-text search, theme or dark-mode switching, and multi-project aggregation in the first version.
- Anything a user must install or configure inside the target project beyond running `npx`.
- Python components or reuse of `units.py`.
- Non-Spec Kit formats (OpenSpec, Kiro).

## Assumptions to Validate

- **Adopters have a recent Node.js** (for example an active LTS release) so that `npx` works. Pick the minimum version during specification. Recursive `fs.watch` support differs between Node versions and operating systems, which may justify a watcher dependency.
- **The npm name `speckit-eye` is available**, or a scoped name is acceptable. Check before publishing.
- **File-change detection is reliable enough** on Linux, macOS, Windows, and WSL, including editors that save by renaming a temporary file. A short spike should confirm this.
- **Full-page reload on change is acceptable** while watching an autopilot run, provided scroll position and expanded items survive the reload.
- **The standard `tasks.md` template is stable enough to parse** (`## Phase N:`, `- [ ] T001`, `[USn]`). Non-standard files show a warning, and the tool still runs. Tolerance for these files is still open from problem.md.
- **"Currently active" can be derived from Spec Kit files alone**, for example the first feature, phase, and story with open tasks, without git or autopilot state. Still open from problem.md.
- **One or two small runtime dependencies are justifiable** under the constitution's KISS rule (at least a Markdown renderer, and possibly a file watcher) rather than writing them ourselves.
- **A public hosted view is acceptable** for most adopters, or they restrict it at the host. Still open from problem.md.
- **E2E tests can drive the served pages headlessly in CI** without an outsized test dependency.
