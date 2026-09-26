# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Serve mode with overview: `speckit-eye --serve <dir>` serves a local page with
  the overall progress bar, spec/phase/task counters, the feature tree, and the
  task grid.
- Live updates in serve mode: open pages follow file changes within
  about 2 seconds, keep scroll position and expanded items, highlight what
  changed, and show a banner while the connection to the tool is lost.
- Added: artifact pages and site menu. Every Markdown artifact (feature files,
  contracts, checklists, the constitution, assessments) has a rendered page,
  linked from its feature in the overview and from a menu on every page.
  Links between artifacts open their pages; raw HTML is shown as text.
- Added: static build mode. `speckit-eye --build <dir> --out <folder> [--base <path>]`
  writes the overview and every artifact page as a static site that works under
  a sub-path and without JavaScript, shows when it was generated, and replaces
  its own previous build without leaving stale pages. See `docs/hosting.md` for
  a sample GitHub Pages workflow.
- Added: click a grid square to jump to its task; compact grid for large projects.
- Added: dark sidebar on the overview and feature pages with the project's
  navigation, the Features list ("Features N / M done", status dot and open
  count per feature) and the version; document pages get a narrow icon rail,
  and narrow screens get a menu that works without JavaScript. Replaces the
  old header and Menu.
- Added: light, dark and system theme; the choice is remembered in the browser
  and applied before the page is drawn.
- Added: the sidebar Features list is sorted "In progress first" (features
  with open tasks, then features without tasks, then complete ones) and marks
  the feature whose page is open.
- Added: redesigned overview. A stats card shows the overall percentage
  ("done of total tasks"), features, phases and open tasks, and a bar with
  one segment per feature sized by its share of all tasks and split into
  done, open and next.
- Added: an always-dark Up next bar on the overview names the next task, its
  feature and phase, and opens it on its feature page ("View task"); when
  there is none it says why.
- Added: redesigned feature tree with number chips, status pills, mini
  progress bars, priority badges and a "NEXT" badge on the next task; an
  Order control (In progress first, Number, Least complete, Name A–Z), a
  depth control (Features | Phases | Tasks), an "Open tasks only" filter, and
  amber warning rows with line chips and a "Details" link. The order and the
  filter are remembered in the browser; the tree scrolls inside its card when
  it is tall.
- Added: the task map replaces the task grid. Every task, including checkboxes
  without a task ID, is one square in folder order: done filled green, open
  blue outline, next orange, and blocked tasks (waiting on an open task) in a
  rose color shared with the tree. A legend counts each state. "By feature"
  groups the squares per feature and "Stack all" restores one field; the
  choice is remembered in the browser, and large projects open "By feature"
  (above 1,000 tasks) or as one bar per feature (above 5,000).
- Added: hovering a square grows it and, after half a second, shows a dark
  tooltip with the task ID, status, text and feature (at once on keyboard
  focus, never on touch); its feature, phase and task rows are tinted in the
  tree. Clicking, tapping or pressing Enter on a square reveals the task in
  the tree: its feature and phase open, the tree scrolls to it and the row
  stays outlined.
