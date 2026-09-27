# Feature Specification: First npm Release, Safe Release Automation, and Documentation Site with Live Project Dashboard

**Feature Branch**: `003-npm-release-docs-site` (spec directory; no branch hook is configured — development happens on `claude/speckit-production-release-byduti`)

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Make project open-source production grade quality. Prepare it for first npm release, prepare action to bump version, prepare change log and release it to npm. Prepare guide on how to release version. Ensure release safety. Add documentation in "/docs" and add docmd framework to release it through GitHub pages. Add workflow to build and deploy documentation page from master on change. And also add "speckit-eye" generated page from a project and link it in both README.md and docmd main page. It will show both project status and project demo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Install speckit-eye from npm (Priority: P1)

A Spec Kit user who has never cloned this repository runs the documented one-line
command in their own project folder and gets the dashboard. Today the README tells
them to run `npx speckit-eye`, but no package is published, so the command fails.
After this feature, the first version is published on the public npm registry,
its package page shows what the tool is, links back to the repository, the
documentation site and the issue tracker, and the installed package contains only
what is needed to run.

**Why this priority**: Without a published package the README's main instruction
does not work, and no one outside the repository can use the tool. Everything else
in this feature supports or showcases this.

**Independent Test**: On a clean machine with only Node.js installed, run the
README's command against a Spec Kit project; the dashboard address is printed and
the overview loads. Open the package's registry page and confirm description,
license, repository, homepage and issue links are present.

**Acceptance Scenarios**:

1. **Given** a machine with a supported Node.js version and no copy of the repository, **When** the user runs the README's command in a Spec Kit project folder, **Then** the tool starts and prints an address that serves that project's overview.
2. **Given** the published package, **When** a user views its registry page, **Then** it shows the description, the license, and links to the source repository, the documentation site and the issue tracker.
3. **Given** the published package, **When** its contents are listed, **Then** it contains only the runtime files, the README, the changelog and the license — no tests, fixtures, specs, mockups, workflow files or development configuration.
4. **Given** the published version, **When** a user looks at the registry page and the repository, **Then** the version, the matching git tag, a GitHub release and the matching changelog section all exist and agree.

---

### User Story 2 - Cut a release safely by following one guide (Priority: P1)

A maintainer wants to ship a new version. They open the release guide, choose the
kind of bump (patch, minor or major, or a pre-release), and start the version-bump
automation. It raises the version in the single place it is defined, moves the
changelog's "Unreleased" entries under the new version with today's date, and
proposes the change for review. Once that change is merged and tagged, the
publishing automation checks everything again and publishes to npm. If any check
fails, nothing is published.

**Why this priority**: A release process that depends on memory and manual steps is
how broken or wrong versions reach users. The first release and every later one
must go through the same guarded path.

**Independent Test**: A maintainer who has not released before follows only the
guide to produce a pre-release (or a dry run) and succeeds without outside help;
deliberately broken inputs (failing test, mismatched version, empty changelog
section) each stop the release before anything is published.

**Acceptance Scenarios**:

1. **Given** unreleased changelog entries on the default branch, **When** the maintainer starts the version bump and picks "minor", **Then** a reviewable change is proposed that updates the version and the changelog (new dated section, fresh empty "Unreleased" section, updated comparison links) and nothing else.
2. **Given** the changelog's "Unreleased" section is empty, **When** the maintainer starts a version bump, **Then** the bump stops with a clear message and proposes nothing.
3. **Given** the bump change is merged and a release is triggered, **When** the publishing automation runs, **Then** it verifies that the tag, the package version and the changelog section agree, that all unit and end-to-end tests pass on the tagged commit, and that the package contents match the allowed list, before publishing.
4. **Given** any of those checks fails, **When** the publishing automation runs, **Then** nothing is published to npm, no GitHub release is created, and the failure names the check that failed.
5. **Given** the version to publish already exists on npm, **When** the publishing automation runs, **Then** it stops without publishing and says so.
6. **Given** a successful publish, **When** a user inspects the package, **Then** it carries verifiable provenance linking it to the exact source commit and automation run that built it, and a GitHub release exists whose notes are that version's changelog section.
7. **Given** someone without release rights pushes a tag or triggers the workflow, **When** the publishing automation runs, **Then** it does not publish until an authorized maintainer approves it.

---

### User Story 3 - Read the documentation on a website (Priority: P2)

A prospective or current user opens the project's documentation website. It has a
home page explaining what speckit-eye is, how to install and run it, and navigation
to the existing guides (usage, hosting a snapshot, architecture) plus the release
guide. The same Markdown files under `docs/` that contributors edit are the source
of the website, so the site and the repository never disagree. Whenever
documentation changes on the default branch, the site is rebuilt and redeployed
automatically.

