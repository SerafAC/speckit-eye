# Feature Specification: Dashboard Redesign — Sidebar Shell, Task Map, Feature Pages, Document Reader and Themes

**Feature Branch**: `002-dashboard-redesign` (spec directory; no branch hook is configured — development happens on `claude/sharp-feynman-cmcr6y`)

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "Take a look at @mockups/001-first-redesign. I also attach screenshots with snapshots. Prepare a plan for the app redesign designed in a described way. Consider if at that point any existing framework would simplify implementation."

The approved redesign lives in `mockups/001-first-redesign/`: `DESIGN_HANDOFF.md` (the written handoff) and `mockups/*.dc.html` (the source mockups, read as reference only). Five screenshots accompany the request: the task map in all its states, the overview in light and dark, the feature page (Tasks tab), and the document reader showing a `spec.md`. The data in the mockups (the `byte-flow-studio` project) is sample data; the real pages derive everything from the project's `specs/` and `.specify/` folders, as the dashboard does today (spec `001-speckit-eye-dashboard`).

## Clarifications

### Session 2026-09-26

- Q: Should search be part of this redesign, and how far should it reach? → A: Yes: a ⌘K search over tasks (ID and text), features, and document titles and section headings. The full text of documents is not searched.
- Q: What should clicking a task map square do — reveal the task in the overview tree (handoff) or open it on its feature page ("Task map — all states" board)? → A: Reveal it in the tree, as in the handoff: expand its feature and phase, scroll the tree to it and keep it outlined as selected.
- Q: How should blocked tasks look, now that the redesign has no blocked color? → A: Keep a fourth, distinct color for blocked tasks in the map, the tree and the legend, and have the task detail panel say which open tasks the task is waiting on (for example "Waiting on T012").
- Q: Must every page stay readable and navigable, with the tree, phases, task rows and collapsible document parts still opening and closing, when JavaScript is turned off? → A: Yes: keep today's promise. Without scripts, all content is readable, links and tabs work, and those parts open and close; everything else is an enhancement that needs scripts.
- Q: Which browsers must the redesigned pages fully support? → A: The last two major versions of Chrome, Edge, Firefox and Safari, with end-to-end tests in all three browser engines (Chromium, Firefox, WebKit).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where the project stands in the new overview (Priority: P1)

A Spec Kit user opens the dashboard and lands on the redesigned overview. A dark sidebar on the left names the project, lists the features with a status dot and their open-task count (or a done mark), and offers Overview and Constitution. The main area opens with a large percentage for the whole project and the done/total task count, next to three counters: features completed (with how many are in progress), phases completed (with how many remain), and open tasks (with how many features they span). One bar below splits the project into one segment per feature, showing the done, open and next parts of each. A slim "Up next" bar names the next task (full text on hover), its feature and phase, with buttons to open the quickstart and to view the task. Below, the feature tree lists every feature with its number, status pill, warnings, mini progress bar and done/total count; the user can re-order it, expand the whole tree to features, phases or tasks in one click, and see warnings as amber rows with their line numbers.

**Why this priority**: The overview is the first screen and the core of the product. The sidebar shell introduced here is the frame every other page uses, so every other story depends on it.

**Independent Test**: Run serve mode against a fixture with features in every state (complete, in progress, not started, spec only, with warnings). Open the overview and confirm the sidebar list, stats card numbers, segmented bar, Up next bar, tree order, depth control and warning rows against the fixture's `tasks.md` counts.

**Acceptance Scenarios**:

1. **Given** a project with four features holding 123/123, 24/32, 72/72 and 14/15 done tasks, **When** the overview opens, **Then** the stats card shows "96 %" and "233 of 242 tasks", Features "2 / 4" with "2 in progress", and Open tasks "9" with "across 2 features".
2. **Given** the same project, **When** the overview opens, **Then** the segmented bar has one segment per feature, in folder order, whose widths are proportional to 123, 32, 72 and 15, each coloured by its done, open and next tasks, with the feature numbers under the segments.
3. **Given** the next task is T015 of feature 005, **When** the overview opens, **Then** the Up next bar shows "T015", the task text exactly as written in `tasks.md` (cut off with an ellipsis if too long, in full on hover), the feature and phase, an "Open quickstart" button (because feature 005 has a quickstart) and a "View task" button that opens T015 on the feature page.
4. **Given** the tree in its default order, **When** the user activates the Order control repeatedly, **Then** the order cycles through "In progress first", "Number", "Least complete" and "Name A–Z", and the control's label always names the current order.
5. **Given** a collapsed tree, **When** the user chooses "Tasks" in the depth control, **Then** every feature and every phase with tasks is expanded; **When** they choose "Features", **Then** everything is collapsed to feature rows.
6. **Given** a feature with six checkboxes without a task ID on lines 23 and 254–258 of its `tasks.md`, **When** the feature is expanded, **Then** its first row is an amber warning "6 checkboxes without a task ID in tasks.md" with line chips "L23" and "L254–258" and a "Details" link, and the feature row shows a "6 warnings" badge.
7. **Given** the overview, **When** the user chooses "Open tasks only", **Then** complete features, complete phases and done tasks disappear from the tree; **When** they choose "All features", **Then** everything is back.
8. **Given** the user changed the order, depth or filter, **When** a `tasks.md` changes on disk and the page updates live, **Then** the order, filter, expanded rows and scroll position are unchanged.
9. **Given** a feature in the sidebar list, **When** the user activates it, **Then** its feature page opens and the feature is marked as current in the sidebar.

---

### User Story 2 - Explore every task on the task map (Priority: P2)

