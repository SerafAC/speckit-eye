# Contract: `scripts/release/release.js`

Development-only script (not in the published package). All rules live in pure, exported
functions; `main(argv, io)` wires them to injected `readFile`/`writeFile`/`stdout`/`stderr`/`now`
and is unit tested with fakes. The file ends with a one-line entry point.

Run from the repository root: `node scripts/release/release.js <command> [options]`.
Files read/written: `package.json`, `CHANGELOG.md` (relative to the current directory).

## Commands

### `bump <kind> [--preid <id>] | bump --version <X.Y.Z>`

- `<kind>`: `patch | minor | major | prepatch | preminor | premajor | prerelease`
  (see [data-model.md → Next version](../data-model.md#version)). `--preid` default `rc`.
- `--version` sets an explicit version (first release: `1.0.0`). Exactly one of `<kind>` and
  `--version` is required.
- Writes `package.json` (`version` only; 2-space JSON + trailing newline, other keys untouched)
  and `CHANGELOG.md` (data-model changelog rules). Date = current UTC date.
- stdout: the new version, one line (used by `bump.yml` for the branch/PR title).
- Errors (exit 1, nothing written): Unreleased section missing or empty; invalid kind or
  version; `--version` equal to an already released changelog section; malformed changelog
  (no `# Changelog` / `## [Unreleased]`).

### `verify --tag <vX.Y.Z>`

- Checks: tag format; `package.json` version = tag without `v`; the newest `## [X.Y.Z]` section
  in `CHANGELOG.md` has that version, a valid date, and at least one entry.
- stdout on success, `key=value` lines for `$GITHUB_OUTPUT`:
  `version=X.Y.Z`, `tag=vX.Y.Z`, `prerelease=true|false`, `dist-tag=latest|next`.
- Errors: exit 1, stderr names the failed check (`tag v1.2.0 does not match package.json version 1.1.0`).

### `notes --version <X.Y.Z>`

- stdout: the body of that version's changelog section (for `gh release create --notes-file`).
- Error exit 1 if the section does not exist.

### `release-commit --version <X.Y.Z> --head-ref <branch|""> --tag-exists <true|false>`

- Decides whether a push to `main` is a release commit (research R10): head ref is
  `release/next`, the tag does not exist, and `CHANGELOG.md` has a `## [X.Y.Z]` section.
- stdout: `release=true|false` and, when false, `reason=<text>`. Always exit 0.

### `pack-check <file-list.json>`

- Input: the JSON written by `npm pack --dry-run --json` (or `pnpm pack --json`) — the `files[].path` list.
- Allowed: `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`, `bin/speckit-eye.js`,
  `src/**/*.js` except `src/styles/**`, `dist/styles.css`, `dist/fonts/*.woff2`,
  `dist/fonts/OFL-*.txt`. Required: each of the fixed files, at least one `src/`, one `.woff2`.
- Errors: exit 1, stderr lists each unexpected file and each missing required file.
