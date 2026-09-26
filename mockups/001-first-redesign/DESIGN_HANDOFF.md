# speckit-eye redesign — implementation handoff

This folder holds the approved redesign of the speckit-eye dashboard (a SpecKit
progress viewer). `mockups/*.dc.html` are the source mockups. They are written in a
canvas-tool format (`<x-dc>` markup + a `class Component extends DCLogic` script at
the bottom) and **won't render on their own** — read them as reference for layout,
spacing, copy, colours and interaction logic, not as code to copy verbatim.

The data shown (feature names, task counts, task text) is sample data from the
`byte-flow-studio` project. The real app must derive everything from the `specs/`
folder (`spec.md`, `plan.md`, `tasks.md`, etc.).

## Screens

| Mockup | Screen | Notes |
|---|---|---|
| `Main.dc.html` | Project overview | Sidebar, stats card, Up next bar, feature tree, Task map |
| `Feature.dc.html` | Feature page (Tasks tab) | Header, document tabs, phase rail, task accordion, task detail panel |
| `Doc.dc.html` | Document reader (spec.md) | Icon rail, document list, rich markdown rendering, "On this page" TOC |
| `TaskMap.dc.html` / `TaskMapStates.dc.html` | Task map component + all its states | |
| `StatsCombined.dc.html` | Stats card used on the overview | `StatsOriginal` is a discarded alternative — ignore |
| `*Dark.dc.html` | Same screens forced to dark theme | Wrappers only; no extra markup |

## Global layout

- Left sidebar 272 px, always dark (`--chrome`). Contains: app name, project switcher,
  search button (⌘K), nav (Overview, Constitution), Features list (status dot, name,
  open count or ✓), **theme switch**, version footer. Replaces the old "Menu" button.
- Document reader collapses the sidebar to a 72 px icon rail.
- Fonts: Geist (UI), Geist Mono (IDs, paths, counts), Instrument Serif (big numbers
  and page titles). All from Google Fonts.
- Minimum hit target 36–44 px. Every clickable thing is a real `<button>`/`<a>`.

## Theme (light / dark / system)

- Colours are CSS custom properties on a root element with `class="sk"` and
  `data-theme="light|dark|system"`. System uses `@media (prefers-color-scheme: dark)`.
- Choice stored in `localStorage["sk-theme"]`, default `system`.
- Sidebar, Up next bar and Task map tooltips stay dark in both themes.
- Orange `#C2410C` ("Next") is the same in both themes.

| Token | Light | Dark |
|---|---|---|
| --bg | #F4F3EF | #0E1013 |
| --surface | #FFFFFF | #171A1F |
| --surface-2 | #FAF9F6 | #1C1F25 |
| --subtle | #EEECE6 | #23272E |
| --subtle-2 | #F1EFEA | #262A31 |
| --track | #EAE8E2 | #22262D |
| --border | #E4E1D9 | #2A2E36 |
| --border-strong | #DEDBD3 | #363B45 |
| --text | #15171C | #ECEDF0 |
| --text-2 | #2E3238 | #D6D8DD |
| --text-3 | #3E434C | #BEC2C9 |
| --text-4 | #4A4F59 | #A9AEB7 |
| --muted | #5B606A | #9197A1 |
| --muted-2 | #6B7079 | #8A909A |
| --inv-bg / --inv-fg | #15171C / #FFFFFF | #ECEDF0 / #15171C |
| --chrome | #15171C | #0A0B0E |
| --chrome-2 (Up next) | #15171C | #1F232A |
| --green / --green-text / --green-bg | #1F7A5A / #16603F / #E3F1EA | #3FB27F / #7FD8AE / #163A2B |
| --blue / --blue-text / --blue-bg | #2F5BD3 / #1E3F9E / #E6ECFB | #7C9CF0 / #B4C6F8 / #1F2A48 |
| --blue-bg-2 (selected row) | #EEF2FD | #1B2440 |
| --blue-soft (open in bars) | #C9D5F5 | #33456E |
| --amber-bg / --amber-text | #FEF3C7 / #713F12 | #3A2E0F / #F6D77E |
| --purple-bg / --purple-text | #EFE9FB / #4C2D91 | #2B2242 / #C9B8F5 |
| --red-bg / --red-text | #FDE7DC / #9A3412 | #3D1F14 / #F7AD8A |

Status meaning: done = green, open = blue outline, next task = orange, warning = amber.

## Overview (`Main.dc.html`)

1. **Header** — project name + "Project overview" (serif 48 px).
2. **Stats card** (`StatsCombined`) — one card: 96 % big number + "233 of 242 tasks",
   then Features 2/4, Phases 25/29, Open tasks 9 separated by dividers; below, a
   **full-width progress bar** split into one segment per feature (done / open / next),
   with feature numbers (001, 002…) under the segments, and a legend.
