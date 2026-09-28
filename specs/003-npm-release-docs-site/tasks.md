---

description: "Task list for the first npm release, safe release automation, the docmd documentation site and the live project dashboard"
---

# Tasks: First npm Release, Safe Release Automation, and Documentation Site with Live Project Dashboard

**Input**: Design documents from `specs/003-npm-release-docs-site/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/) ([release-cli.md](./contracts/release-cli.md), [workflows.md](./contracts/workflows.md), [site.md](./contracts/site.md), [cli-home.md](./contracts/cli-home.md)), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution §IV (unit tests for all code) and §V (E2E coverage of every user story) are non-negotiable. Each logic task names its unit test file and ships the code and its tests together. Each story has its own Playwright suite in the new `tooling` project. E2E test names of this feature MUST start with `003 USn FR-xxx`, for example `003 US2 FR-008 bump refuses an empty Unreleased section`.

**Organization**: Tasks are grouped by user story. Order follows the spec priorities: US1, US2 (P1) → US3, US4 (P2) → US5 (P3). The last phase contains the maintainer-only steps (one-time setup and the first release), which cannot be done from inside the repository.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: The user story the task belongs to (US1–US5)
- All paths are relative to the repository root

## Conventions that apply to every task

- Plain JavaScript ES modules with JSDoc, Node.js ≥ 22, no TypeScript. The runtime dependency list stays `markdown-it` only. The only new dev dependency is `@docmd/core`, pinned exactly to `0.9.7` (research R2). No release tooling dependency (no `semver`, changesets, release-please, semantic-release) (research R9).
- Scripts under `scripts/` follow `scripts/copy-assets.js`: every rule is an exported pure function; a `main(argv, io)` receives injected `readFile`/`writeFile`/`stdout`/`stderr`/`now`/`run` and returns an exit code; the file ends with a one-line entry point guarded by an `import.meta.url` check. Unit tests use `node:test` + `node:assert/strict` in `tests/unit/`, with fakes, never the real file system, network or git (§IV).
- The version exists only in `package.json` `version`; the site URL only in `package.json` `homepage` (`https://serafac.github.io/speckit-eye/`); the repository URL only in `package.json` `repository.url` (`https://github.com/SerafAC/speckit-eye`). Everything else derives from them (§III, data-model).
- Workflows: `permissions: {}` at the top and the minimum per job exactly as in contracts/workflows.md; every third-party action pinned to a full 40-character commit SHA with a `# vX.Y.Z` comment; `actions/checkout` with `persist-credentials: false` unless the job pushes; `pnpm install --frozen-lockfile` (FR-014, FR-017). The workflow YAML only calls tested commands; any decision goes into `scripts/release/release.js`.
- Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md` (§VI). `package.json` `version` stays `1.0.0` (clarified first release).
- Docs live in `docs/` (§VII); README stays user-facing (§VIII); developer procedures go into `DEVELOPMENT.md` (§IX).
- Dashboard pages built **without** `--home` MUST stay byte-for-byte identical to today's output (contracts/cli-home.md).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Package metadata, the docmd dependency, ignore rules and the `tooling` test project

- [X] T001 Update `package.json`: add `"repository": {"type": "git", "url": "git+https://github.com/SerafAC/speckit-eye.git"}`, `"homepage": "https://serafac.github.io/speckit-eye/"`, `"bugs": {"url": "https://github.com/SerafAC/speckit-eye/issues"}`, `"author": "SerafAC"`, `"keywords": ["spec-kit", "speckit", "github-spec-kit", "spec-driven-development", "dashboard", "progress", "tasks", "cli", "static-site"]`, `"publishConfig": {"access": "public", "provenance": true}`; add script `"prepublishOnly": "node -e \"if(!process.env.GITHUB_ACTIONS){console.error('Publish only from the Release workflow: see docs/releasing.md');process.exit(1)}\""` (research R8); keep `version` `1.0.0`, `files`, `engines` unchanged
- [X] T002 Add dev dependency `@docmd/core` pinned exactly (`"0.9.7"`, no caret) with `pnpm add -D -E @docmd/core@0.9.7`; in `pnpm-workspace.yaml` add `esbuild: false` and `'@docmd/engine-rust': false` under `allowBuilds` with a comment that docmd falls back to its JS engine (research R2); commit the updated `pnpm-lock.yaml`; verify `pnpm exec docmd --version` prints `0.9.7`
- [X] T003 [P] Add `site/` and `*.tgz` to `.gitignore`
- [X] T004 [P] Update `playwright.config.js`: add a project `tooling` (Desktop Chrome, viewport 1440 × 900) with `testMatch: /(release-.*|site|repo-health)\.spec\.js/`; add the same pattern to `DESKTOP_IGNORE` so `chromium`, `firefox`, `webkit` do not run the 003 suites; update the header comment (the tooling suites test packaging, scripts and the docs site, not browser engines, research R14). The project runs wherever `pnpm run test:e2e` runs, i.e. in the CI E2E job on Linux, macOS and Windows; this is intended (the package and the docs build must work on every supported OS). If a suite proves OS-specific, fix it rather than skipping an OS

**Checkpoint**: `pnpm install --frozen-lockfile` succeeds; `pnpm test` and `pnpm run test:e2e --project chromium` pass unchanged.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The release script skeleton and the CI workflow changes that the release and bump workflows reuse

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T005 Create `scripts/release/release.js` with the command dispatcher only: `main(argv, io)` parses `<command>` and options with `util.parseArgs` (strict), dispatches to `bump`, `verify`, `notes`, `release-commit`, `pack-check` (each a stub returning exit 1 "not implemented" until its story task), prints usage and exits 2 on an unknown command or bad options; exports `parseVersion(text)` → `{major, minor, patch, pre: {id, n} | null}` or `null`, accepting only `MAJOR.MINOR.PATCH` with optional `-<id>.<n>` (no build metadata, data-model Version), and `formatVersion(v)`; one-line entry point at the end. Unit tests for dispatch, usage/exit codes and `parseVersion`/`formatVersion` (valid, `1.0`, `01.0.0`, `1.0.0+build`, `1.0.0-rc`, `1.0.0-rc.1`) in `tests/unit/release.test.js`
- [X] T006 Update `.github/workflows/ci.yml` (contracts/workflows.md "ci.yml"): add triggers `workflow_call` and `workflow_dispatch`; add `permissions: {}` at the top and `permissions: contents: read` per job; pin `actions/checkout`, `pnpm/action-setup`, `actions/setup-node`, `actions/upload-artifact`, `Vampire/setup-wsl` to full commit SHAs with version comments; add `persist-credentials: false` to every checkout; in the `e2e` job's test command keep `pnpm run test:e2e` (the `tooling` project runs with it). Keep the job names, matrices and the macOS App Nap step unchanged

**Checkpoint**: `node scripts/release/release.js` prints usage and exits 2; `pnpm test` passes; `ci.yml` is valid YAML (`node -e` parse or `actionlint` if available).

---

## Phase 3: User Story 1 - Install speckit-eye from npm (Priority: P1) 🎯 MVP

**Goal**: The package is complete, carries full metadata, and contains exactly the runtime files; the installed tarball runs.

**Independent Test**: `pnpm pack` → `release.js pack-check` passes → install the tarball into an empty temp folder → `npx speckit-eye --serve <fixture>` serves the overview (quickstart §2).

### Implementation for User Story 1

- [X] T007 [US1] Implement `pack-check <file-list.json>` in `scripts/release/release.js` (contracts/release-cli.md): export pure `checkPackFiles(paths)` → `{unexpected: string[], missing: string[]}` where allowed = `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `bin/speckit-eye.js`, `src/**/*.js` except `src/styles/**`, `dist/styles.css`, `dist/fonts/*.woff2`, `dist/fonts/OFL-*.txt`, and required = each fixed file plus at least one `src/` file and at least one `.woff2`; `main` reads the JSON (accepting both the `npm pack --dry-run --json` array form `[{files:[{path}]}]` and the `pnpm pack --json` object form `{files:[{path}]}`), prints each unexpected and missing path to stderr and exits 1 if any, else 0. Unit tests (exact allowed set passes; `tests/…`, `specs/…`, `src/styles/input.css`, `docs/x.md`, `.github/…` rejected; missing `LICENSE` and no `.woff2` reported; both JSON forms) in `tests/unit/release.test.js`
- [X] T008 [US1] Create E2E suite `tests/e2e/release-package.spec.js` (tooling project): in a temp folder run `pnpm pack --json --pack-destination <tmp>` from the repo root, run `node scripts/release/release.js pack-check` on its output (exit 0) — `003 US1 FR-002 the package contains only runtime files, README, CHANGELOG and LICENSE`; check the packed `package.json` has `description`, `license`, `repository`, `homepage`, `bugs`, `keywords`, `engines` — `003 US1 FR-001 the package carries complete metadata`; `npm install <tgz>` into an empty temp folder, spawn `npx speckit-eye --serve <copy of tests/fixtures/projects/mixed>` from there, wait for the `Local:` line, open it in the page and expect `40 / 65 tasks (62 %)` — `003 US1 FR-001 the installed tarball serves a project's overview`; stop the server; reuse helpers from `tests/e2e/helpers.js` (fixture copy, spawn, port 4747)
- [X] T009 [US1] In `DEVELOPMENT.md`'s release checklist, replace the manual "Package contents" and "Installed tarball runs" items with one line saying both are now automated by `release.js pack-check` and `tests/e2e/release-package.spec.js` (the release section is rewritten in T019)

