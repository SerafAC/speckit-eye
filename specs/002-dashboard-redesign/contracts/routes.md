# Contract: Pages, Assets, DOM and View State

Replaces the "Page paths" and "Page structure" parts of [001 routes.md](../../001-speckit-eye-dashboard/contracts/routes.md). Unchanged from 001: `{base}` handling, the rule that only names matching `[A-Za-z0-9._-]+` get pages, 404 for anything not in the site map, the response headers **including the CSP** (`default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:`), and the SSE protocol on `/__events`.

## Page paths

| Path | Content | New? |
|---|---|---|
| `index.html` (also `/` in serve mode) | Overview | redesigned |
| `features/<dir>/index.html` | Feature page (Tasks tab) | **new** |
| `features/<dir>/<rel>.html` | Document page (reader layout) | redesigned |
| `constitution.html` | Document page | redesigned |
| `assessments/<slug>/<rel>.html` | Document page | redesigned |
| `assets/styles.css` | Compiled stylesheet with `@font-face` rules (`url(fonts/…)`, relative) | changed |
| `assets/fonts/<file>.woff2`, `assets/fonts/OFL-<family>.txt` | Bundled fonts and their licences (`font/woff2`, `text/plain`) | **new** |
| `assets/theme.js` | Blocking theme script, loaded in `<head>` | **new** |
| `assets/app.js` + `assets/<module>.js` | Bootstrap and browser modules (ES modules) | **new** (replaces `assets/overview.js`) |
| `assets/search-index.json` | Search index ([search-index.md](./search-index.md)) | **new** |
| `assets/live.js` | Live-update client, **serve mode only** | changed |
| `__events` | SSE stream, **serve mode only** | unchanged |

### Fragments

| Fragment | On | Target |
|---|---|---|
| `#<anchor>` | overview | the task row in the tree (map squares link here) |
| `#<anchor>` | feature page | the task row; with JS it is opened, selected and shown in the detail panel (FR-036) |
| `#phase-<n>` | feature page | the phase section (rail blocks link here) |
| `#warnings` | feature page | the warning banner ("Details" links) |
| `#L<line>` | `tasks.html` document | the source line, highlighted with `:target` ("View source line", FR-044) |
| `#<heading-slug>` | any document | a heading (001 slugs) |

`<anchor>` is the Task `anchor` of [data-model.md](../data-model.md); it already starts with `task-` (for example `#task-001-x-T012`).

## Page shell

```text
<html lang="en" [data-theme="light|dark|system"]>          data-theme set by assets/theme.js before paint
<head> … <script src="{base}assets/theme.js"></script>      blocking, first script
         <link rel="stylesheet" href="{base}assets/styles.css">
         <script type="module" src="{base}assets/app.js"></script>
         [serve] <script type="module" src="{base}assets/live.js"></script>
<body data-mode="serve|static" data-version="<n>" data-page="overview|feature|document" data-base="{base}">
  <details data-region="mobile-menu">                        narrow screens only (CSS), works without JS
  <aside data-region="sidebar">                              overview and feature pages
     brand · project name
     <button data-part="search" hidden>                      shown by JS (FR-049)
     <nav aria-label="Main">  Overview · Constitution · Assessment: <slug>…
     <nav aria-label="Features"> <a data-key="side:<dir>" data-status=… [aria-current="page"]> …
     <div role="group" aria-label="Theme" data-part="theme" hidden> 3 × <button aria-pressed>   shown by JS
     <footer> speckit-eye <version> [· generated at <time>]
  <nav data-region="rail">                                   document pages instead of the sidebar
  <main> … page body …
  [serve] <div data-region="live-status" hidden>
  <dialog data-region="search">                              filled by JS
  <div data-region="tooltip" role="tooltip" hidden>          overview only, filled by JS
```

No element carries a `style` attribute (CSP). Widths come from `w-pct-<0..100>` classes (research D6).

## Overview `<main>`

```text
<header data-region="page-head">  project name · <h1>Project overview</h1>
   <div role="group" aria-label="Show"> <button data-filter="all" aria-pressed> <button data-filter="open">   (JS; hidden without JS)
<section data-region="stats">
   [data-stat="percent|features|phases|open"] data-key="stat:<name>" data-sig=…
   <div data-part="segments"> <a data-key="seg:<dir>" href="#<feature anchor>" class="w-pct-N" title="…">
        <span data-part="done|open|next" class="w-pct-N">
   <div data-part="labels"> … <ul data-part="legend">
<section data-region="up-next">   ID chip · text (title=full) · feature › phase · [Open quickstart] · View task
                                  or data-empty="complete|no-tasks" with the explanation
<section data-region="features">
   header: <button data-part="order" data-order="progress|number|least|name">  <div role="group" data-part="depth">   (JS)
   <div data-region="tree" data-keep-scroll="tree" data-filter="all|open">
     <ul> <li data-feature="<dir>" data-rank-progress=… data-rank-number=… data-rank-least=… data-rank-name=… [data-complete]>
            <details data-key="<dir>" data-sig data-status="done|started|not-started|no-tasks" [data-active] [open]>
              <summary> chevron · dot · number chip · title · [warnings badge] · pill · mini bar · done/total </summary>
              <a data-part="open-feature" href="features/<dir>/index.html">
              [<a data-part="warning" data-code="W1" href="features/<dir>/index.html#warnings"> … L-chips …]
              phases: <details data-key="<phaseKey>" data-status … [data-complete]> (001 nesting, story level kept)
                tasks: <li data-key="<taskKey>" id="<anchor>" data-state="done|next|blocked|open">
                         mark · <a href="features/<dir>/index.html#<anchor>">T012</a> · text · [NEXT]
<section data-region="taskmap" data-layout="stacked|grouped|bars">
   header: <button data-part="map-mode" aria-pressed>   (JS)
   <div data-part="grid"> <a data-key data-sig data-state data-parents="<dir> <phaseKey> [groupKey]"
                             href="#<anchor>" title="T046 · Done — text — feature"> …
   grouped: <div data-part="group"> name · done/total · squares
   <ul data-part="legend"> Done N · Open N · Blocked N · Next N · 1 dot = 1 task
```