3. **Up next bar** — one slim row: "UP NEXT", task ID chip (orange), raw task text
   (ellipsis, full text on hover), feature › phase (ellipsis), buttons "Open quickstart"
   and "View task".
4. **Features tree** (left column):
   - Header controls: **Order** button cycling *In progress first → Number → Least
     complete → Name A–Z*; segmented **Features | Phases | Tasks** that expands the whole
     tree to that depth.
   - Feature row: chevron, status dot, **number chip (001)**, name (ellipsis), warning
     badge, status pill, mini progress bar, done/total, arrow to feature page.
   - Feature with warnings, when expanded, shows an amber row first: "N checkboxes
     without a task ID in tasks.md", line chips (L23, L254–258), "Details" link.
   - Phase row: chevron (only if it has tasks), "Phase N", title, priority badge
     (P1 filled dark, P2 grey, P3 outlined), done/total.
   - Task row: done/open/next mark, ID, **raw task text with ellipsis**, NEXT badge.
   - Tree scrolls inside its card (max-height ≈ 800 px).
5. **Task map** (right column, 372 px, top aligned with the tree card) — see below.

## Task map (`TaskMap.dc.html`, states in `TaskMapStates.dc.html`)

- Title "Task map" and the toggle button sit **above** the card (like the Features header).
- Default: all tasks as one stacked grid of 13 px squares, 3 px gap.
  Toggle "By feature" ⇄ "Stack all" regroups into per-feature blocks (9 px squares)
  with name and done/total.
- Dot colours: done filled green, open blue outline, next filled orange.
- Hover: dot scales 1.6× with a 2-ring outline, 120 ms ease-out. **Other dots unchanged**
  (no fading).
- Tooltip appears **500 ms** after hover starts, hides immediately on leave. Content: ID,
  status pill, task text clamped to 2 lines with ellipsis, feature name. Positioned above
  the dot; left/right aligned near card edges so it never clips.
- Checkboxes without a task ID are dots too; tooltip says "Checkbox without a task ID".
- **Hovering a dot highlights** its feature, phase and task rows in the tree (light blue
  on ancestors, stronger tint + outline on the deepest visible row).
- **Clicking a dot** expands the tree to that task (feature → phase → task), scrolls the
  tree to it and keeps it outlined as selected.

## Feature page (`Feature.dc.html`)

- Header: status pill, branch chip, serif title, done/total, progress ring.
- **Document tabs** replace the old link list: Tasks (count), Specification, Plan,
  Research, Data model, Quickstart, Contracts (count), Quality checklist.
- **Phase rail**: one block per phase, width proportional to task count. Clicking a block
  (or a phase row below) **opens that phase and closes the others** (accordion); clicking
  the open one closes it. Caption under the rail shows the selected phase.
- Warning banner (amber) for checkboxes without IDs, with "Show lines".
- Filters: All / Open / Tests / Backend / Frontend + text filter + Expand all/Collapse all.
- Task row: chevron, done mark, ID, task text (ellipsis), **kind chip fixed 64 × 22 px**
  (Go test / Go / Vue), **file chip fixed 200 × 22 px** (ellipsis). Chips line up in columns.
- Click a task row → it expands **in place**: the full text wraps, and a row of marker
  tags appears below (story tag, Parallel, FR/SC refs). The detail panel on the right
  shows the same full text, markers and the file paths found in it.

### tasks.md parsing rules

Line format: `- [X] T047 [P] [US2] text…`

- Regex: `^- \[( |x|X)\] (T\d+)((?: \[[^\]]+\])*) (.*)$`
- Markers: `[P]` → "Parallel" tag (purple); `[USn]` → dark tag.
- Inline formatting in the text:
  `` `code` `` → mono chip, `**bold**`, `*em*`, `[text](link)` → link,
  `FR-123` / `SC-45` → blue mono ref chip.
- Files = backticked spans that contain `/` and end in an extension or filename.
- A checkbox line with no `T\d+` ID is still counted, but raised as a warning with its
  line number.
- Never shorten or rewrite task text — show it raw, truncated with ellipsis, full on
  hover/expand.

## Document reader (`Doc.dc.html`)

- 72 px icon rail (includes a vertical light/dark/system switch), 264 px document list
  grouped Define / Design / Contracts / Build, reading column, 240 px "On this page" TOC
  with reading progress.
- Header: eyebrow "SPECIFICATION · spec.md", serif title, metadata card (branch, created,
  status), original request as a serif-italic pull quote.
- Numbered sections (01 Overview, 02 Clarifications…).
- Clarifications: collapsible by session; each Q/A row = question | fixed-width 56 px
  answer badge (Yes / No / Config) + answer, so answers line up in one column.
- User stories: cards with US id, priority badge, phase progress; "Why this priority" and
  "Independent test" boxes; acceptance scenarios as a Given / When / Then table.
- Requirements: filter chips per area; each FR with an ID chip and highlighted MUST.
- Key entities: 2-column grid of cards.
- Expand all and Raw markdown buttons.
