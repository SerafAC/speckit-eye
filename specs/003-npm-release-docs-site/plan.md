# Implementation Plan: First npm Release, Safe Release Automation, and Documentation Site with Live Project Dashboard

**Branch**: `003-npm-release-docs-site` (spec directory; development happens on `claude/speckit-production-release-byduti`) | **Date**: 2026-09-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-npm-release-docs-site/spec.md`

## Summary

Make speckit-eye installable from npm as `1.0.0` and make every release go through one guarded
path: a manual **Bump version** workflow opens a PR that updates `package.json` and moves the
changelog's Unreleased entries under the new version; merging it starts the **Release** workflow,
which runs the full CI, checks that tag, version and changelog agree, packs and checks the tarball,
then waits for the repository owner's approval before it tags, publishes that exact tarball with
npm provenance (trusted publishing; a one-day token only for the very first publish), and creates
the GitHub release from the changelog. All release rules live in one unit-tested script,
`scripts/release/release.js`; the workflow YAML is only wiring.

Alongside, `docs/` becomes a docmd site on GitHub Pages, rebuilt from `main` whenever something
it shows changes, with this repository's own speckit-eye dashboard at `/status/` as project status
and live demo, linked from the README and the docs home. The dashboard links back to the docs
through a new, optional `--home <url>` build option. The repository gains the usual open-source
files (contributing, code of conduct, security policy, issue/PR templates, Dependabot, badges).

## Technical Context

**Language/Version**: JavaScript (ES modules), Node.js ≥ 22 (unchanged). Release publish job on
Node 24 (npm ≥ 11.5.1 for trusted publishing, research R7).

**Primary Dependencies**: Runtime: `markdown-it` only (unchanged). Dev, new: `@docmd/core`
0.9.7, pinned exactly (R2). No release tooling dependency: version arithmetic and changelog
handling are in `scripts/release/release.js` (R9). CI: GitHub Actions, `gh` CLI (preinstalled),
`actions/upload-pages-artifact`, `actions/deploy-pages`, all pinned by SHA (R11).

**Storage**: None. Files: `package.json` (version), `CHANGELOG.md` (sections), git tags,
npm registry, GitHub releases, GitHub Pages artifact.

**Testing**: `node:test` unit tests for the release script, the site build script and `--home`;
Playwright E2E in a new `tooling` project (Chromium only) with suites for the package, the release
flow, the site and repository health (R14); a maintainer rehearsal of the workflows
([quickstart.md](./quickstart.md) §5–7).

**Target Platform**: npm registry (public), GitHub Actions `ubuntu-latest` runners, GitHub Pages
(`https://serafac.github.io/speckit-eye/`).

**Project Type**: CLI tool (single npm package) plus repository automation and a static
documentation site.

**Performance Goals**: Docs change visible on the site ≤ 10 min after merge (SC-005; *measured*
docmd build ≈ 1.4 s, the dashboard build is seconds). Release: maintainer time ≤ 30 min, ≤ 3
manual actions (SC-002); wall time dominated by the existing CI matrix.

**Constraints**: Nothing published unless every check passes (SC-003); no long-lived publish
credential after the first release (FR-013); least-privilege workflow permissions (FR-014);
published package contents unchanged in shape (bin, src without styles, dist css/fonts, README,
CHANGELOG, LICENSE); dashboard pages without `--home` byte-identical to today.

