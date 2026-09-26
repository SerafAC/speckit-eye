# Research: Dashboard Redesign

Phase 0 of [plan.md](./plan.md). Each entry records the decision, why it was taken, and what else was considered. Decisions of spec 001 ([001 research](../001-speckit-eye-dashboard/research.md), R1–R12) stay in force unless an entry here replaces one; D-numbers are used to avoid confusion with them.

The constraints that shape almost every entry come from the spec and its clarifications:

- pages stay readable and navigable, and the tree, phases, task rows and collapsible parts open and close, **without JavaScript** (FR-053, clarified);
- serve mode keeps its **content security policy** `default-src 'self'; style-src 'self'; script-src 'self'` (FR-004), so markup may not carry `style="…"` attributes or inline scripts, and nothing may need `eval`;
- **no third-party requests** at view time (FR-004, 001 FR-038);
- **static builds equal serve mode**, also under a sub-path (FR-052);
- the last **two major versions of Chrome, Edge, Firefox and Safari**, tested in Chromium, Firefox and WebKit (FR-055, SC-016);
- **one-command start** with few runtime dependencies, and **unit tests without a browser** (constitution §I, §IV).

---

## D1. Would an existing UI framework simplify the redesign?

**Decision**: No UI framework. Keep the current architecture — pages rendered to HTML strings on the server by pure functions (`project → parse → model → render → serve/build`), plus small browser modules that add behavior to already-complete HTML. Organize the browser code as one ES module per behavior, each exporting an idempotent `init(root, deps)` that a small bootstrap (`assets/app.js`) calls on load and again after every live update.

**Rationale**:

- The redesign is mostly layout and presentation; the interactive parts (theme switch, tooltip, order/depth/filter, phase accordion, task filters and detail panel, contents panel, search) are each a few dozen lines on top of server-rendered HTML.
- The no-JavaScript requirement means the server must render all content anyway. A client-rendering framework would then render the same UI a second time, in a second language of components, and would still need the server renderer for static builds and the no-JS path.
- The CSP rules out every framework that evaluates expressions from HTML attributes and most that inject inline styles.
- The package ships one runtime dependency today (`markdown-it`); `npx speckit-eye` must stay fast (001 SC-007).

**Alternatives considered**:

| Option | Why rejected |
|---|---|
| React / Preact / Vue / Svelte / Solid as a single-page app | Breaks the no-JS requirement (content rendered in the browser); needs a bundler and a JSON API; rewrites render, serve and build; large runtime. |
| Same frameworks with server rendering + hydration (Next, Nuxt, SvelteKit static, Astro islands) | Heavy toolchain and dependency tree inside an `npx` tool; serve mode with live updates would need the framework's dev server or a custom adapter; static output under a sub-path and CSP without inline scripts need extra configuration; the gain (component syntax) does not pay for it at this size. |
| Alpine.js, petite-vue | Standard builds evaluate attribute expressions with `new Function` → need `'unsafe-eval'`, which the CSP forbids. Alpine's CSP build restricts expressions so much that the code moves back into JS files anyway. |
| htmx | Solves server round trips (we have none besides live updates, already done with SSE); does not help with client-only state such as filters or the tooltip. |
| Lit / Web Components | Viable and CSP-friendly, but shadow DOM fights the shared Tailwind stylesheet, and light-DOM custom elements give little over plain modules with `init(root)`. Kept as a fallback if the module count grows. |
| Stimulus | Nice conventions for "HTML first + behavior" and CSP-safe, but it is a runtime dependency whose value here is naming conventions we can follow without it. |

The narrower tools that *do* simplify the work are adopted individually: Tailwind v4 features (D3, D6), native browser elements (D7), bundled fonts (D4), and a DOM implementation for unit tests (D11).

## D2. Keeping view state across live updates

**Decision**: Keep today's mechanism — fetch the page, replace `<main>`, restore state — and generalize it:

1. **Viewer preferences** (theme, overview order and filter, task map mode) live in `localStorage` (D9) and are applied by the modules' `init`, so re-running `init` after the swap restores them.
2. **Open/closed items** (`<details>` with `data-key`) keep today's rule: the viewer's own toggles are re-applied (001 `applyToggles`).
3. **Page-local state** that is not in the DOM (task filters and text filter, depth choice, selected task, raw-markdown view, "show more" expansions) is saved by each module to a per-page in-memory store before the swap and read back by `init` (`save(root) → object`, `init(root, {state})`).
4. **Scroll positions**: the window plus every element marked `data-keep-scroll="<name>"` (tree card, feature task list, reader document list).
5. The selected task is also in the address (`#task-…`, contracts/routes.md), so it survives reloads, too.

**Rationale**: One explicit contract (`init`/`save`) that every module follows, testable per module, with no new dependency.