**Why this priority**: The site is how most users will discover and learn the tool,
but the tool is usable from the README alone, so it follows the release.

**Independent Test**: Change a sentence in a file under `docs/`, merge to the
default branch, and within minutes see the change on the public site; every page
is reachable from the navigation and has no broken internal links.

**Acceptance Scenarios**:

1. **Given** the default branch, **When** a change to `docs/` (or the site configuration) is merged, **Then** the documentation site is rebuilt and the public site shows the change without any manual step.
2. **Given** a change that touches nothing the site is built from, **When** it is merged, **Then** the site is not needlessly rebuilt.
3. **Given** the documentation site, **When** a visitor opens the home page, **Then** they can reach every guide under `docs/` through the navigation, and find links to the npm package, the repository and the live project dashboard.
4. **Given** a documentation change that breaks the site build (for example a broken internal link), **When** it is proposed in a pull request, **Then** the check fails before merge and the currently published site stays untouched.
5. **Given** the repository README, **When** a reader looks for documentation, **Then** it links to the documentation website as well as to the files under `docs/`.

---

### User Story 4 - See the project's own status and a live demo (Priority: P2)

A visitor wants to see what speckit-eye looks like on a real project before
installing it, and a contributor wants to see how far this project's own features
are. The documentation website includes a dashboard generated by speckit-eye from
this repository's own `specs/` and `.specify/` folders. It is rebuilt on the same
trigger as the documentation, so it always reflects the default branch. The README
and the documentation home page both link to it as "project status and live demo".

**Why this priority**: It turns the project into its own showcase and status board
at almost no extra cost, but it depends on the documentation site existing.

**Independent Test**: Open the dashboard link from the README and from the
documentation home page; both reach a working speckit-eye overview of this
repository whose feature list and task counts match the repository's `specs/`
folder on the default branch.

**Acceptance Scenarios**:

1. **Given** the published site, **When** a visitor follows the dashboard link from the README or from the documentation home page, **Then** they land on the speckit-eye overview of this repository, with working feature pages, document pages, search, theme switch and task map.
2. **Given** a task is checked off in a `tasks.md` on the default branch, **When** the site is redeployed, **Then** the dashboard's counts reflect the change.
3. **Given** the dashboard is served under a sub-path of the documentation site, **When** a visitor navigates inside it, **Then** all links, styles, fonts and scripts load from that sub-path with no broken links, and navigating back to the documentation is one click away.
4. **Given** the dashboard build uses the speckit-eye code on the default branch, **When** the tool's rendering changes, **Then** the demo shows the latest unreleased behavior (and says so via its generated-at footer and version).

---

### User Story 5 - Contribute to an open-source project with clear rules (Priority: P3)

A newcomer finds the repository and wants to report a bug, propose a change or
report a security problem. The repository offers contribution guidelines, a code of
conduct, a security policy with a private reporting channel, issue templates for
bugs and feature requests, and a pull request template that reminds contributors of
the project's quality gates (tests, changelog, docs). The README shows at a glance
the build status, the latest published version and the license.

**Why this priority**: These make the project trustworthy and maintainable as an
open-source package, but users can install and use the tool without them.

**Independent Test**: From the repository front page, a newcomer can find in under a
minute how to contribute, how to report a vulnerability privately, and what the
current version and CI status are; opening a new issue offers the bug and feature
templates.

**Acceptance Scenarios**:

1. **Given** the repository front page, **When** a newcomer looks for how to contribute, **Then** contribution guidelines, a code of conduct and a security policy are present and linked.
2. **Given** a user opens a new issue, **When** they choose a type, **Then** bug report and feature request templates are offered, and security issues are redirected to the private channel.
3. **Given** a contributor opens a pull request, **When** the description loads, **Then** it contains a checklist of the project's quality gates.
4. **Given** the README, **When** a visitor opens it, **Then** it shows badges for CI status, the latest npm version and the license, each linking to its source.
5. **Given** third-party dependencies and automation actions, **When** new versions or security fixes are published for them, **Then** update proposals are raised automatically on a regular schedule.

---

### Edge Cases

