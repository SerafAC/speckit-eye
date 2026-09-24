# Implementation Plan: speckit-eye — Zero-Setup Spec Kit Progress Dashboard

**Branch**: `001-speckit-eye-dashboard` (spec directory; current git branch is `main`) | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-speckit-eye-dashboard/spec.md`

## Summary

`speckit-eye` is a small Node.js CLI published to npm. It reads a Spec Kit project without changing it and renders an overview page and one page per Markdown artifact. The overview has a header, an overall progress bar with spec, phase, and task counters, a feature tree on the left, and a task-square grid on the right. `--serve` serves these pages from a local-only `node:http` server. The server watches the project with Node's built-in recursive watcher and pushes Server-Sent Events, so open pages swap in new content while keeping scroll position and expanded items. `--build` writes the same pages as static files with a configurable base path. There is one runtime dependency (`markdown-it`, raw HTML disabled). Styling is Tailwind CSS v4 plus the typography plugin, compiled into the package at publish time. Unit tests use `node:test` with an in-memory file reader. E2E tests use Playwright (Chromium) and drive the real CLI. See [research.md](./research.md) for every decision.

## Technical Context

**Language/Version**: JavaScript (ES modules) on Node.js ≥ 22; developed and tested on 22 and 24 (R1)

**Primary Dependencies**: Runtime: `markdown-it` ^15 only (R3). Dev: `tailwindcss` + `@tailwindcss/cli` ^4, `@tailwindcss/typography` ^0.5 (R6), `@playwright/test` ^1.63 (R7). Node built-ins for everything else: `http`, `fs.watch`, `util.parseArgs`, `node:test`.

**Storage**: None. The model is rebuilt in memory from the Spec Kit files on every scan (spec: no separate progress store).

**Testing**: `node --test` for unit tests (pure functions plus a fake `ProjectReader`); `@playwright/test` with Chromium for E2E tests, with test names tagged `USn` / `FR-xxx` (R7).

**Target Platform**: The CLI runs on Linux, macOS, Windows, and WSL (Linux file system). Pages work in current evergreen browsers. The static output works on any static host (GitHub Pages, Netlify).

**Project Type**: CLI tool with an embedded local web server and a static-site generator (a single npm package).

**Performance Goals**: File save → page updated in ≤ 2 s at the 95th percentile (SC-002). Overview load ≤ 2 s and build ≤ 30 s for 50 features / 2,000 tasks (SC-010). `npx` cold start to a live view in about 1 minute (SC-007).

**Constraints**: The target project is never written (FR-006). The server binds to loopback only and serves only paths in its route table (FR-007). No third-party network requests at view time (FR-038). Overview and expand/collapse work without JavaScript (FR-037). Animations honor reduced motion (FR-036). The runtime dependency tree is kept minimal (§I).

**Scale/Scope**: Up to 50 features and 2,000 tasks with time guarantees; larger projects work without a guarantee. About 23 source modules and 3 page types (overview, artifact, and the shared layout).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-research | Post-design | How the design complies |
|---|---|---|---|---|
| I | Simplicity First (KISS) | ✅ with justification | ✅ | No web framework, template engine, or client framework. One runtime dependency. Every dependency is listed in Complexity Tracking. Plain JS, no TS build. |
| II | YAGNI | ✅ | ✅ | No caching, plugins, config file, `--port`, `--poll`, themes, or search. Only spec FRs are designed. Open design items (click behavior, grid density) are left out until they are decided. |
| III | DRY | ✅ | ✅ | One renderer for serve and build (FR-031). One URL scheme (routes.md). Status colors defined once as CSS custom properties. The version lives only in `package.json`. Docs link to contracts instead of copying them. |
| IV | Unit tests for all code | ✅ | ✅ | All logic modules are pure (parse, model, render, cli/args) or take injected I/O (`fs` in `createReader` and `writeSite`, `fs.watch`, timers, `http.createServer`, and `document`/`window`/`EventSource`/`fetch` in the client scripts), so they can be tested fully with `node:test` and fakes, with no file system, socket, or browser. The request handler is a pure `(req, res)` function separate from the listening server. Only one-line entry points with no logic (`bin/speckit-eye.js`, the client bootstraps) are left to the E2E tests. |
| V | E2E coverage of major requirements | ✅ | ✅ | Playwright suites per user story (`us1-overview`, `us2-live`, `us3-artifacts`, `us4-build`) plus `security` and `scale`. Test names carry `USn`/`FR-xxx`. Quickstart scenarios 1–6 correspond to them. |
| VI | SemVer + CHANGELOG | ✅ | ✅ | `package.json` version `0.1.0` → `1.0.0` at first release. `CHANGELOG.md` in Keep a Changelog format is created in this feature. The release is tagged `vX.Y.Z` (DEVELOPMENT.md release steps). |
| VII | Docs under ./docs | ✅ | ✅ | `docs/usage.md` (CLI, links to contracts/cli.md), `docs/hosting.md` (CI sample, public-exposure warning, WSL note), `docs/architecture.md` (modules, data flow). |
| VIII | README user-facing | ✅ | ✅ | README: what it is, `npx` install/use for both modes, one example, a screenshot, the public-exposure warning, and links to `./docs` and DEVELOPMENT.md. |
| IX | DEVELOPMENT.md | ✅ | ✅ | Setup (Node 22+, `npm ci`, Playwright browser), `build:css`, `npm test` and `npm run test:e2e`, the structure overview, conventions (ESM, JSDoc, `html` tag escaping), and the release process. |

**Gate result**: PASS. The new dependencies (§I) are justified below. No violations remain.

## Project Structure

### Documentation (this feature)

```text
specs/001-speckit-eye-dashboard/
├── plan.md              # This file
├── research.md          # Phase 0: decisions R1–R12
├── data-model.md        # Phase 1: entities, state rules, active-item algorithm
├── quickstart.md        # Phase 1: runnable validation scenarios
├── contracts/
│   ├── cli.md           # options, exit codes, output
│   ├── routes.md        # page paths, DOM contract, SSE protocol
│   └── tasks-md-format.md  # parser grammar + warning codes
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