**Scale/Scope**: 4 workflows (1 changed, 3 new) + Dependabot; 2 scripts; 1 CLI option;
2 new docs pages; 6 community files; 4 E2E suites.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Pre-research | Post-design | How the design complies |
|---|---|---|---|---|
| I | Simplicity First (KISS) | ✅ with justification | ✅ | One release script with small subcommands instead of changesets/release-please/semantic-release (R9). One release workflow (R10). docmd with a ~20-line config (R3). New dev dependency `@docmd/core` justified below. |
| II | YAGNI | ✅ | ✅ | Only spec FRs. `--home` has no label/target variants (R6). No custom domain, no docs versioning, no docmd AI/analytics plugins (R3). No release bot app, no PAT (R9, R10). |
| III | DRY | ✅ | ✅ | Version only in `package.json`; site URL only in `package.json` `homepage`, from which docmd `url`, dashboard `--base` and `--home` are derived (data-model). Repository URL only in `package.json` `repository` (changelog links). CI defined once and reused by the release via `workflow_call`. Release guide in `docs/releasing.md`; `DEVELOPMENT.md` summarizes and links; `CONTRIBUTING.md` links to `DEVELOPMENT.md`. The pack allowed list is a test oracle for `files`, not a second definition (R8). |
| IV | Unit tests for all code | ✅ | ✅ | `release.js` and `build-site.js` export pure functions and a `main(argv, io)` with injected I/O; one-line entry points only. `--home` covered in `args.test.js` and `layout.test.js`. Workflow YAML holds no logic beyond calling tested commands (R14). |
| V | E2E coverage of major requirements | ✅ | ✅ | One E2E suite per story: `release-package` (US1), `release-flow` (US2), `site` (US3 + US4), `repo-health` (US5); names start `003 USn FR-xxx`. The workflows themselves are validated by the maintainer rehearsal recorded in the tasks. |
| VI | SemVer + CHANGELOG | ✅ | ✅ | This feature *implements* §VI: bump moves Unreleased to a dated section, tags `vX.Y.Z`. First release `1.0.0` (clarified). New entries for the npm package, `--home`, the docs site under Unreleased (FR-032). |
| VII | Docs under ./docs | ✅ | ✅ | `docs/index.md`, `docs/releasing.md` new; `docs/usage.md`/`hosting.md` document `--home`; `docs/architecture.md` gains release and site sections; spec links made absolute (R4). |
| VIII | README user-facing | ✅ | ✅ | Badges, docs site and dashboard links, npm install; no developer content added. |
| IX | DEVELOPMENT.md | ✅ | ✅ | Release section → summary + link to `docs/releasing.md`; `docs:build`; the `tooling` Playwright project; `scripts/release/` in the structure; `003` E2E naming. |

**Gate result**: PASS. Additions recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/003-npm-release-docs-site/
├── plan.md                # This file
├── research.md            # Phase 0: decisions R1–R14
├── data-model.md          # Phase 1: Version, Changelog section, Release run, Documentation site
├── quickstart.md          # Phase 1: validation scenarios 1–7
├── contracts/
│   ├── release-cli.md     # scripts/release/release.js commands, outputs, errors
│   ├── workflows.md       # ci / bump / release / pages / dependabot: triggers, jobs, permissions
│   ├── site.md            # docs:build, URL layout, home page and README link requirements
│   └── cli-home.md        # the new --home build option (delta to 001 contracts/cli.md)
├── checklists/requirements.md
└── tasks.md               # Phase 2 (/speckit-tasks; not created here)
```

### Source Code (repository root)

Legend: **new**, *changed*, unmarked = unchanged.

```text
package.json                 # *metadata (repository, homepage, bugs, keywords, author), publishConfig,
                             #  scripts docs:build + prepublishOnly guard, devDependency @docmd/core*
pnpm-workspace.yaml          # *allowBuilds: esbuild, @docmd/engine-rust → false*
docmd.config.js              # **new** docmd config (R3)
.gitignore                   # *site/*
README.md                    # *badges, docs site + status links, screenshot paths*
CHANGELOG.md                 # *new Unreleased entries; link definitions at the bottom*
DEVELOPMENT.md               # *release summary + link, docs:build, tooling project, naming*
CONTRIBUTING.md              # **new**
CODE_OF_CONDUCT.md           # **new** Contributor Covenant 2.1
SECURITY.md                  # **new**
scripts/
├── copy-assets.js
├── build-site.js            # **new** docmd build + dashboard build into site/ (contracts/site.md)
└── release/
    └── release.js           # **new** bump / verify / notes / release-commit / pack-check
