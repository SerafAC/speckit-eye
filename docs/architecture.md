# Architecture

This page gives an overview of how speckit-eye is put together. The exact
interfaces are defined in the feature's contracts, and this page links to them
instead of repeating them:

- [contracts/](https://github.com/SerafAC/speckit-eye/tree/main/specs/001-speckit-eye-dashboard/contracts/) of 001: the CLI
  ([cli.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/001-speckit-eye-dashboard/contracts/cli.md)), the
  live-update protocol
  ([routes.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/001-speckit-eye-dashboard/contracts/routes.md)), and the
  recognized `tasks.md` format
  ([tasks-md-format.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/001-speckit-eye-dashboard/contracts/tasks-md-format.md))
- [contracts/](https://github.com/SerafAC/speckit-eye/tree/main/specs/002-dashboard-redesign/contracts/) of 002: page paths,
  the DOM of every page, the browser modules and the view state they keep
  ([routes.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/002-dashboard-redesign/contracts/routes.md)), the
  structured `spec.md` view
  ([spec-md-structure.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/002-dashboard-redesign/contracts/spec-md-structure.md))
  and the search index
  ([search-index.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/002-dashboard-redesign/contracts/search-index.md))
- the data models of
  [001](https://github.com/SerafAC/speckit-eye/blob/main/specs/001-speckit-eye-dashboard/data-model.md) (the project model,
  counting and state rules, and how the active item is chosen) and
  [002](https://github.com/SerafAC/speckit-eye/blob/main/specs/002-dashboard-redesign/data-model.md) (statuses, ranks,
  shares, warning groups, documents and task files)

## Data flow

Data flows in one direction:

```text
project  →  parse  →  model  →  render  →  serve / build
 (read)     (pure)    (pure)    (pure)       (write / listen)
```

1. **project** reads the input files through a `ProjectReader` and returns
   them unparsed. This is the only code that reads the target project, and it
   never writes to it (FR-006).
2. **parse** turns `tasks.md` and `spec.md` text into phases, tasks, stories,
   warnings and the blocks of the structured `spec.md` view.
3. **model** builds the `Project`: features, counts, stages and statuses,
   totals, task states, the files and kind of each task, feature orders,
   percent shares, warning groups, document groups, change signatures and
   the active selection.
4. **render** turns the model into a site map, a `Map` from page path to
   `{ type, body }`. The functions in this layer return strings (or the bytes
   of a font) and have no side effects.
5. **serve** answers HTTP requests from that map. **build** writes the map to
   the `--out` folder.

No layer calls back into an earlier one, and I/O happens only at the two ends.
Everything in between is a pure function. The ends take their I/O
(`fs`, `http.createServer`, `fs.watch`, timers, browser globals) as
parameters, so unit tests can run the whole flow with fakes.

A sixth part runs in the browser: the modules in `src/client/` add behavior
to the rendered pages (see [Browser modules](#browser-modules)). The pages
never depend on them for content or navigation.

## Modules

| Folder | Module | Responsibility |
|---|---|---|
| `bin/` | `speckit-eye.js` | One-line entry point: calls `run()` from `src/cli/main.js` |
| `src/cli/` | `args.js` | Parses the command line into a mode and options, or a usage error |
| | `main.js` | Connects reader, model, renderer, server, watcher and build; reads the packaged assets (stylesheet, browser modules, fonts as bytes); handles exit codes and console output |
| `src/project/` | `reader.js` | `ProjectReader`: all reads of input files, limited to the project root |
| | `scan.js` | Finds features, artifacts, assessments, `feature.json` and the git branch, and returns the raw files |
| | `artifacts.js` | Artifact kind, order and title, source path → page URL, and file-name validation |
| `src/parse/` | `lines.js` | Line iteration that skips fenced code blocks and HTML comments |
| | `tasks.js` | `tasks.md` parser: phases, tasks, markers, dependencies and warnings |
| | `spec.js` | `spec.md` parser: title and user stories |
| | `spec-structure.js` | `spec.md` → blocks with line ranges for the structured view (metadata, input, clarifications, stories, requirements, entities, plain); the blocks cover every line of the file ([spec-md-structure.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/002-dashboard-redesign/contracts/spec-md-structure.md)) |
| `src/model/` | `build-model.js` | Builds the `Project` model from the scan result, including statuses, feature numbers, overview stats, document groups and tabs |
| | `task-state.js` | Task states (done, next, blocked, open), their display names, `waitingOn`, and change signatures |
| | `task-files.js` | The file paths, kind ("Go test", "Vue") and FR/SC references of a task, from its text |
| | `shares.js` | Largest-remainder percentages: every proportional width (stats bar segments, phase rail) adds up to exactly 100 |
| | `ranks.js` | The four feature orders of the tree (In progress first, Number, Least complete, Name A–Z) |
| | `warnings.js` | Warning groups with a title, a note and merged line ranges ("L14–L16") |
| | `active.js` | Chooses the active feature, phase, story and next task |
| `src/render/` | `html.js` | Auto-escaping `html` tagged template and `raw()` |
| | `markdown.js` | Markdown to HTML with `markdown-it` (raw HTML off), task lists, link rewriting, an inline renderer and `#L<line>` anchors for `tasks.md` |
| | `icons.js` | Inline SVG icons copied from Lucide (ISC notice in the file); the only source of icons |
| | `layout.js` | Shared page shell: head (theme script, stylesheet, `app.js`), sidebar, icon rail, mobile menu, search dialog and tooltip hosts, footer |
| | `overview.js` | Overview body: page head, stats card, Up next bar, feature tree |
| | `taskmap.js` | Task map (stacked, grouped or bars) and its legend |
| | `task-text.js` | Inline task text with formatting and FR/SC chips; kind and file chips |
| | `feature.js` | Feature page body: header, ring, document tabs, phase rail, warnings banner, task list, detail panel host |
| | `reader.js` | Document page body: document list, header with "Raw markdown", reading column, "On this page" |
| | `spec-view.js` | The structured `spec.md` blocks → HTML |
| | `search-index.js` | Model → `assets/search-index.json` ([search-index.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/002-dashboard-redesign/contracts/search-index.md)) |
| | `theme-script.js` | The text of `assets/theme.js`, generated from `applyStoredTheme` in `src/client/prefs.js` |
| | `site.js` | Model → site map; decides which pages and assets exist |
| `src/serve/` | `handler.js` | Pure `(req, res)` handler: route lookup, headers, CSP, 404s, `/__events` dispatch; sends text and binary bodies |
| | `server.js` | Thin listener: binds to `127.0.0.1`, falls back to another port when 4747 is busy |
| | `watcher.js` | Watches `specs/` and `.specify/` with `fs.watch` and calls `onChange` after a short debounce. On Linux, where Node's recursive watch follows files by inode and misses writes after a rename-save, it watches each folder separately instead, re-creating a watch whose folder was replaced |
| | `events.js` | Server-Sent Events hub: `hello`, `change`, keep-alive pings |
| `src/build/` | `build.js` | Writes the site map to `--out` (text and binary files); checks and replaces the build marker |
| `src/client/` | `app.js` | Browser bootstrap: runs `init` of the modules of the current page, wires the theme switch, and exposes `save`/`reinit` to `live.js` |
| | `prefs.js` | Safe `localStorage` access for the four viewer preferences (theme, order, filter, map mode) and `applyStoredTheme` |
| | `tree.js` | Overview tree: order, depth, "Open tasks only", and `reveal()` of a task |
| | `taskmap.js` | Task map: mode toggle, hover highlight in the tree, delayed tooltip, click → `tree.reveal` |
| | `feature.js` | Feature page: phase rail ↔ list, filters and text filter, expand/collapse all, selection, detail panel, "Copy ID", the `#task-…` address |
| | `reader.js` | Document reader: contents highlight and progress, "Expand all", raw view, requirement area chips |
| | `search.js` | Search dialog: ⌘K / Ctrl+K, index loading, matching, keyboard navigation |
| | `live.js` | Serve mode only: swaps in new content and keeps the viewer's state on each change |
| `src/styles/` | `input.css` | Tailwind CSS source: theme tokens, `@font-face` rules, `w-pct` utilities and the components, compiled to `dist/styles.css` |
| `scripts/` | `copy-assets.js` | Copies the bundled fonts and their licences from the `@fontsource` packages into `dist/fonts/` (`pnpm run build:assets`) |

## Why `render/site.js` decides which pages exist

Serve mode and build mode must show the same pages at the same paths (FR-031).
To guarantee that, only `site.js` decides which pages and assets exist and
what they contain. Serve mode looks up request paths in the map it returns,
and build mode writes each entry of that map to a file. This has three
consequences:

- The two modes cannot drift apart, because there is no second list of pages.
- The server never reads a file based on a request path. A path that is not a
  key in the map returns 404, including `..` tricks and source files (FR-007).
- A test of `site.js` covers the page set of both modes at once.

### What is in the site map

| Path | Content |
|---|---|
| `index.html` | Overview |
| `features/<dir>/index.html` | Feature page, one per feature |
| `features/<dir>/<rel>.html`, `constitution.html`, `assessments/<slug>/<rel>.html` | Document pages (reader layout) |
| `assets/styles.css` | The compiled stylesheet |
| `assets/theme.js` | Blocking theme script, generated in memory by `theme-script.js` |
| `assets/app.js` and `assets/<module>.js` | The browser modules, copied from `src/client/` as they are (no bundler) |
| `assets/live.js` | Live-update client, serve mode only |
| `assets/search-index.json` | Search index, built by `search-index.js`; the same in both modes |
| `assets/fonts/*.woff2`, `assets/fonts/OFL-*.txt` | Bundled fonts and their licences |

Most bodies are strings. Font files are `Uint8Array` bodies: the handler sends
them and `build.js` writes them unchanged, so fonts go through the same site
map as every page instead of a second list of files.

## Browser modules

The pages are complete HTML without JavaScript: the tree, phases, task rows
and collapsible document parts are native `<details>` elements, tabs and map
squares are links, and the mobile menu is a `<details>`. Behavior that needs
scripts is added by small ES modules in `src/client/`, loaded as
`assets/<module>.js`. Controls that only work with scripts (search, theme
switch, order, depth, filters, map mode, "Expand all") are rendered `hidden`
and shown by their module.

Every module follows one convention:

- `init(root, deps)` wires the module to the page. It is idempotent: it runs on
  load and again after every live update. `deps` injects `document`,
  `window`, storage, timers, `fetch` and the module's saved state, so the
  modules are unit tested with `happy-dom` instead of a browser.
- `save(root)`, for a module that holds page-local state (tree depth, feature
  filters and selection, reader views), returns that state before a live
  update replaces the page content.

`app.js` is the only script tag besides `theme.js` (and `live.js` in serve
mode). It reads `data-page` from `<body>` (`overview`, `feature` or
`document`), wires the theme switch and search on every page, and runs `init`
of the modules registered for that page type: `tree.js` and `taskmap.js` on
the overview, `feature.js` on feature pages, `reader.js` on document pages.
It exposes `save()` and `reinit()` for `live.js`.

Viewer preferences (theme, tree order, tree filter, map mode) are kept in
`localStorage` through `prefs.js`, which wraps every access in `try/catch`, so
a browser that refuses storage falls back to the defaults.

## Styles, themes and the CSP

Every response in serve mode carries the Content Security Policy
`default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:`.
It blocks inline scripts, `style` attributes and requests to other servers,
which keeps any HTML or script inside a Markdown file inert even if escaping
were missed. The pages are built to live with it:

- **No `style` attributes.** Data-driven widths (stats bar segments, phase
  rail blocks, feature bars) use the classes `w-pct-0` … `w-pct-100`, a
  Tailwind utility generated for every value in `input.css`. The widths come
  from `model/shares.js`, so the parts of a bar always add up to 100 %.
- **No inline scripts.** The theme script is a separate file,
  `assets/theme.js`, loaded as the first script in `<head>` so it runs before
  the first paint.
- **No other origins.** Fonts and icons ship with the tool.

**Theme tokens.** Every color is a CSS custom property defined once on
`:root` with `light-dark(<light>, <dark>)`. `color-scheme: light dark` makes
the page follow the operating system (System); `assets/theme.js` sets
`<html data-theme="light|dark">` from the stored choice, which pins
`color-scheme` and with it every token. Regions that are dark in both themes
(sidebar, icon rail, Up next bar, tooltip) carry the `always-dark` class,
which sets `color-scheme: dark` on that subtree. The theme script is
generated from `applyStoredTheme` in `src/client/prefs.js`, so the code that
runs before paint is the same code the unit tests cover.

## Fonts

The pages use Geist, Geist Mono and Instrument Serif. They ship with the
package instead of being loaded from a font service, which the CSP and the
"nothing leaves the page's origin" rule would forbid:

1. The fonts come from the `@fontsource` dev dependencies.
2. `scripts/copy-assets.js` (run by `pnpm run build:assets`, which also
   compiles the stylesheet, and by `prepack`) copies the Latin and
   Latin-extended `.woff2` files and each font's licence (`OFL-<family>.txt`)
   into `dist/fonts/`. Its file selection is a pure function with unit tests.
3. `main.js` reads `dist/fonts/` as bytes and `site.js` publishes the files
   under `assets/fonts/`.
4. The `@font-face` rules in `input.css` use URLs relative to the stylesheet
   (`url(fonts/…)`), so they resolve under any `--base` without rewriting.

## Live updates

In serve mode, a change on disk reaches open pages in these steps (details in
[routes.md](https://github.com/SerafAC/speckit-eye/blob/main/specs/001-speckit-eye-dashboard/contracts/routes.md#live-update-protocol-serve-mode)):

1. **Watcher**: `watcher.js` sees a file event under `specs/` or `.specify/`
   (or a branch switch in the git `HEAD`) and calls `onChange` once after a
   short debounce (100 ms of quiet, at most 500 ms).
2. **Rescan**: `main.js` scans the project again and rebuilds the model and
   the site map. Rescans run one at a time. A change that arrives during a
   rescan triggers one more rescan afterwards. If a rescan fails, the last good
   site stays in place.
3. **Version**: when any page or asset differs from the current map, the new
   map replaces the old one and the model version goes up by one.
4. **SSE**: `events.js` sends `event: change` with the new version to every
   open `/__events` stream.
5. **Client swap**: `live.js` fetches the current page, collects the
   modules' state with `save()` and the scroll positions of the window and of
   every `[data-keep-scroll]` element (tree card, task list, document list),
   replaces `<main>` and the live parts of the shell (the sidebar Features
   list), restores the viewer's expanded items, calls `reinit()` so every
   module applies its preferences and saved state again, restores the scroll
   positions, and highlights items whose `data-sig` changed. If the
   connection drops, it shows a banner, and it catches up on the next
   `hello`.

Static builds skip all of this: they include neither `live.js` nor
`/__events`.
