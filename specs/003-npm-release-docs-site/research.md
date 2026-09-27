# Research: First npm Release, Safe Release Automation, and Documentation Site

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-27

Each decision lists what was chosen, why, and what else was considered. Facts marked
*measured* were checked in the development container on 2026-09-27.

## R1. Package name and registry state

**Decision**: Publish as the unscoped package `speckit-eye`, public access.

**Rationale**: *Measured*: `npm view speckit-eye` returns `E404`, so the name is free. It
matches the binary name and every command in the README (`npx speckit-eye …`).

**Alternatives considered**: A scope (`@serafac/speckit-eye`): it would make `npx speckit-eye`
fail and every documented command longer. Kept only as the fallback if the name is taken before
the first release (the release stops at R6's "not yet published" check, and the guide says what
to do).

## R2. docmd package and version

**Decision**: Use `@docmd/core`, pinned exactly (`0.9.7`) as a dev dependency, run through the
`docmd` binary from the lockfile.

**Rationale**: *Measured*: `@mgks/docmd` (the name most guides still show) is marked
"Discontinued from 0.8.x, use @docmd/core instead" and only re-exports `@docmd/core`.
`@docmd/core` 0.9.7 builds this repository's `docs/` in about 1.4 s, needs Node ≥ 20 (the repo
needs ≥ 22), is MIT-licensed, and has `docmd validate`, which exits 1 on broken relative links
(used as the PR check, FR-023). Pinning exactly, with the lockfile, means the site build cannot
change underneath us (FR-017); Dependabot proposes upgrades (R13).

