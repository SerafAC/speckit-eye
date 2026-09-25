# Contract: Pages, Routes and Live-Update Protocol

Serve mode and build mode use the same page paths. In build mode each path is a file under `--out`. In serve mode, the server looks the path up in the route table built from the model (research R5, R10). `{base}` is `/` in serve mode and `--base` in build mode. Every internal link is written as `{base}` + the path.

## Page paths

| Path | Content | Source |
|---|---|---|
| `index.html` (also `/` in serve mode) | Overview | whole model |
| `constitution.html` | Artifact page | `.specify/memory/constitution.md` |
| `features/<dir>/<rel>.html` | Artifact page | `specs/<dir>/<rel>.md` (for example `features/001-x/contracts/cli.html`) |
| `assessments/<slug>/<rel>.html` | Artifact page | `.specify/assessments/<slug>/<rel>.md` |
| `assets/styles.css` | Compiled Tailwind CSS | package `dist/styles.css` |
| `assets/overview.js` | Hover highlight between the grid and the tree (optional enhancement) | package `src/client/overview.js` |
| `assets/live.js` | Live-update client, **serve mode only** | package `src/client/live.js` |
| `__events` | SSE stream, **serve mode only** | server |
| `.speckit-eye-build` | Build marker file, **build mode only** (not linked) | build |

Path segments are taken from real folder and file names. Only names matching `[A-Za-z0-9._-]+` are given pages. Any other name gets a warning and is left out, which keeps URLs safe and needs no encoding rules. Serve mode answers any path not in the table, including `..` tricks, with **404**. It never reads a file based on a request path (FR-007, SC-008).

Response headers (serve mode): `Content-Type` by extension, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and `Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:` (a second line of defense for FR-024).

## Page structure (DOM contract used by the client scripts and E2E tests)

```text
<body data-mode="serve|static" data-version="<model version>">
  <header data-region="header">        project name, links to constitution/assessments, menu
  <main>
    <section data-region="progress">   overall bar <progress data-key="project" value=done max=total>, counters:
                                       [data-counter="specs|phases|tasks"] "completed / total"
    <div data-region="tree">           <details data-key="<featureDir>" data-sig=… data-status="done|started|not-started" [data-active] [open]>
                                         <summary> title · stage · "N open / M" </summary>
                                         links to artifacts
                                         <details data-key="<phaseKey>" …> (merged phase+story title when single story)
                                           [<details data-key="<groupKey>">] tasks <li data-key="<taskKey>" data-state=… id="task-…">
    <div data-region="grid">           <a href="#<task li id>" data-key="<taskKey>" data-state="completed|current|blocked|future"
                                          data-parents="<featureDir> <phaseKey> [groupKey]"
                                          title="T012 · description — feature › phase"></a> …
         [data-layout="rows"]          > 1,000 tasks: <div data-part="row"> label + <div data-part="cells"> squares per feature
         [data-layout="bars"]          > 5,000 tasks: <a data-part="bar" href="#<feature id>"> label + <progress data-key="<featureDir>">
  </main>
  <div data-region="live-status" hidden>Live updates paused — reconnecting…</div>  (serve only)
  <footer> generated at <ISO time> (static) · version
```

- `data-sig`: a short string made of the counts, the status or state, and the active flag; used to detect changes (FR-028).
- `[open]` is set by the server only on the active chain (FR-016). Completed items are never `open` by default, except a completed active feature (FR-018), which is `open` and `data-active` while its phases stay closed.
- Keys are unique per page; duplicate task IDs or phase numbers get an `@L<line>` suffix (data-model.md).
- No element carries an inline `style` attribute: the serve-mode CSP (`style-src 'self'`) would block it. Progress is drawn with `<progress value max>` and styled from `assets/styles.css`; `live.js` animates the `value` property from script, which the CSP allows.
- Artifact pages share `header` and the menu. Their `<main>` contains `<article class="prose" data-region="artifact" data-key="<source path>">`.

## Live-update protocol (serve mode)

- `GET /__events` → `text/event-stream`. On connect: `event: hello`, `data: {"version": <n>}`. After each rescan that changes the model: `event: change`, `data: {"version": <n>}`. A comment line `: ping` every 25 s keeps proxies from closing the connection.
- Client (`live.js`) on `change`:
  1. Record `scrollY`, the set of `data-key`s the viewer has opened or closed themselves, the `data-sig` for each key, and the progress-bar values.
  2. `fetch(location.pathname)` and parse the response with `DOMParser`.
  3. Replace `<main>`. Re-apply the viewer's own open/closed choices. Restore `scrollY`.
  4. Add `data-changed` for ~1.5 s to elements whose `data-sig` differs. Animate each `<progress>` `value` from the old value to the new one with `requestAnimationFrame` (skipped under `prefers-reduced-motion`).
  5. If the fetch returns 404 (the artifact was deleted), show a notice with a link to the overview.
- `EventSource` `error` → show `[data-region="live-status"]`. On the next `hello` → hide it and fetch once (FR-030).
- Rescans are debounced (100 ms quiet, 500 ms maximum). The target from saving a file to the page updating is ≤ 2 s (SC-002).