Next to the tree, the task map shows one square per task in the project: green when done, a blue outline when open, a distinct blocked color when it still waits on another open task, and orange for the next task. By default all squares form one stacked grid; "By feature" regroups them into one labelled block per feature with its done/total count, and "Stack all" returns to one grid. Hovering a square makes it grow and, after half a second, shows a dark tooltip with the task ID, a status pill, the first two lines of the task text and the feature name, while the task's feature, phase and row light up in the tree. Clicking a square reveals the task in the tree: its feature and phase open, the tree scrolls to it, and its row stays outlined; from there the row leads on to the task's feature page.

**Why this priority**: The map is the fastest way to see how much is left and where, and to jump to any task. It builds on the overview (US1) but is a separate, testable component.

**Independent Test**: Open the overview of a fixture, hover squares near the middle and near both edges of the map, wait for the tooltip, toggle "By feature" / "Stack all", and click a square; confirm the tooltip timing, content and placement, the tree highlight, the regrouping and the click result.

**Acceptance Scenarios**:

1. **Given** the overview, **When** it opens, **Then** the map shows one square per task (checkboxes without a task ID included), grouped as one stacked grid, with a legend "Done N · Open N · Blocked N · Next N · 1 dot = 1 task" whose numbers add up to the project's task total.
2. **Given** the stacked map, **When** the user activates "By feature", **Then** the squares regroup into one block per feature with the feature name and its done/total count, the squares become smaller, and the button now reads "Stack all"; activating it again restores the stacked grid.
3. **Given** the pointer enters a square, **When** less than half a second has passed, **Then** the square has grown with a visible ring and no tooltip is shown, and all other squares look unchanged; **When** half a second has passed, **Then** the tooltip appears above the square with the task ID, status pill, at most two lines of task text and the feature name.
4. **Given** a square in the first or last columns of the map, **When** its tooltip appears, **Then** the tooltip is aligned to that side so that it is fully visible and not cut off by the card or the window.
5. **Given** a visible tooltip, **When** the pointer leaves the square, **Then** the tooltip disappears at once.
6. **Given** a square whose task sits in a collapsed phase, **When** the user hovers it, **Then** the task's feature (and phase, if visible) rows are tinted in the tree, the deepest visible one more strongly and outlined, and the tint disappears when the pointer leaves.
7. **Given** a square whose task sits in a collapsed feature, **When** the user clicks it or presses Enter on it, **Then** the task's feature and phase (and story, where the phase has a story level) expand in the tree, the tree scrolls inside its card to the task row, and the row stays outlined as selected until the user chooses another square or row or clicks elsewhere; **When** the user then activates the task ID in that row, **Then** the task opens on its feature page.
8. **Given** a checkbox without a task ID, **When** its square is hovered, **Then** the tooltip says "Checkbox without a task ID" instead of an ID.
9. **Given** open task T020 says "depends on T012" and T012 is still open, **When** the map is shown, **Then** T020's square and its tree row use the blocked color and its tooltip's status pill reads "Blocked"; **When** T012 is checked in `tasks.md`, **Then** after the live update T020 is shown as an ordinary open task.

---

### User Story 3 - Work through a feature on its feature page (Priority: P2)

Each feature gets its own page. Its header shows the status, the feature folder name, the title, "done / total tasks · X of Y phases" and a progress ring. Tabs lead to the feature's documents: Tasks (with count), Specification, Plan, Research, Data model, Quickstart, Contracts (with count) and the quality checklist. On the Tasks tab, a phase rail shows one block per phase, sized by its task count; choosing a block opens that phase and closes the others. Filters narrow the list to open tasks, tests or a kind of file, or by a word, ID or file name. Each task row shows its ID, its text as written in `tasks.md` with inline formatting, a kind chip (for example "Go test", "Go", "Vue") and a file chip, aligned in columns. Clicking a task expands it in place to its full text and markers, and a detail panel beside the list shows the full text, phase, markers and file paths, with "Copy ID" and "View source line".

**Why this priority**: This is where people inspect the work of one feature in detail; it replaces reading `tasks.md` by hand. It depends on the shell (US1) but not on the map.

**Independent Test**: Open a fixture feature's page, check the header counts, tab set, phase rail widths and accordion behavior, each filter, a row expansion and the detail panel against the fixture's files.

**Acceptance Scenarios**:

1. **Given** a feature with 123 tasks in 10 phases, all done, **When** its page opens, **Then** the header shows a "Complete" pill, the folder name, the title, "123 / 123 tasks · 10 of 10 phases" and a full progress ring with a check mark.
2. **Given** a feature with `spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`, four contracts and a quality checklist, **When** its page opens, **Then** the tabs are Tasks, Specification, Plan, Research, Data model, Quickstart, Contracts (4) and Quality checklist; **Given** a feature without `research.md`, **Then** it has no Research tab.
3. **Given** the phase rail, **When** the page opens, **Then** each phase block's width is proportional to its task count, shows its short name and task count, and the caption names the selected phase (or "None").
4. **Given** phase 4 is open, **When** the user chooses phase 6 in the rail or in the list, **Then** phase 6 opens and phase 4 closes; **When** they choose phase 6 again, **Then** it closes and no phase is open.
5. **Given** the filter "Open", **When** it is chosen, **Then** only open tasks are listed, each phase with matches is shown open, phases without matches are hidden, and the chip shows how many tasks match; **Given** the text filter "simulator", **Then** only tasks whose ID, text or file names contain "simulator" are listed; **Given** a filter that matches nothing, **Then** a message says so and offers to clear the filters.
6. **Given** task T047 is collapsed, **When** the user clicks its row, **Then** the row expands in place with the full text wrapped and its markers (for example "US2", "Parallel", FR/SC references) below it, and the detail panel shows T047 with its status, full text, phase, markers and every file path in the text.
7. **Given** the detail panel shows T047, **When** the user activates "Copy ID", **Then** "T047" is on the clipboard and a short confirmation is shown; **When** they activate "View source line", **Then** the `tasks.md` document opens at the line of T047 with that line highlighted.
8. **Given** a task text containing `` `internal/input/simulator_test.go` ``, **When** the row is shown, **Then** the kind chip reads "Go test" and the file chip reads "simulator_test.go"; a task naming two files shows "2 files".
9. **Given** the feature has checkboxes without task IDs, **When** the page opens, **Then** an amber banner states how many and on which lines, and "Show lines" reveals those source lines.
10. **Given** an address that names a task of this feature (as used by "View task"), **When** it is opened, **Then** that task's phase is open, the task is expanded, selected in the detail panel and scrolled into view.
11. **Given** open task T020 depends on T012 and T013, of which only T012 is still open, **When** T020 is selected, **Then** its mark and status show it as blocked, and the detail panel says "Waiting on T012" (T013, being done, is not named).

