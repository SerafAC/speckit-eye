# Quickstart & Validation Guide: Dashboard Redesign

Runnable scenarios that show the redesign works end to end. Each maps to a user story or success criterion of [spec.md](./spec.md); the automated versions live in `tests/e2e/` (suite names in [plan.md](./plan.md)). Page structure and view state are defined in [contracts/routes.md](./contracts/routes.md), the recognized `spec.md` structure in [contracts/spec-md-structure.md](./contracts/spec-md-structure.md), search in [contracts/search-index.md](./contracts/search-index.md), derived data in [data-model.md](./data-model.md). Fixture contents and counts are listed in `tests/fixtures/projects/README.md`.

## Prerequisites

- Node.js ≥ 22 and pnpm (unchanged from 001).
- `pnpm install --frozen-lockfile`, then `pnpm run build:assets` (stylesheet **and** fonts into `dist/`).
- E2E: `pnpm exec playwright install chromium firefox webkit` (the cloud dev container has Chromium only; the full matrix runs in CI).
- Work on copies of fixtures, because Scenario 6 edits files:

```bash
cp -r tests/fixtures/projects/mixed /tmp/eye-mixed
node bin/speckit-eye.js --serve /tmp/eye-mixed      # prints Local: http://127.0.0.1:4747/
```

## Scenario 1: Overview (US1, SC-001, SC-004)

Open the `Local:` address at 1440 × 900.

Expected:
- A dark sidebar with the project name, Overview, Constitution, "Assessment: speckit-dashboard", "Features 1 / 4 done", and the four features: `002-beta` (blue ring, "10 open") first, then `003-gamma`, `004-delta`, then `001-alpha` (green, ✓) — the "In progress first" order.
- Stats card: **62 %**, "40 of 65 tasks", Features "1 / 4" with "1 in progress", Phases "5 / 9" with "4 remaining", Open tasks "25" "across 2 features". The segmented bar has three segments (`001`, `002`, `003`; `004` has no tasks) with widths 46 / 31 / 23 %.
- The Up next bar names the next task of `002-beta` in full on hover; "View task" opens it on the feature page; "Open quickstart" is absent (the fixture has no quickstart).
- Order control cycles In progress first → Number → Least complete → Name A–Z; the depth control "Tasks" opens every phase with tasks; "Open tasks only" hides `001-alpha` and done tasks.
- Without scrolling, the percentage, the in-progress feature and the next task are all visible (SC-001).

## Scenario 2: Task map (US2, SC-006)

Expected:
- 65 squares, stacked; legend "Done 40 · Open 23 · Blocked 1 · Next 1 · 1 dot = 1 task" (T018 of `002-beta` depends on the open T011, so it is blocked and drawn in rose).
- Hovering a square grows it at once; after 0.5 s a dark tooltip shows ID, status pill, two lines of text and the feature; the tree tints the feature and phase rows. Squares in the first and last columns get left- and right-aligned tooltips that are fully visible. Leaving hides the tooltip at once.
- Clicking a square of `003-gamma` (collapsed) opens that feature and phase, scrolls the tree card to the task row and outlines it; its task ID then opens the feature page.
- "By feature" regroups into four labelled blocks (three with squares); reload: the mode is remembered.
- Scale: `node tests/fixtures/generate-large.js /tmp/eye-large && node bin/speckit-eye.js --serve /tmp/eye-large` → the map opens "By feature" (2,000 tasks), hover and tooltip timings unchanged (automated in `scale.spec.js`).

## Scenario 3: Feature page (US3)

Open `002-beta` from the sidebar.

Expected:
- Header "In progress" pill, `002-beta`, title, "10 / 20 tasks · x of y phases", ring at 50 %.
- Tabs: Tasks 20, Specification, Plan (only the documents that exist).
- Phase rail blocks sized by task count; the active phase is open; choosing another block opens it and closes the first; choosing it again closes it.
- Filter "Open" lists the 10 open tasks; typing a word from one task narrows to it; a nonsense word shows "No tasks match" with "Clear filters".
- Clicking T018 expands it in place and shows it in the detail panel with "Waiting on T011"; "Copy ID" puts `T018` on the clipboard; "View source line" opens `tasks.html#L31` with that line highlighted.
- Serve `tests/fixtures/projects/nonstandard`: its feature page shows the amber banner for checkboxes without an ID with line chips, and "Show lines" reveals the raw lines.

## Scenario 4: Theme (US4, SC-005)

Expected:
- First visit: the switch shows System and the page follows the OS (emulate with the browser's color-scheme setting).
- Choose Dark, open a feature page and a document, reload: dark from the first paint on every page, no light flash. The sidebar, Up next bar and tooltip are dark in both themes.
- With storage blocked (private window with storage disabled), the switch still changes the current page; the next page is System again.

## Scenario 5: Document reader (US5, SC-012)

```bash
node bin/speckit-eye.js --serve .      # this repository
```

Open `001-speckit-eye-dashboard` → Specification.

Expected:
- Icon rail, document list (Define: Specification, Quality checklist; Design: Implementation plan, Research, Data model, Quickstart; Contracts: 3; Build: Tasks; Other: decisions), reading column, "On this page".
- Metadata card (branch, created 2026-09-24, Draft) and the input as a pull quote; numbered sections; Clarifications "N answered · M sessions" with aligned badges; user stories as cards with Given/When/Then tables and their phase progress; requirements with area chips and highlighted MUST; key entities as cards.
- Scrolling moves the contents highlight and progress; "Raw markdown" shows the source; every non-blank source line appears in the formatted view (automated: the parser invariant unit test and `us5-reader.spec.js`).

## Scenario 6: Live updates keep view state (FR-051, SC-008)

With Scenario 1 running: set order "Name A–Z", filter "Open tasks only", map "By feature", expand `003-gamma`, scroll the tree card; in a second tab open `002-beta`'s feature page with filter "Open" and T018 selected. Then:

```bash
sed -i '0,/- \[ \] T011/s//- [x] T011/' /tmp/eye-mixed/specs/002-beta/tasks.md
```

Expected within 2 s: counts update and flash; every chosen order, filter, mode, expanded item, scroll position and the selected task are unchanged; T018 is no longer blocked (its rose color and "Waiting on" line disappear).

## Scenario 7: Search (US6, SC-014)

Expected on any page, in serve mode and in a static build served under a sub-path:

```bash
node bin/speckit-eye.js --build /tmp/eye-mixed --out /tmp/eye-site --base /eye/
# serve /tmp/eye-site under /eye/ with any static server
```

- ⌘K / Ctrl+K opens the dialog; Escape closes it and returns focus.
- "T018" → the task first; Enter opens its feature page with it selected. A feature name lists the feature; a plan heading ("Technical Context") opens the plan at that heading. A word only in a document body finds nothing.

## Scenario 8: No JavaScript, narrow screens, browsers (FR-053, FR-009, FR-055, SC-009, SC-011, SC-013, SC-016)

Expected:
- With JavaScript disabled: all pages readable; tree, phases, task rows, clarification sessions and the mobile menu open and close; tabs and links work; map squares jump to their rows; theme follows the OS; no search entry, no theme switch.
- At 375 px: the sidebar is behind the menu control, the tree comes before the map, no horizontal page scroll; tapping a square reveals its task without a tooltip.
- The E2E suite passes in Chromium, Firefox and WebKit; no request leaves the page's own origin.