**Alternatives considered**: DOM morphing with `idiomorph` (0BSD, small) or `morphdom` (MIT). They keep focus and element identity, but they also copy the server's attributes over the viewer's state (`open`, `aria-pressed`, hidden rows), so callbacks to protect each piece of state would be needed anyway; and they add a runtime asset. Worth revisiting only if focus loss after updates becomes a reported problem.

## D3. Theme: light, dark, system

**Decision**:

- Every color token of the handoff is defined **once** on `:root` with the CSS `light-dark()` function (for example `--bg: light-dark(#F4F3EF, #0E1013)`). `color-scheme` selects the branch: `:root { color-scheme: light dark }` (System follows the OS), `:root[data-theme="light"] { color-scheme: light }`, `:root[data-theme="dark"] { color-scheme: dark }`.
- Always-dark regions (sidebar, icon rail, Up next bar, map tooltip) set `color-scheme: dark` locally, so the same tokens give their dark values there.
- A tiny **blocking** script `assets/theme.js` (generated from the unit-tested `applyStoredTheme` in `src/client/prefs.js` by `src/render/theme-script.js`, so no test has to read a file). Because the script text is `applyStoredTheme.toString()`, that function must stay self-contained (no references outside its body) and `src/client/` is never bundled or minified (the package ships its sources as they are); the unit test runs the generated text with `node:vm` to catch a violation, loaded as a normal external `<script>` in `<head>` (allowed by `script-src 'self'`), reads `localStorage["sk-theme"]` and sets `data-theme` on `<html>` before first paint (SC-005). Without JavaScript there is no `data-theme`, so the page follows the OS (FR-048).
- No Tailwind `dark:` variant is needed, because the tokens switch by themselves; utilities use the tokens (for example `bg-(--surface)`).

**Rationale**: `light-dark()` keeps one definition per token (constitution §III) and makes System free (no duplicated `@media (prefers-color-scheme)` block). It is supported by Chrome/Edge ≥ 123, Firefox ≥ 120 and Safari ≥ 17.5, all older than the supported range (FR-055).

**Alternatives considered**: two token blocks (`[data-theme=dark]` plus a copy inside `@media (prefers-color-scheme: dark)`), as in the mockups — works everywhere but duplicates every token; setting the theme on the server — impossible for static builds.

## D4. Fonts

**Decision**: Bundle the fonts. Add `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` and `@fontsource/instrument-serif` (all OFL-1.1) as **devDependencies**. A build step (`scripts/copy-assets.js`, run by `build:assets`, part of `prepack` and `test:e2e`) copies only the Latin and Latin-extended `woff2` files and the licence texts into `dist/fonts/`. `@font-face` rules live in `src/styles/input.css` and point to `fonts/<file>` **relative to the stylesheet**, so they work under any `--base`. The site map serves them as `assets/fonts/<file>` with `font/woff2` (binary bodies, D12). `font-display: swap`.

**Rationale**: Keeps FR-004 / 001 FR-038 and the CSP; no runtime dependency; variable fonts keep the file count to about six files (~200 kB).

**Alternatives considered**: Google Fonts as in the handoff (third-party request, blocked by the CSP); the `geist` npm package (ships Next.js-oriented exports); system font stack (does not match the approved design).

## D5. Icons

**Decision**: Copy the ~16 icons the mockups use (eye, search, grid, shield, layers, sun, moon, monitor, chevron-right, chevron-up-down, arrow-right, alert-triangle, check, check-circle, copy, x, sort, menu) from Lucide as SVG path data into `src/render/icons.js`, with the ISC licence notice in the file header. Icons are inline `<svg>` with `stroke="currentColor"` (presentation attributes, allowed by the CSP).

**Rationale**: A fixed, small set; a dependency (`lucide-static`, ~1,500 icons) would be unused weight.

## D6. Proportional widths without inline styles

The stats bar segments, their done/open/next parts, the phase rail blocks and the mini progress bars need widths computed from data, but `style="width: …"` is blocked by the CSP.

**Decision**:

- Widths are **integer percentages** chosen by the model with the **largest-remainder method**, so the parts of one bar always add up to exactly 100 (data-model "Percent shares").
- Tailwind v4 generates one utility per value: `@utility w-pct-* { width: calc(--value(integer) * 1%); }` and `@source inline("w-pct-{0..100}")`, so all 101 classes exist even though the markup builds them at run time. Tiny non-zero shares get a minimum visible width (`min-w-[3px]` for segments, a label-sized minimum for rail blocks, with the rail allowed to scroll sideways on narrow screens).
- The progress ring is an inline SVG whose `stroke-dasharray` is a presentation attribute (allowed).
- Positions computed in the browser (the tooltip, D8) are set through the CSSOM (`el.style.left = …`), which the CSP does not restrict.

