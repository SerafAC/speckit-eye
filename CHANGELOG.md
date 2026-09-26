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
