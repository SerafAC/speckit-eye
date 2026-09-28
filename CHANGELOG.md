# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Serve mode: `speckit-eye --serve <dir>` serves the dashboard of a Spec Kit
  project on your own machine (`127.0.0.1`), with the overview, a page per
  feature and a page per document.
- Live updates in serve mode: open pages follow file changes within
  about 2 seconds, keep scroll position and expanded items, highlight what
  changed, and show a banner while the connection to the tool is lost.
  On Linux, changes are also picked up after an editor has saved a file by
  replacing it, and in a folder that was deleted and created again.
- A page for every Markdown document (feature files, contracts, checklists,
  the constitution, assessments), at most two clicks from the overview.
  Links between documents open their pages; raw HTML is shown as text.
- Static build mode. `speckit-eye --build <dir> --out <folder> [--base <path>]`
  writes the overview, every feature page and every document page as a static
  site that works under a sub-path and without JavaScript, shows when it was
  generated, and replaces its own previous build without leaving stale pages.
  The theme switch, task map, filters, reader and search work there too. See
  `docs/hosting.md` for a sample GitHub Pages workflow.
- Dark sidebar on the overview and feature pages with the project's
  navigation, the Features list ("Features N / M done", status dot and open
  count per feature) and the version; document pages get a narrow icon rail,
  and narrow screens get a menu that works without JavaScript. Replaces the
  old header and Menu.
- Every link and button is at least 36 px tall, with a mouse as well
  as on touch screens, including task IDs in the feature tree, the segments of
  the progress bar, the breadcrumb of feature pages, the reader's contents
  panel and links in document text (task map squares excepted).
- The sidebar Features list is sorted "In progress first" (features
  with open tasks, then features without tasks, then complete ones) and marks
  the feature whose page is open.
- Redesigned overview. A stats card shows the overall percentage
  ("done of total tasks"), features, phases and open tasks, and a bar with
  one segment per feature sized by its share of all tasks and split into
  done, open and next.
- An always-dark Up next bar on the overview names the next task, its
  feature and phase, and opens it on its feature page ("View task"); when
  there is none it says why.
- Redesigned feature tree with number chips, status pills, mini
  progress bars, priority badges and a "NEXT" badge on the next task; an
  Order control (In progress first, Number, Least complete, Name A–Z), a
  depth control (Features | Phases | Tasks), an "Open tasks only" filter, and
  amber warning rows with line chips and a "Details" link. The order and the
  filter are remembered in the browser; the tree scrolls inside its card when
  it is tall.
- The task map replaces the task grid. Every task, including checkboxes
  without a task ID, is one square in folder order: done filled green, open
  blue outline, next orange, and blocked tasks (waiting on an open task) in a
  rose color shared with the tree. A legend counts each state. "By feature"
  groups the squares per feature and "Stack all" restores one field; the
  choice is remembered in the browser, and large projects open "By feature"
  (above 1,000 tasks) or as one bar per feature (above 5,000).
- Hovering a square grows it and, after half a second, shows a dark
  tooltip with the task ID, status, text and feature (at once on keyboard
  focus, never on touch); its feature, phase and task rows are tinted in the
  tree. Clicking, tapping or pressing Enter on a square reveals the task in
  the tree: its feature and phase open, the tree scrolls to it and the row
  stays outlined.
- A page per feature. Its header shows the status pill, folder name,
  title, "done / total tasks · completed of total phases" and a progress ring
  with a check mark when the feature is complete. Tabs lead to Tasks and to
  each existing document (Specification, Plan, Research, Data model,
  Quickstart, Contracts, checklists, More); a tab with several documents
  lists them without leaving the page.
- On the Tasks tab, a phase rail with one block per phase sized by its
  task count; choosing a block or a phase opens it and closes the others, and
  choosing it again closes it. Warnings appear as an amber banner with line
  numbers and "Show lines".
- Task filters on the feature page: All, Open, Tests and one chip per
  kind of file (for example Go, Vue), each with its count, plus a text filter
  over IDs, task text and file names, and "Expand all" / "Collapse all".
- Task rows show the task text with its inline formatting and FR/SC
  chips, plus a kind chip ("Go test", "Vue") and a file chip ("list.go",
  "2 files") aligned in columns. Clicking a row expands it in place and opens
  a detail panel with status, full text, phase, markers, file paths and, for
  blocked tasks, "Waiting on …"; "Copy ID" copies the task ID and "View
  source line" opens `tasks.md` at that line, highlighted.
- Every task has its own address on its feature page; opening it (for
  example from "View task" or a task ID in the tree) shows the task open,
  selected and in view.
