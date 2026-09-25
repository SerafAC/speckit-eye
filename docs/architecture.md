# Architecture

This page gives an overview of how speckit-eye is put together. The exact
interfaces are defined in the feature's contracts, and this page links to them
instead of repeating them:

- [contracts/](../specs/001-speckit-eye-dashboard/contracts/): the CLI
  ([cli.md](../specs/001-speckit-eye-dashboard/contracts/cli.md)), page paths,
  DOM contract and live-update protocol
  ([routes.md](../specs/001-speckit-eye-dashboard/contracts/routes.md)), and the
  recognized `tasks.md` / `spec.md` format
  ([tasks-md-format.md](../specs/001-speckit-eye-dashboard/contracts/tasks-md-format.md))
- [data-model.md](../specs/001-speckit-eye-dashboard/data-model.md): the
  project model, counting and state rules, and how the active item is chosen

## Data flow

Data flows in one direction:

```text
project  →  parse  →  model  →  render  →  serve / build
 (read)     (pure)    (pure)    (pure)       (write / listen)
```

1. **project** reads the input files through a `ProjectReader` and returns
   them unparsed. This is the only code that reads the target project, and it
   never writes to it (FR-006).
2. **parse** turns `tasks.md` and `spec.md` text into phases, tasks, stories
   and warnings.
3. **model** builds the `Project`: features, counts, stages, totals, task
   states, change signatures and the active selection.
4. **render** turns the model into a site map, a `Map` from page path to
   `{ type, body }`. The functions in this layer return strings and have no
   side effects.
5. **serve** answers HTTP requests from that map. **build** writes the map to
   the `--out` folder.

No layer calls back into an earlier one, and I/O happens only at the two ends.
Everything in between is a pure function. The ends take their I/O
(`fs`, `http.createServer`, `fs.watch`, timers, browser globals) as
parameters, so unit tests can run the whole flow with fakes.

## Modules

| Folder | Module | Responsibility |
|---|---|---|
| `bin/` | `speckit-eye.js` | One-line entry point: calls `run()` from `src/cli/main.js` |
| `src/cli/` | `args.js` | Parses the command line into a mode and options, or a usage error |
| | `main.js` | Connects reader, model, renderer, server, watcher and build; handles exit codes and console output |
| `src/project/` | `reader.js` | `ProjectReader`: all reads of input files, limited to the project root |
| | `scan.js` | Finds features, artifacts, assessments, `feature.json` and the git branch, and returns the raw files |
| | `artifacts.js` | Artifact kind, order and title, source path → page URL, and file-name validation |
| `src/parse/` | `lines.js` | Line iteration that skips fenced code blocks and HTML comments |
| | `tasks.js` | `tasks.md` parser: phases, tasks, markers, dependencies and warnings |
| | `spec.js` | `spec.md` parser: title and user stories |
| `src/model/` | `build-model.js` | Builds the `Project` model from the scan result |
| | `task-state.js` | Task states (completed, current, blocked, future) and change signatures |
| | `active.js` | Chooses the active feature, phase, story and next task |
| `src/render/` | `html.js` | Auto-escaping `html` tagged template and `raw()` |
| | `markdown.js` | Markdown to HTML with `markdown-it` (raw HTML off), task lists, link rewriting |
| | `layout.js` | Shared page shell: header, menu, footer, and style and script tags for each mode |
| | `overview.js` | Overview body: progress bar, counters, feature tree, task grid |
| | `artifact.js` | Artifact page body |
| | `site.js` | Model → site map; decides which pages and assets exist |
| `src/serve/` | `handler.js` | Pure `(req, res)` handler: route lookup, headers, CSP, 404s, `/__events` dispatch |
| | `server.js` | Thin listener: binds to `127.0.0.1`, falls back to another port when 4747 is busy |
| | `watcher.js` | Watches `specs/` and `.specify/` with `fs.watch` and calls `onChange` after a short debounce |
| | `events.js` | Server-Sent Events hub: `hello`, `change`, keep-alive pings |
| `src/build/` | `build.js` | Writes the site map to `--out`; checks and replaces the build marker |
| `src/client/` | `live.js` | Browser script (serve mode only): swaps in new content and keeps the viewer's state on each change |
| | `overview.js` | Browser script: grid ↔ tree hover highlight; optional, pages work without it |
| `src/styles/` | `input.css` | Tailwind CSS source and status color tokens, compiled to `dist/styles.css` at pack time |

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

## Live updates

In serve mode, a change on disk reaches open pages in these steps (details in
[routes.md](../specs/001-speckit-eye-dashboard/contracts/routes.md#live-update-protocol-serve-mode)):

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
5. **Client swap**: `live.js` fetches the current page, replaces `<main>`,
   restores the viewer's expanded items and scroll position, highlights items
   whose `data-sig` changed, and animates the progress bars. If the connection
   drops, it shows a banner, and it catches up on the next `hello`.

Static builds skip all of this: they include neither `live.js` nor
`/__events`.
