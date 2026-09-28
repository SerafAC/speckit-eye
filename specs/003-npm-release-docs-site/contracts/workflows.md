# Contract: GitHub Actions workflows

All workflows: `permissions: {}` at the top, minimum per job; third-party actions pinned to a
commit SHA (`# vN.N.N` comment); `pnpm install --frozen-lockfile`; `actions/checkout` with
`persist-credentials: false` unless the job pushes. Research R9–R12.

## `ci.yml` (changed)

| Trigger | Notes |
|---|---|
| `push`, `pull_request` | unchanged |
| `workflow_call` | **new**: `release.yml` runs the full suite on the release commit |
| `workflow_dispatch` | **new**: `bump.yml` starts CI on `release/next` (GITHUB_TOKEN pushes start no workflows) |

Jobs unchanged (unit Node 22/24, E2E on 3 OSes, WSL) plus the new `tooling` Playwright project in
the E2E job. Job permissions: `contents: read`.

## `bump.yml` (new)

- Trigger: `workflow_dispatch` only, inputs:
  `kind` (choice: `patch`, `minor`, `major`, `prepatch`, `preminor`, `premajor`, `prerelease`,
  `explicit`), `version` (string, required when `kind` = `explicit`), `preid` (string, default `rc`).
- Runs on `main` only (fails otherwise).
- Steps: checkout `main` → `release.js bump` → commit `chore(release): vX.Y.Z` as
  `github-actions[bot]` → force-push `release/next` → create PR `Release vX.Y.Z` (base `main`) or
  edit the open one → `gh workflow run ci.yml --ref release/next`.
- PR body: the release notes (`release.js notes`) and the reminder that merging tags and starts
  the release, which waits for approval.
- Permissions: `contents: write`, `pull-requests: write`, `actions: write`.
- `concurrency: bump` (no parallel bumps).

## `release.yml` (new)

| Trigger | Condition |
|---|---|
| `push` to `main` | paths `package.json`, `CHANGELOG.md` |
| `push` tags `v*` | tag pushed by hand (recovery) |
| `workflow_dispatch` | must be run on a tag ref; no inputs (re-runs the release for that tag; there is no dry-run mode) |

| Job | Needs | Permissions | Environment | Does |
|---|---|---|---|---|
| `prepare` | — | `contents: read`, `pull-requests: read` | — | `release.js release-commit` (push-main) or tag from ref; outputs `release`, `version`, `tag`, `sha`, `dist-tag` |
| `ci` | prepare (release) | `contents: read` | — | `uses: ./.github/workflows/ci.yml` |
| `verify` | prepare (release) | `contents: read` | — | ancestor of `origin/main`; `release.js verify`; not on npm; `pnpm pack`; `release.js pack-check`; `release.js notes`; upload artifact `release` (tarball, notes) |
| `publish` | ci, verify | `contents: write`, `id-token: write` | `npm` (owner approval) | create + push annotated tag if missing; Node 24; `npm publish <tgz> --access public --provenance --tag <dist-tag>` |
| `github-release` | publish | `contents: write` | — | `gh release create <tag> --verify-tag --title <tag> --notes-file notes.md [--prerelease]` |

`concurrency: { group: release, cancel-in-progress: false }`.

Secrets: `NPM_TOKEN` in environment `npm` only for the first publish (research R7); the job maps
it to `NODE_AUTH_TOKEN` and npm prefers OIDC when a trusted publisher is configured.

## `pages.yml` (new)

| Trigger | Condition |
|---|---|
| `push` to `main` | paths `docs/**`, `docmd.config.js`, `scripts/build-site.js`, `src/**`, `bin/**`, `specs/**`, `.specify/**`, `package.json`, `pnpm-lock.yaml`, `.github/workflows/pages.yml` |
| `pull_request` | same paths (build + validate only) |
| `workflow_dispatch` | — |

| Job | Permissions | Does |
|---|---|---|
| `build` | `contents: read` | install; `pnpm run docs:build`; `pnpm exec docmd validate`; `actions/upload-pages-artifact` (path `site`) |
| `deploy` (not on PRs) | `pages: write`, `id-token: write` | `actions/deploy-pages`, environment `github-pages` |

`concurrency: { group: pages, cancel-in-progress: false }`.

## `dependabot.yml` (new)

`npm` and `github-actions` ecosystems, weekly, minor + patch updates grouped per ecosystem.
