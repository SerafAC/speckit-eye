# Developing speckit-eye

This guide is for people working on speckit-eye itself. For using the tool, see `README.md`.

## Setup

- Node.js 22 or newer.
- [pnpm](https://pnpm.io/) is the package manager for this repository (a `pnpm-lock.yaml` is committed; there is no `package-lock.json`).

```sh
pnpm install --frozen-lockfile        # install exactly the locked dependencies
pnpm exec playwright install chromium # browser for the E2E tests (Chromium only)
```

`pnpm-workspace.yaml` lists which dependency install scripts may run (`allowBuilds`). `@parcel/watcher`, pulled in by the Tailwind CLI, is denied because it ships prebuilt binaries.

## Build

```sh
pnpm run build:css   # compiles src/styles/input.css into dist/styles.css (Tailwind CSS v4)
```

`dist/` is generated and gitignored. `prepack` runs `build:css`, so the published package always contains a fresh `dist/styles.css`.

## Tests

```sh
pnpm test                # unit tests: node:test over tests/unit/**/*.test.js
pnpm run test:coverage   # unit tests with Node's built-in coverage report
pnpm run test:e2e        # builds the CSS, then runs the Playwright suites in tests/e2e/
```

- Unit tests never touch the real file system, network, or a browser. All I/O is injected (see Conventions).
- E2E tests drive the real CLI in Chromium, one worker at a time (all servers use port 4747).
- **E2E naming rule**: every E2E test name starts with the story and requirement ids it covers, `USn FR-xxx …`, for example `US2 FR-027 keeps scroll and expanded items on live update` (constitution §V traceability).

## Conventions

- Plain JavaScript ES modules with JSDoc, Node.js ≥ 22, no TypeScript (research R1).
- All HTML is produced with the `html` tagged template from `src/render/html.js`; only trusted fragments go through `raw()` (R4).
- Unit tests use `node:test` + `node:assert/strict`, live in `tests/unit/`, and never touch the real file system, network, or a browser (§IV). All I/O is injected: `fs` into `createReader` and `writeSite`, `http.createServer` into `startServer`, `fs.watch`/timers into the watcher, and `document`/`window`/`EventSource`/`fetch`/`DOMParser` into the client scripts. File input for scan/model tests goes through the fake reader in `tests/unit/fake-reader.js`. Only one-line entry points with no logic (`bin/speckit-eye.js`, the client bootstraps) are left to the E2E tests.
- The target project is never written (FR-006). Only `src/project/reader.js` reads input files; only `src/build/build.js` writes output files.
- Status colors exist once, as CSS custom properties in `src/styles/input.css` (§III).
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (§VI).
- The version is defined only in `package.json` (§III).

## Project structure

_To be completed (T069)._

## Release process

_To be completed (T069)._

### Release checklist

- [ ] **Package contents**: `npm pack --dry-run` (runs `prepack`, which builds
  `dist/styles.css`) lists only `bin/`, `src/` without `src/styles/`,
  `dist/styles.css`, `README.md`, `CHANGELOG.md`, `LICENSE`, and the
  `package.json` that npm always adds.
- [ ] **Installed tarball runs**: `npm pack`, install the tarball in an empty
  temporary folder, and run `npx speckit-eye --serve <copy of tests/fixtures/projects/mixed>`.
  It must print a `Local:` address that serves the overview
  (`40 / 65 tasks (62 %)`) and `assets/styles.css`. `npm ls --all --omit=dev`
  must show `markdown-it` as the only direct dependency.

Last verified on 2026-09-25 with version 0.1.0 (Node 24.11.1, npm 11.6.2):
30 files, 43.4 kB packed, 156.1 kB unpacked. The installed CLI served the
`mixed` fixture, and the runtime tree was `markdown-it@15.0.2` with its own
dependencies (`argparse`, `entities`, `linkify-it`, `mdurl`, `punycode.js`,
`uc.micro`).
