# Data Model: First npm Release, Safe Release Automation, and Documentation Site

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

No runtime data is stored. The entities below are files and workflow values; the rules are
enforced by `scripts/release/release.js` (see [contracts/release-cli.md](./contracts/release-cli.md)).

## Version

| Field | Rule |
|---|---|
| `value` | SemVer 2.0 `MAJOR.MINOR.PATCH` with optional pre-release `-<id>.<n>` (id: `rc` by default). No build metadata. Defined only in `package.json` `version` (§III). |
| `tag` | `v` + `value`, e.g. `v1.0.0`. Annotated, points at the release commit. |
| `prerelease` | `true` when `value` contains `-`. |
| `distTag` | `next` when `prerelease`, otherwise `latest` (FR-016). |

**Next version** (`bump`):

| Kind | From `1.2.3` | From `1.3.0-rc.1` |
|---|---|---|
| `patch` | `1.2.4` | `1.3.0` (finishes the pre-release) |
| `minor` | `1.3.0` | `1.3.0` |
| `major` | `2.0.0` | `2.0.0` |
| `prepatch` | `1.2.4-rc.0` | `1.3.1-rc.0` |
| `preminor` | `1.3.0-rc.0` | `1.4.0-rc.0` |
| `premajor` | `2.0.0-rc.0` | `2.0.0-rc.0` |
| `prerelease` | `1.2.4-rc.0` | `1.3.0-rc.2` |
| `--version X` | `X` (must be valid; may equal the current version only if no tag `vX` and no `## [X]` section exist — the first-release case, `1.0.0`) | same |

Uniqueness: a value is released at most once — no existing git tag, no changelog section, not on
npm (npm refuses reuse even after unpublish).

## Changelog section

`CHANGELOG.md` keeps the Keep a Changelog 1.1.0 shape:

```text
# Changelog
<intro>
## [Unreleased]
### Added | Changed | Deprecated | Removed | Fixed | Security
- entries…
## [X.Y.Z] - YYYY-MM-DD
…
[Unreleased]: https://github.com/SerafAC/speckit-eye/compare/vX.Y.Z...HEAD
[X.Y.Z]: https://github.com/SerafAC/speckit-eye/compare/vW...vX.Y.Z   (first release: /releases/tag/vX.Y.Z)
```

| Rule | Where enforced |
|---|---|
| Unreleased must have at least one `- ` entry to bump | `bump` (FR-008) |
| After bump: Unreleased is empty (heading only); the entries sit under `## [X.Y.Z] - <UTC date>` directly below it, sub-headings kept | `bump` (FR-006) |
| The newest released section's version equals `package.json` version and the tag, and is non-empty | `verify` (FR-010) |
| Link definitions: exactly one `[Unreleased]` line comparing the newest tag to `HEAD`, one line per released version | `bump` rewrites them; repository URL from `package.json` `repository` (§III) |
| Release notes = body of the version's section (without its heading) | `notes` (FR-015) |

## Release run

One run of `release.yml` for one version.

```text
            ┌── not a release commit ──► done (nothing happens)
prepare ────┤
            └── release ──► ci ─┐
                           verify ─┴─► awaiting approval ──rejected──► stopped (no tag, nothing published)
                                            │ approved
                                            ▼
                                   tag created (if missing) ──► published to npm ──► GitHub release created
any failing check ─────────────────────────────────────────► failed (names the check; nothing published)
```

| Field | Source |
|---|---|
| `trigger` | `push-main` / `push-tag` / `dispatch` |
| `commit` | head commit (push) or tag target |
| `version`, `tag`, `distTag` | `package.json` (push-main) or the tag name |
| `dryRun` | dispatch input; publishes with `--dry-run`, skips tag and GitHub release |
| `tarball` | artifact `speckit-eye-<version>.tgz` from `verify`, the only file published |
| `notes` | artifact `notes.md` from `verify` |
| `provenance` | attached by npm from the OIDC identity of the `publish` job |

## Documentation site

| Path on the site | Content | Source |
|---|---|---|
| `/` (e.g. `https://serafac.github.io/speckit-eye/`) | docmd home page | `docs/index.md` |
| `/usage/`, `/hosting/`, `/architecture/`, `/releasing/` | guides | `docs/<name>.md` |
| `/assets/…` | docmd assets + screenshots | docmd + `docs/assets/` |
| `/status/…` | speckit-eye static build of this repository | `specs/`, `.specify/` via `bin/speckit-eye.js --build` |

The site URL has one definition: `package.json` `homepage`. The docmd `url`, the dashboard
`--base` (`<path of homepage>status/`) and `--home` (`homepage`) are derived from it.