---

### User Story 4 - Choose a light, dark or system theme (Priority: P2)

Every page offers a three-way theme switch — Light, Dark, System — in the sidebar (and, on document pages, in the icon rail). System follows the operating system's setting. The choice applies at once to every page of the dashboard, is remembered in that browser for later visits, and pages never flash in the other theme while loading. In both themes the sidebar, the Up next bar and the map tooltips stay dark and the "next" orange stays the same.

**Why this priority**: Dark mode is requested by the design and used by most developer tools; it is small and independent of the other stories once the shell exists.

**Independent Test**: With the operating system in light mode, choose Dark on the overview, open a feature page and a document, reload, and trigger a live update; confirm every page is dark without a light flash. Then choose System and switch the operating system to dark and back.

**Acceptance Scenarios**:

1. **Given** no earlier choice, **When** a page opens, **Then** the switch shows System and the page follows the operating system's light or dark setting.
2. **Given** System is chosen and the page is open, **When** the operating system switches between light and dark, **Then** the page follows without a reload.
3. **Given** the user chooses Dark, **When** they open any other page, reload, or come back the next day in the same browser, **Then** the page shows dark from its first paint, with no flash of the light theme.
4. **Given** either theme, **When** the overview is shown, **Then** the sidebar, the Up next bar and the map tooltip are dark, and the next-task orange is identical in both themes.
5. **Given** the browser refuses to store the choice (for example a strict private mode), **When** the user picks a theme, **Then** the current page still switches, and later pages fall back to System.

---

### User Story 5 - Read specs and other documents in the document reader (Priority: P3)

Opening any document (for example from a feature page tab) shows it in a reading layout: the sidebar shrinks to an icon rail, a document list groups the feature's documents under Define, Design, Contracts and Build, the text sits in a comfortable reading column, and an "On this page" panel lists the sections, marks the one being read and shows how far the reader has got. A `spec.md` is shown with extra structure: a metadata card (branch, created, status), the original request as a pull quote, numbered sections, clarifications grouped by session with answers aligned in one column, user stories as cards with their priority, "Why this priority", "Independent test", a Given / When / Then table and the progress of their phase, functional requirements filterable by area with the normative keywords highlighted, and key entities as a grid of cards. "Expand all" opens every collapsed part, and "Raw markdown" shows the file's source.

**Why this priority**: Every document is already readable today; this story makes them much easier to read and navigate, but the other stories deliver value without it.

**Independent Test**: Open this repository's own `specs/001-speckit-eye-dashboard/spec.md` and a fixture's `plan.md` and contract in the reader; check the document list, the contents panel, each structured `spec.md` section, "Expand all", "Raw markdown", and that no line of the source is missing.

**Acceptance Scenarios**:

1. **Given** a feature with a specification, a quality checklist, a plan, research, a data model, a quickstart, four contracts and tasks, **When** its specification opens in the reader, **Then** the document list shows Define (Specification, Quality checklist), Design (Implementation plan, Research, Data model, Quickstart), Contracts (the four contracts by title) and Build (Tasks), with Specification marked as current, and a link back to the feature page.
2. **Given** a `spec.md` with the standard header fields, **When** it opens, **Then** a metadata card shows the feature branch, the creation date and the status, and the user's original request is shown as a pull quote.
3. **Given** a `spec.md` with three clarification sessions and 13 answers, **When** it opens, **Then** the Clarifications section says "13 answered · 3 sessions", the first session is open showing its first three answers and a "Show N more answers" control, the other sessions are collapsed with their question counts, and every answer's badge ("Yes", "No" or a neutral badge) sits in one aligned column.
4. **Given** a user story with acceptance scenarios written as "**Given** … **When** … **Then** …", **When** it is shown, **Then** its card has the story ID, priority badge and title, "Why this priority" and "Independent test" boxes, and a table with one row per scenario and Given, When and Then columns; the card names the phase that implements the story with its done/total tasks.
5. **Given** functional requirements grouped under area headings, **When** the user picks an area chip, **Then** only that area's requirements are listed, each with its ID chip and with MUST (and the other normative keywords) highlighted; the default choice lists all requirements.
6. **Given** the reader, **When** the user scrolls through the document, **Then** the "On this page" panel marks the section in view and its progress indicator advances.
7. **Given** the reader, **When** the user activates "Raw markdown", **Then** the file's exact source text is shown, and activating it again returns to the formatted view.
8. **Given** a `spec.md` section that does not follow the template (for example free text under "User Scenarios"), **When** it is shown, **Then** it is rendered as ordinary formatted text and nothing from the file is lost.

---

### User Story 6 - Find a task, feature or document with search (Priority: P3)

