# Idea Research: Spec Kit status & artifacts dashboard

- **Slug**: speckit-dashboard
- **Created**: 2026-09-24
- **Evidence confidence (overall)**: medium. The repo evidence is first-hand. All external evidence comes from web-search result summaries; no page was fetched (see [Sources](#sources)). Treat feature claims about third-party tools as unverified until someone reads their READMEs or docs directly.

## Users & Demand

- The only stated demand is from the repo owner. No tickets, requests, or usage data exist in this repo. [source: `intake.md`; repo has no `issues/` or feedback artifacts] (confidence: high that no other signal exists here)
- Wider demand exists. At least six independent community projects visualize Spec Kit status: VS Code extensions, a web kanban, a TUI, and a CLI extension (see Prior Art). This shows *stated/built* interest across authors, not measured usage. [source: web search, see Sources] (confidence: medium)
- The Spec Kit ecosystem reports "157 community extensions (90+ authors), 33 presets", so the extension surface is active and crowded. [source: web-search summary citing github.github.io/spec-kit] (confidence: low; the figure was not verified)
- Assumption: the main audience is the solo developer running `speckit-autopilot` unattended, who wants a glanceable view of progress. The static Pages mode suggests a secondary audience of teammates or stakeholders without repo checkouts. [ASSUMPTION] (confidence: low)

## Prior Art

### Internal (this repo)

- **`speckit-autopilot/scripts/units.py`** already parses `tasks.md` into phases (`## Phase N: Title`), tasks (`- [ ] T001 …`), user-story tags (`[US1]`), and done/total counts, and emits JSON. That covers most of the data model the dashboard's main view needs (progress bar, phases, stories, "first incomplete phase"). Python 3, stdlib only. [source: `speckit-autopilot/scripts/units.py:1-60`] (confidence: high)
- **`tasks.md` checkboxes are the single source of truth for progress.** Autopilot keeps no other state. Per-feature side files: `specs/<feature>/.autopilot/{config.json,run-log.md}` (git-excluded) and `specs/<feature>/decisions.md`. [source: `docs/usage.md`] (confidence: high)
- The active feature is inferred from the **current git branch name** (`specs/<branch>/`). This is one existing precedent for what counts as "currently active". [source: `docs/usage.md` "Before the first run"] (confidence: high)
- The phase and story structure comes from the Spec Kit template: `## Phase 1: Setup`, `## Phase 2: Foundational`, `## Phase 3: User Story 1 - <Title> (Priority: P1) 🎯 MVP`, … [source: `.specify/templates/tasks-template.md`] (confidence: high)
- Spec Kit v1.0.10 is installed with the `assess` extension. The extension mechanism (`.specify/extensions/`) is a possible home for a dashboard command. [source: `.specify/init-options.json`, `.specify/extensions.yml`] (confidence: high)
- **Project constraints that would apply**, from Constitution v1.0.0: KISS, and new dependencies MUST be justified in Complexity Tracking; YAGNI; DRY, so parsing logic must not be duplicated; unit tests for all code (non-negotiable); E2E coverage of every user story (non-negotiable); docs under `./docs`. [source: `.specify/memory/constitution.md` §I–VIII] (confidence: high)
- The repo has **no JavaScript toolchain today**: no `package.json`, and Python only for scripts. [source: repo listing] (confidence: high)
- No `specs/` directory exists yet, so there is no real feature to render as a fixture beyond `scripts/tests/fixtures/tasks.md`. [source: repo listing] (confidence: high)

### External: Spec Kit dashboards

- **spec-ui** (Darell12/spec-ui) is the closest match to this idea. It is a single-script Node ≥ 18 dashboard for OpenSpec and Spec Kit with zero dependencies (stdlib `fs`, `http`, `child_process` only). It has two modes: `--live`, a local server with auto-refresh and notifications, and a static one-shot HTML snapshot that works from `file://`. It gives each `## Phase N:` a collapsible with its own done/total progress bar. Its layout is a kanban by stage, not the top-down spec → phase → story view in the intake. It shows that a no-framework, dual-mode (live + static) design is feasible in one script. [source: github.com/Darell12/spec-ui via search summary] (confidence: medium)
- **spec-kit-status** (KhawarHabibKhan) is a Spec Kit extension that shows project status and SDD workflow progress, with task completion % from `tasks.md`. It is CLI/text, not a web page. [source: github.com/KhawarHabibKhan/spec-kit-status via search summary] (confidence: medium)
- **spectatui** (tinesoft) is a TUI dashboard with a stage tracker (constitution → spec → clarify → plan → tasks → analyze → implement) and a task progress bar. [source: github.com/tinesoft/spectatui via search summary] (confidence: medium)
- **Spec Kit Dashboard / Spec Kit Board** (GWS-mbH) is a VS Code extension. It discovers feature folders and shows lifecycle, progress, blockers, and test evidence. It navigates per feature across Overview, Specify, Plan, Tasks, Implement, Research, Contracts, Checklists, Quickstart, Data Model, and Test Results. It reads workspace files directly with no separate DB. That navigation list is a ready inventory of the secondary artifacts to expose. [source: github.com/GWS-mbH/spec-kit-board, VS Marketplace via search summary] (confidence: medium)
- **SpecKit Companion** (alfredoperez) and **Spec Kit Helper / Spec Kit Assistant** are further VS Code extensions for managing and seeing specs. [source: search summary] (confidence: medium)
- **SpecBoard** is a hosted kanban (Backlog → Specs → Plan → Tasks) with task and checklist progress. **specs.md** also has a "dashboard". **spec-kit-diagram** generates Mermaid DAGs from `tasks.md` with status colouring. [source: search summaries] (confidence: low to medium)
- **Gap in prior art**: none of the tools found was confirmed to do all three of these: a static site built in CI for GitHub Pages, a live local server, and the top-down progress → spec → phase → story view with only the active item expanded. spec-ui comes closest, but its static output is a single HTML file, not a deployable site with linked artifact pages. [ASSUMPTION, based on search summaries only] (confidence: low)

### External: framework candidates (for the framework question)

- **VitePress** has build-time data loaders (`*.data.js`) with a `watch` glob that accepts any file type, including non-Markdown files. `load(watchedFiles)` can read and parse them with `fs.readFileSync`. Changes trigger regeneration and HMR in the dev server. `createContentLoader` gives a list of Markdown pages with frontmatter, html, and excerpt, with mtime caching. Dynamic routes (`[param].paths.js`) can generate one page per spec. Pages can embed Vue components. The static build output suits GitHub Pages. [source: vitepress.dev/guide/data-loading, vitepress.dev/guide/routing, github.com/vuejs/vitepress via search summaries] (confidence: medium)
- **VitePress caveats**: issue #4221 asks for hot reload of files *outside* the docs source dir, so `specs/` and `.specify/` at the repo root may need the source dir set to the repo root or a workaround. Issue #4828 says `createContentLoader` does not render Vue components inside the loaded `.md`. [source: github.com/vuejs/vitepress/issues/4221, /4828 via search summaries] (confidence: medium)
- **docmd** (docmd-io/docmd) builds a site with zero config from a folder of Markdown files. Navigation comes from the file structure. It has WebSocket live reload and HMR on `.md` or config change, static HTML with minimal vanilla JS, built-in callouts, tabs, and cards, a plugin system, and JS/TS config for dynamic values. The search summaries did **not** confirm whether it can render *computed* views (progress bars, aggregations across files) without custom plugin or JS work. [source: github.com/docmd-io/docmd, docs.docmd.io via search summaries] (confidence: medium for features, low for the computed-view question)
- **Plain Vue (or any SPA)**: no search done. From general knowledge, a Vite + Vue app gives full control and dev HMR, but routing, Markdown rendering, and navigation must be built by hand. That is likely more code than a docs framework for the artifact pages. [ASSUMPTION] (confidence: medium)
- **No-framework single script**, the spec-ui approach: a stdlib server plus a static HTML generator is shown to work (see spec-ui above). In this repo it could reuse `units.py` directly (Python). [source: spec-ui via search summary + `units.py`] (confidence: medium)
- Not researched: Astro, MkDocs Material (Python, which would match the repo's Python toolchain), Docusaurus, Eleventy. [NEEDS CLARIFICATION: include them in the shape stage?]

## Market & Context

- **What users do today without it**: open `tasks.md` in an editor and count checkboxes, run `/speckit-autopilot dry-run` for remaining units, read `run-log.md`, or install one of the community dashboards above. [source: `docs/usage.md`; Prior Art] (confidence: high for this repo's own tools)
- **Cost of doing nothing** is low for a solo developer, because the Markdown files are already readable on GitHub, which renders `.md` and task-list checkboxes natively. It is higher for sharing progress with people who won't browse the repo tree, and for watching long unattended autopilot runs. [ASSUMPTION] (confidence: medium)
- **Trend**: many tools appeared within about a year of Spec Kit's release. The niche is being filled fast, which argues for reusing or contributing to a tool over building a new one (see Evidence Against). [source: Prior Art] (confidence: medium)

## Data & Constraints

- **GitHub Pages**: published sites ≤ 1 GB; soft bandwidth limit 100 GB/month; soft limit of 10 builds/hour, *which does not apply to custom GitHub Actions workflows*; deployments time out after 10 minutes. A Markdown dashboard sits far inside all of these. [source: docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits via search summary] (confidence: high)
- **Pages visibility**: on Free plans, Pages needs a public repo, and a published Pages site is publicly reachable except under Enterprise Cloud access control. Publishing specs, constitution, and research could expose internal plans. [source: github.com/orgs/community/discussions/167331 via search summary + general knowledge of GitHub plans] (confidence: medium) → ties to the intake unknown about audience and access control.
- **A static host cannot auto-refresh from disk.** The 1s/5s/1m auto-refresh only makes sense for the local server. A static build updates only when CI rebuilds, for example on push. [ASSUMPTION, inherent to static hosting] (confidence: high)
- **Base path**: GitHub Pages project sites are served under `/<repo>/`, so the static build must support a configurable base path. VitePress and most SSGs expose this as `base`. [ASSUMPTION / general knowledge] (confidence: high)
- **Parsing stability**: phase and story structure depends on template conventions (`## Phase N:`, `[USn]`, `(Priority: Pn)`). Custom or older templates may break parsing. `units.py` already emits `warnings` for this. [source: `units.py`, `tasks-template.md`] (confidence: high)
- **Constitution cost**: any new code needs unit tests plus E2E tests per user story, and adding a Node or JS toolchain adds a dependency that must be justified under KISS. [source: constitution §I, IV, V] (confidence: high)

## Evidence Against the Idea

- **Crowded prior art.** spec-ui already provides a zero-dependency live + static dashboard with per-phase progress bars. spec-kit-status, spectatui, and several VS Code extensions cover status views. Building from scratch may duplicate existing work. Contributing to spec-ui, or adding a top-down view there, could meet most needs. [source: Prior Art] (confidence: medium)
- **GitHub already renders the artifacts.** `.md` files and checkboxes are readable on github.com with no build. That covers the "other artifacts via menu" requirement for anyone with repo access. [ASSUMPTION / general knowledge] (confidence: medium)
- **The two modes pull in different directions.** Live refresh from disk and static CI hosting have different runtime models. A docs framework gives both only if its dev server is used as "the live server". That means running a Node dev toolchain locally, and a dev server is not a supported production server. [ASSUMPTION] (confidence: medium)
- **Constitution overhead.** Principles IV and V (unit + E2E tests per story) and the dependency justification rule make even a "least code" dashboard a real maintenance commitment in this repo. [source: constitution] (confidence: high)
- **Scope mismatch with the repo.** This repo is a skill distribution, not an app. A web dashboard may fit better as its own repo or as a Spec Kit extension. [ASSUMPTION] (confidence: low)
- **Public exposure risk** when hosting specs, research, and constitution on public Pages (see Data & Constraints). [source: Pages visibility above] (confidence: medium)

## Gaps & Open Questions

- [NEEDS CLARIFICATION: Is reusing or extending spec-ui, or another existing tool, acceptable, or is a new tool required? What does spec-ui lack for your use?]
- [NEEDS CLARIFICATION: Toolchain preference: is adding Node/npm acceptable in this repo, or should it stay Python and reuse `units.py`, for example via MkDocs?]
- [NEEDS CLARIFICATION: Must the live mode be a framework dev server, or a small purpose-built server that polls or watches files?]
- [NEEDS CLARIFICATION: What defines the "active" item: the current git branch, the first incomplete phase, or the last autopilot unit from `run-log.md`?]
- [NEEDS CLARIFICATION: Is the static site public, or does it need restricted hosting (private Pages on Enterprise, Cloudflare Access, Netlify password)?]
- [NEEDS CLARIFICATION: Single repo only, or aggregate several Spec Kit projects?]
- Unverified: what docmd can do for computed views (progress aggregation) without a custom plugin. This needs a hands-on spike or a direct reading of the docmd docs.
- Unverified: whether VitePress's source-dir limit (issue #4221) blocks watching `specs/` at the repo root. This needs a spike.
- Unverified: the spec-ui feature set, licence, and maintenance activity. Read its README and commit history directly.
- Not researched: Astro, MkDocs Material, Docusaurus, Eleventy; how Pages alternatives (Netlify, Cloudflare Pages, GitLab Pages) differ on base path and access control.

## Sources

**Fetch policy note**: no URL was fetched directly. The available fetch tool cannot pin the connection to a validated address or expose the connected peer, so under the URL Trust Policy's connection-safety rule every direct fetch was **auto-refused**. All external findings come from web-search result summaries. The URLs below are search results, recorded here with sanitized URLs and no query strings.

| URL | Host | Policy |
|---|---|---|
| https://github.com/Darell12/spec-ui | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://github.com/KhawarHabibKhan/spec-kit-status | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://github.com/tinesoft/spectatui | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://github.com/GWS-mbH/spec-kit-board | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://marketplace.visualstudio.com/items | marketplace.visualstudio.com | unrecognized; not fetched; search summary only |
| https://github.com/alfredoperez/speckit-companion | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://github.com/Quratulain-bilal/spec-kit-diagram- | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://specboard.vercel.app/ | specboard.vercel.app | unrecognized; not fetched; search summary only |
| https://specs.md/getting-started/specs-md-dashboard | specs.md | unrecognized; not fetched; search summary only |
| https://github.github.io/spec-kit/community/walkthroughs.html | github.github.io | unrecognized; not fetched; search summary only |
| https://vitepress.dev/guide/data-loading | vitepress.dev | unrecognized; not fetched; search summary only |
| https://vitepress.dev/guide/routing | vitepress.dev | unrecognized; not fetched; search summary only |
| https://github.com/vuejs/vitepress/issues/4221 | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://github.com/vuejs/vitepress/issues/4828 | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://github.com/docmd-io/docmd | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |
| https://docs.docmd.io/ | docs.docmd.io | unrecognized; not fetched; search summary only |
| https://docs.docmd.io/theming/custom-css-js/ | docs.docmd.io | unrecognized; not fetched; search summary only |
| https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits | docs.github.com | unrecognized; not fetched; search summary only |
| https://github.com/orgs/community/discussions/167331 | github.com | allowlisted host; fetch auto-refused (cannot pin peer); search summary only |

**Repo sources (read directly):** `intake.md`, `README.md`, `docs/usage.md`, `speckit-autopilot/scripts/units.py`, `.specify/templates/tasks-template.md`, `.specify/memory/constitution.md`, `.specify/init-options.json`, `.specify/extensions.yml`.
