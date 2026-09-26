# Implementation Plan: Dashboard Redesign — Sidebar Shell, Task Map, Feature Pages, Document Reader and Themes

**Branch**: `002-dashboard-redesign` (spec directory; development happens on `claude/sharp-feynman-cmcr6y`) | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-dashboard-redesign/spec.md`

## Summary

Rebuild the pages of speckit-eye to the approved redesign in `mockups/001-first-redesign/`: a dark sidebar shell, a new overview (stats card with a per-feature segmented bar, Up next bar, orderable feature tree, task map with delayed tooltips), a new feature page per feature (document tabs, phase rail accordion, filterable task list with kind/file chips and a detail panel), a reader layout for every document with a structured view of `spec.md`, a light/dark/system theme, and ⌘K search.

**No UI framework is introduced** ([research D1](./research.md#d1-would-an-existing-ui-framework-simplify-the-redesign)). The pages stay server-rendered by pure functions over the existing model, so they work without JavaScript, in static builds under a sub-path, and under the unchanged strict CSP. Browser behavior is added by small ES modules with an idempotent `init(root)`. What does simplify the work is adopted individually: CSS `light-dark()` tokens for theming (D3), Tailwind v4 generated width utilities for data-driven widths without inline styles (D6), native `<details name>`, `<dialog>` and `IntersectionObserver` (D7), bundled Fontsource fonts (D4), and `happy-dom` for unit-testing browser modules without a browser (D11). The runtime dependency tree stays `markdown-it` only.

## Technical Context

**Language/Version**: JavaScript (ES modules) on Node.js ≥ 22, unchanged (001 R1).

**Primary Dependencies**: Runtime: `markdown-it` ^15 only (unchanged). Dev, existing: `tailwindcss` + `@tailwindcss/cli` ^4 (needs ≥ 4.1 for `@source inline`), `@tailwindcss/typography`, `@playwright/test`. Dev, new: `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/instrument-serif` (fonts copied into `dist/fonts`, D4), `happy-dom` (unit tests of browser modules, D11). Icons are copied from Lucide into source (D5), not a dependency.

**Storage**: None on the server. In the browser, `localStorage` for four viewer preferences (D9).

**Testing**: `node --test` unit tests (pure parse/model/render functions; browser modules against `happy-dom` or fakes). Playwright E2E in `chromium`, `firefox`, `webkit`, plus `chromium-nojs` and `chromium-mobile` projects (D16). Layout checked by element boxes, not screenshots (clarified).

**Target Platform**: CLI on Linux, macOS, Windows, WSL (unchanged). Pages: last two major versions of Chrome, Edge, Firefox, Safari (FR-055).

**Project Type**: CLI tool with an embedded local web server and static-site generator (single npm package), unchanged.

**Performance Goals**: Overview and feature pages load ≤ 2 s and build ≤ 30 s at 50 features / 2,000 tasks (SC-007); tooltip at 500 ± 100 ms, hover feedback ≤ 150 ms (SC-006); search results ≤ 200 ms per keystroke (SC-014); live updates ≤ 2 s at p95 (SC-008).

**Constraints**: Read-only target project; loopback-only serving; CSP unchanged (no `style` attributes, no inline scripts, no `eval`); no third-party requests; everything readable and navigable without JavaScript; static build = serve mode; reduced motion honored.

**Scale/Scope**: Up to 50 features / 2,000 tasks with time guarantees (map modes switch at 1,000 and 5,000 tasks). Page types: overview, feature page (new), document page; about 12 new or rewritten source modules and 9 browser modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-research | Post-design | How the design complies |
|---|---|---|---|---|
| I | Simplicity First (KISS) | ✅ with justification | ✅ | No UI framework, no bundler, no new runtime dependency (D1). Browser modules share one `init`/`save` convention. New dev dependencies (fonts, `happy-dom`) are justified in Complexity Tracking. |
| II | YAGNI | ✅ | ✅ | Only spec FRs are designed. Structured rendering only for `spec.md` (spec scope). Search is a linear scan, no index library (D14). No settings page, no project switcher, no full-text search. `assets/overview.js` is removed, not kept beside the new modules. |
| III | DRY | ✅ | ✅ | One renderer for serve and build; one site map. Color tokens defined once with `light-dark()` (D3). Ordering rules only in the model, emitted as `data-rank-*` (D10). One `shares()` function for every proportional width. Task states keep 001's single rule set (renamed for display). Version stays in `package.json` only. |
| IV | Unit tests for all code | ✅ | ✅ | New parse/model/render modules are pure. Browser modules take injected `document`/`window`/`storage`/timers/`fetch` and are tested with `happy-dom` (D11). `scripts/copy-assets.js` exposes a pure file-selection function that is unit tested. The `spec-structure` coverage invariant is tested over every fixture and this repository's specs (SC-012). |
| V | E2E coverage of major requirements | ✅ | ✅ | One suite per user story (`us1-overview` … `us6-search`) plus cross-cutting suites (`live-state`, `nojs`, `mobile`, `security`, `scale`, `self-counts`), all run in three browser engines. Test names start with `USn FR-xxx` (DEVELOPMENT.md rule). |
| VI | SemVer + CHANGELOG | ✅ | ✅ | Every user-visible change adds lines under `## [Unreleased]`. No release has been made yet (clarified); the version is set by the release process (D18). |
| VII | Docs under ./docs | ✅ | ✅ | `docs/usage.md` (new layout, feature pages, reader, theme, search, map modes, blocked color, browser support), `docs/architecture.md` (new modules, browser module convention, site map entries, fonts), `docs/hosting.md` (unchanged content; check that the screenshot/text still match). |
| VIII | README user-facing | ✅ | ✅ | New screenshot and feature list (FR-054); still user-only content. |
| IX | DEVELOPMENT.md | ✅ | ✅ | `build:assets` instead of `build:css`, three Playwright browsers, `happy-dom` in unit tests, updated project structure, updated release checklist (package contents now include `dist/fonts/`). |