**Alternatives considered**: SVG for every bar (awkward for the interactive, labelled rail blocks and for text truncation); `<progress>` (one value only, cannot show three parts); per-page generated stylesheets (more site entries for no gain); `attr()` with types (Chromium only).

## D7. Native browser features instead of libraries

**Decision** (all within the supported browsers, FR-055):

| Need | Native feature |
|---|---|
| Tree, phases, task rows, clarification sessions, stories open/close without JS | `<details>/<summary>` (as today) |
| Phase accordion (one open at a time) | `<details name="phases">` exclusive groups (Chrome 120, Firefox 130, Safari 17.2); JS adds the rail ↔ list sync and "choose again to close" |
| Search dialog, focus trap, Escape, focus return | `<dialog>` with `showModal()` |
| Contents panel "section in view" | `IntersectionObserver` |
| Two-line clamp in tooltips | `line-clamp: 2` / `-webkit-line-clamp` |
| Sidebar on narrow screens | `<details>` menu (works without JS) |
| Copy ID | `navigator.clipboard.writeText` (secure context: `127.0.0.1` and HTTPS hosts count) with a text-selection fallback |
| Tree highlight of ancestors | `:has()` is available but the highlight is set from JS (hover is JS-only anyway) |

## D8. Task map: tooltip, hover and click

**Decision**:

- **One shared tooltip element** per page, filled and positioned by JS (`getBoundingClientRect`, clamped to the card and the viewport, placed above the square and aligned left/centre/right by available room). A `setTimeout` of 500 ms starts on `pointerenter` of a square (delegated listener on the map) and is cleared on `pointerleave`; keyboard `focus` shows it at once; `pointerType === "touch"` never shows it (clarified; the tap is a click).
- **Hover growth** (1.6× with a two-ring outline, 120 ms ease-out) is pure CSS (`:hover`, `:focus-visible`, `transform`), off under reduced motion.
- **Click / Enter** keeps 001's link-based behavior: each square is an `<a href="#task-<key>">` to the tree row, so without JS the browser jumps there; with JS the module opens the task's feature, phase and story `<details>`, scrolls the tree card (not the window) to the row and marks it `data-selected` until the next click elsewhere.
- **Without JS**: every square carries `title="T046 · Done — text — feature"` (native tooltip) and its state color.

**Rationale**: 2,000 per-square tooltip elements would multiply the page size and DOM nodes; a single element keeps SC-006 easy. Server-side "left/right alignment by column" (as in the mockup) breaks when the map reflows on narrow screens.

## D9. Viewer preferences

**Decision**: `localStorage` keys `sk-theme` (`light|dark|system`, default `system`, name from the handoff), `sk-order` (`progress|number|least|name`), `sk-filter` (`all|open`), `sk-map` (`stacked|grouped`). Every access goes through `src/client/prefs.js`, which wraps reads and writes in `try/catch` and falls back to defaults (edge case "Browser storage unavailable"). Keys are shared by all pages of one origin, which is what the spec asks for ("every page of the dashboard").

## D10. Ordering and filtering the tree without duplicating logic

**Decision**: The **model** computes, for every feature, its rank under each of the four orders and whether it is complete; the renderer writes them as `data-rank-progress`, `data-rank-number`, `data-rank-least`, `data-rank-name` and `data-complete`. The server renders the default order ("In progress first"). The browser module only sorts the feature `<li>` elements by the chosen attribute (no ordering rules in the browser) and "Open tasks only" is a CSS rule on `[data-filter="open"]` that hides `[data-complete]` rows and done tasks. The sidebar list is rendered in the same default order.

**Rationale**: The ordering rules exist once, in unit-tested model code (§III); the browser code stays trivial.

## D11. Unit tests for the browser modules

**Decision**: Add **`happy-dom`** (MIT) as a devDependency and use it in `node:test` suites for the browser modules (`new Window()` per test, injected as `document`/`window`). Existing client tests with hand-written fakes stay as they are.

**Rationale**: The redesign moves real DOM work to the browser (sorting nodes, `<details>` groups, a dialog, focus handling). Hand-written fakes for that surface would be larger than the code under test. happy-dom runs in-process, has no network or file access and is fast, so constitution §IV ("isolated from network, filesystem … use fakes or test doubles") holds. Layout-dependent behavior (tooltip clamping, scrolling) is tested with stubbed `getBoundingClientRect` values; real layout is covered by E2E tests.

**Alternatives considered**: `jsdom` (heavier and slower, same role); only E2E tests for browser code (violates §IV).

## D12. Binary assets in the site map