- The server renders the tree in `progress` order; `data-rank-*` are the positions from the model (data-model FeatureRanks).
- `data-filter="open"` on the tree hides `[data-complete]` items and `li[data-state="done"]` by CSS (FR-019).
- Rendering `data-layout`: `stacked` up to 1,000 tasks, `grouped` from 1,001 to 5,000 (both modes available with the toggle), `bars` above 5,000 (no toggle).

## Feature page `<main>`

```text
<header data-region="feature-head"> breadcrumb · status pill · <code>dir</code> · <h1>title</h1> · done/total · ring (SVG)
<nav data-region="tabs" aria-label="Documents">
   <a aria-current="page">Tasks <n></a> · <a href="spec.html">Specification</a> · …
   <details data-part="tab-menu"><summary>Contracts <n></summary> <a>…</a> </details>      (N > 1)
<section data-region="tasks">
   <nav data-part="rail"> <a href="#phase-<n>" class="w-pct-N" data-status aria-current?> P4 · 23 </a> … <p data-part="caption">
   [<section id="warnings" data-part="warnings"> title · lines · <details><summary>Show lines</summary> <ol> source lines </ol></details>]
   <div data-part="filters" hidden> chips (All, Open, Tests, kinds) · <input type="search"> · Expand all   (JS)
   <div data-part="list" data-keep-scroll="tasks">
      <details name="phases" data-key="<phaseKey>" id="phase-<n>" data-status [open]>
        <summary> Phase N · title · [Pn] · done/total </summary>
        <details data-key="<taskKey>" id="<anchor>" data-state data-kind="<chip>" data-test? data-files="<names>">
          <summary> mark · ID · text (inline formatting) · kind chip · file chip </summary>
          full text · marker tags (USn, Parallel, FR/SC refs, depends on)
   <aside data-region="detail" hidden> ID · status · text · phase · markers · files · [Waiting on …] · Copy ID · View source line   (JS)
```

### Inline task text

Rendered from `description` with `markdown-it`'s inline renderer (raw HTML off, 001 link rules), then FR/SC references are wrapped as chips. `` `code` `` becomes a mono chip. The text is never shortened in markup; truncation is CSS (`text-overflow: ellipsis`) and the full text is in the expanded row and the detail panel.

## Document page `<main>`

```text
<nav data-region="doc-list" data-keep-scroll="docs">  ← back to feature · title · status · groups Define/Design/Contracts/Build/Other
<article data-region="doc" data-key="<source path>">
   <header> eyebrow "<KIND> · <file>" · <h1> · <button data-part="expand-all" hidden> · <details data-part="raw"><summary>Raw markdown</summary><pre>source</pre></details>
   spec.md: structured blocks (spec-md-structure.md); other documents: 001 Markdown rendering with numbered top-level sections
   tasks.md: every task line wrapped in <span id="L<line>">
<nav data-region="toc" aria-label="On this page">  links · <div data-part="progress"> (JS)
```

"Raw markdown" is a `<details>`, so it works without JS; with JS the button swaps the formatted view for the source view.

## Browser modules (`assets/*.js`)

Each module exports `init(root, deps)` (idempotent, called on load and after every live swap) and, when it holds page-local state, `save(root)` (research D2). `deps` injects `document`, `window`, `storage`, timers and `fetch` for unit tests.

| Module | Pages | Responsibility |
|---|---|---|
| `app.js` | all | Imports the modules, runs `init` for the current `data-page`, exposes `reinit(state)` to `live.js` |
| `prefs.js` | all | Safe `localStorage` access and defaults |
| `theme.js` | all | Blocking head script, generated from `applyStoredTheme` in `prefs.js` by `render/theme-script.js` (not a separate source file); the switch buttons are wired by `app.js` |
| `tree.js` | overview | Order, depth, filter, and reveal-task (open ancestors, scroll the tree card, `data-selected`) |
| `taskmap.js` | overview | Map mode toggle, hover → tree highlight, tooltip (delay, touch rule, placement), click → `tree.reveal` |
| `feature.js` | feature | Rail ↔ list sync, choose-again-to-close, filters and text filter, expand/collapse all, selection and detail panel, copy, address fragment |
| `reader.js` | document | Contents highlighting and progress, expand all, raw view toggle, "show more" answers, requirement area chips |
| `search.js` | all | Dialog, shortcut, index loading, matching (search-index.md), keyboard navigation |
| `live.js` | all (serve) | 001 protocol; before the swap collects `save()` results and scroll positions (`window`, `[data-keep-scroll]`), after the swap calls `reinit` and restores them |

## View state kept across live updates (FR-051)

| State | Kept by |
|---|---|
| theme, order, filter, map mode | `localStorage` (prefs.js), re-applied by `init` |
| viewer-toggled `<details>` | 001 `applyToggles` by `data-key` |
| depth, feature filters and text, selected task, raw view, "show more", requirement area | `save()` → `init(root, {state})` |
| selected task (also across reloads) | address fragment `#<anchor>` |
| scroll positions | `live.js`: `window` and every `[data-keep-scroll]` by name |