**Checkpoint**: US1 E2E suite passes locally in the `tooling` project.

---

## Phase 4: User Story 2 - Cut a release safely by following one guide (Priority: P1)

**Goal**: Bump workflow → reviewed PR → merge → Release workflow (CI, verify, pack, owner approval, tag, publish with provenance, GitHub release), with every failure stopping before publish.

**Independent Test**: The `release-flow` E2E suite drives `release.js` through a release and every broken input on scratch copies (quickstart §3); the maintainer rehearsal (quickstart §6–7) covers the workflows.

### Implementation for User Story 2

- [ ] T010 [US2] Implement pure `nextVersion(current, kind, preid = "rc")` in `scripts/release/release.js` following the data-model "Next version" table exactly (kinds `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, `prerelease`; from a pre-release, `patch`/`minor`/`major` finish it when the base already matches, e.g. `1.3.0-rc.1` + `patch` → `1.3.0`; `prerelease` from a stable version behaves as `prepatch`; `prerelease` with the same id increments `n`, with a different id starts at `0`); throws on an unknown kind. Unit tests covering every cell of the table plus `1.0.0-beta.2` + `prerelease --preid rc` → `1.0.0-rc.0` in `tests/unit/release.test.js`
- [ ] T011 [US2] Implement changelog functions in `scripts/release/release.js` (data-model "Changelog section"): `parseChangelog(text)` → `{head, unreleased: {body}, sections: [{version, date, body}], links}` (throws `malformed changelog` without `# Changelog` or `## [Unreleased]`); `hasEntries(body)` (at least one line starting `- `); `releaseChangelog(text, {version, date, repoUrl})` → new text with an empty `## [Unreleased]` followed by `## [X.Y.Z] - YYYY-MM-DD` holding the former Unreleased body (sub-headings kept), then the older sections unchanged, then rewritten link definitions: `[Unreleased]: <repo>/compare/vX.Y.Z...HEAD`, and per released version `[V]: <repo>/compare/v<previous>...vV` or, for the oldest, `[V]: <repo>/releases/tag/vV`; `sectionNotes(text, version)` → the section body trimmed, or throws; `repoUrlFrom(pkg)` → `repository.url` without `git+` and `.git`. Unit tests with sample changelogs (first release from the real shape of `CHANGELOG.md`, second release, sub-headings preserved, empty Unreleased, malformed input, notes of a missing version) in `tests/unit/release.test.js`
- [ ] T012 [US2] Implement the `bump` command in `scripts/release/release.js` (contracts/release-cli.md): `bump <kind> [--preid rc]` or `bump --version X.Y.Z` (exactly one); reads `package.json` and `CHANGELOG.md`; refuses (exit 1, nothing written, stderr message) when Unreleased has no entries (FR-008), when the version is invalid, or when the changelog already has a `## [X.Y.Z]` section; `--version` equal to the current version is allowed (first release `1.0.0`); writes `package.json` with only `version` changed (`JSON.stringify(pkg, null, 2) + "\n"`, key order kept) and the released changelog with today's UTC date from `io.now()`; prints the new version. Unit tests with fake I/O (writes both files, first-release `--version 1.0.0`, empty Unreleased writes nothing, duplicate section refused, both `<kind>` and `--version` rejected) in `tests/unit/release.test.js`
- [ ] T013 [US2] Implement `verify --tag vX.Y.Z` and `notes --version X.Y.Z` in `scripts/release/release.js` (contracts/release-cli.md): `verifyRelease({tag, pkg, changelog})` → `{version, tag, prerelease, distTag}` or throws with the failed check named (`tag v1.2.0 does not match package.json version 1.1.0`, `newest changelog section is 1.1.0, not 1.2.0`, `changelog section 1.2.0 has no entries`, `invalid tag`); `distTag` = `next` when the version contains `-`, else `latest` (FR-016); `verify` prints `version=`, `tag=`, `prerelease=`, `dist-tag=` lines; `notes` prints `sectionNotes`. Unit tests for each check and both dist-tags in `tests/unit/release.test.js`
- [ ] T014 [US2] Implement `release-commit --version X.Y.Z --head-ref <ref> --tag-exists <true|false>` in `scripts/release/release.js`: pure `releaseCommitDecision({version, headRef, tagExists, changelog})` → `{release: true}` only when `headRef === "release/next"`, `tagExists === false` and the changelog has `## [X.Y.Z]`; otherwise `{release: false, reason}` (`not merged from release/next`, `tag vX.Y.Z already exists`, `no changelog section for X.Y.Z`); prints `release=` and `reason=` lines, always exit 0 (research R10, edge case "hand-edited version"). Unit tests for all four outcomes in `tests/unit/release.test.js`
- [ ] T015 [US2] Create `.github/workflows/bump.yml` (contracts/workflows.md "bump.yml"): `workflow_dispatch` inputs `kind` (choice `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, `prerelease`, `explicit`), `version` (string), `preid` (string, default `rc`); fail unless `github.ref == 'refs/heads/main'`; `permissions: {}` then job `contents: write`, `pull-requests: write`, `actions: write`; `concurrency: bump`; steps: checkout `main`, setup pnpm/node 22, run `node scripts/release/release.js bump …` (`--version ${{ inputs.version }}` when `kind == explicit`, else `${{ inputs.kind }} --preid ${{ inputs.preid }}`), capture the version, commit `chore(release): vX.Y.Z` as `github-actions[bot]`, `git push --force origin HEAD:release/next`, write the PR body (release notes from `release.js notes` + "Merging this PR tags vX.Y.Z and starts the Release workflow, which waits for the repository owner's approval"), then `gh pr create --base main --head release/next --title "Release vX.Y.Z"` or, when a PR from `release/next` is open, `gh pr edit` it (edge case "previous bump still open"), then `gh workflow run ci.yml --ref release/next` (research R9). Pass inputs through `env:`, never interpolate `${{ inputs.* }}` directly into `run:` scripts (script injection)
- [ ] T016 [US2] Create `.github/workflows/release.yml` (contracts/workflows.md "release.yml", research R10): triggers `push` to `main` with paths `package.json`, `CHANGELOG.md`; `push` tags `v*`; `workflow_dispatch` without inputs (re-run for an existing tag; there is no dry-run mode — the rehearsal is the real run reviewed at the approval step); `permissions: {}`; `concurrency: {group: release, cancel-in-progress: false}`. Job `prepare` (`contents: read`, `pull-requests: read`): on a push to `main`, get the head ref of the PR for `github.sha` with `gh api repos/${{ github.repository }}/commits/${{ github.sha }}/pulls --jq '.[0].head.ref // ""'`, check the remote tag with `git ls-remote --tags origin`, run `release.js release-commit`; on a tag push or dispatch, require `github.ref_type == 'tag'` (dispatch on a branch fails with "run this workflow on a tag"); outputs `release`, `version`, `tag`, `sha`. Jobs `ci` (`uses: ./.github/workflows/ci.yml`, `contents: read`) and `verify` (`contents: read`; checkout with `fetch-depth: 0`; `git merge-base --is-ancestor <sha> origin/main` (FR-009); `release.js verify --tag`; fail if `npm view speckit-eye@<version> version` succeeds (FR-010); `pnpm pack --json`; `release.js pack-check`; `release.js notes > notes.md`; upload artifact `release` with the `.tgz` and `notes.md`) both only when `prepare.outputs.release == 'true'`. Job `publish` needs `ci` + `verify`, `environment: npm`, permissions `contents: write`, `id-token: write`: checkout with credentials, download the artifact, create and push the annotated tag `vX.Y.Z` on `sha` if it does not exist, setup-node 24 with `registry-url: https://registry.npmjs.org`, `npm publish ./speckit-eye-<version>.tgz --access public --provenance --tag <dist-tag>`, env `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (research R7). Job `github-release` needs `publish`, `contents: write`: download the artifact and run `gh release create <tag> --verify-tag --title <tag> --notes-file notes.md` plus `--prerelease` when prerelease (FR-015). All values reach shell steps through `env:`
- [ ] T017 [US2] Create fixture files `tests/fixtures/release/package.json` (`{"name": "speckit-eye", "version": "1.0.0", "repository": {"type": "git", "url": "git+https://github.com/SerafAC/speckit-eye.git"}}`) and `tests/fixtures/release/CHANGELOG.md` (the Keep a Changelog head of the real file, an `## [Unreleased]` section with `### Added` and two entries, and the `[Unreleased]: …/commits/main` link line) — a frozen sample, never the repository's live files, so the suite keeps passing after real releases. Create E2E suite `tests/e2e/release-flow.spec.js` (tooling project): copy the two fixture files into a temp folder, run `node <repo>/scripts/release/release.js` there with `cwd` = temp. Tests: `003 US2 FR-006 bump moves Unreleased under the new dated version` (`bump --version 1.0.0` → stdout `1.0.0`, empty Unreleased, `## [1.0.0] - <today UTC>` with the former entries, link lines); `003 US2 FR-008 bump refuses an empty Unreleased section` (second run exits 1, files unchanged by hash); `003 US2 FR-010 verify accepts a matching tag and names latest`; `003 US2 FR-010 verify rejects a tag that does not match package.json` (exit 1, stderr names the mismatch, SC-003); `003 US2 FR-016 a pre-release verifies with the next dist-tag` (add an entry, `bump preminor` → `1.1.0-rc.0`, `verify` → `dist-tag=next`); `003 US2 FR-015 notes print the version's changelog section`; `003 US2 FR-002 pack-check rejects an unexpected file` (hand-made list with `tests/x.js` → exit 1); `003 US2 FR-009 release-commit ignores a version change not merged from release/next`
- [ ] T018 [US2] Write `docs/releasing.md` (FR-018): overview diagram (bump → PR → merge → Release: prepare, ci, verify, approval, tag, publish, GitHub release); **One-time setup** (claim/confirm the npm name; create the `npm` environment with the repository owner as the only required reviewer, self-review allowed, deployment refs `main` and `v*`; first-release granular npm token with write access and 1-day expiry as environment secret `NPM_TOKEN`; Settings → Actions → "Allow GitHub Actions to create and approve pull requests"; Settings → Pages → Source "GitHub Actions"; tag ruleset protecting `v*` from update and deletion; immutable releases; private vulnerability reporting); **Cutting a release**; **Cutting a pre-release** (`prepatch`/`preminor`/`premajor`/`prerelease`, `next` dist-tag, how users install it); **The first release** (`explicit` + `1.0.0`, then switch to trusted publishing: configure the trusted publisher for `SerafAC/speckit-eye`, workflow `release.yml`, environment `npm`; set "Require two-factor authentication and disallow tokens"; revoke the token; delete `NPM_TOKEN`); **Verifying a release** (`npm view`, provenance on npmjs.com, `npm audit signatures`, tag, GitHub release, changelog); **When something goes wrong** (a check failed; approval rejected; publish succeeded but the GitHub release failed → re-run failed jobs; a tag pushed by hand; re-running a release by dispatching **Release** on its tag; there is no dry-run mode — to rehearse, review the pending run at the approval step and reject it; a broken version → `npm deprecate speckit-eye@X "<reason>"` and ship a patch, never unpublish/reuse; name taken); **Why it is safe** (the checks of FR-009–FR-017 in one list)
- [ ] T019 [US2] Update `DEVELOPMENT.md` "Release process": replace the manual steps and the release checklist with a short summary (the three maintainer actions: start **Bump version**, merge the PR, approve the release) and a link to `docs/releasing.md` (FR-019); mention `scripts/release/release.js` in "Project structure" and that `npm publish` from a working copy is refused by `prepublishOnly`
- [ ] T020 [US2] Prepare `CHANGELOG.md` for the first bump: add, at the bottom, the link definition `[Unreleased]: https://github.com/SerafAC/speckit-eye/commits/main` (rewritten by `bump` on release); add a unit test in `tests/unit/release.test.js` that runs `parseChangelog` and `releaseChangelog` on an inline copy of the file's head, first entries and link line, so the real file's shape is covered without reading it

**Checkpoint**: `release-flow` and `release-package` suites pass; the workflows are valid YAML and pass `actionlint` when available.

---

## Phase 5: User Story 3 - Read the documentation on a website (Priority: P2)

**Goal**: `docs/` builds into a docmd site with a home page and navigation to every guide; PRs check the build and links; `main` deploys to GitHub Pages.

**Independent Test**: `pnpm run docs:build && pnpm exec docmd validate` succeeds; the `site` suite serves `site/` under `/speckit-eye/` and finds every guide from the home page with no broken internal links (quickstart §4).

### Implementation for User Story 3

- [ ] T021 [P] [US3] Create `docmd.config.js` (research R3): `import pkg from "./package.json" with { type: "json" }`; export default `{ title: "speckit-eye", url: pkg.homepage (as-is: docmd strips the trailing slash itself, so the config holds no logic to unit-test, §IV), src: "docs", out: "site", markdown: { breaks: false, linkify: false }, navigation: [Home "/", Usage "/usage", Hosting a snapshot "/hosting", Architecture "/architecture", Releasing "/releasing", external "Contributing" → `https://github.com/SerafAC/speckit-eye/blob/main/CONTRIBUTING.md`, external "Development" → `https://github.com/SerafAC/speckit-eye/blob/main/DEVELOPMENT.md` (FR-021), external "Project status & live demo" → `${pkg.homepage}status/`, external "npm" → `https://www.npmjs.com/package/speckit-eye`, external "GitHub" → repository URL], plugins: { ai: false, analytics: false } }` — confirm the exact key names for navigation entries and external links against `node_modules/@docmd/core/dist/utils/config-schema.js` and `@docmd/parser`'s `normalizeNavPaths`
- [ ] T022 [P] [US3] Move `docs/screenshot.png` and `docs/screenshot-dark.png` to `docs/assets/` with `git mv` (docmd copies only `docs/assets/`, research R4); update the `<picture>` sources in `README.md` to `docs/assets/screenshot-dark.png` and `docs/assets/screenshot.png`; grep the repository for other references to the old paths (tests, docs) and update them
- [ ] T023 [P] [US3] In `docs/architecture.md` and `docs/usage.md`, replace every relative link into `specs/` (`../specs/…`) with the absolute URL `https://github.com/SerafAC/speckit-eye/blob/main/specs/…` (directories: `…/tree/main/specs/…`); in `docs/usage.md` rephrase the "Links to other documents" bullet so the example paths `./plan.md` and `contracts/cli.md#synopsis` are not written in Markdown link syntax (research R4)
- [ ] T024 [US3] Create `docs/index.md` (contracts/site.md "Home page"): front matter `title: speckit-eye`; one-paragraph description; the screenshot `![…](assets/screenshot.png)` with the README's alt text; "Install and run" with `npx speckit-eye --serve .` and Node ≥ 22; a prominent link "Project status & live demo" to `https://serafac.github.io/speckit-eye/status/` (FR-026) with one sentence explaining it is this repository's own specs shown by speckit-eye; links to the npm package and the repository; a "Guides" list linking Usage, Hosting a snapshot, Architecture, Releasing; "Project" links to `CONTRIBUTING.md`, `DEVELOPMENT.md`, `CHANGELOG.md`, `SECURITY.md` on GitHub (absolute URLs, `blob/main`). Do not copy README sections (§III)
- [ ] T025 [US3] Create `scripts/build-site.js` (contracts/site.md "Build command"), docs part: export pure `sitePaths(homepage)` → `{home: "<homepage with trailing />", base: "<URL path of homepage>", statusBase: "<base>status/", statusUrl: "<home>status/"}` (throws unless `https:`/`http:`); `main(argv, io)` removes `site/` (`io.rm`), runs `docmd build` through `io.run` (the local binary `node_modules/.bin/docmd`), and returns its exit code (the dashboard step is added in T031); add script `"docs:build": "node scripts/build-site.js"` to `package.json`. Unit tests for `sitePaths` (`https://serafac.github.io/speckit-eye/` and without trailing slash → base `/speckit-eye/`, statusBase `/speckit-eye/status/`; root domain → base `/`; `ftp:` throws) and for `main` with fake `rm`/`run` (order of calls, non-zero exit propagated) in `tests/unit/build-site.test.js`
- [ ] T026 [US3] Create `.github/workflows/pages.yml` (contracts/workflows.md "pages.yml", research R12): triggers `push` to `main` and `pull_request` with paths `docs/**`, `docmd.config.js`, `scripts/build-site.js`, `src/**`, `bin/**`, `specs/**`, `.specify/**`, `package.json`, `pnpm-lock.yaml`, `.github/workflows/pages.yml`, plus `workflow_dispatch`; `permissions: {}`; `concurrency: {group: pages, cancel-in-progress: false}`; job `build` (`contents: read`): checkout, pnpm, node 22, `pnpm install --frozen-lockfile`, `pnpm run docs:build`, `pnpm exec docmd validate`, `actions/upload-pages-artifact` with `path: site`; job `deploy` (`if: github.event_name != 'pull_request'`, needs `build`, `pages: write`, `id-token: write`, `environment: {name: github-pages, url: ${{ steps.deployment.outputs.page_url }}}`): `actions/deploy-pages`. Pin all actions by SHA
- [ ] T027 [US3] Create E2E suite `tests/e2e/site.spec.js` (tooling project), docs part: in `beforeAll` run `pnpm run docs:build` and start a small static file server (Node `http`, in `tests/e2e/helpers.js` as `serveStatic(root, prefix)`) that serves `site/` under `/speckit-eye/` on port 4747 and returns 404 elsewhere. Tests: `003 US3 FR-021 the home page links to every guide, npm, GitHub and the dashboard` (Usage, Hosting a snapshot, Architecture, Releasing reachable in ≤ 2 clicks, SC-006); `003 US3 FR-021 the navigation lists every guide plus Contributing and Development`; `003 US3 FR-023 the site has no broken internal links` (crawl every same-origin `href`/`src` under `/speckit-eye/`, excluding `/speckit-eye/status/` which the US4 part covers, and expect 200 for each); `003 US3 FR-020 a guide page shows the text of its docs/ file` (a heading from `docs/usage.md` appears on `/speckit-eye/usage/`); `003 US3 FR-023 docmd validate passes` (spawn `pnpm exec docmd validate`, exit 0)
- [ ] T028 [US3] Update `README.md` "Documentation" section: add a first bullet linking the documentation website `https://serafac.github.io/speckit-eye/` (US3 acceptance scenario 5); keep the links to the files under `docs/`, adding `docs/releasing.md`

**Checkpoint**: `pnpm run docs:build && pnpm exec docmd validate` pass; the `site` suite's US3 tests pass.

---

## Phase 6: User Story 4 - See the project's own status and a live demo (Priority: P2)

**Goal**: The deployed site contains this repository's speckit-eye dashboard at `/status/`, linked from README and the docs home, with a "Home" link back.

**Independent Test**: After `pnpm run docs:build`, `/speckit-eye/status/` in the `site` suite shows the overview whose counts match `specs/`, all its links work under the sub-path, and "Home" returns to the docs home (quickstart §4).

### Implementation for User Story 4

- [ ] T029 [P] [US4] Add the `--home <url>` option to `src/cli/args.js` (contracts/cli-home.md): new `home` string option; `CliArgs.home` (`string | null`, `null` by default and for serve/help/version); `--home` with `--serve` → `{error: "--home can only be used with --build"}`; a value that is not a URL with protocol `http:` or `https:` → `{error: "--home must be an http or https URL"}`; update `USAGE` with `  --home <url>      Link back to <url> from every page, for --build (for example your docs site)`. Unit tests (accepted https URL, rejected `javascript:alert(1)`, `/relative`, `ftp://x`; serve + home rejected; default `null`; usage text) in `tests/unit/args.test.js`
- [ ] T030 [P] [US4] Add the Lucide `house` icon to `src/render/icons.js` (same format and ISC notice as the other icons) and a test that it renders in `tests/unit/icons.test.js`
- [ ] T031 [US4] Render the Home link (contracts/cli-home.md "Rendering"): `renderPage` in `src/render/layout.js` takes `home = null`; when set, the sidebar gets `<a href="<home>" data-part="home">${icon("house")}<span>Home</span></a>` directly after `<p data-part="project-name">`, the mobile menu gets the same link after its `<summary>`, and the document-page rail gets `<a href="<home>" data-part="home" aria-label="Home" title="Home">${icon("house")}</a>` directly after the brand; when `home` is `null` the output is unchanged. Thread `home` through `renderSite` in `src/render/site.js` (every `renderPage` call) and pass `args.home` from the build branch of `src/cli/main.js` (serve passes nothing). Add the `data-part="home"` link style to `src/styles/input.css` next to the brand style (tokens only, no inline styles). Unit tests: with `home` the three placements exist with the escaped URL; without `home` the HTML of every page type equals the output before this change (snapshot the current output in the test first) in `tests/unit/layout.test.js` and `tests/unit/site.test.js`; `main` passes `home` only in build mode in `tests/unit/main.test.js`
- [ ] T032 [US4] Extend `scripts/build-site.js`: after `docmd build`, run `node bin/speckit-eye.js --build . --out site/status --base <statusBase> --home <home>` through `io.run`; return the first non-zero exit code (FR-024: a failing dashboard build fails the whole build). Unit tests for the second call's arguments and failure propagation in `tests/unit/build-site.test.js`
- [ ] T033 [US4] Update `README.md`: directly under the intro paragraph add a line with the links "Documentation" → `https://serafac.github.io/speckit-eye/` and "Project status & live demo" → `https://serafac.github.io/speckit-eye/status/` (this repository's own specs shown by speckit-eye) (FR-026)
- [ ] T034 [US4] Document `--home`: add the option to `docs/usage.md` (build mode) and `docs/hosting.md` (options list, with an example linking back to a docs site), and add the `--home` row and synopsis to `specs/001-speckit-eye-dashboard/contracts/cli.md` as described in `contracts/cli-home.md`
- [ ] T035 [US4] Extend `tests/e2e/site.spec.js`, status part: `003 US4 FR-025 the dashboard of this repository is served at /status/` (open `/speckit-eye/status/`, overview heading and sidebar present); `003 US4 FR-025 the dashboard counts match this repository's tasks.md checkboxes` (count `- [x]`/`- [X]` and `- [ ]` task lines in `specs/*/tasks.md` the same way `tests/e2e/self-counts.spec.js` does — reuse its helper, moving it into `tests/e2e/helpers.js` if needed — and compare with the stats card, SC-007); `003 US4 FR-027 every link, style, font and script of the dashboard loads under /status/` (crawl same-origin URLs from the overview, one feature page and one document page; all 200; the search dialog opens and finds a task; the theme switch changes the theme); `003 US4 FR-027 the Home link returns to the documentation home`; `003 US4 FR-026 the docs home and README link to the dashboard` (home page link resolves to `/speckit-eye/status/`; `README.md` contains `https://serafac.github.io/speckit-eye/status/`)
- [ ] T036 [P] [US4] Add a build-mode E2E test to `tests/e2e/us4-build.spec.js`: `003 US4 FR-027 --home adds a Home link to every page of a build` (build the `mixed` fixture with `--home https://example.com/docs/`, check overview, a feature page and a document page) and `003 US4 FR-027 a build without --home has no Home link`

**Checkpoint**: The whole `site` suite passes; existing `chromium` suites pass unchanged.

---

## Phase 7: User Story 5 - Contribute to an open-source project with clear rules (Priority: P3)

**Goal**: Community files, templates, Dependabot and README badges.

**Independent Test**: The `repo-health` suite finds every file and link; opening a new issue on GitHub offers the two templates and the private security link.

### Implementation for User Story 5

- [ ] T037 [P] [US5] Create `CONTRIBUTING.md`: how to report a bug or propose a feature (issue templates), the Spec Kit flow used by this project (specify → clarify → plan → tasks → implement, `specs/`), the constitution's Quality Gates in short with a link to `.specify/memory/constitution.md`, "Development setup, tests and conventions: see DEVELOPMENT.md" (no duplication, §III), commit messages in the existing style (`docs(…)`, `chore: …`), and that releases are cut by maintainers (link `docs/releasing.md`)
- [ ] T038 [P] [US5] Create `CODE_OF_CONDUCT.md` from the Contributor Covenant 2.1 text; leave the enforcement contact as the literal placeholder `[INSERT CONTACT METHOD]` and leave it for the maintainer task T049 — do not invent or insert any personal address (research R13)
- [ ] T039 [P] [US5] Create `SECURITY.md`: supported versions table (latest `1.x` minor: supported; older: not), how to report — GitHub private vulnerability reporting (`https://github.com/SerafAC/speckit-eye/security/advisories/new`), what to include, expected first response within 7 days, coordinated disclosure; scope notes (serve mode listens on loopback only, the tool is read-only)
- [ ] T040 [P] [US5] Create `.github/ISSUE_TEMPLATE/bug_report.yml` (fields: speckit-eye version, Node.js version, OS, command run, what happened, expected, `tasks.md`/spec excerpt if relevant), `.github/ISSUE_TEMPLATE/feature_request.yml` (problem, proposed solution, alternatives), and `.github/ISSUE_TEMPLATE/config.yml` (`blank_issues_enabled: false`; contact link "Report a security vulnerability" → the private advisory URL; contact link "Documentation" → `https://serafac.github.io/speckit-eye/`)
- [ ] T041 [P] [US5] Create `.github/pull_request_template.md`: summary, linked spec/issue, and a checklist of the Quality Gates — unit tests (§IV), E2E tests with `USn FR-xxx` names (§V), `CHANGELOG.md` Unreleased entry for user-visible changes (§VI), `docs/` / `README.md` / `DEVELOPMENT.md` updated where affected (§VII–IX), no unjustified complexity (§I–III)
- [ ] T042 [P] [US5] Create `.github/dependabot.yml` (contracts/workflows.md): `version: 2`; ecosystems `npm` (directory `/`) and `github-actions` (directory `/`), `schedule.interval: weekly`, one group per ecosystem for `minor` and `patch` updates (FR-031)
- [ ] T043 [US5] Add badges to the top of `README.md` under the title: CI (`https://github.com/SerafAC/speckit-eye/actions/workflows/ci.yml/badge.svg` → the workflow page), npm version (`https://img.shields.io/npm/v/speckit-eye` → `https://www.npmjs.com/package/speckit-eye`), license (`https://img.shields.io/npm/l/speckit-eye` → `LICENSE`); add a "Contributing" section at the end linking `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` and `SECURITY.md` (FR-030; user-facing, §VIII)
- [ ] T044 [US5] Create E2E suite `tests/e2e/repo-health.spec.js` (tooling project, file checks only): `003 US5 FR-028 contribution guidelines, code of conduct and security policy exist and are linked from README`; `003 US5 FR-029 issue templates for bugs and features and a PR template with the quality gates exist` (parse the YAML templates' `name`/`body`; PR template mentions CHANGELOG and tests); `003 US5 FR-030 README shows CI, npm and license badges`; `003 US5 FR-031 Dependabot watches npm and GitHub Actions`; `003 US5 FR-014 every third-party action in .github/workflows is pinned to a commit SHA` (regex over `uses:` lines, allowing only local `./` paths and 40-hex SHAs) and `every workflow sets top-level permissions`

**Checkpoint**: `repo-health` suite passes.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Changelog, docs, full validation, and the maintainer-only steps

- [ ] T045 Add entries under `## [Unreleased]` in `CHANGELOG.md` (FR-032): Added — speckit-eye is published on npm (`npx speckit-eye`); the `--home <url>` build option; a documentation website with this project's live status dashboard; contributing guide, code of conduct, security policy. Changed — screenshots moved to `docs/assets/`
- [ ] T046 [P] Update `docs/architecture.md`: new sections "Release automation" (bump → PR → release run; `scripts/release/release.js` commands; where each FR-009–FR-017 check happens; link `docs/releasing.md`) and "Documentation site" (docmd from `docs/`, `scripts/build-site.js`, `/status/` dashboard, `pages.yml`); `--home` in the CLI section
- [ ] T047 [P] Update `DEVELOPMENT.md`: `pnpm run docs:build` and `pnpm exec docmd dev` for previewing docs, `site/` output, the `tooling` Playwright project and the `003 USn FR-xxx` test naming for this feature, `scripts/build-site.js` and `docmd.config.js` in "Project structure"; note that the `tooling` suites need registry access (`release-package.spec.js` installs the packed tarball with `npm install`, which fetches `markdown-it`)
- [ ] T048 Run the full local validation (quickstart §1–4): `pnpm test`, `pnpm run test:e2e --project tooling`, `pnpm run test:e2e --project chromium --project chromium-nojs --project chromium-mobile`, `pnpm run docs:build && pnpm exec docmd validate`, `pnpm pack` + `pack-check`; fix any failure; run `actionlint` on `.github/workflows/*.yml` if available
- [ ] T049 Maintainer (outside the repository, cannot be automated): provide the Code of Conduct contact and replace `[INSERT CONTACT METHOD]` in `CODE_OF_CONDUCT.md`; then perform the one-time setup of `docs/releasing.md` "One-time setup" (quickstart §5)
- [ ] T050 Maintainer: after this feature is merged to `main`, confirm the Pages deploy published `https://serafac.github.io/speckit-eye/` and `/status/` (SC-005), then cut the first release following `docs/releasing.md` "The first release" — **Bump version** with `explicit` / `1.0.0`, merge the PR, review and approve the Release run — and verify (quickstart §6): `npm view speckit-eye version` → `1.0.0`, provenance shown on npmjs.com, tag `v1.0.0`, GitHub release notes = changelog section (SC-004); then switch to trusted publishing and delete `NPM_TOKEN`
- [ ] T051 Maintainer: run the negative checks of quickstart §7 — hand-pushed mismatching tag, re-dispatch on `v1.0.0` (already on npm), bump with empty Unreleased, and a tag on a scratch-branch commit with a deliberately failing unit test (fails both `ci` and the "on `main`" check) — and confirm nothing is published in any of them (SC-003); delete the scratch tag and branch

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately.
- **Foundational (Phase 2)**: after Setup. T005 is the base of every `release.js` task; T006 runs the E2E job that includes T004's `tooling` project.
- **US1 (Phase 3)**: after Phase 2.
- **US2 (Phase 4)**: after Phase 2; T016 uses `pack-check` from T007 (US1), so finish T007 first.
- **US3 (Phase 5)**: after Phase 1 (T002 docmd); independent of US1/US2.
- **US4 (Phase 6)**: after US3's T025/T027 (site build and suite exist); T029–T031 can start any time after Phase 1.
- **US5 (Phase 7)**: after Phase 1; T044 checks the workflows created in T015, T016, T026, so run it last in the phase.
- **Polish (Phase 8)**: after all stories. T049–T051 are the maintainer's, after merge.

### Within Each User Story

- `release.js` tasks are sequential (same file): T005 → T007 → T010 → T011 → T012 → T013 → T014.
- Code and its unit tests ship together in one task; the story's E2E suite comes after the code it drives.
- `README.md` is touched by T022, T028, T033, T043: run them in that order, not in parallel.

### Parallel Opportunities

- Phase 1: T003 and T004 in parallel after T001/T002.
- US3: T021, T022, T023 in parallel; then T024 → T025 → T026 → T027.
- US4: T029, T030 and T036 in parallel with US3 work; T031 after T029 and T030.
- US5: T037–T042 all in parallel (different files).
- Polish: T046 and T047 in parallel.

---

## Parallel Example: User Story 5

```bash
Task: "T037 Create CONTRIBUTING.md"
Task: "T038 Create CODE_OF_CONDUCT.md"
Task: "T039 Create SECURITY.md"
Task: "T040 Create .github/ISSUE_TEMPLATE/*.yml"
Task: "T041 Create .github/pull_request_template.md"
Task: "T042 Create .github/dependabot.yml"
```

## Parallel Example: User Story 3 + User Story 4 (different files)

```bash
Task: "T021 Create docmd.config.js"
Task: "T023 Absolute spec links in docs/architecture.md and docs/usage.md"
Task: "T029 --home option in src/cli/args.js"
Task: "T030 house icon in src/render/icons.js"
```

---

## Implementation Strategy

### MVP First (User Stories 1 and 2 — both P1)

1. Phase 1 → Phase 2.
2. US1: the package is complete and checked (T007–T009).
3. US2: the release script, workflows and guide (T010–T020).
4. **Stop and validate**: `release-package` and `release-flow` suites green; after merge the maintainer can cut `1.0.0` (T049–T050), which makes the README's `npx speckit-eye` work.

### Incremental Delivery

1. Setup + Foundational → base ready.
2. US1 + US2 → first npm release possible (MVP).
3. US3 → docs website live from `main`.
4. US4 → `/status/` dashboard linked from README and docs home.
5. US5 → community files and badges.
6. Polish → changelog, architecture/development docs, full validation, first release by the maintainer.

### Notes

- [P] tasks = different files, no dependency on an unfinished task.
- Commit after each task or logical group.
- The first release and all npmjs.com/GitHub settings are the maintainer's (T049–T051); no task publishes from a development machine (FR-004).