From any page, the user presses ⌘K (Ctrl+K on Windows and Linux) or activates the "Search tasks, specs…" entry in the sidebar or icon rail. A search box opens over the page. As they type, results appear in three groups: Tasks (state mark, ID, text and feature), Features (number, name and status) and Documents (document title or section heading, with the feature it belongs to). Arrow keys move through the results, Enter opens the chosen one, and Escape closes the box. A task opens selected on its feature page, a feature opens its feature page, and a document or heading opens the reader at that place.

**Why this priority**: Useful on large projects, but every item is already reachable by navigation.

**Independent Test**: In serve mode and in a static build of a fixture served under a sub-path, open search with the keyboard shortcut and with the sidebar entry, search for a task ID, a word from a task text, a feature name and a section heading, and open one result of each kind.

**Acceptance Scenarios**:

1. **Given** any page, **When** the user presses ⌘K (or Ctrl+K) or activates the search entry, **Then** a search box opens with the cursor in it; **When** they press Escape, **Then** it closes and focus returns to where it was.
2. **Given** the search box, **When** the user types "T047", **Then** task T047 is the first result, shown with its state mark, text and feature.
3. **Given** the search box, **When** the user types "moving average", **Then** every task whose ID or text contains both words is listed under Tasks, and features and documents whose name, title or section headings contain both words are listed in their own groups.
4. **Given** results, **When** the user moves with the arrow keys and presses Enter on a task, **Then** the task's feature page opens with the task selected, expanded and in view (FR-036); **When** they choose a section heading, **Then** the reader opens scrolled to that heading.
5. **Given** a search with no matches, **When** it runs, **Then** the box says that nothing was found.
6. **Given** a word that appears only in the body text of a document, **When** the user searches for it, **Then** that document is not listed (only titles and headings are searched).
7. **Given** a static build served under a sub-path, **When** the user searches, **Then** search behaves as in serve mode, without contacting any server other than the site's own.
8. **Given** serve mode, **When** a task is added to a `tasks.md` and the page updates live, **Then** the new task can be found without reloading the page.

---

### Edge Cases

- **Empty project or no tasks at all**: the stats card shows 0 % with a short explanation, the segmented bar and the task map show an empty state instead of an empty box, and the Up next bar says there are no tasks yet.
- **All tasks done**: no square or row is orange, the Up next bar says every task is complete, and the stats card shows 100 %. A feature named by `.specify/feature.json` or the git branch stays highlighted as in spec 001 (001 FR-018).
- **Feature without `tasks.md`** (spec only, or planned): the sidebar shows a grey dot and its stage; its tree row shows its stage as the status pill and no progress bar; it has no segment in the bar and no squares on the map; its feature page opens with an empty Tasks tab that explains the stage.
- **Many features** (up to 50): segments too narrow for their number show no label but stay visible; the sidebar list scrolls on its own; the Features list header still reads "N / M done".
- **Large projects**: up to 1,000 tasks the map opens stacked, from 1,001 to 5,000 it opens "By feature", and above 5,000 it shows one progress bar per feature, as in spec 001; the tree and feature pages are unchanged.
- **Long names and texts**: feature names, task texts, phase titles and file names that do not fit are cut off with an ellipsis and shown in full on hover, on expansion, or in the detail panel. Task text is never reworded or shortened in the data, only visually truncated.
- **Blocked tasks**: a task is blocked under the rule of spec 001 (001 FR-015c): it is open and its "depends on" wording names at least one task that is still open. It counts as open in every count and in the segmented bar; the next task is never shown as blocked (as in spec 001); a dependency on a task ID that does not exist is ignored for the blocked state and raises a warning.
- **Search with many matches**: each group lists its best matches first (a task ID typed in full first, then matches at the start of a name, title or heading, then the rest, each in page order) and shows only its first matches with a count of the others; typing more narrows the list.
- **Checkbox without a task ID**: counted and shown as a square and a row labelled "No ID"; it is part of a warning; it has no address of its own on the feature page.
- **Duplicate task IDs**: each occurrence is its own square and row and can be selected on its own; the warning from spec 001 still applies.
- **Phase without tasks**: its row shows "—" and no chevron; in the phase rail it is a narrow block that cannot be opened; it counts toward no phase total (as in spec 001).
- **Phase mixing several user stories**: the story sub-level of spec 001 stays in the overview tree; on the feature page, the story is shown as a marker on each task.
- **Task naming no file**: its kind and file chips are empty, but the columns stay aligned. A task naming a file with an unknown extension shows the extension as its kind.
- **Tooltip near the window edge** or when the map is scrolled: the tooltip always stays fully visible.
- **Warnings of other kinds** (unknown story label, dependency on a missing task, duplicate IDs, unreadable file, file name not supported): each kind gets its own amber row with its line numbers, like the missing-ID warning.
- **`spec.md` not following the template**, a clarification not written as "Q: … → A: …", or a scenario that does not split into Given / When / Then: shown as ordinary formatted text (a scenario as one full-width table row); nothing is dropped.
- **Documents with raw HTML or scripts**: shown as text, as in spec 001 (001 FR-024), also in the structured `spec.md` view, the tooltips and the detail panel.
- **Live update removes the selected task or the open document**: the selection is cleared; a deleted document shows the notice from spec 001 with a link back to the overview.
- **Scripts disabled** (for example a hosted snapshot): all content is readable, the tree, phases and task rows still open and close, tabs and document links work, and the page follows the operating system's theme; the theme switch, tooltips with delay, ordering, depth control, filters, detail panel, copy, contents highlighting, search and live updates need scripts, and the search entry is not shown.
- **Narrow screens** (phones): the sidebar collapses behind a menu control at the top, columns stack (tree before map; list before detail panel), tabs and the phase rail scroll sideways inside their own area, and the reader hides the contents panel and puts the document list behind a control.
- **Reduced-motion preference**: square growth, tooltip fade, expand/collapse and progress animations are turned off; the information is still shown.
- **Browser storage unavailable**: theme, order, filter and map mode fall back to their defaults on every load; the controls still work on the current page.

