# Releasing speckit-eye

A release takes three actions from the maintainer: start **Bump version**,
merge the pull request it opens, and approve the release. Everything else,
the tag, the checks, the npm publish and the GitHub release, is done by
GitHub Actions. Nobody runs `npm publish` or types a tag in the normal
process; `npm publish` from a working copy is refused by the package's
`prepublishOnly` script.

```text
 Actions → Bump version (on main)
   │  release.js bump: package.json version + CHANGELOG.md section
   ▼
 PR "Release vX.Y.Z" from release/next  ── CI runs on it
   │  review, merge
   ▼
 Release workflow (push to main)
   ├─ prepare   is this a merge from release/next with a new version?
   ├─ ci        full unit + E2E suites on the release commit
   ├─ verify    on main · tag = package.json = changelog · not on npm yet
   │            · pnpm pack + package contents check · release notes
   ▼
 approval       environment "npm": the repository owner reviews the run
   ▼
 publish        create and push tag vX.Y.Z · npm publish the checked tarball
   │            with provenance, dist-tag latest or next
   ▼
 github-release vX.Y.Z with the changelog section as notes
```

The pieces:

- [`scripts/release/release.js`](https://github.com/SerafAC/speckit-eye/blob/main/scripts/release/release.js):
  the rules (next version, changelog rewrite, checks). It runs locally too,
  for example `node scripts/release/release.js notes --version 1.0.0`.
- [`.github/workflows/bump.yml`](https://github.com/SerafAC/speckit-eye/blob/main/.github/workflows/bump.yml):
  **Bump version**, opens or updates the release pull request.
- [`.github/workflows/release.yml`](https://github.com/SerafAC/speckit-eye/blob/main/.github/workflows/release.yml):
  **Release**, checks, tags, publishes and creates the GitHub release.

## One-time setup

Do these once, before the first release. All of them are repository or npm
settings; none of them is stored in the code.

1. **The npm name.** `npm view speckit-eye` must answer `E404` (the name is
   free) or show a package you own. If someone else has taken it, see
   [The npm name is taken](#the-npm-name-is-taken).
2. **The `npm` environment.** Settings → Environments → New environment
   `npm`:
   - Required reviewers: the repository owner only. Leave "Prevent
     self-review" off, so the owner can approve releases they started.
     Adding more reviewers later changes nothing else in the process.
   - Deployment branches and tags: "Selected branches and tags", add the
     branch rule `main` and the tag rule `v*`.
3. **The first-release token.** On npmjs.com → Access Tokens → Generate New
   Token → Granular Access Token: packages and scopes "Read and write",
   expiration 1 day. Add it as the **environment** secret `NPM_TOKEN` of the
   `npm` environment (not as a repository secret), so only an approved
   release job can read it. You delete it right after the first release (see
   [The first release](#the-first-release)). If npm lets you configure a
   trusted publisher for a package that does not exist yet by the time you
   release, skip the token and configure the trusted publisher now instead.
4. **Pull requests from Actions.** Settings → Actions → General → Workflow
   permissions: turn on "Allow GitHub Actions to create and approve pull
   requests". **Bump version** needs it to open the release pull request.
5. **GitHub Pages.** Settings → Pages → Build and deployment → Source:
   "GitHub Actions".
6. **Protect the version tags.** Settings → Rules → Rulesets → New tag
   ruleset: target `v*`, enforcement "Active", rules "Restrict updates" and
   "Restrict deletions". A published version's tag can then not be moved or
   removed.
7. **Immutable releases.** Settings → General → Releases: turn on immutable
   releases, so a published GitHub release and its assets cannot be changed.
8. **Private vulnerability reporting.** Settings → Security → turn on
   "Private vulnerability reporting".

## Cutting a release

1. Check that `## [Unreleased]` in
   [`CHANGELOG.md`](https://github.com/SerafAC/speckit-eye/blob/main/CHANGELOG.md)
   lists what the release contains. Every user-visible change adds its line
   there when it is merged; **Bump version** refuses to run on an empty
   Unreleased section.
2. Actions → **Bump version** → Run workflow, on branch `main`. Choose the
   kind:

   | Kind | From `1.2.3` | Use for |
   |---|---|---|
   | `patch` | `1.2.4` | fixes only |
   | `minor` | `1.3.0` | new features, nothing breaks |
   | `major` | `2.0.0` | breaking changes |
   | `explicit` | the version you type | the first release (`1.0.0`), or a version the kinds cannot express |

   The run updates `version` in `package.json`, moves the Unreleased entries
   under `## [X.Y.Z] - <today>`, rewrites the comparison links at the bottom of
   the changelog, commits `chore(release): vX.Y.Z` to the branch
   `release/next` and opens the pull request **Release vX.Y.Z**, with the
   release notes as its description, and starts CI on it. Running it again
   before merging replaces the branch and updates the same pull request.
3. Review the pull request: the version, the dated changelog section and the
   green CI checks. Merge it.
4. The merge starts **Release**. `prepare`, `ci` and `verify` run by
   themselves; then the `publish` job waits for approval. Open the run,
   choose "Review deployments", tick `npm` and approve. Every check has
   already passed at this point.
5. After approval the run creates the annotated tag `vX.Y.Z` on the merge
   commit, publishes the tarball that `verify` checked, and creates the
   GitHub release. Then [verify the release](#verifying-a-release).

## Cutting a pre-release

Use a pre-release to let people try a version before it becomes the default
install. In **Bump version**, choose one of:

| Kind | From `1.2.3` | From `1.3.0-rc.1` |
|---|---|---|
| `prepatch` | `1.2.4-rc.0` | `1.3.1-rc.0` |
| `preminor` | `1.3.0-rc.0` | `1.4.0-rc.0` |
| `premajor` | `2.0.0-rc.0` | `2.0.0-rc.0` |
| `prerelease` | `1.2.4-rc.0` | `1.3.0-rc.2` |

`preid` (default `rc`) names the pre-release, for example `beta` gives
`1.3.0-beta.0`; `prerelease` with another id than the current one starts again
at `.0`. Merge and approve as for a normal release.

A version with a `-` is published under the npm dist-tag `next`, never
`latest`, and its GitHub release is marked as a pre-release. `npx speckit-eye`
keeps installing the latest stable version. To try the pre-release:

```sh
npx speckit-eye@next --serve .
npx speckit-eye@1.3.0-rc.0 --serve .     # or name the exact version
```

To finish a pre-release, bump with `patch`, `minor` or `major`: from
`1.3.0-rc.1`, `patch` and `minor` give `1.3.0`, `major` gives `2.0.0`.

## The first release

The first release publishes `1.0.0`, the version already in `package.json`.

1. Finish the [one-time setup](#one-time-setup), including the `NPM_TOKEN`
   environment secret.
2. Actions → **Bump version**, kind `explicit`, version `1.0.0`. The version
   does not change; the changelog gets its `## [1.0.0]` section.
3. Merge the pull request and approve the release as usual. The npm CLI
   uses `NPM_TOKEN` because no trusted publisher exists yet.
4. Right after `1.0.0` is on npm, switch to trusted publishing, so no
   publish credential is stored anywhere:
   1. On npmjs.com → the `speckit-eye` package → Settings → Trusted
      Publisher → GitHub Actions: organization or user `SerafAC`,
      repository `speckit-eye`, workflow filename `release.yml`, environment
      `npm`.
   2. In the same settings, Publishing access: "Require two-factor
      authentication and disallow tokens".
   3. Revoke the granular token on npmjs.com → Access Tokens.
   4. Delete the `NPM_TOKEN` secret from the `npm` environment.

The workflow does not change: the npm CLI tries trusted publishing (OIDC)
first and uses the token only when there is no trusted publisher. From the
second release on, publishing uses a short-lived identity token issued to the
approved `publish` job.

## Verifying a release

After the run is green, check that everything names the same version:

```sh
npm view speckit-eye version        # X.Y.Z (a stable release)
npm view speckit-eye dist-tags      # latest: X.Y.Z, and next: for a pre-release
git fetch --tags && git show vX.Y.Z --no-patch   # the tag is on the merge commit
```

- On `https://www.npmjs.com/package/speckit-eye`, the version shows a
  **Provenance** section that links to the `release.yml` run and the commit
  it was built from.
- In any project that installed the package, `npm audit signatures` reports
  verified registry signatures and attestations for `speckit-eye`.
- The GitHub release `vX.Y.Z` exists and its notes are the version's
  changelog section (marked as a pre-release for a `-` version).
- `CHANGELOG.md` on `main` has an empty `## [Unreleased]`, the
  `## [X.Y.Z] - <date>` section and the updated links at the bottom.
- `npx speckit-eye@X.Y.Z --version` prints `X.Y.Z`.

## When something goes wrong

Nothing is tagged or published before the approval, so a failure before it
leaves nothing to clean up.

### A check failed

A `ci` or `verify` step failed. The run stops before the approval
and nothing is published. The failing step names the check, for example
`tag v1.2.0 does not match package.json version 1.1.0` or
`speckit-eye@1.2.0 is already on npm`.

- A flaky test or an outage: open the run and choose "Re-run failed jobs".
- A real problem in the code: fix it with a normal pull request to `main`.
  The version is not out yet, so if the fix is user-visible, add its entry
  to the `## [X.Y.Z]` section, not to Unreleased. Then release the fixed
  commit by pushing its tag by hand (see below).

### The approval was rejected

Nothing was tagged or published. To release the same commit later, open the
rejected run and choose "Re-run all jobs", or push the tag by hand.

### The publish succeeded but the GitHub release failed

Open the run and choose "Re-run failed jobs". Only `github-release` runs
again; the publish is never repeated.

### A tag pushed by hand

Pushing a `v*` tag starts **Release** on that tag,
with every check: the commit must be on `main`, `package.json` and the newest
changelog section must name the tag's version, and the version must not be
on npm. This is also the way to release a commit when the automatic run
did not:

```sh
git switch main && git pull
git tag -a vX.Y.Z -m vX.Y.Z      # on the commit to release
git push origin vX.Y.Z
```

A tag pushed by mistake publishes nothing unless you approve it: reject the
run. The tag ruleset blocks deleting it; to remove it, disable the ruleset,
delete the tag, and enable the ruleset again.

### Re-running a release

Actions → **Release** → Run workflow, and under
"Use workflow from" choose the tag `vX.Y.Z` (the workflow refuses to run on a
branch). It runs every check again, so a version that is already on npm
fails in `verify`.

### Rehearsing a release

There is no dry-run mode. The rehearsal is the real
run up to the approval step: all checks have run by then, and rejecting the
approval publishes nothing and leaves no tag.

### A broken version was published

npm versions cannot be reused, even
after an unpublish, so never unpublish and never republish the same number.
Deprecate the version, then ship a fixed patch release:

```sh
npm deprecate speckit-eye@X.Y.Z "Broken: <reason>. Use X.Y.(Z+1) or later."
```

Anyone installing that exact version then sees the message. If the broken
version is the `latest` dist-tag, the patch release moves `latest` on.

### The npm name is taken

If `npm view speckit-eye` shows a package you do
not own, the release fails in `verify` (the version is already on npm) or in
`publish` (no permission), and nothing is published. Choose another name, for example the scoped `@serafac/speckit-eye`:
change `name` in `package.json` and the `npx` commands in `README.md` and
`docs/`, add a changelog entry, and release again.

## Why it is safe

- **Only a reviewed merge releases** (FR-009). **Release** publishes only a
  commit merged from `release/next` whose tag does not exist yet, or a `v*`
  tag; the commit must be on `main`. A hand-edited version in any other pull
  request does not release. The tag is created by the release run itself.
- **Versions agree and are new** (FR-010). The tag, `package.json` and the
  newest changelog section must name the same version, the section must have
  entries, and the version must not exist on npm.
- **What is tested is what is published** (FR-011, FR-017). The full unit and
  E2E suites run on the release commit; the tarball is packed once, its file
  list is checked, and exactly that file is published. Every install uses the
  committed lockfile (`pnpm install --frozen-lockfile`).
- **A person approves every publish** (FR-012). The `publish` job runs in the
  `npm` environment, whose only required reviewer is the repository owner,
  and only after every check has passed.
- **No stored publish credential** (FR-013). Publishing uses npm trusted
  publishing with a short-lived identity token; the package carries
  verifiable build provenance. The one-day token of the first release is
  revoked right after it.
- **Least privilege** (FR-014). Every workflow starts with no permissions and
  each job gets only what it needs (`id-token: write` only in `publish`).
  Third-party actions are pinned to full commit SHAs.
- **Release notes come from the changelog** (FR-015). The GitHub release
  notes are the version's changelog section.
- **Pre-releases never become the default install** (FR-016). The dist-tag is
  derived from the version: `next` for a version with a `-`, else `latest`.
- **Published history is fixed.** Tag rules stop `v*` tags from being moved
  or deleted, immutable releases stop GitHub releases from being edited, and
  npm never reuses a version number.