```text
package.json               # name, version (single source), bin, engines >=22, scripts, files
bin/
└── speckit-eye.js         # #!/usr/bin/env node → src/cli/main.js
src/
├── cli/
│   ├── args.js            # parseArgs → {mode, dir, out, base} | usage error (pure)
│   └── main.js            # wires reader → model → serve/build; exit codes; console output
├── project/
│   ├── reader.js          # ProjectReader over an injected fs/promises (list, read, exists, readGitHead); the only fs access for input
│   ├── scan.js            # discover features, artifacts, assessments, feature.json, git HEAD (via reader.readGitHead) → raw files
│   └── artifacts.js       # classify kind, order, title, source → url mapping, name validation (W11)
├── parse/
│   ├── tasks.js           # tasks.md → phases/tasks/warnings (contracts/tasks-md-format.md)
│   └── spec.js            # spec.md → title, stories
├── model/
│   ├── build-model.js     # raw files → Project (features, counts, stages, totals)
│   ├── active.js          # ActiveSelection (FR-014 rules)
│   └── task-state.js      # completed/current/blocked/future + signatures
├── render/
│   ├── html.js            # html`` tagged template (auto-escape) + raw()
│   ├── markdown.js        # markdown-it setup, task-list rule, link rewrite, slugs
│   ├── layout.js          # page shell, header, menu, footer, script/style tags per mode
│   ├── overview.js        # progress + counters, tree, grid
│   ├── artifact.js        # artifact page
│   └── site.js            # model → Map<path, {type, body}> (shared by serve and build)
├── serve/
│   ├── handler.js         # pure (req, res) handler: route table lookup, headers, CSP, SSE endpoint dispatch
│   ├── server.js          # thin listener over injected http.createServer: bind 127.0.0.1, port fallback
│   ├── watcher.js         # fs.watch roots (recursive) + parent folders (filtered) + debounce → onChange; picks up roots created later (injectable fs.watch/exists/timers)
│   └── events.js          # SSE client registry, hello/change/ping
├── build/
│   └── build.js           # write site map to --out, marker check/replace, summary
├── client/                # browser scripts, served as assets
│   ├── live.js            # createLiveClient({document, window, EventSource, fetch, DOMParser, timers}): swap, state keep, highlight, bar animation, banner; one-line bootstrap
│   └── overview.js        # attachHover(document): grid ↔ tree hover highlight; one-line bootstrap
└── styles/
    └── input.css          # @import "tailwindcss"; @plugin typography; status tokens; motion rules
dist/
└── styles.css             # generated by `npm run build:css` (gitignored, shipped via `prepack`)
tests/
├── unit/                  # mirrors src/: args, scan (fake reader), artifacts, tasks, spec, build-model,
│                          #   active, task-state, html, markdown, overview, site, handler (fake req/res), server (fake createServer), reader (fake fs),
│                          #   watcher (fake), build (fake fs), client-live and client-overview (fake DOM objects)
├── e2e/
│   ├── helpers.js         # copy fixture to tmp, spawn CLI, wait for "Local:" line
│   ├── us1-overview.spec.js
│   ├── us2-live.spec.js
│   ├── us3-artifacts.spec.js
│   ├── us4-build.spec.js
│   ├── security.spec.js   # FR-007/FR-024/FR-006, SC-008
│   ├── scale.spec.js      # SC-010
│   └── self-counts.spec.js # SC-005 against this repository's own specs
└── fixtures/
    ├── projects/{mixed,nonstandard,empty,complete,artifacts}/   # small Spec Kit trees
    └── generate-large.js  # 50 × 40 fixture generator
docs/{usage.md,hosting.md,architecture.md}
README.md  DEVELOPMENT.md  CHANGELOG.md
playwright.config.js
```