## Requirements *(mandatory)*

### Functional Requirements

**Scope and what stays the same**

- **FR-001**: Every behavior of spec 001 that this spec does not change MUST keep working as specified there, in particular: the tool only reads the project (001 FR-006); serve mode is local-only and serves only artifacts and its own assets (001 FR-007); counting, stage and active-item rules (001 FR-010 to FR-014, FR-018); live updates (001 FR-026 to FR-030); static builds under a sub-path with the same pages as serve mode (001 FR-031 to FR-034); rendered documents cannot run scripts (001 FR-024); nothing is fetched from third-party servers at view time (001 FR-038); reduced motion is honored (001 FR-036).
- **FR-002**: This spec replaces the overview layout, tree, grid and colors of spec 001 (001 FR-015, FR-015a, FR-015b, FR-017, FR-019a), the header menu (001 FR-022, FR-025) and the visual style (001 FR-035), and brings theme switching and search into scope (both listed as out of scope in spec 001).
- **FR-003**: Visual values — colors for both themes, type families and sizes, spacing, component sizes and timings — MUST follow the approved design handoff (`mockups/001-first-redesign/DESIGN_HANDOFF.md`) and mockups; where this spec and the handoff differ, this spec wins.
- **FR-004**: The redesign MUST NOT weaken the page security rules serve mode enforces today (what a page may load and run), and every font, icon and other asset it uses MUST ship with the tool.

**App shell (every page)**

- **FR-005**: Every page except document pages MUST show a left sidebar that stays dark in both themes, containing: the tool name, the project name, a search entry (FR-049), navigation to the overview, to the constitution (when present) and to each assessment (when present), a Features list headed "Features N / M done", the theme switch (FR-045), and a footer with the tool version (plus the generation time in static builds).
- **FR-006**: Each entry of the sidebar Features list MUST show a status dot (done: filled green; in progress: blue ring; not started or no tasks: grey), the feature name (truncated, full on hover) and either its open-task count or a done mark; entries are listed in the "In progress first" order (FR-012). The current page's entry MUST be marked.
- **FR-007**: Document pages MUST replace the sidebar with a narrow icon rail offering the same destinations and the theme switch (FR-045).
- **FR-008**: The old header, header links and Menu MUST be removed; everything they reached MUST be reachable from the sidebar, the icon rail or a feature page. Every artifact MUST remain reachable from the overview in at most two page navigations (001 SC-004); a tab that stands for several documents (for example Contracts) MUST list them without a page navigation.
- **FR-009**: On narrow screens the sidebar MUST collapse behind a menu control at the top of the page, and no page may need horizontal scrolling of the whole page.

**Overview**

- **FR-010**: The overview MUST show, top to bottom: the project name and the title "Project overview" with a view filter "All features" / "Open tasks only"; the stats card (FR-011); the Up next bar (FR-013); then the Features tree (left) and the task map (right, a narrow column whose card top-aligns with the tree card). On narrow screens the tree comes before the map.
- **FR-011**: The stats card MUST show: the overall completion as a whole percentage with "done of total tasks"; Features completed / total with the number in progress (features with both done and open tasks); Phases completed / total with the number remaining (phases with tasks that are not complete); Open tasks with the number of features that have open tasks. Below them, a bar with one segment per feature that has tasks, in folder order, each as wide as its share of all tasks and split into its done, open and next parts (blocked tasks count as open here); each segment is labelled with the feature number where the label fits and names the feature and its counts on hover; a legend explains Done, Open and Next up.
- **FR-012**: The tree header MUST offer an Order control that cycles "In progress first" (default: features with open tasks, then features without tasks, then complete features; highest number first within each group), "Number" (folder order), "Least complete" (lowest completion first; features without tasks last) and "Name A–Z", and a depth control "Features | Phases | Tasks" that expands the whole tree to that level; after the user expands or collapses a row by hand, no depth is shown as selected. The task map is not affected by the order.
- **FR-013**: The Up next bar MUST stay dark in both themes and show the next task's ID, its text exactly as written in `tasks.md` on one line (truncated, full on hover), its feature and phase, "Open quickstart" (only when the active feature has a quickstart document) and "View task", which opens the task on its feature page (FR-036). When there is no next task, the bar MUST say why (all tasks complete, or no tasks yet).
- **FR-014**: A feature row MUST show an expand control, status dot, feature number chip, feature title (truncated), a warnings badge when it has warnings, a status pill ("N open", "Complete", or its stage when it has no tasks or none done), a mini progress bar, "done/total", and a link to its feature page.
- **FR-015**: An expanded feature with warnings MUST start with one amber row per kind of warning, giving the count and meaning (for example "6 checkboxes without a task ID in tasks.md — counted, not linkable"), the affected lines as chips with consecutive lines merged into ranges ("L254–258"), and a "Details" link to the warning on the feature page.
- **FR-016**: A phase row MUST show an expand control only when the phase has tasks, "Phase N", its title, a priority badge when the phase belongs to one user story (P1 filled dark, P2 grey, P3 outlined), and "done/total" with a done mark when complete or "—" when it has no tasks. The story sub-level for phases that mix stories stays as in spec 001.
- **FR-017**: A task row MUST show a done, open, blocked or next mark, the task ID (a link to the task on its feature page, FR-036), the raw task text on one line (truncated, full on hover) and, on the next task, a "NEXT" badge with the row tinted.
- **FR-018**: The tree MUST scroll inside its own card when it is taller than about one screen. On load, only the active chain is expanded (001 FR-016).
- **FR-019**: "Open tasks only" MUST hide complete features, complete phases and done tasks from the tree; "All features" (default) shows everything. The stats card and the task map are not filtered.
- **FR-020**: The order, depth, filter, expanded rows and scroll position MUST survive live updates; the order and filter MUST also be remembered when the user returns to the overview in the same browser.

