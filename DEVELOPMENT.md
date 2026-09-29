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

## Documentation site

```sh
pnpm run docs:build        # builds the site into site/: docmd from docs/, then this
                           # repository's dashboard into site/status/ (scripts/build-site.js)
pnpm exec docmd validate   # checks docs/ for broken relative links
pnpm exec docmd dev        # previews docs/ with live reload while you edit
```

`site/` is generated and gitignored. The site's settings and navigation are in `docmd.config.js`; its URL is `homepage` in `package.json`. `docmd dev` shows the documentation only; to see the `/status/` dashboard as it will be deployed, run `pnpm run docs:build` and serve `site/` under the base path. The Pages workflow builds and validates the site on pull requests and deploys it from `main` (see [docs/architecture.md](docs/architecture.md#documentation-site)).

## Tests

```sh
pnpm test                # unit tests: node:test over tests/unit/**/*.test.js
pnpm run test:coverage   # unit tests with Node's built-in coverage report
pnpm run test:e2e        # builds the assets, then runs the Playwright suites in tests/e2e/
pnpm run test:e2e --project chromium   # one Playwright project only
```

- Unit tests never touch the real file system, network, or a browser. All I/O is injected (see Conventions).
- Unit tests of the browser modules in `src/client/` run against [happy-dom](https://github.com/capricorn86/happy-dom) (a fresh `new Window()` per test), in files named `tests/unit/client-<module>.test.js`. Layout-dependent code is tested with stubbed `getBoundingClientRect` values.
- E2E tests drive the real CLI, one worker at a time (all servers use port 4747), in six Playwright projects (`playwright.config.js`):
  - `chromium`, `firefox`, `webkit`: desktop, 1440 × 900, every suite except `nojs.spec.js` and `mobile.spec.js`;
  - `chromium-nojs`: JavaScript disabled, runs only `nojs.spec.js`;
  - `chromium-mobile`: 375 × 812 with touch, runs only `mobile.spec.js`;
  - `tooling`: Chromium, runs only the suites of feature 003 that test packaging, the release script, the docs site and the repository files (`release-package.spec.js`, `release-flow.spec.js`, `site.spec.js`, `repo-health.spec.js`); the desktop projects skip them. Run it with `pnpm run test:e2e --project tooling`. These suites need registry access: `release-package.spec.js` installs the packed tarball with `npm install`, which fetches `markdown-it`.

  CI installs all three browsers. The cloud development container has Chromium only, so run `--project chromium` (and the two Chromium variants) there.
- **E2E naming rule**: every E2E test name starts with the story and requirement ids it covers, `USn FR-xxx …`, for example `US2 FR-027 keeps scroll and expanded items on live update` (constitution §V traceability). Tests of feature 003 start with the feature number as well, `003 USn FR-xxx …`, for example `003 US1 FR-002 the package contains only runtime files, README, CHANGELOG and LICENSE`, because their story numbers restart at US1.

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
  build-site.js         docs:build: docmd site plus this repository's dashboard under
                        site/status/ (not in the package)
  release/release.js    release rules for the workflows: bump, verify, notes,
                        release-commit, pack-check (not in the package; docs/releasing.md)
docs/                   user docs (index.md, usage.md, hosting.md), architecture.md,
                        releasing.md and assets/ (screenshots); the source of the website
docmd.config.js         documentation site settings and navigation (not in the package)
site/                   generated website (pnpm run docs:build), gitignored
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
