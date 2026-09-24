# Problem Definition: Spec Kit progress and artifacts are hard to see and share

- **Slug**: speckit-dashboard
- **Created**: 2026-09-24
- **Inputs used**: intake.md, research.md, and the user's answers on 2026-09-24 (audience, pains, reuse stance)

## Problem Statement

People using Spec Kit cannot see at a glance where a project stands: which features, phases, and user stories are done, which one is in progress, and what is left. Progress is scattered across checkboxes in per-feature `tasks.md` files, and the related artifacts (spec, plan, research, constitution) sit in separate folders with no overview. This gets worse during long, unattended `speckit-autopilot` runs, and when someone without a repo checkout needs the status. It matters now because autopilot makes implementation largely hands-off, so humans increasingly check progress rather than make it.

## Affected Users & Stakeholders

- **Users**
  - **Spec Kit practitioner (solo or small team)**: runs the Spec Kit workflow in any repo. Today they open several `tasks.md` files and count checkboxes to judge progress, and move between `specs/<feature>/` and `.specify/memory/` to find artifacts. [source: user answer "Any Spec Kit user"; research §Market & Context]
  - **Autopilot operator**: runs long `speckit-autopilot` sessions. Their only progress signals are `tasks.md` checkboxes, `dry-run` output, and `run-log.md`, none of which give a continuously updated overview. [source: research §Prior Art (internal), `docs/usage.md`; user answer "Watching long autopilot runs"]
  - **Status consumer without the repo** (teammate, reviewer, stakeholder): needs to know where features stand but won't clone the repo or browse its tree. [source: user answer "Sharing status with others"; intake requirement for hosted builds]. Their exact roles and number: [NEEDS CLARIFICATION: who concretely consumes shared status?]
- **Stakeholders**
  - **Repo owner / maintainer of speckit-autopilot (SerafAC)**: decides whether to build, and bears the maintenance cost under the constitution (unit + E2E tests per story, dependency justification). [source: intake; research §Data & Constraints]
  - **Spec Kit community / maintainers of existing dashboards (e.g. spec-ui)**: affected if this duplicates or extends their work. [source: research §Prior Art; user answer "Undecided" on reuse]

## Goals

- **G1: Status at a glance.** A Spec Kit user can tell overall progress, and which feature, phase, and user story is currently in progress, without opening individual `tasks.md` files.
- **G2: Follow progress while it happens.** An autopilot operator sees progress change during a run without manually re-checking files, and chooses how fresh the view is (the intake cites 1s / 5s / 1m).
- **G3: Share status without repo access.** A person without a checkout can view current status and artifacts through a link that updates when the project changes, for example on push.
- **G4: Find any artifact from one place.** Secondary artifacts (research, constitution, plan, checklists, etc.) can be reached from the overview without knowing the folder layout.
- **G5: Works for any Spec Kit project.** It applies to Spec Kit repos in general, not only this one. [source: user answer "Any Spec Kit user"]
- **G6: Low ongoing cost.** Keeping it working costs little effort, in line with the constitution's KISS/YAGNI and the intake's "least code" wish. [source: intake; constitution §I–II]

## Non-Goals

- **Editing or running workflows.** Changing artifacts, ticking tasks, or triggering Spec Kit or autopilot commands from the view. It shows state; it does not change it. [basis: intake describes rendering only; VS Code tools in research already cover guided workflows]
- **Replacing the source of truth.** No separate progress database. The Spec Kit files stay authoritative. [basis: research, `tasks.md` is the only progress record]
- **Project management features.** Assignees, estimates, burndown, sprint planning, and issue-tracker sync are out. [basis: not in intake]
- **Access control and authentication** built into the solution itself. How a shared view is restricted is a hosting concern. [NEEDS CLARIFICATION: confirm that a public or host-restricted view is acceptable]
- **Real-time updates on the shared (hosted) view.** Freshness there is bounded by rebuilds. Only local viewing needs second-level freshness. [basis: research §Data & Constraints, static hosts cannot read disk]
- **Supporting non-Spec Kit formats** (e.g. OpenSpec, Kiro). [basis: not in intake]

## Success Metrics

- **M1: Time to answer "where does the project stand?"** (overall % done, the current feature, phase, and story, and what is next): target a few seconds from one view. (baseline: unknown. Today this means opening each `tasks.md`; [NEEDS CLARIFICATION: measure on a real multi-feature repo])
- **M2: Freshness during a local run.** Delay between a `tasks.md` checkbox changing on disk and the change showing up: at or below the chosen refresh interval. (baseline: ∞, since nothing updates on its own today)
- **M3: Freshness of the shared view.** Delay between a push and the updated shared view: within one CI run. (baseline: no shared view exists)
- **M4: Artifact reach.** Every Spec Kit artifact present in a project is reachable from the overview in ≤ 2 navigation steps. (baseline: needs repo browsing; not measured)
- **M5: Correctness.** Progress shown matches the checkbox counts in `tasks.md` exactly, for projects that follow the standard template. (baseline: n/a)
- **M6: Adoption (qualitative/lagging).** Used on at least one real Spec Kit project beyond this repo, with external users if published. (baseline: 0. Research found no demand data beyond the owner; [NEEDS CLARIFICATION: target])
- **M7: Setup effort.** Time for a new Spec Kit user to get both a local live view and a hosted view working. (baseline: unknown; [NEEDS CLARIFICATION: target, e.g. under 10 minutes])

## Cost of Inaction

Practitioners keep judging progress by opening `tasks.md` files and counting checkboxes. Autopilot operators poll files or logs during long runs. Sharing status means sending repo links, which GitHub renders as plain Markdown with checkboxes but no overview. For a solo developer this cost is low but recurring. It grows with the number of features and with unattended runs, and it blocks easy status sharing with people outside the repo. Without building anything, part of the need can be met today by adopting existing community tools: spec-ui for a live/static dashboard, spec-kit-status or spectatui for terminal status, or VS Code extensions. None of these was confirmed to combine the top-down overview, a live local view, and a hosted multi-page site. [source: research §Prior Art, §Market & Context, §Evidence Against]

## Open Questions

- [NEEDS CLARIFICATION: Build new, or extend or adopt an existing tool (e.g. spec-ui)? The user is undecided. The shape and decide stages must weigh it, and it needs a hands-on check of what spec-ui lacks.]
- [NEEDS CLARIFICATION: What defines the "currently active" item: the current git branch, the first incomplete phase or story, or the last autopilot unit?]
- [NEEDS CLARIFICATION: Is a publicly reachable shared view acceptable for specs, research, and constitution, or must sharing be restricted?]
- [NEEDS CLARIFICATION: One project per view, or several Spec Kit projects aggregated?]
- [NEEDS CLARIFICATION: Which artifacts count as "secondary" and must be reachable: checklists, contracts, data-model, quickstart, decisions.md, run-log.md, assessments?]
- [NEEDS CLARIFICATION: Tolerance for Spec Kit files that don't follow the standard template (custom phase headings, missing `[USn]` tags): warn, degrade, or unsupported?]
- [NEEDS CLARIFICATION: Toolchain acceptability for users: can "any Spec Kit user" be assumed to have Node, or Python only (Spec Kit itself is Python-based)?]
- [NEEDS CLARIFICATION: Where does it live: inside this repo, as a separate repo, or as a Spec Kit extension? This affects reach (G5) and constitution overhead (G6).]
- [NEEDS CLARIFICATION: Concrete targets for M1, M6, M7.]