**Task map**

- **FR-021**: The task map's title and its mode toggle MUST sit above its card, like the Features header. The default mode shows every task — including checkboxes without a task ID — as one square in a single stacked grid, in folder order and task order; "By feature" regroups the squares into one block per feature with its name and done/total count and smaller squares; the toggle then reads "Stack all" and returns to the stacked grid.
- **FR-022**: Squares MUST be colored by task state: done filled green, open blue outline, blocked a fourth color that is clearly distinct from the other three (the next-task orange included) in both themes, and next filled orange. A task is blocked under the rule of spec 001 (see Edge Cases). The overview tree and the feature page MUST use the same blocked mark.
- **FR-023**: A legend under the map MUST give the number of done, open, blocked and next squares and state "1 dot = 1 task" (or what one mark stands for in the large-project modes).
- **FR-024**: When the pointer enters a square, the square MUST grow to about 1.6 times its size with a two-ring outline within about 120 ms, and no other square may change. A dark tooltip MUST appear 500 ms after the pointer entered (at once on keyboard focus) and disappear at once when it leaves. It MUST show the task ID (or "Checkbox without a task ID"), a status pill, the task text limited to two lines with an ellipsis, and the feature name. It MUST sit above the square and be aligned left or right near the edges so it is never cut off.
- **FR-025**: While a square is hovered or focused, the rows of its feature, phase and task in the tree MUST be tinted: the ancestors lightly, the deepest visible row more strongly and outlined.
- **FR-026**: Clicking a square or pressing Enter on it MUST reveal its task in the overview tree: expand its feature, its phase and, where present, its story level; scroll the tree card to the task row; and keep that row outlined as selected until the user chooses another square or row or clicks elsewhere. Without scripts, the click still jumps to the task row (as in spec 001). The task ID in the row leads on to the feature page (FR-017).
- **FR-027**: For large projects the map MUST open "By feature" from 1,001 tasks and show one progress bar per feature above 5,000 tasks (the thresholds of spec 001).
- **FR-028**: The chosen mode MUST survive live updates and be remembered in the same browser; the map MUST stay usable without scripts (every square keeps its color and identifies and links to its task).

**Feature page**

- **FR-029**: Every feature MUST have a feature page, reachable from the sidebar, from its tree row, from the Up next bar and from the task map or tree for any of its tasks.
- **FR-030**: The feature page header MUST show a breadcrumb (Overview / Features), the status pill, the feature folder name, the title, "done / total tasks · completed of total phases" and a progress ring that shows a check mark when the feature is complete.
- **FR-031**: The feature page MUST have one tab per existing document kind, in this order: Tasks (with task count; always present), Specification, Plan, Research, Data model, Quickstart, Contracts (with count), the checklist(s) ("Quality checklist" for a single requirements checklist, otherwise "Checklists" with count) and "More" (with count) for every other Markdown file of the feature. Tabs other than Tasks open the document in the reader (US5); tabs with several documents list them first (FR-008).
- **FR-032**: The Tasks tab MUST show a phase rail with one block per phase, as wide as its share of the feature's tasks (with a minimum width so the label fits), showing the phase's short name and task count and colored by the phase's status; a caption states that width means task count and names the selected phase. Choosing a block or a phase row MUST open that phase and close the others; choosing the open phase closes it. On load, the active phase is open (or none, when the feature has no open tasks), unless the address names a task (FR-036).
- **FR-033**: Warnings of the feature MUST be shown as an amber banner with their line numbers and a "Show lines" control that reveals the source lines concerned.
- **FR-034**: The Tasks tab MUST offer filter chips — All (count), Open (count, blocked tasks included), Tests, and one chip per kind of file found in the feature's tasks — a text filter matching the task ID, the task text and file names, and "Expand all" / "Collapse all". Chips and text combine; while any filter is active, every phase with matches is open and phases without matches are hidden; when nothing matches, a message says so with a way to clear the filters.
- **FR-035**: A task row MUST show an expand control, the done/open/blocked/next mark, the ID, the task text on one line with an ellipsis and its inline formatting rendered (code, bold, emphasis, links, and FR-/SC- references as chips), a kind chip and a file chip; kind and file chips have fixed sizes so they line up in columns. The kind comes from the first file named in the task: a test file (its name or folder marks it as a test) gives "<kind> test", otherwise the kind of the file (for example Go, Vue, JavaScript, Markdown). The file chip shows the file name, or "N files" when the task names several.
- **FR-036**: Clicking a task row MUST expand it in place (full text wrapped, markers below: user story, "Parallel", FR/SC references, dependencies) and select it; a second click collapses it. The detail panel MUST show the selected task's ID, status, full text, phase, markers and every file path found in the text; for a blocked task it MUST also say which of its dependencies are still open (for example "Waiting on T012" or "Waiting on T012, T013"); with "Copy ID" and "View source line" (opens the `tasks.md` document at that task's line, highlighted), and can be closed. The page address MUST identify the selected task, so opening that address shows the task open, selected and in view.
- **FR-037**: Task text MUST be shown exactly as written in `tasks.md` (only visually truncated); file paths are the backticked spans that look like paths (contain a `/` and end in a file name).

**Document reader**

