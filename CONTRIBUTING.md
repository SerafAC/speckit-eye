# Contributing to speckit-eye

Thank you for helping. This guide explains how to report a problem, propose a
change, and what a pull request needs before it can be merged. Please also
read the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug or proposing a feature

Open an [issue](https://github.com/SerafAC/speckit-eye/issues/new/choose) and
pick a template:

- **Bug report**: what you ran, what happened and what you expected, with your
  speckit-eye, Node.js and OS versions.
- **Feature request**: the problem you want solved, your proposed solution and
  the alternatives you considered.

Do not report security vulnerabilities in a public issue. Follow the
[security policy](SECURITY.md) instead.

## How changes are made: the Spec Kit flow

speckit-eye is built with [GitHub Spec Kit](https://github.com/github/spec-kit),
the tool it visualizes. Every feature goes through the same steps, and each
step leaves a document in `specs/<number>-<name>/`:

1. **specify**: `spec.md`, the user stories and requirements (`FR-xxx`);
2. **clarify** (optional): open questions answered and written back into the spec;
3. **plan**: `plan.md` and the design documents (research, data model, contracts);
4. **tasks**: `tasks.md`, the ordered task list;
5. **implement**: the code, tests and documentation, task by task.

For a small fix, an issue and a pull request are enough. For a new feature,
start with an issue so the idea can be discussed before a spec is written.

## Quality gates

The project's rules are in the [constitution](.specify/memory/constitution.md).
A change is merged only when it passes its Quality Gates:

1. All unit tests pass (§IV).
2. All end-to-end tests pass, and every major requirement touched has
   end-to-end coverage (§V).
3. `CHANGELOG.md` is updated for user-visible changes (§VI).
4. `docs/`, `README.md` and `DEVELOPMENT.md` are updated where affected (§VII–IX).
5. No unjustified complexity, speculative code or duplicated knowledge (§I–III).

The pull request template repeats these as a checklist.

## Development setup, tests and conventions

See [DEVELOPMENT.md](DEVELOPMENT.md).

## Commit messages

Follow the style already in the history: a type, an optional scope in
parentheses, and a short summary in the imperative mood, for example
`docs(003-npm-release-docs-site): clarify dashboard lives at /status/` or
`chore: require Tailwind 4.1`. Common types are `feat`, `fix`, `docs`, `test`
and `chore`; the scope is usually the feature folder under `specs/`.

## Releases

Releases are cut by the maintainers, following
[docs/releasing.md](docs/releasing.md). Contributors do not change the version
in `package.json`; add your changelog entry under `## [Unreleased]` in
`CHANGELOG.md`.