- The bump is started while a previous bump proposal is still open: the new run refuses or updates the existing proposal rather than creating a conflicting second one.
- A tag is pushed that does not match the package version (e.g. `v1.2.0` while the package says `1.1.0`): publishing stops before anything is uploaded.
- A tag is pushed on a commit that is not on the default branch: publishing stops.
- A pre-release version (e.g. `1.1.0-rc.1`) is published: it is published under a pre-release channel so that `npx speckit-eye` still installs the latest stable version.
- npm publishes the package but creating the GitHub release fails: the guide explains how to finish the release without republishing; rerunning the automation does not attempt to publish the same version twice.
- A published version turns out to be broken: the guide explains how to deprecate it and ship a fixed patch version (npm versions cannot be reused).
- The package name is already taken on npm when the first release is attempted: the release stops before publishing, and the guide lists this as a first-release precondition.
- The documentation build succeeds but the dashboard build fails (for example a malformed `tasks.md`): the deployment fails as a whole and the previously published site stays online.
- Two documentation changes are merged in quick succession: only the latest one ends up deployed, and deployments never run over each other.
- GitHub Pages is not yet enabled for the repository: the guide lists enabling it as a one-time setup step, and the deploy workflow fails with a clear message instead of silently doing nothing.
- The dashboard publishes this repository's specs, plans and constitution publicly: this is intended (the repository is public), and the hosting guide's warning about hosted snapshots still applies to other projects.

## Requirements *(mandatory)*

### Functional Requirements

**Package and first release**

- **FR-001**: The package MUST be publishable to the public npm registry under the name `speckit-eye` with complete metadata: description, license, keywords, author, repository, homepage (the documentation site), issue tracker, and the supported Node.js range.
- **FR-002**: The published package MUST contain only the files needed at runtime plus README, CHANGELOG and LICENSE; an automated check MUST compare the package contents against this allowed list and fail on any difference.
- **FR-003**: Before the first release, the changelog MUST be finalized: the current "Unreleased" entries become the first version's dated section, and comparison links for each version exist at the bottom.
- **FR-004**: The first version MUST be released through the same automated path as every later version (no manual publish from a developer machine).

**Version bump automation**

- **FR-005**: Maintainers MUST be able to start a version bump on demand, choosing patch, minor, major, or a pre-release of one of these.
- **FR-006**: The version bump MUST update the version only in its single authoritative location and MUST move the changelog's "Unreleased" entries under a new section headed with the new version and the current date, leaving a fresh empty "Unreleased" section.
- **FR-007**: The version bump MUST propose its change for review rather than writing directly to the default branch.
- **FR-008**: The version bump MUST refuse to run when the "Unreleased" section has no entries.

**Publishing and release safety**

- **FR-009**: Publishing MUST start only from a version tag on a commit that belongs to the default branch.
- **FR-010**: Before publishing, the automation MUST verify that the tag, the package version and the changelog's latest section name the same version, and that the version does not already exist on npm.
- **FR-011**: Before publishing, the automation MUST run the full unit and end-to-end test suites and the package-contents check on the tagged commit; any failure MUST stop the release with nothing published.
- **FR-012**: Publishing MUST require approval by an authorized maintainer through a protected release environment.
- **FR-013**: Publishing MUST NOT depend on a long-lived publish credential stored in the repository when a short-lived, identity-based alternative is available, and the published package MUST carry verifiable build provenance.
- **FR-014**: Automation MUST run with the least permissions it needs, and third-party automation steps MUST be pinned to immutable versions.
- **FR-015**: After a successful publish, a GitHub release MUST be created for the tag whose notes are that version's changelog section.
- **FR-016**: Pre-release versions MUST be published under a separate distribution channel so the default install keeps resolving to the latest stable version.
- **FR-017**: Installs in automation MUST use the committed lockfile unchanged, so what is tested is what is published.

**Release guide**

- **FR-018**: A release guide under `docs/` MUST describe: one-time setup (npm package ownership and trusted publishing, protected release environment, GitHub Pages), cutting a normal release, cutting a pre-release, verifying a release, and recovering from a failed or broken release (deprecation and patch release).
- **FR-019**: `DEVELOPMENT.md`'s release section MUST summarize the process and link to the release guide instead of duplicating it.

**Documentation site**