- Live updates keep the feature page as you left it: filters, text
  filter, open phases and task rows (also after "Expand all" or opening a
  task's address), the selected task and the scroll position. A selected task
  that is deleted from `tasks.md` is unselected.
- A Light / Dark / System theme switch in the sidebar and, on document
  pages, in the icon rail. System is the default and follows the operating
  system, also when it changes while a page is open. The choice applies to
  every page from its first paint, survives reloads and live updates, and is
  remembered in the browser; when the browser refuses storage the switch
  still changes the current page. The sidebar, icon rail, Up next bar and map
  tooltips stay dark and the next-task orange is the same in both themes;
  document text follows the theme.
- A document reader for every document page (feature documents, the
  constitution and assessments). A document list links back to the feature
  page, shows the feature title and status, and groups its documents under
  Define, Design, Contracts, Build and Other with the current one marked;
  project documents get a project document list. The reading column shows
  the document kind and file name, the title and numbered top-level sections
  (01, 02, …); an "On this page" panel lists the sections, marks the one being
  read and shows reading progress. "Expand all" opens every collapsed part and
  "Raw markdown" shows the exact source and toggles back. On narrow screens
  the contents panel is hidden and the document list sits behind a menu.
- A structured view of `spec.md` wherever it follows the Spec Kit
  template: a metadata card (feature branch, created, status), the original
  request as a pull quote, clarifications grouped by session ("N answered ·
  M sessions", the first session open, "Show N more answers") with aligned
  Yes / No badges, user stories as cards (priority, why this priority,
  independent test, a numbered Given / When / Then table and the phase that
  implements the story with its progress), functional requirements with area
  chips and MUST, MUST NOT, SHOULD, SHOULD NOT and MAY highlighted, and key
  entities as a grid of cards. Everything else is shown as ordinary formatted
  text; no line of the document is left out and no wording is changed.
- Search on every page. ⌘K (Ctrl+K on Windows and Linux) or the
  "Search tasks, specs…" entry in the sidebar or icon rail opens a search box
  over the page. It finds tasks by ID and text, features by number and name,
  and documents by title and section headings (not their body text); every
  typed word must match, case is ignored, and a task ID typed in full comes
  first. Results are grouped as Tasks (state mark, ID, text, feature),
  Features (name and status) and Documents, each showing its first 8 and
  "N more". Arrow keys and Enter or a click open a result: a task opens
  selected on its feature page, a heading opens the reader at that heading.
  Escape closes the box. Search works the same in static builds under a
  sub-path, contacts no other server, and finds changes after a live update
  without a reload. Without JavaScript the search entry is not shown.
- Pages work without JavaScript: every page stays readable, links and tabs
  work, and the tree, phases, task rows, clarification sessions and the
  mobile menu open and close; controls that need scripts (search, theme
  switch, order, filters, map mode) are not shown then.
- Pages work on phones: at 375 px wide no page scrolls sideways, the sidebar
  is behind a menu, the tree comes before the task map, and tapping a square
  reveals its task.
- The fonts (Geist, Geist Mono and Instrument Serif) and icons ship with the
  tool, so no page loads anything from another server.
- Supported browsers: the last two major versions of Chrome, Edge, Firefox
  and Safari.
- speckit-eye is published on npm: run it with `npx speckit-eye` or install
  it with `npm install -g speckit-eye`. Every release is published by the
  project's release workflow with npm build provenance, and its GitHub
  release notes are the version's section of this changelog.
- `--home <url>` build option: adds a "Home" link to `<url>` on every page
  (sidebar, icon rail and mobile menu), for linking a hosted dashboard back to
  the site it is part of.
- A documentation website at https://serafac.github.io/speckit-eye/ with the
  usage, hosting, architecture and releasing guides, and this project's own
  live status dashboard (a speckit-eye build of its specs) under `/status/`,
  linked from the README and the docs home page as the project's status and
  live demo.
- A contributing guide, a code of conduct and a security policy with a
  private way to report vulnerabilities, plus issue and pull request
  templates.

### Changed

- The README screenshots moved to `docs/assets/`.
- Redesigned every page: a dark sidebar replaces the header, a stats card,
  Up next bar and task map replace the progress bar, counters and task grid,
  and documents open in a reader layout.
- Task states are now called Done, Open, Blocked and Next. Blocked tasks are
  rose instead of red, and the next task is orange.
- Page addresses: each feature has a new page at
  `features/<folder>/index.html`; task links ("View task", task IDs in the
  tree, search results) now go to the task on its feature page
  (`features/<folder>/index.html#task-<folder>-<ID>`); task lines of a
  `tasks.md` document have `#L<line>` addresses. Document pages keep their
  addresses.

### Removed

- The header and its Menu button: the sidebar, the icon rail and the mobile
  menu replace them, and each document page lists the other documents of its
  feature.
- The feature's list of documents inside the overview tree: the feature page
  tabs and the reader's document list replace it.

[Unreleased]: https://github.com/SerafAC/speckit-eye/commits/main