**Decision**: `SiteEntry.body` becomes `string | Uint8Array`. The handler sends bytes as they are; `writeSite` writes them with no encoding. New types: `font/woff2`, `application/json; charset=utf-8`, `text/plain; charset=utf-8` (font licence files).

## D13. Structured `spec.md` view

**Decision**: A new pure parser `src/parse/spec-structure.js` turns `spec.md` into a list of **blocks**, each with the source line range it covers. Recognized blocks (metadata, original request, clarification sessions and Q/A items, user stories with their parts and scenarios, requirement areas and requirements, key entities) are rendered by `src/render/spec-view.js`; every other range becomes a **plain block** rendered by the existing Markdown renderer. The parser's invariant — *the blocks' line ranges are disjoint and cover every line of the file* — is asserted by unit tests over all fixtures and this repository's specs, which directly proves SC-012. Text inside recognized blocks is rendered with the same `markdown-it` instance (inline rendering), so raw HTML stays text (001 FR-024). Recognition rules are in [contracts/spec-md-structure.md](./contracts/spec-md-structure.md).

**Alternatives considered**: transforming `markdown-it`'s token stream (tokens carry `map` line ranges, but user-story structure spans many tokens and bold-prefixed paragraphs; the line-based parser is simpler and already the pattern of `parse/tasks.js`); `remark`/`unified` (large dependency tree).

## D14. Search

**Decision**:

- `render/search-index.js` builds a JSON index from the model: tasks (key, id, text, state, feature, URL of the task on its feature page), features (number, title, status, URL) and documents (title, and each `##`/`###` heading with its anchor URL). `site.js` publishes it as `assets/search-index.json` — the same file in serve and build mode.
- The browser module fetches it on first use (relative to `base`), and again after a live `change` event if the dialog is used later. Matching follows [contracts/search-index.md](./contracts/search-index.md): case-insensitive, every word must occur, full task ID first, then matches at the start of a label, then page order; each group shows its first 8 results and "N more".
- The search entry is rendered with `hidden` and shown by JS, so it never appears without scripts.

**Rationale**: A linear scan over ~3,000 short strings per keystroke takes well under a millisecond; SC-014 (200 ms) is met without an index library.

**Alternatives considered**: MiniSearch or Fuse.js (fuzzy and ranked search that the spec does not ask for; extra dependency); server-side search endpoint (does not exist in static builds).

## D15. Blocked color

**Decision**: Blocked tasks are drawn like open tasks (outlined, as they are open) but in **rose**: a 1.5 px outline and a light tint. New tokens next to the handoff's: `--rose: light-dark(#BE123C, #FB7185)`, `--rose-bg: light-dark(#FFE4E6, #3F1522)`, `--rose-text: light-dark(#9F1239, #FDA4AF)`. Rose differs in hue from the next-task orange `#C2410C` and from the amber warnings. Pill text (`--rose-text` on `--rose-bg`) exceeds 4.5 : 1 in both themes (checked in the E2E contrast test).

## D16. Supported browsers and E2E matrix

**Decision**: Playwright projects `chromium`, `firefox` and `webkit` (desktop), plus a `chromium-nojs` project (`javaScriptEnabled: false`) and a `chromium-mobile` project (375 × 812, touch) for FR-053, FR-009 and the touch rule. CI installs all three browsers (`playwright install --with-deps chromium firefox webkit`). Layout checks compare bounding boxes (region order and side-by-side placement, SC-009), not screenshots (clarified).

**Note**: the cloud development container has Chromium preinstalled only; Firefox and WebKit runs happen in CI.

## D17. Page addresses

**Decision** (existing addresses may change, clarified; most stay because they are fine): overview `index.html`; feature page `features/<dir>/index.html` (new); documents keep `features/<dir>/<rel>.html`, `constitution.html`, `assessments/<slug>/<rel>.html`; the selected task is the fragment `#task-<key>`; a `tasks.md` line is `features/<dir>/tasks.html#L<line>`. See [contracts/routes.md](./contracts/routes.md).

## D18. Version

**Decision**: No release has been made yet (clarification; no git tag, nothing on npm), so `CHANGELOG.md` keeps everything under `## [Unreleased]`: the premature `[1.0.0] - 2026-09-25` heading was removed on 2026-09-26 and its entries now sit under Unreleased. The redesign adds its entries there too. The version number is chosen when the release process runs (DEVELOPMENT.md).

## D19. Performance (SC-007, SC-014)

**Decision**: Keep 001 R12's approach (one scan, pure render, site map in memory). New costs measured by the existing `scale` E2E suite with the generated 50 × 2,000 fixture: overview HTML (tree rows + map squares, no per-square tooltip markup), feature pages (one per feature), the search index (~300 kB for 2,000 tasks, loaded only on first search). Tree order changes move existing nodes, they do not re-render.
