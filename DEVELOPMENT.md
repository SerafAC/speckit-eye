# Developing speckit-eye

This guide is for people working on speckit-eye itself. For using the tool, see `README.md`.

## Setup

- Node.js 22 or newer.
- [pnpm](https://pnpm.io/) is the package manager for this repository (a `pnpm-lock.yaml` is committed; there is no `package-lock.json`).

```sh
pnpm install --frozen-lockfile        # install exactly the locked dependencies
pnpm exec playwright install chromium firefox webkit # browsers for the E2E tests
```

`pnpm-workspace.yaml` lists which dependency install scripts may run (`allowBuilds`). `@parcel/watcher`, pulled in by the Tailwind CLI, is denied because it ships prebuilt binaries.

## Build

```sh
pnpm run build:assets   # stylesheet and fonts:
                        # compiles src/styles/input.css into dist/styles.css (Tailwind CSS v4),
                        # then scripts/copy-assets.js copies the fonts into dist/fonts/
```

`dist/` is generated and gitignored. `prepack` runs `build:assets`, so the published package always contains a fresh `dist/styles.css` and `dist/fonts/`. The fonts come from the `@fontsource*` dev dependencies (Geist, Geist Mono, Instrument Serif; Latin and Latin-extended `woff2` files plus their OFL licence texts).

## Tests

```sh
pnpm test                # unit tests: node:test over tests/unit/**/*.test.js
pnpm run test:coverage   # unit tests with Node's built-in coverage report
pnpm run test:e2e        # builds the assets, then runs the Playwright suites in tests/e2e/
pnpm run test:e2e --project chromium   # one Playwright project only
```

- Unit tests never touch the real file system, network, or a browser. All I/O is injected (see Conventions).
- Unit tests of the browser modules in `src/client/` run against [happy-dom](https://github.com/capricorn86/happy-dom) (a fresh `new Window()` per test), in files named `tests/unit/client-<module>.test.js`. Layout-dependent code is tested with stubbed `getBoundingClientRect` values.
- E2E tests drive the real CLI, one worker at a time (all servers use port 4747), in five Playwright projects (`playwright.config.js`):
  - `chromium`, `firefox`, `webkit`: desktop, 1440 × 900, every suite except `nojs.spec.js` and `mobile.spec.js`;
  - `chromium-nojs`: JavaScript disabled, runs only `nojs.spec.js`;
  - `chromium-mobile`: 375 × 812 with touch, runs only `mobile.spec.js`.

  CI installs all three browsers. The cloud development container has Chromium only, so run `--project chromium` (and the two Chromium variants) there.
- **E2E naming rule**: every E2E test name starts with the story and requirement ids it covers, `USn FR-xxx …`, for example `US2 FR-027 keeps scroll and expanded items on live update` (constitution §V traceability).

## Conventions

- Plain JavaScript ES modules with JSDoc, Node.js ≥ 22, no TypeScript (research R1).
- **Browser modules** live in `src/client/` and are served as `assets/<name>.js`. Each exports `init(root, deps)`, idempotent and called on load and after every live update, and, when it holds page-local state, `save(root)` returning an object that is passed back as `init(root, { state, … })`. `deps` injects `document`, `window`, `storage`, `setTimeout`/`clearTimeout`, `fetch` and `navigator`. Every `localStorage` access goes through `src/client/prefs.js`.
- All HTML is produced with the `html` tagged template from `src/render/html.js`; only trusted fragments go through `raw()` (R4).
- Unit tests use `node:test` + `node:assert/strict`, live in `tests/unit/`, and never touch the real file system, network, or a browser (§IV). All I/O is injected: `fs` into `createReader` and `writeSite`, `http.createServer` into `startServer`, `fs.watch`/timers into the watcher, and `document`/`window`/`EventSource`/`fetch`/`DOMParser` into the client scripts. File input for scan/model tests goes through the fake reader in `tests/unit/fake-reader.js`. Only one-line entry points with no logic (`bin/speckit-eye.js`, the client bootstraps) are left to the E2E tests.
- The target project is never written (FR-006). Only `src/project/reader.js` reads input files; only `src/build/build.js` writes output files.
- Status colors exist once, as CSS custom properties in `src/styles/input.css` (§III).
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (§VI).
- The version is defined only in `package.json` (§III).

## Project structure

```text
bin/speckit-eye.js      one-line entry point; calls src/cli/main.js
src/
  cli/                  argument parsing and the serve/build commands
  project/              the only file reader: scan specs/, .specify/, artifacts
  parse/                tasks.md and spec.md parsers (contracts/tasks-md-format.md)
  model/                project model: counts, stages, task states, the active chain
  render/               HTML: overview, artifact pages, layout; site.js decides every page
  serve/                local HTTP server, route handler, file watcher, live-update events
  build/                static build: the only file writer
  client/               browser scripts: grid hover and click, live updates
  styles/input.css      Tailwind source; status colors defined once
tests/
  unit/                 node:test suites with injected fakes (fake-fs.js, fake-reader.js)
  e2e/                  Playwright suites, one per user story plus security, scale, self-counts
  fixtures/             sample projects (projects/README.md) and generate-large.js
scripts/
  copy-assets.js        build-time only: copies the fonts into dist/fonts/ (not in the package)
  release/release.js    release rules for the workflows: bump, verify, notes,
                        release-commit, pack-check (not in the package; docs/releasing.md)
docs/                   user docs (usage.md, hosting.md), architecture.md and releasing.md
```

Data flows one way: `project → parse → model → render → serve/build`. See
[docs/architecture.md](docs/architecture.md) for each module's job, why
`render/site.js` is the single page decider, and the live-update sequence.

## Release process

Releases are automated with GitHub Actions; the full guide, including the
one-time setup, pre-releases and recovery, is
[docs/releasing.md](docs/releasing.md). The maintainer does three things:

1. Actions → **Bump version** on `main` (kind `patch`, `minor`, `major`, a
   pre-release kind, or `explicit` with a version). It updates `package.json`
   and `CHANGELOG.md` and opens the pull request **Release vX.Y.Z**.
2. Review and merge that pull request.
3. Approve the waiting **Release** run (environment `npm`). By then the full
   test suites, the version checks and the package contents check have
   passed; the run tags the merge commit, publishes to npm with provenance
   and creates the GitHub release.

The version lives only in `package.json` (§III), and every user-visible change
adds a line under `## [Unreleased]` in `CHANGELOG.md`; **Bump version** refuses
to release an empty Unreleased section. `npm publish` from a working copy is
refused by the `prepublishOnly` script: publish only through the Release
workflow.