*Measured*: with `pnpm install`, docmd works although the install scripts of `esbuild` and
`@docmd/engine-rust` are not run (docmd falls back to its JS engine, "Rust engine not supported
on this platform"). Both are added to `allowBuilds` as `false` in `pnpm-workspace.yaml`,
following the existing `@parcel/watcher` entry, so no install script of the docs toolchain runs.

**Alternatives considered**: `npx @docmd/core` in the workflow without a dependency: unpinned,
not in the lockfile, and not reproducible locally. VitePress, Docusaurus, MkDocs: the user asked
for docmd.

## R3. docmd configuration

**Decision**: One small `docmd.config.js` at the repository root:

- `title: "speckit-eye"`, `src: "docs"`, `out: "site"`.
- `url` read from `package.json` `homepage` (the site URL has one definition, §III). docmd
  derives the base path (`/speckit-eye/`) from its path; generated links are relative (`./usage/`),
  *measured*.
- `markdown: { breaks: false, linkify: false }`. *Measured*: the defaults (`breaks: true`,
  `linkify: true`) turn every hard-wrapped line of our docs into a `<br>` and turn prose like
  "spec.md" into a link to `https://spec.md` (`.md` is a country domain).
- `navigation`: explicit order — Home, Usage, Hosting a snapshot, Architecture, Releasing,
  Contributing, plus external entries "Project status & demo" (`/status/`), "npm", "GitHub".
- The `ai` and `analytics` plugins are turned off: no chat widget, no tracking, nothing loaded
  from other servers. The default search, sitemap, SEO, `llms.txt` outputs stay (zero config).

**Rationale**: The smallest config that renders our existing Markdown correctly (KISS).

**Alternatives considered**: No config file (docmd's zero-config mode): renders `<br>` in every
paragraph and bogus `spec.md` links, and no fixed navigation order.

## R4. Documentation sources and what moves

**Decision**:

- `docs/index.md` (new) is the site's home page: what speckit-eye is, install, quick start, links
  to npm, GitHub and the dashboard. It links to the other pages; it does not copy the README
  (§III).
- `docs/releasing.md` (new) is the release guide (FR-018). `DEVELOPMENT.md`'s "Release process"
  section is reduced to a summary and a link (FR-019); the existing release checklist moves into
  the guide, where the automated checks now enforce it.
- `docs/contributing.md` is **not** created: the site navigation links to `CONTRIBUTING.md` and
  `DEVELOPMENT.md` on GitHub instead of duplicating them.
- The screenshots move from `docs/*.png` to `docs/assets/`. *Measured*: docmd copies only
  `docs/assets/` into the site (`assets/`); images next to the Markdown are not copied. README's
  `<picture>` sources are updated to the new paths.
- Links from `docs/` into `specs/` (e.g. `../specs/001-…/contracts/cli.md`) become absolute
  GitHub URLs (`https://github.com/SerafAC/speckit-eye/blob/main/specs/…`). *Measured*:
  `docmd validate` reports them as broken because `specs/` is not part of the site. Absolute
  links work both on GitHub and on the site.
- *Measured*: `docmd validate` also flags the two example links written inside inline code in
  `docs/usage.md` ("Links to other documents", `./plan.md`, `contracts/cli.md`). These are
  rephrased so that the example paths are not in link position, keeping the meaning.

**Rationale**: `docs/` stays the single source (FR-020); every guide is reachable from the home
page in one click (SC-006).

## R5. Project dashboard on the site (`/status/`)

**Decision**: After `docmd build`, run the tool from the same checkout:
`node bin/speckit-eye.js --build . --out site/status --base <site base>status/ --home <site URL>`.
A small script, `scripts/build-site.js`, derives base and home URL from `package.json`
`homepage` and runs both builds (`pnpm run docs:build`). It deletes `site/` first, so the
dashboard's "refuses a non-empty folder it did not create" rule is never hit.

**Rationale**: The dashboard is built from the commit being deployed, so it is both the project
status and a demo of unreleased behavior (spec assumption). `--out site/status` satisfies the
tool's output rules (not the project folder, not inside `specs/` or `.specify/`). The footer
already shows the version and "generated <time>".

**Alternatives considered**: Building with the published npm version (`npx speckit-eye@latest`):
would not exist before the first release and would lag behind `specs/`. Hard-coding
`/speckit-eye/status/` in a package script: duplicates the site URL (§III).

## R6. A way back from the dashboard to the docs (FR-027): new `--home <url>` build option

**Decision**: Add a build-only option `--home <url>` to speckit-eye. When given, the sidebar
(and the document-page rail and mobile menu) shows a "Home" link to that URL, under the
project name. Only `http:` and `https:` URLs are accepted (exit code 2 otherwise). Without the
option, pages are byte-for-byte unchanged.

**Rationale**: The dashboard pages are produced by speckit-eye, so the only clean way to put a
link on them is an option of the tool. It is useful to every project that hosts a snapshot next
to its own docs, it is optional, and it stays within the strict CSP (a plain link).

**Alternatives considered**: Post-processing the generated HTML in the site script: brittle,
couples the site to the page markup. Relying on the browser's Back button: fails for visitors
who arrive on `/status/` directly from the README (FR-026). A free-form label option: no need
(YAGNI).

## R7. Publishing credentials: trusted publishing, with a one-time bootstrap

**Decision**: Publish from GitHub Actions with **npm trusted publishing** (OIDC,
`id-token: write`; npm CLI ≥ 11.5.1, so the publish job uses Node 24). Provenance is attached
(`--provenance`, and `publishConfig.provenance: true`). For the **first** publish only: npm lets a
trusted publisher be configured only on a package that already exists, so the first run uses a
granular npm token with write access and a 1-day expiry, stored as the `NPM_TOKEN` secret of the
`npm` environment (not a repository secret). Right after 1.0.0 is out, the guide has the
maintainer: configure the trusted publisher (repository `SerafAC/speckit-eye`, workflow
`release.yml`, environment `npm`), set the package to "require two-factor authentication and
disallow tokens", revoke the token and delete the secret. The npm CLI tries OIDC first and falls
back to the token, so the workflow is the same before and after.

**Rationale**: FR-013: no long-lived publish credential; FR-006-style provenance for SC-004.
The bootstrap token lives one day, only in an environment that requires the owner's approval.
If npm offers configuring a trusted publisher before the first publish by the time of release,
the guide says to skip the token.

**Alternatives considered**: A permanent automation token: long-lived secret (FR-013).
Publishing 1.0.0 from the maintainer's laptop: violates FR-004 and would have no provenance.
A placeholder `0.0.0` publish to create the package: publishes a useless version forever.

## R8. What is published is what was tested

**Decision**: The release packs once (`pnpm pack`, which runs `prepack` → `build:assets`),
checks that tarball's file list against an allowed list, uploads it as a workflow artifact, and
the publish job publishes **that file** (`npm publish ./speckit-eye-X.Y.Z.tgz`). Installs use
`pnpm install --frozen-lockfile` everywhere. A `prepublishOnly` script refuses `npm publish` from
the repository folder outside CI (publishing a tarball runs no scripts, so the workflow is not
affected).

**Rationale**: FR-002, FR-004, FR-017. The allowed list (in `scripts/release/pack-check.js`) is the
same list as the release checklist in `DEVELOPMENT.md` today; it is an independent oracle for the
outcome of `package.json` `files`, not a second definition of it.

## R9. Version bump: a script plus a manual workflow that opens a PR

**Decision**: `scripts/release/release.js bump <kind> [--preid rc] [--version X.Y.Z]` (kinds:
`patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, `prerelease`, or `--version` for
an explicit version such as the first release's `1.0.0`, which equals the current version).
It updates `package.json` `version` and `CHANGELOG.md` (moves the Unreleased entries under
`## [X.Y.Z] - YYYY-MM-DD`, leaves an empty `## [Unreleased]`, rewrites the comparison links at the
bottom) and fails with a message if Unreleased is empty. The workflow `bump.yml`
(`workflow_dispatch` with those inputs) runs it on `main`, commits to the fixed branch
`release/next` (force-pushed), and opens the PR — or updates the open one — with `gh`.

The next-version arithmetic is ~30 lines in the script (no `semver` dependency) and unit tested.

**Rationale**: FR-005–FR-008. A fixed branch means a second bump updates the same PR instead of
opening a conflicting one (edge case). `gh` is preinstalled on GitHub runners, so no third-party
action is needed.

**Gotcha and fix**: pushes and PRs made with `GITHUB_TOKEN` do not start other workflows, so CI
would not run on the bump PR. `workflow_dispatch` is the documented exception, so `ci.yml` gains a
`workflow_dispatch` trigger and `bump.yml` runs `gh workflow run ci.yml --ref release/next`; the
check runs attach to the PR's head commit. The repository setting "Allow GitHub Actions to create
and approve pull requests" must be on (one-time setup in the guide).

**Alternatives considered**: `npm version`: creates commits/tags itself and knows nothing about
the changelog. changesets / release-please / semantic-release: each replaces the hand-written
Keep a Changelog file the constitution requires with its own model; far more machinery than one
script (KISS). A GitHub App token for the PR: more setup than the dispatch fix.

## R10. From merged bump to npm: one release workflow

**Decision**: `.github/workflows/release.yml`, triggered by:

1. `push` to `main` touching `package.json` or `CHANGELOG.md` (the automatic path, clarified);
2. `push` of a `v*` tag (a tag pushed by hand, recovery path);
3. `workflow_dispatch` run on a tag ref, with a `dry-run` input (rehearsal / re-run).

Jobs:

- **prepare** (read-only): for a push to `main`, decides whether the head commit is a release:
  it came from a PR whose head branch is `release/next` (GitHub API: commit → pulls), the tag
  `vX.Y.Z` does not exist yet, and `CHANGELOG.md` has a `## [X.Y.Z]` section. Anything else ends
  the run successfully with "not a release commit" (edge case: hand-edited versions do not
  release). For a tag or dispatch, the version comes from the tag. Outputs version, tag, commit,
  dist-tag.
- **ci**: the whole CI workflow via `uses: ./.github/workflows/ci.yml` (`ci.yml` gains
  `workflow_call`): unit tests on Node 22 and 24, E2E on Linux/macOS/Windows, WSL (FR-011).
- **verify**: commit is an ancestor of `origin/main` (FR-009); tag, `package.json` and the newest
  changelog section agree and the section is not empty (FR-010); the version is not on npm yet
  (`npm view speckit-eye@X version` must fail with E404); `pnpm pack` + pack check (FR-002);
  release notes extracted from the changelog; tarball and notes uploaded as an artifact.
- **publish** (needs ci + verify; `environment: npm`, which requires the repository owner's
  approval, FR-012): creates and pushes the annotated tag if it does not exist yet, then
  `npm publish <tarball> --access public --provenance --tag <latest|next>` (`--dry-run` for a
  rehearsal). The tag is created only after approval, so a rejected or failed check leaves no tag.
- **github-release** (needs publish, not in dry run): `gh release create vX.Y.Z --verify-tag
  --notes-file notes.md` (`--prerelease` for pre-releases, FR-015). Kept as its own job so that
  "Re-run failed jobs" retries only it, never the publish (edge case).

`concurrency: { group: release, cancel-in-progress: false }`.

**Rationale**: GitHub does not start a new workflow run for a tag pushed with `GITHUB_TOKEN`, so
tagging and publishing must happen in the same run (clarified: nobody types the tag). Every check
runs before the approval request, so the maintainer approves only green releases.

**Alternatives considered**: Tag in a separate job before approval: a rejected release would leave
a tag. A PAT to push the tag and trigger a second workflow: a long-lived credential.

## R11. Release safety hardening

**Decision**:

- `permissions: {}` at workflow level in every workflow, then the minimum per job (FR-014):
  `contents: read` by default; `contents: write` only for tag push, PR branch push and release
  creation; `pull-requests: write` only in `bump.yml`; `actions: write` only to dispatch CI;
  `id-token: write` only in `publish` and the Pages deploy; `pages: write` only in deploy.
- Every third-party action pinned to a full commit SHA with the version in a comment;
  `actions/checkout` with `persist-credentials: false` except where the job pushes.
- The `npm` environment: required reviewer = repository owner, self-review allowed (clarified),
  deployment branches and tags limited to `main` and `v*`.
- Guide setup steps: a tag ruleset protecting `v*` tags from update and deletion; GitHub
  "immutable releases" turned on; private vulnerability reporting turned on.
- Pre-releases publish with the `next` dist-tag, stable with `latest` (FR-016); the dist-tag is
  derived from the version (a `-` means pre-release), never typed.

## R12. Documentation deploy workflow

**Decision**: `.github/workflows/pages.yml`:

- Triggers: `push` to `main` and `pull_request`, both filtered to paths that affect the site
  (`docs/**`, `docmd.config.js`, `scripts/build-site.js`, `src/**`, `bin/**`, `specs/**`,
  `.specify/**`, `package.json`, `pnpm-lock.yaml`, the workflow itself), plus `workflow_dispatch`
  (FR-022, and "no needless rebuild").
- Job **build** (always): `pnpm install --frozen-lockfile`, `pnpm run docs:build`,
  `pnpm exec docmd validate`; uploads with `actions/upload-pages-artifact`.
- Job **deploy** (only on `main`/dispatch, not PRs): `actions/deploy-pages`, environment
  `github-pages`.
- `concurrency: { group: pages, cancel-in-progress: false }`: GitHub keeps only the newest pending
  run, and a running deploy is never cut off (FR-024). A failed build never reaches deploy, so the
  live site stays (FR-024, edge case).

**Rationale**: GitHub's own Pages actions deploy an artifact without a `gh-pages` branch. If
Pages is not enabled with source "GitHub Actions", `deploy-pages` fails with an explicit error
(edge case); the guide covers the one-time setting.

## R13. Open-source project health files

**Decision**: `CONTRIBUTING.md` (how to propose changes, the Spec Kit flow, quality gates, links
to `DEVELOPMENT.md`), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md` (supported
versions: the latest 1.x minor; report through GitHub private vulnerability reporting),
`.github/ISSUE_TEMPLATE/` (`bug_report.yml`, `feature_request.yml`, `config.yml` with blank issues
off and a contact link to the private advisory form), `.github/pull_request_template.md` (the
constitution's Quality Gates as a checklist), `.github/dependabot.yml` (weekly, `npm` and
`github-actions`, minor/patch grouped). README gains badges (CI, npm version, license) and links
to the docs site and the dashboard. `package.json` gains `repository`, `homepage`, `bugs`,
`keywords`, `author`, `publishConfig`.

The Code of Conduct needs an enforcement contact. It is left for the maintainer to fill in
(task marked as needing their input); the plan does not publish a personal address.

## R14. How this feature is tested (constitution §IV, §V)

**Decision**:

- **Unit** (`node:test`, no I/O): `scripts/release/*` pure functions — next version, changelog
  release/notes/link rewriting, release-commit decision, verify rules, pack allowed list;
  `scripts/build-site.js` path derivation; the new `--home` option in `args.js` and `layout.js`.
- **E2E** (Playwright, new `tooling` project in Chromium, test names `003 USn FR-xxx …`):
  - `release-package.spec.js` (US1): pack, check contents, install the tarball into a temp
    folder, run `npx speckit-eye --serve` on a fixture copy, load the overview.
  - `release-flow.spec.js` (US2): run `release.js bump/verify/notes` on a temp copy of the repo
    files, and each deliberately broken input (SC-003) ends with a non-zero exit and nothing
    written.
  - `site.spec.js` (US3, US4): `pnpm run docs:build`, serve `site/` under `/speckit-eye/`, check
    home links, navigation to every guide, crawl for broken internal links (SC-006), open
    `/status/`, see the overview with counts matching `specs/` (SC-007), follow "Home" back.
  - `repo-health.spec.js` (US5): community files, templates, README badges and links exist.
- **Workflow rehearsal** (manual, quickstart): a `dry-run` release dispatch before the real 1.0.0.

**Rationale**: Workflow YAML itself cannot be unit tested; keeping every decision in tested
scripts leaves the YAML as wiring. The `tooling` project runs these suites once, not in every
browser engine.