- **FR-038**: Every document page (every artifact of spec 001 FR-021: feature documents, the constitution and assessments) MUST use the reader layout: icon rail, document list, reading column and an "On this page" contents panel.
- **FR-039**: The document list MUST show a link back to the feature page, the feature title and status, and the feature's documents in the groups Define (specification, checklists), Design (plan, research, data model, quickstart), Contracts (each by title), Build (tasks) and Other (the rest), leaving out empty groups and marking the current document. Project documents (constitution, assessments) get a project document list instead.
- **FR-040**: The reader header MUST show the document kind and file name, the title, "Expand all" and "Raw markdown"; "Raw markdown" shows the exact source text and toggles back. Top-level sections MUST be numbered in order (01, 02, …).
- **FR-041**: The contents panel MUST list the document's sections (and, for a specification, its user stories under their section), mark the section being read, show reading progress, and jump to a section when chosen.
- **FR-042**: A `spec.md` MUST be shown with these structures wherever the file follows the Spec Kit template: a metadata card (feature branch, created, status); the original request as a pull quote; clarifications grouped by session (collapsible, the first open, "N answered · M sessions" in the heading, question count per session, the first three answers then "Show N more answers"), each answer shown as question, a fixed-width badge ("Yes" or "No" when the answer starts with that word, otherwise a neutral badge) and the answer text; user stories as cards (ID, priority badge, title, description, "Why this priority", "Independent test", a numbered Given / When / Then table, and the phase implementing the story with its done/total), the first story open and the others as collapsed rows with their scenario count; functional requirements with area chips (an "All" choice as default) and each requirement's ID chip with the normative keywords MUST, MUST NOT, SHOULD, SHOULD NOT and MAY highlighted; key entities as a two-column grid of cards.
- **FR-043**: Anything that does not match those structures — other sections, other documents, and deviating parts of a `spec.md` — MUST be rendered as ordinary formatted text (001 FR-020). No line of a document may be missing from the reader, and wording is never changed.
- **FR-044**: In a `tasks.md` document, every task line MUST be addressable so that "View source line" lands on it and highlights it.

**Theme**

- **FR-045**: Every page MUST offer a theme switch with Light, Dark and System; System is the default and follows the operating system, including changes while the page is open.
- **FR-046**: The choice MUST apply to every page of the dashboard, be remembered in that browser across pages, visits and live updates, and be in effect from a page's first paint.
- **FR-047**: In both themes, the sidebar, the icon rail, the Up next bar and the map tooltips MUST stay dark, the next-task orange MUST be identical, and done, open, blocked, next and warning MUST keep their meaning and color family.
- **FR-048**: Without scripts, pages MUST follow the operating system's theme.

**Search**

- **FR-049**: Every page MUST offer search, opened with ⌘K (Ctrl+K on Windows and Linux) or with the search entry in the sidebar or icon rail, in a box over the current page that closes with Escape and returns focus to where it was.
- **FR-049a**: Search MUST find tasks by ID and text, features by number and name, and documents by title and section headings; it MUST NOT search the body text of documents. Matching ignores case, every typed word must match, and a task ID typed in full comes first. Results MUST be grouped as Tasks, Features and Documents, each group showing its best matches first and how many more there are, with a message when nothing matches.
- **FR-049b**: Results MUST be usable by keyboard (arrow keys, Enter) and pointer. A task opens selected on its feature page (FR-036), a feature opens its feature page, and a document or heading opens the reader at that document or heading.
- **FR-049c**: Search MUST work the same in serve mode and in static builds (under a sub-path too), MUST find what the page shows after a live update without a reload, and MUST NOT contact any server other than the site's own.

**Cross-cutting**

- **FR-050**: Every clickable element MUST be a real link or button, reachable and usable by keyboard with a visible focus ring, with a hit target of at least 36 px (task map squares excepted, which stay reachable by keyboard).
- **FR-051**: Live updates MUST keep all view state of every page: theme, order, depth, filters, text filter, map mode, expanded rows, open phase, selected task, reader expansions and raw view, and scroll positions (page, tree card and task list); items whose status or counts changed are still briefly highlighted (001 FR-028).
- **FR-052**: Static builds MUST contain the same pages and behavior as serve mode (except live updates and with the generation time shown), work under a sub-path, and support every redesign behavior that runs in the browser (theme, map, filters, reader, search).
- **FR-053**: Without scripts, every page's content MUST stay readable, every link and tab MUST work, and the tree, phases, task rows and collapsible document parts MUST still open and close (001 FR-037; the README's "Works without JavaScript" promise stands). Any design choice that needs scripts to show content or to navigate is ruled out.
- **FR-055**: Every page and behavior in this spec MUST work in the last two major versions of Chrome, Edge, Firefox and Safari; a browser feature not available in all of them may only be used where the page stays correct without it.
- **FR-054**: The user documentation (`README.md` screenshot and feature list, `docs/usage.md`) and `CHANGELOG.md` MUST describe the new layout, the task map, feature pages, the document reader, the theme switch and search.

### Key Entities