**Structure Decision**: A single npm package, split into modules by concern (owner direction: multi-module, not a single script). The data flow goes one way: `project` (I/O) → `parse` (pure) → `model` (pure) → `render` (pure, returns strings) → `serve`/`build` (I/O). `render/site.js` is the single place that decides which pages exist, and both serve and build consume it (FR-031, §III). Browser code is limited to two small optional scripts in `src/client/`. All their logic sits in exported functions that receive the DOM and browser APIs as parameters, so unit tests drive them with fakes; the only untested line is the bootstrap that passes the real globals. Likewise `serve/handler.js` holds all request logic and `serve/server.js` only listens, so no unit test opens a socket.

### Key flows

- **Serve**: `main` → `scan(reader)` → `buildModel` → `renderSite(model, {base:'/', mode:'serve'})` → `server` looks up paths in the site map. `watcher` fires → rescan → new site map, `version++` → `events.broadcast('change')`.
- **Build**: `main` → scan → model → `renderSite({base, mode:'static', generatedAt})` → `build.write(out)`. The marker check comes first; nothing is written if it fails.

## Complexity Tracking

> Constitution §I requires every new dependency, abstraction, and option to be justified.

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `markdown-it` (runtime) | Readable rendering of every artifact with tables and task lists (FR-020), and safe escaping of raw HTML (FR-024) | A hand-written Markdown renderer: large, error-prone, and a security risk. `marked` passes HTML through and would need a sanitizer plus a DOM. |
| `tailwindcss`, `@tailwindcss/cli`, `@tailwindcss/typography` (dev) | Owner direction: a utility framework for a consistent, polished look and light animations. The typography plugin handles rendered Markdown (FR-035, FR-036). Compiled at publish time, so adopters get only CSS. | Hand-written CSS was ruled out by the owner. daisyUI or another component layer adds a second vocabulary and a theme system the spec excludes, and saves little for a bar, a tree, and a grid. |
| `@playwright/test` (dev) | §V requires user-level E2E tests. US2 (live swap, scroll and expanded-state preservation), hover highlight, and no-JS checks need a real browser engine. | jsdom: no layout or real `EventSource`, so it cannot prove user-visible behavior. Manual testing: fails §V. |
| CSS build step (`build:css`, `prepack`) | Required by Tailwind. It runs only for maintainers and CI, and the output ships in the package. | Committing the generated CSS: two sources that can drift apart (§III). |
| `ProjectReader` interface | Lets scan/model logic be unit-tested without a file system (§IV) | Direct `fs` calls: would force file system use in unit tests, which §IV forbids. |
| Handler / server split (`handler.js`, `server.js`) | The request logic is unit-tested with fake `req`/`res` and the port fallback with a fake `createServer`, so no unit test opens a socket (§IV) | One `server.js` tested over loopback: a network dependency in unit tests, which §IV forbids. |
| Injected globals in client scripts | The live swap, state keeping, reconnect banner, and hover logic are unit-tested with fake DOM objects (§IV) | Leaving DOM wiring to E2E only: logic without unit tests, which §IV forbids. A DOM library (jsdom) as a dev dependency: heavier than the few fakes needed. |
| Two client scripts (`live.js`, `overview.js`) | FR-026–FR-030 (live swap, state keeping, highlight, banner) and FR-015b (hover highlight) need browser code | A full page reload loses state and cannot animate changes. A client framework: unnecessary for about 200 lines. |

## Risks & Follow-ups for /speckit-tasks

- **Watcher on macOS, Windows, and WSL** (R2): add an early spike task that runs the `us2-live` E2E test on all three (CI matrix: ubuntu, macos, windows). The fallback (chokidar with polling) needs a plan amendment.
- **Open design items** (spec): the click behavior of tree items and grid squares, and the grid for very large projects. Add a "visual review" task after US1 that records the owner's decisions in the spec before they are implemented.
- **Constitution deliverables**: README.md, DEVELOPMENT.md, CHANGELOG.md, and `docs/` are created in this feature (spec Assumptions). Include them in the tasks for each story.
- **CI**: a GitHub Actions workflow for this repo (unit + E2E, Node 22/24 matrix) and the sample Pages workflow in `docs/hosting.md`. The sample is checked in an E2E test by running its build command.
