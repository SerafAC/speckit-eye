# Quickstart: validating the release and documentation feature

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Scenarios 1–4 run locally (Node ≥ 22, `pnpm install --frozen-lockfile`, Chromium). Scenarios 5–7
need the GitHub repository and run once, by the maintainer, around the first release. Command
details: [contracts/release-cli.md](./contracts/release-cli.md),
[contracts/workflows.md](./contracts/workflows.md), [contracts/site.md](./contracts/site.md).

## 1. Automated tests

```sh
pnpm test                                   # unit tests, including scripts/release and --home
pnpm run test:e2e --project tooling         # 003 suites: package, release flow, site, repo health
pnpm run test:e2e --project chromium        # existing suites still pass (no change without --home)
```

Expected: all pass.

## 2. The package (US1)

```sh
pnpm pack --json > pack.json
node scripts/release/release.js pack-check pack.json     # exit 0, no output on stderr
```

Install `speckit-eye-1.0.0.tgz` into an empty temporary folder and run
`npx speckit-eye --serve <copy of tests/fixtures/projects/mixed>`: it prints a `Local:` address
serving the overview (`40 / 65 tasks (62 %)`).

## 3. The release scripts on a scratch copy (US2)

In a temporary copy of `package.json` and `CHANGELOG.md`:

| Run | Expected |
|---|---|
| `release.js bump --version 1.0.0` | prints `1.0.0`; `CHANGELOG.md` has an empty Unreleased and `## [1.0.0] - <today>` with the former entries; link lines at the bottom |
| same command again | exit 1: Unreleased is empty |
| `release.js verify --tag v1.0.0` | `version=1.0.0`, `dist-tag=latest` |
| `release.js verify --tag v1.0.1` | exit 1, names the mismatch |
| add an entry, `release.js bump preminor` | prints `1.1.0-rc.0`; `verify --tag v1.1.0-rc.0` prints `dist-tag=next` |

## 4. The site (US3, US4)

```sh
pnpm run docs:build && pnpm exec docmd validate
```

Serve `site/` under `/speckit-eye/` (the `site.spec.js` suite does this) and check: the home page
links to every guide, npm, GitHub and "Project status & live demo"; `/speckit-eye/status/` shows
the overview of this repository with the same counts as `specs/`; its sidebar "Home" link returns
to the docs home.

## 5. One-time setup (maintainer, before the first release)

Follow `docs/releasing.md` → "One-time setup": `npm` environment with the owner as required
reviewer, `NPM_TOKEN` (1-day granular token) in that environment, "Allow GitHub Actions to create
and approve pull requests", Pages source "GitHub Actions", tag ruleset for `v*`, immutable
releases, private vulnerability reporting.

## 6. Rehearsal and first release

1. Actions → **Bump version** → kind `explicit`, version `1.0.0`. Expected: PR "Release v1.0.0"
   from `release/next`, CI checks running on it.
2. Merge the PR. Expected: **Release** run starts; `prepare` says it is a release; `ci` and
   `verify` pass; `publish` waits for approval.
3. Review the pending run: every check has already run, so this is the rehearsal. Rejecting it
   leaves no tag and publishes nothing.
4. Approve. Expected: tag `v1.0.0` exists; `npm view speckit-eye version` → `1.0.0`; the npm page
   shows provenance; the GitHub release `v1.0.0` has the changelog section as notes (SC-004).
5. Configure the trusted publisher on npmjs.com, disallow tokens, revoke the token, delete
   `NPM_TOKEN` (research R7).

## 7. Negative checks (SC-003)

- Push a tag `v9.9.9` by hand on `main`: the run fails in `verify` (version mismatch); nothing is
  published; delete the tag afterwards.
- Dispatch **Release** on tag `v1.0.0` again: `verify` fails ("already on npm").
- Start **Bump version** with an empty Unreleased: the run fails, no PR.