src/
├── cli/args.js              # *--home option*
├── cli/main.js              # *passes home to the build*
├── render/layout.js         # *Home link in sidebar, rail, mobile menu when home is set*
├── render/icons.js          # *house icon (Lucide)*
└── render/site.js           # *threads home through*
docs/
├── index.md                 # **new** site home
├── releasing.md             # **new** release guide (FR-018)
├── usage.md, hosting.md     # *--home, absolute spec links, reworded example links*
├── architecture.md          # *release + site sections, absolute spec links*
└── assets/                  # **new** screenshot.png, screenshot-dark.png (moved from docs/)
.github/
├── workflows/ci.yml         # *workflow_call, workflow_dispatch, pinned SHAs, permissions, tooling project*
├── workflows/bump.yml       # **new**
├── workflows/release.yml    # **new**
├── workflows/pages.yml      # **new**
├── dependabot.yml           # **new**
├── ISSUE_TEMPLATE/          # **new** bug_report.yml, feature_request.yml, config.yml
└── pull_request_template.md # **new**
tests/
├── unit/release.test.js     # **new**
├── unit/build-site.test.js  # **new**
├── unit/args.test.js, layout.test.js   # *--home cases*
└── e2e/
    ├── release-package.spec.js   # **new** US1
    ├── release-flow.spec.js      # **new** US2
    ├── site.spec.js              # **new** US3, US4
    └── repo-health.spec.js       # **new** US5
playwright.config.js         # *tooling project; the other projects ignore the 003 suites*
specs/001-speckit-eye-dashboard/contracts/cli.md   # *--home row (see contracts/cli-home.md)*
```

**Structure Decision**: Keep the single-package layout. Release logic goes into
`scripts/release/` (development-only, like `scripts/copy-assets.js`, never published); the site
build into `scripts/build-site.js`; the only product change is the `--home` option along the
existing `cli → render` path.

## Implementation Outline

The order follows the spec's priorities; each step leaves the repository releasable or deployable
(details are for `/speckit-tasks`):

1. **Foundation**: package metadata, `publishConfig`, `prepublishOnly` guard, pinned action SHAs and
   permissions in `ci.yml` (+ `workflow_call`, `workflow_dispatch`), `tooling` Playwright project.
2. **US1 package**: `pack-check` + unit tests; `release-package.spec.js`.
3. **US2 release**: `release.js` bump/verify/notes/release-commit + unit tests; `bump.yml`,
   `release.yml`; `release-flow.spec.js`; `docs/releasing.md`; `DEVELOPMENT.md` summary;
   changelog link definitions.
4. **US3 docs site**: docmd dependency + config; `docs/index.md`; screenshot move; absolute spec
   links; `build-site.js` (docmd part) + tests; `pages.yml`; `site.spec.js` (docs part).
5. **US4 dashboard**: `--home` option (args, layout, icons, site, contract, usage/hosting docs,
   tests); dashboard step in `build-site.js`; README and home links; `site.spec.js` (status part).
6. **US5 project health**: community files, templates, Dependabot, badges; `repo-health.spec.js`.
7. **Polish**: CHANGELOG entries, architecture doc, quickstart run, then the maintainer's one-time
   setup and the first release (`1.0.0`) via the workflows.

## Risks

| Risk | Mitigation |
|---|---|
| npm requires the package to exist before a trusted publisher can be configured | One-day granular token in the `npm` environment for 1.0.0 only, then switch and revoke (R7). |
| Bot PRs do not trigger CI | `workflow_dispatch` of `ci.yml` from `bump.yml` (R9); the release reruns full CI anyway (R10). |
| docmd is young (0.x) and may change | Exact pin + lockfile; Dependabot PRs run the site build and link check before merge. |
| The public dashboard exposes all specs | Intended for this public repository; the hosting warning stays for other projects. |
| Code of Conduct needs an enforcement contact | Left for the maintainer to provide (R13); tasks flag it. |

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Dev dependency `@docmd/core` (plus its tree) | FR-020: the user asked for docmd | Hand-written HTML: not a docs framework, more code to maintain. |
| New CLI option `--home` | FR-027: a way back from the dashboard | HTML post-processing is brittle; browser Back fails for visitors arriving from the README (R6). |
| `scripts/release/release.js` (~250 lines) | FR-005–FR-011 rules must be unit tested (§IV) | Logic in YAML/shell cannot be unit tested; release-please/changesets replace the constitution's changelog model (R9). |
| Pack allowed list duplicated from `files` | FR-002: an independent check of the result | Trusting `files` alone cannot catch a wrong `files` entry (R8). |
