# Decision: speckit-eye, a zero-setup Spec Kit dashboard (live locally, hosted from CI)

- **Slug**: speckit-dashboard
- **Decided**: 2026-09-24
- **Verdict**: go
- **Artifacts reviewed**: intake.md | research.md | problem.md | concept.md

## Owner Direction Recorded With This Decision (2026-09-24)

- **Build Option A from concept.md**: a Node CLI (`npx speckit-eye --serve <dir>` / `--build <dir> --out <folder>`) that renders HTML on the server and reloads open pages when Spec Kit `.md` files change.
- **Not a single-file tool.** Unlike spec-ui, the code is a normal multi-module Node project. Each concern has its own module and unit tests, which also suits constitution §IV. The module layout is a plan-stage decision.
- **Use a styling package for a polished look and animations**, for example Tailwind CSS. Hand-written CSS is out. This changes one trade-off in concept.md: Option A is no longer "no front-end build". The package gets a CSS build step **when it is published**, and the compiled stylesheet ships inside the package. Adopters still install and configure nothing; `npx` stays the only step.

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | adequate | The pains are real and first-hand: counting checkboxes across `tasks.md`, watching long autopilot runs, sharing status without the repo (problem.md). At least six community tools exist in this space, which shows wider interest. Demand beyond the owner is not measured. |
| Evidence strength | adequate | Repo and Spec Kit template evidence is first-hand (high confidence). External evidence comes from search summaries only (research.md). The owner tested the existing tools hands-on and found none that fits, which settles the main open question ("build or adopt"). |
| Value vs. inaction | adequate | The cost of inaction is low but recurring for a solo user, and higher for unattended runs and for sharing status (problem.md §Cost of Inaction). The owner tested the alternatives and rejected them, so doing nothing means going without the view. |
| Feasibility / appetite | strong | The option is small to medium (about 1–2 weeks) with one renderer for live and static output. research.md shows spec-ui already does live + static from Node, so the approach is known to work. Adding a Tailwind build at publish time adds a little setup but no runtime work for adopters. |
| Strategic fit | strong | It is the reason this repo (`speckit-eye`) exists. It follows constitution §I KISS: a small package, few runtime dependencies, no framework dev server. The multi-module structure helps §IV unit testing. The Tailwind dev dependency must be justified in Complexity Tracking (§I). |
| Risk posture | adequate | The main risks are known and can be spiked or bounded: file watching across operating systems, Markdown fidelity (Mermaid, task lists), npm name availability, serving only Spec Kit files. Search, theming, and multi-project support are out of scope for v1. Open: whether a public hosted view is acceptable, and how to define the "active" item. Neither blocks specification. |

## Verdict & Rationale

**Go.** The problem is real for the owner and is likely shared, since several community tools exist for it. The owner's hands-on test rules out adopting an existing tool, and the adjusted requirements settle the earlier toolchain and home questions: Node, npm, this repo. Option A fits within the appetite, uses one code path for live and hosted views, and meets the one-command install goal directly. The evidence is only *adequate*: demand beyond the owner is unmeasured, and third-party claims come from search summaries. That is enough for a tool the owner will use regardless, and M6 (adoption) is recorded as a lagging metric rather than a gate. The owner's two additions (a multi-module layout and a styling package) do not change feasibility. They change how the package is built and published, not what adopters experience.

## If needs-clarification

- **Blocking questions**: n/a
- **Revisit stage**: n/a

## If go — Handoff to `/speckit-specify`

- **Problem**: Spec Kit users cannot see at a glance where a project stands (overall progress, the active feature, phase, and story, and what is left), cannot follow progress live during long autopilot runs, and cannot easily share status or artifacts with people who do not have the repo.
- **Chosen approach**: Option A. `speckit-eye` is a Node CLI published to npm and run with `npx` against any Spec Kit project, with nothing to install or configure inside the project.
  - `--serve <dir>`: a local server renders the overview and artifact pages. Open pages update on their own within about 1–2 s of any Spec Kit `.md` change, keeping scroll position and expanded items.
  - `--build <dir> --out <folder>`: writes the same pages as a static site for GitHub Pages, Netlify, and similar hosts, with a configurable base path. The docs should include a sample CI job.
  - **Main view**: an overall progress bar, then specs → phases → user stories. Only the active item is expanded; the others expand on demand.
  - **Artifacts**: spec, plan, research, constitution, checklists, and the others are reachable from a menu or linked pages, rendered as readable Markdown.
  - **Code structure**: a multi-module project, not a single script.
  - **Styling**: a utility CSS framework such as Tailwind, compiled when the package is published. It provides consistent styling and light animations such as expand/collapse, progress fill, and change highlights. Rendered Markdown needs readable typography, for example a typography plugin.
- **In scope**: the overview, artifact pages, a `tasks.md` parser for the standard template (with warnings for files that don't follow it), live updates in serve mode, static build, and one-command `npx` use.
- **Out of scope**: editing or running workflows from the view; any separate progress store; project-management features; built-in authentication; live updates on the hosted site; a timed refresh interval; search, theme switching, and multi-project aggregation in v1; anything a user must install or configure in the target project; Python components; non-Spec Kit formats.
- **Success metrics**:
  - **M1**: overall %, the active feature, phase, and story, and what is next, answerable in seconds from one view.
  - **M2**: saving a file updates the local view in about 1–2 s or less.
  - **M3**: the hosted view updates within one CI run of a push.
  - **M4**: every artifact present is reachable in 2 or fewer navigation steps.
  - **M5**: progress exactly matches the `tasks.md` checkbox counts on standard-template projects.
  - **M6**: used on at least one real Spec Kit project beyond this repo (lagging).
  - **M7**: from nothing to a live view with one `npx` command, in about a minute.
- **Carried-forward open questions**:
  - [NEEDS CLARIFICATION: How is the "active" item defined (first feature, phase, and story with open tasks, the current git branch, or the last autopilot unit)?]
  - [NEEDS CLARIFICATION: Is a public hosted view acceptable by default? Should the docs warn about exposing specs, research, and constitution?]
  - [NEEDS CLARIFICATION: Which secondary artifacts must be listed (checklists, contracts, data-model, quickstart, decisions.md, run-log.md, `.specify/assessments/`)?]
  - [NEEDS CLARIFICATION: How should the tool handle `tasks.md` files that don't follow the template: warn and degrade, or treat them as unsupported?]
  - [NEEDS CLARIFICATION: What is the minimum Node.js version? Does file watching need a dependency, or is Node's own watcher enough on Linux, macOS, Windows, and WSL? A spike should decide.]
  - [NEEDS CLARIFICATION: Is the npm name `speckit-eye` available, or should the package use a scoped name?]
  - [NEEDS CLARIFICATION: Which styling stack exactly: Tailwind alone, or Tailwind with a component layer (for example daisyUI) for ready-made progress bars and accordions? Must respect the reduced-motion setting. Justify the choice in Complexity Tracking (constitution §I).]
  - [NEEDS CLARIFICATION: Should Mermaid diagrams render in the view in v1, or show as code blocks?]
  - [NEEDS CLARIFICATION: Which headless browser should the E2E tests use (for example Playwright), and is that dependency acceptable under §I?]
