<!--
Sync Impact Report
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: Initial ratification; all placeholders replaced with concrete principles.

Modified principles (template placeholder → new title):
  - [PRINCIPLE_1_NAME] → I. Simplicity First (KISS)
  - [PRINCIPLE_2_NAME] → II. Build Only What Is Needed (YAGNI)
  - [PRINCIPLE_3_NAME] → III. Single Source of Truth (DRY)
  - [PRINCIPLE_4_NAME] → IV. Unit Tests for All Code (NON-NEGOTIABLE)
  - [PRINCIPLE_5_NAME] → V. End-to-End Coverage of Major Requirements (NON-NEGOTIABLE)

Added principles:
  - VI. Versioning and CHANGELOG.md
  - VII. Documentation Under ./docs Is Mandatory
  - VIII. README.md Is Mandatory and User-Facing
  - IX. DEVELOPMENT.md Is for Developers

Added sections:
  - Quality Gates (was [SECTION_2_NAME])
  - Development Workflow (was [SECTION_3_NAME])
  - Governance (filled)

Removed sections: none

Dependent artifacts: templates read the constitution at runtime; not modified by this command.

Follow-up TODOs: none. Note: README.md, DEVELOPMENT.md, CHANGELOG.md and ./docs do not exist
yet; they MUST be created with the first feature delivered under this constitution.
-->

# speckit-eye Constitution

## Core Principles

### I. Simplicity First (KISS)

- The simplest design that satisfies the current requirements MUST be chosen.
- Code MUST be readable by a developer new to the project without additional explanation;
  clever or obscure constructs MUST be avoided when a plain alternative exists.
- Every new dependency, abstraction layer, or configuration option MUST be justified in the
  feature's plan (Complexity Tracking); unjustified complexity is grounds for rejection in review.

**Rationale**: Simple systems are easier to understand, test, change, and debug.

### II. Build Only What Is Needed (YAGNI)

- Only functionality required by an accepted specification MUST be implemented.
- Speculative features, hooks, extension points, or generalizations for hypothetical future
  needs MUST NOT be added.
- Unused code, dead configuration, and unreferenced files MUST be removed.

**Rationale**: Unneeded code costs maintenance and testing effort while delivering no value.

### III. Single Source of Truth (DRY)

- Each piece of knowledge (business rule, constant, configuration value, schema, version number)
  MUST have exactly one authoritative definition; other locations MUST reference or derive from it.
- Duplicated logic MUST be extracted once it appears a second time with the same meaning;
  coincidentally similar code with different intent MAY stay separate.
- Documentation MUST link to authoritative sources rather than copying their content.

**Rationale**: Duplication causes drift and inconsistent behavior when only one copy is changed.

### IV. Unit Tests for All Code (NON-NEGOTIABLE)

- Every module, function, and class containing logic MUST be covered by unit tests.
- Every bug fix MUST include a unit test that fails without the fix.
- Unit tests MUST be fast, deterministic, and isolated from network, filesystem, and external
  services (use fakes or test doubles).
- Code without accompanying unit tests MUST NOT be merged.

**Rationale**: Unit tests give fast feedback and make refactoring safe.

### V. End-to-End Coverage of Major Requirements (NON-NEGOTIABLE)

- Every major requirement and every user story in a specification MUST be covered by at least
  one end-to-end test exercising the system as a user would.
- The traceability from requirement / user story to its end-to-end test(s) MUST be recorded
  in the feature's tasks or test names.
- A feature MUST NOT be considered complete while any of its major requirements lacks a
  passing end-to-end test.

**Rationale**: Unit tests prove parts work; end-to-end tests prove the product delivers what was
specified.

### VI. Versioning and CHANGELOG.md

- The software MUST be versioned using Semantic Versioning (MAJOR.MINOR.PATCH), with the version
  defined in a single authoritative location (see Principle III).
- `CHANGELOG.md` MUST exist at the repository root and follow the Keep a Changelog format
  (an `Unreleased` section plus one section per released version).
- Every user-visible change MUST add an entry to `CHANGELOG.md` in the same change set.
- Each release MUST be tagged in git with its version (e.g., `v1.2.3`).

**Rationale**: Users and developers need to know what changed, when, and whether it is
compatible.

### VII. Documentation Under ./docs Is Mandatory

- Project documentation (architecture, design decisions, configuration reference, usage guides)
  MUST live under `./docs`.
- Any change that alters behavior, configuration, interfaces, or architecture MUST update the
  relevant documents under `./docs` in the same change set.
- Documentation that no longer matches the code is a defect and MUST be fixed or removed.

**Rationale**: Documentation kept in one predictable place and updated with the code stays
trustworthy.

### VIII. README.md Is Mandatory and User-Facing

- `README.md` MUST exist at the repository root.
- It MUST be written for users of the software and MUST contain: what the project is, how to
  install it, how to use it (with at least one example), and where to find further
  documentation (`./docs`).
- Developer-only content (build internals, contribution workflow, test setup) MUST NOT be placed
  in `README.md`; it belongs in `DEVELOPMENT.md`, linked from the README.

**Rationale**: The README is the first thing a user sees and must answer their questions quickly.

### IX. DEVELOPMENT.md Is for Developers

- `DEVELOPMENT.md` MUST exist at the repository root.
- It MUST describe: development environment setup, how to build, how to run unit and
  end-to-end tests, project structure overview, coding conventions, and the release process
  (versioning and changelog steps per Principle VI).
- It MUST be updated whenever any of those procedures change.

**Rationale**: A single, current developer guide makes onboarding and contributing reproducible.

## Quality Gates

A change MUST satisfy all of the following before it is merged:

1. All unit tests pass (Principle IV).
2. All end-to-end tests pass, and every major requirement touched has end-to-end coverage
   (Principle V).
3. `CHANGELOG.md` is updated for user-visible changes (Principle VI).
4. `./docs`, `README.md`, and `DEVELOPMENT.md` are updated where affected
   (Principles VII–IX).
5. No unjustified complexity, speculative code, or duplicated knowledge is introduced
   (Principles I–III).

## Development Workflow

- Features follow the Spec Kit flow: specify → (clarify) → plan → tasks → implement.
- Every plan MUST include a Constitution Check that evaluates the feature against each principle;
  violations MUST be justified in Complexity Tracking or the design MUST be changed.
- Task lists MUST include tasks for unit tests, end-to-end tests, documentation, and changelog
  updates for each user story.
- Reviews MUST verify compliance with this constitution; a reviewer MAY block a change on any
  principle violation.

## Governance

- This constitution supersedes all other project practices and conventions. Where another
  document conflicts with it, the constitution prevails.
- Amendments MUST be made via a change to this file that includes a Sync Impact Report,
  an updated version, and an updated Last Amended date.
- The constitution itself is versioned using Semantic Versioning:
  - MAJOR: removal or backward-incompatible redefinition of a principle or governance rule.
  - MINOR: a new principle or section, or materially expanded guidance.
  - PATCH: clarifications, wording, or typo fixes with no semantic change.
- Compliance MUST be checked during every plan (Constitution Check) and every code review.
  Runtime development guidance lives in `DEVELOPMENT.md`.

**Version**: 1.0.0 | **Ratified**: 2026-09-24 | **Last Amended**: 2026-09-24