- **Feature status (display)**: done, in progress or not started, plus the stage from spec 001 when a feature has no tasks; drives the dot, pill, bar and ordering.
- **Task display state**: done, open, blocked or next (FR-022); a blocked task knows which of its dependencies are still open; a task may lack an ID ("No ID").
- **Task kind and files**: the file paths named in a task's text, and the kind derived from the first of them (language or document type, with or without "test"); used for chips and filters.
- **Warning group**: all warnings of one kind in one file, with their count, meaning and line numbers merged into ranges.
- **Document group**: Define, Design, Contracts, Build or Other; decides where a document appears in tabs and in the document list.
- **Specification structure**: the parts of a `spec.md` the reader recognizes — metadata, original request, clarification sessions (question, answer, badge), user stories (ID, priority, title, description, why, independent test, scenarios as Given / When / Then, linked phases), requirement areas with their requirements, and key entities.
- **Search entry**: something search can find — a task, a feature, a document or a section heading — with the label it is shown with, the words it is found by, and the place it opens.
- **Viewer preferences**: remembered per browser — theme, overview order and filter, task map mode.
- **View state**: per page, kept across live updates — expanded rows, depth, open phase, selected task, filters, reader expansions, raw view and scroll positions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A first-time viewer can state the overall percentage, the features in progress and the next task within 10 seconds of the overview loading, without scrolling, on a 1440 × 900 display.
- **SC-002**: From the overview, the full text and file paths of the next task are visible after one click, and of any task after at most two clicks.
- **SC-003**: 100 % of the project's artifacts are reachable from the overview in at most two page navigations (unchanged from 001 SC-004).
- **SC-004**: All counts shown — stats card, segmented bar, sidebar, tree, map legend and feature pages — match the checkbox counts in `tasks.md` exactly (zero discrepancies across the test fixtures and this repository's own specs).
- **SC-005**: The chosen theme is in effect from the first paint on 100 % of page loads, navigations and live updates in the supported browsers (FR-055); no page ever shows a flash of the other theme.
- **SC-006**: With 2,000 tasks on the map, the hover growth is visible within 150 ms, the tooltip appears 500 ms (± 100 ms) after the pointer enters a square and disappears within 100 ms after it leaves, and no tooltip is ever cut off at the edges.
- **SC-007**: For a project of 50 features and 2,000 tasks, the overview and each feature page load within 2 seconds in serve mode, and a static build completes within 30 seconds (unchanged targets from 001 SC-010).
- **SC-008**: After a live update, 100 % of the view state listed in FR-051 is unchanged in the end-to-end tests, and 95 % of changes still appear within 2 seconds (001 SC-002).
- **SC-009**: Every page is usable at 375 px width without horizontal page scrolling, and at 1440 px matches the approved mockups' layout.
- **SC-010**: Body text meets a contrast ratio of at least 4.5 : 1 against its background in both themes on every page type.
- **SC-011**: With scripts disabled, every page type shows all its content and every link, tab and expandable item works (zero failures in the end-to-end tests).
- **SC-012**: For every `spec.md` in the fixtures and in this repository, 100 % of the source's non-blank lines appear in the reader's formatted view.
- **SC-013**: No page makes a request to any server other than the one it was loaded from (zero third-party requests in the end-to-end tests).
- **SC-014**: For a project of 50 features and 2,000 tasks, search results update within 200 ms of each keystroke in serve mode and in a static build, and a task ID typed in full is always the first result.
- **SC-016**: The end-to-end suite passes in all three browser engines (Chromium, Firefox, WebKit).
- **SC-015**: Every user story in this spec has at least one passing end-to-end test that exercises it as a user would (constitution §V).

## Assumptions

- **Source of truth for visuals**: `DESIGN_HANDOFF.md` and the mockups decide colors, fonts, sizes and spacing; the handoff's token table is the reference for both themes. `StatsOriginal.dc.html` is a discarded alternative and is ignored. The sample data (`byte-flow-studio`) is illustrative only.
- **Fonts ship with the tool**: the handoff loads Geist, Geist Mono and Instrument Serif from Google Fonts; to keep 001 FR-038 (no third-party fetch) and serve mode's security rules, the same fonts are bundled with the tool instead. Their licence allows redistribution.
- **Project switcher**: the sidebar shows the current project name only; there is no switching between projects (multi-project aggregation stays out of scope).
- **Settings button**: the gear icon in the sidebar footer is left out, because the theme is the only setting and it already has its own switch.
- **File-kind filters**: the mockup's "Backend" and "Frontend" chips depend on that sample project's folder layout; this spec generalizes them to one chip per kind of file found in the feature's tasks (FR-034), since no rule tells backend from frontend in every project.
- **Clarification badges**: the mockup's "Config" badge is illustrative; badges are derived only from the answer's first word (FR-042), so the answer text is never rewritten.
- **Requirement area chips**: an "All" choice is added as the default so every requirement is visible at once; picking an area narrows the list as in the mockup.
- **Blocked color**: the handoff has no blocked color; a value for each theme, distinct from the next-task orange and from the amber warnings, is chosen at planning and defined next to the handoff's other tokens.
- **Order of the task map**: the map always follows folder order and task order, independent of the tree's Order control, so a square's position does not jump when the tree is re-ordered.
- **Where tasks.md is read**: the feature page's Tasks tab is the structured view; the `tasks.md` document is still available in the reader (Build group) for "View source line".
- **Accessibility**: as in spec 001, there is no formal conformance target; the handoff's hit targets, keyboard use and the body text contrast in SC-010 are the bar for this redesign.
- **Scripts**: the redesign keeps the no-scripts baseline of spec 001 for content and navigation; the new interactive behaviors are enhancements that need scripts (see Edge Cases).
- **Version**: this is a user-visible change recorded in `CHANGELOG.md`; the version number of the release is decided at planning.
- **Out of scope**: editing tasks or documents from the dashboard; switching between projects; a settings page; rendering diagrams; searching the body text of documents; structured rendering for documents other than `spec.md` (they get the reader layout with ordinary formatting).
- **Deferred to planning (technical decisions, not scope)**: whether an existing UI framework or library would simplify the richer page behavior (theme switching, task map, filters, accordion, contents panel, keeping view state across live updates) — to be evaluated in the plan's research and justified in Complexity Tracking (constitution §I) against the constraints above: pages work without scripts, static builds equal serve mode under a sub-path, no third-party requests, serve mode's security rules unchanged, one-command start with few runtime dependencies, and unit tests without a browser (constitution §IV). Also deferred: page addresses for feature pages and selected tasks, how bundled fonts and icons are packaged, and how the structured `spec.md` view is recognized.