- **FR-020**: The documentation site MUST be generated with the docmd framework from the Markdown files under `docs/`, which remain the single source of the documentation.
- **FR-021**: The site MUST have a home page (what speckit-eye is, install, quick start, links to npm, the repository and the live dashboard) and navigation to every guide: usage, hosting a snapshot, architecture, releasing, and contributing/development.
- **FR-022**: The site MUST be built and deployed to GitHub Pages automatically when a change that affects it (documentation, site configuration, the tool itself, or this repository's specs) lands on the default branch, and MUST also be deployable on demand.
- **FR-023**: Pull requests that affect the site MUST build it (including the dashboard) as a check without deploying, failing on build errors and broken internal links.
- **FR-024**: Deployments MUST NOT overlap, and a failed build MUST leave the previously deployed site online.

**Project dashboard (status and demo)**

- **FR-025**: The deployed site MUST include a speckit-eye static build of this repository, served under a sub-path of the documentation site, generated with the tool's code from the same commit.
- **FR-026**: The README and the documentation home page MUST both link to the dashboard, labeled as the project's status and live demo.
- **FR-027**: The dashboard MUST work fully under its sub-path (links, styles, fonts, scripts, search) and MUST offer a way back to the documentation site.

**Open-source project health**

- **FR-028**: The repository MUST contain contribution guidelines, a code of conduct, and a security policy describing a private vulnerability reporting channel and the supported versions.
- **FR-029**: The repository MUST provide issue templates (bug report, feature request) and a pull request template listing the project's quality gates.
- **FR-030**: The README MUST show CI status, latest npm version and license badges, and install instructions that work with the published package.
- **FR-031**: Automated dependency update proposals MUST be configured for both package dependencies and automation actions.
- **FR-032**: The changelog MUST gain entries for the user-visible parts of this feature (published package, documentation site, dashboard link).

### Key Entities

- **Version**: A semantic version (stable or pre-release) defined in one authoritative place; linked to exactly one git tag, one changelog section, one npm publication and one GitHub release.
- **Changelog section**: The dated list of user-visible changes for one version, plus the "Unreleased" section that collects changes until the next bump.
- **Release run**: One execution of the publishing automation for a tag, with its checks, approval, outcome and provenance record.
- **Documentation site**: The published website generated from `docs/`, including the home page, guides and navigation.
- **Project dashboard**: The speckit-eye static snapshot of this repository, published as part of the documentation site.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a clean machine with only a supported Node.js installed, the README's install command starts the dashboard for a Spec Kit project in under 1 minute on a normal connection.
- **SC-002**: A maintainer who has never released the project can publish a new version by following only the release guide, with no more than 3 manual actions (start bump, approve/merge proposal, approve release) and in under 30 minutes of their own time excluding test run time.
- **SC-003**: 100% of the deliberately broken release attempts (version mismatch, failing test, empty changelog section, already-published version, unexpected package file, tag off the default branch) end with nothing published.
- **SC-004**: Every published version has a matching git tag, GitHub release, changelog section and verifiable provenance — 0 exceptions.
- **SC-005**: A documentation change merged to the default branch is visible on the public site within 10 minutes, without manual steps.
- **SC-006**: The documentation site and the dashboard have 0 broken internal links, and every guide under `docs/` is reachable from the home page in at most 2 clicks.
- **SC-007**: The dashboard's feature and task counts match this repository's `specs/` on the default branch after each deployment.
- **SC-008**: A newcomer finds how to contribute, how to report a vulnerability privately, the current version and the CI status from the repository front page in under 1 minute.

## Assumptions

- The repository's default branch is `main` (the user wrote "master"); "master" in the request is read as "the default branch".
- The first published version is the one already in `package.json` (`1.0.0`), whose entries are currently collected under "Unreleased" in the changelog; the maintainer may choose a different number at bump time.
- The npm name `speckit-eye` is available (or owned by the maintainer); securing it and configuring npm trusted publishing for this repository are one-time manual steps performed by the maintainer and documented in the guide — they cannot be done from inside the repository.
- The actual first publish is triggered and approved by the maintainer after this feature is merged; this feature delivers everything needed so that the publish is a guided, approved run.
- The documentation site and the dashboard are hosted together on this repository's GitHub Pages project site (a sub-path per repository name), with the dashboard under its own sub-path (for example `/status/`); no custom domain.
- docmd is used as-is with its default theme and minimal configuration; it is a development-only dependency and is never part of the published package.
- The dashboard in the site is built from the current commit's code, not from the published npm version, so it doubles as a preview of unreleased behavior.
- Existing docs (`usage.md`, `hosting.md`, `architecture.md`) keep their content; they may gain front-matter or small navigation adjustments needed by the site. The sample GitHub Pages workflow in `hosting.md` stays as guidance for other projects.
- Verifying the automations end to end is done with a rehearsal (a pre-release or dry run through the real automation) plus automated tests for any scripts they use (changelog and version handling, package-contents check), in line with the constitution's testing principles.
- Contribution guidelines point to `DEVELOPMENT.md` for build and test instructions rather than repeating them; the code of conduct uses the Contributor Covenant.