**Gate result**: PASS. No unjustified violations. The dev-dependency additions are recorded below.

## Project Structure

### Documentation (this feature)

```text
specs/002-dashboard-redesign/
├── plan.md                    # This file
├── research.md                # Phase 0: decisions D1–D19 (framework question: D1)
├── data-model.md              # Phase 1: added/changed derived entities
├── quickstart.md              # Phase 1: runnable validation scenarios 1–8
├── contracts/
│   ├── routes.md              # pages, assets, DOM regions, browser modules, view state
│   ├── spec-md-structure.md   # recognized spec.md structure + coverage invariant
│   └── search-index.md        # search index format and matching rules
├── checklists/requirements.md
└── tasks.md                   # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

Legend: **new**, *changed*, unmarked = unchanged.

```text
package.json                   # *scripts: build:assets (css + fonts), prepack, test:e2e; new devDependencies*
scripts/
└── copy-assets.js             # **new** copy Latin woff2 files + OFL texts from @fontsource/* into dist/fonts (pure selectFontFiles() + thin main)
src/
├── cli/main.js                # *reads the new assets (binary fonts, modules) and passes them to renderSite*
├── project/                   # unchanged
├── parse/
│   ├── tasks.js               # unchanged
│   ├── spec.js                # unchanged (title + stories for the tree)
│   └── spec-structure.js      # **new** spec.md → blocks with line ranges (contracts/spec-md-structure.md)
├── model/
│   ├── build-model.js         # *adds status, number, ranks, warningGroups, documents, phaseShares, spec, overview stats*
│   ├── task-state.js          # *adds display names and waitingOn*
│   ├── task-files.js          # **new** files, kind and refs of a task (data-model TaskKind)
│   ├── shares.js              # **new** largest-remainder percentages
│   ├── ranks.js               # **new** the four feature orders
│   └── warnings.js            # **new** warning groups with merged line ranges
├── render/
│   ├── html.js, markdown.js   # markdown.js *gains an inline-render export and tasks.md line anchors*
│   ├── icons.js               # **new** Lucide SVG paths (ISC notice)
│   ├── layout.js              # *rewritten: head (theme.js, app.js), sidebar, icon rail, mobile menu, dialog, tooltip host*
│   ├── overview.js            # *rewritten: page head, stats card, Up next, feature tree*
│   ├── taskmap.js             # **new** task map (stacked, grouped, bars) and legend
│   ├── task-text.js           # **new** inline task text: formatting, FR/SC chips, kind and file chips
│   ├── feature.js             # **new** feature page: header, ring, tabs, rail, warnings, task list, detail host
│   ├── reader.js              # **new** document page layout: doc list, header, raw view, contents
│   ├── spec-view.js           # **new** structured spec.md blocks → HTML
│   ├── artifact.js            # *removed; replaced by reader.js*
│   ├── search-index.js        # **new** model → search-index.json
│   └── site.js                # *adds feature pages, search index, fonts, modules; binary bodies (D12)*
├── serve/handler.js           # *serves Uint8Array bodies; new content types*
├── build/build.js             # *writes Uint8Array bodies*
├── client/
│   ├── app.js                 # **new** bootstrap: runs init per data-page, reinit for live.js
│   ├── prefs.js               # **new** safe localStorage
│   ├── theme.js               # **new** blocking head script
│   ├── tree.js                # **new** order, depth, filter, reveal
│   ├── taskmap.js             # **new** mode, hover highlight, tooltip, click
│   ├── feature.js             # **new** rail/list sync, filters, selection, detail panel, copy
│   ├── reader.js              # **new** contents highlight/progress, expand all, raw view, area chips
│   ├── search.js              # **new** dialog, shortcut, matching, navigation
│   ├── live.js                # *save()/reinit and [data-keep-scroll] restoration*
│   └── overview.js            # *removed; replaced by tree.js and taskmap.js*
└── styles/input.css           # *rewritten: tokens (light-dark), @font-face, w-pct utilities, components*
tests/
├── unit/                      # new suites per new module; happy-dom suites for client modules
├── e2e/
│   ├── us1-overview.spec.js   # *rewritten*
│   ├── us2-taskmap.spec.js    # **new** (001 grid tests move here)
│   ├── us3-feature.spec.js    # **new**
│   ├── us4-theme.spec.js      # **new**
│   ├── us5-reader.spec.js     # **new** (replaces us3-artifacts)
│   ├── us6-search.spec.js     # **new**
│   ├── live-state.spec.js     # **new** (extends us2-live)
│   ├── nojs.spec.js, mobile.spec.js  # **new**
│   └── security, scale, self-counts, us4-build  # *updated selectors*
└── fixtures/projects/         # *README gains the new expectations (stats, ranks, legend); fixtures change only where a test needs more*
playwright.config.js           # *projects: chromium, firefox, webkit, chromium-nojs, chromium-mobile*
.github/workflows/             # *install and run the three browsers*
```

**Structure Decision**: Keep the single-package layout and one-way data flow of 001 (`project → parse → model → render → serve/build`, plus `client/` for the browser). New derived data goes into `model/`, new page types into `render/`, and each browser behavior into its own `client/` module, so every piece stays pure or injected and unit-testable.

## Implementation Outline

The order follows the spec's priorities so every step leaves a working tool (details are for `/speckit-tasks`):

1. **Foundation**: tokens and fonts (`input.css`, `copy-assets.js`, binary site entries), icons, `shares.js`, new shell in `layout.js` (sidebar, rail, mobile menu), `prefs.js`, `app.js`, `live.js` save/reinit, Playwright browser matrix.
2. **US1 overview** (P1): model additions (status, ranks, stats, segments, warning groups), `overview.js`, `client/tree.js`.
3. **US2 task map** (P2): `render/taskmap.js`, `client/taskmap.js`, blocked color.
4. **US3 feature page** (P2): `task-files.js`, `task-text.js`, `render/feature.js`, `client/feature.js`, tasks.md line anchors.
5. **US4 theme** (P2): `theme.js`, switch wiring, contrast check.
6. **US5 reader** (P3): `spec-structure.js`, `spec-view.js`, `render/reader.js`, `client/reader.js`.
7. **US6 search** (P3): `search-index.js`, `client/search.js`.
8. **Polish**: no-JS, mobile, scale and security suites in three browsers; docs, README screenshot, CHANGELOG.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| Dev dependencies `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/instrument-serif` + `scripts/copy-assets.js` | The design's fonts must ship with the tool (FR-004, 001 FR-038, CSP) | Google Fonts: third-party request blocked by the CSP. Committing font binaries by hand: no version tracking or licence provenance. |
| Dev dependency `happy-dom` | Browser modules now do real DOM work; §IV requires unit tests without a browser | Hand-written fakes would exceed the code under test; E2E-only testing violates §IV. |
| Three Playwright browsers (+ no-JS and mobile projects) | FR-055 / SC-016 (clarified), FR-053, FR-009 | Chromium only: contradicts the clarified browser support. |
| Binary bodies in the site map | Fonts are served and written like every other asset (one site map, §III) | Serving fonts outside the site map would create a second page list for serve and build. |
