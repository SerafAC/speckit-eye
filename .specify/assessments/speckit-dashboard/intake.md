# Idea Intake: Spec Kit status & artifacts dashboard

- **Slug**: speckit-dashboard
- **Created**: 2026-09-24
- **Source**: pasted text (via `/speckit-assess-intake`), in repo `speckit-auto`
- **Type**: new-capability

## Idea (as captured)

> I want to build a dashboard that will render Spec Kit status and artifacts.
> I want it to be able to compile in github actions pipline and host under github pages (or similar platforms).
> But also I want to run a local server which can render files live and auto refresh e.g. 1s/5s/1m.
> Analyse which framework would be best suited, so least code should be produced, eg. md documentation frameworks like docmd.io, vitepress or full framework like vue?
> Dashboard should show view from the top to bottom, that is on main dashboard there should be a progress bar and list of specs, phases user stories, and only currently active one is expanded. To see details user should open an item.
> Other artifacts like research or constitution also should be avilable but from menu or connected pages.

## Restated

A dashboard that reads a Spec Kit project's artifacts (specs, plans, tasks, research, constitution) and shows overall progress and the spec → phase → user story hierarchy, expanding only the active item. It should build as a static site in CI for GitHub Pages or similar hosts, and also run as a local server that re-renders live on a configurable refresh interval. The idea also asks which framework (a Markdown docs framework such as docmd.io or VitePress, or a full framework such as Vue) would need the least code.

## Stated Requirements (as given, not yet validated)

- **Two delivery modes**: a static build in a GitHub Actions pipeline, hosted on GitHub Pages "or similar platforms"; and a local server that renders files live with auto-refresh at a chosen interval (examples: 1s, 5s, 1m).
- **Main view, top to bottom**: a progress bar, then the list of specs → phases → user stories. Only the currently active item is expanded, and details open when the user selects an item.
- **Secondary artifacts** (research, constitution, others) reachable from a menu or linked pages, not from the main view.
- **Framework choice**: the one that needs the least code. Candidates named: docmd.io, VitePress, Vue.

## Origin & Context

- **Raised by**: repository owner (SerafAC), via intake command
- **Trigger**: [NEEDS CLARIFICATION: what prompted this, e.g. visibility into speckit-autopilot runs, team or stakeholder reporting, or personal tracking?]
- **Related context**: This repo hosts `speckit-autopilot` and the `speckit-assess-*` skills, which produce the artifacts the dashboard would show (`specs/<feature>/{spec,plan,tasks,research}.md`, `.specify/memory/constitution.md`, and possibly `.specify/assessments/`). No `specs/` directory exists here yet.

## First-Glance Unknowns

- [NEEDS CLARIFICATION: Where does the dashboard live? Inside this repo, as a standalone tool or package installable into any Spec Kit project, or as a Spec Kit extension?]
- [NEEDS CLARIFICATION: How are "status" and "progress" derived? For example, checked vs. unchecked tasks in `tasks.md`, git history, or autopilot state. Is the progress bar per project, per spec, or both?]
- [NEEDS CLARIFICATION: What makes an item "currently active"? For example, the current git branch, the first incomplete phase, or explicit state from autopilot.]
- [NEEDS CLARIFICATION: How do the terms map to Spec Kit artifacts? Phases and user stories live inside `tasks.md` and `spec.md`, so the parsing depth and the format stability it needs are unclear.]
- [NEEDS CLARIFICATION: Should the list of secondary artifacts include checklists, contracts, data-model, quickstart, and the `.specify/assessments/` outputs?]
- [NEEDS CLARIFICATION: Does "auto refresh" mean file-watch with push (HMR or websocket) or timed polling, and is the interval set by the user in the UI or in config?]
- [NEEDS CLARIFICATION: Does the static build need the same interactivity (expand/collapse, navigation) with no runtime server?]
- [NEEDS CLARIFICATION: Which "similar platforms" count (GitLab Pages, Netlify, Cloudflare Pages), and does the static build need a configurable base path?]
- [NEEDS CLARIFICATION: Who is the audience (the solo developer, a team, external stakeholders), and does it need access control?]
- [NEEDS CLARIFICATION: Are there constraints on the toolchain (Node.js, Python, or other runtime), and is it acceptable to add dependencies to a repo with none today?]
- [NEEDS CLARIFICATION: Should it support multiple repos or projects, or only one?]
