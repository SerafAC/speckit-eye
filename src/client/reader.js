/**
 * Document reader behavior (FR-040 to FR-042; contracts/routes.md "Browser
 * modules"):
 *
 * - contents: the "On this page" link of the section in view (the last one
 *   at the end of the page) is marked `aria-current="location"`, and the
 *   progress bar (un-hidden here) follows
 *   the scroll position with a `w-pct-N` class (no inline style, CSP);
 * - "Expand all": un-hidden here; opens every `<details>` of the article
 *   (except "Raw markdown") and turns into "Collapse all";
 * - "Raw markdown": while its `<details>` is open the article shows the
 *   source instead of the formatted view (`data-view="raw"`);
 * - "Show N more answers": kept open across live updates;
 * - requirement area chips: un-hidden here; "All" by default, picking an
 *   area hides the other areas' requirements.
 *
 * Without this module the page still works: sections are plain anchors,
 * "Raw markdown" and "Show more" are `<details>`, and every area is listed
 * (FR-053). `init(root, deps)` is idempotent: it runs on load and after
 * every live swap with the result of `save(root)` in `deps.state`.
 */

/** Elements already wired (listeners are added once per element). */
const wired = new WeakSet();

/**
 * The IntersectionObserver of each document and the article it watches; a
 * new article (after a live swap) replaces it.
 * @type {WeakMap<Document, {article: Element, observer: any, refresh: () => void}>}
 */
const observers = new WeakMap();

/**
 * @typedef {object} ReaderState
 * @property {boolean} raw the raw view is shown
 * @property {boolean} expanded "Expand all" is on
 * @property {string} area the chosen requirement area ("all" by default)
 * @property {string[]} more `data-key`s of the open "Show more" parts
 */

/**
 * @typedef {object} ReaderDeps
 * @property {Document} document
 * @property {Window} [window]
 * @property {any} [IntersectionObserver] injected for tests; defaults to the window's
 * @property {unknown} [state] the result of `save()` before a live swap
 */

/** @param {Document | Element} root */
const articleOf = (root) => /** @type {HTMLElement | null} */ (root.querySelector('article[data-region="doc"]'));

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
const all = (root, selector) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);

/**
 * The `<details>` "Expand all" opens and closes: all of the article's,
 * except the raw view.
 * @param {Element} article
 */
const collapsibles = (article) =>
  /** @type {HTMLDetailsElement[]} */ (all(article, "details").filter((d) => d.getAttribute("data-part") !== "raw"));

/**
 * Marks one contents link as the section in view.
 * @param {Element | null} toc
 * @param {string | null} anchor
 */
export function markCurrent(toc, anchor) {
  if (!toc) return;
  for (const a of all(toc, "a[data-toc]")) {
    if (anchor !== null && a.getAttribute("data-toc") === anchor) a.setAttribute("aria-current", "location");
    else a.removeAttribute("aria-current");
  }
}

/**
 * Reading progress in percent (0–100) from the scroll position.
 * @param {number} scrollY
 * @param {number} scrollHeight
 * @param {number} viewport
 */
export function progressPercent(scrollY, scrollHeight, viewport) {
  const range = scrollHeight - viewport;
  if (range <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round((scrollY / range) * 100)));
}

/**
 * Sets the progress bar's `w-pct-N` class and shows it.
 * @param {Document} document
 * @param {Window | undefined} window
 */
function updateProgress(document, window) {
  const box = /** @type {HTMLElement | null} */ (document.querySelector('[data-region="toc"] [data-part="progress"]'));
  const bar = box?.querySelector('[data-part="progress-bar"]');
  if (!box || !bar) return;
  const el = document.documentElement;
  const pct = progressPercent(window?.scrollY ?? 0, el.scrollHeight, window?.innerHeight ?? el.clientHeight);
  for (const c of [...bar.classList]) if (c.startsWith("w-pct-")) bar.classList.remove(c);
  bar.classList.add(`w-pct-${pct}`);
  box.hidden = false;
}

/**
 * Whether the page is scrolled to its end.
 * @param {Document} document
 * @param {Window | undefined} window
 */
function atEnd(document, window) {
  const el = document.documentElement;
  const range = el.scrollHeight - (window?.innerHeight ?? el.clientHeight);
  return range > 0 && (window?.scrollY ?? 0) >= range - 2;
}

/**
 * Observes the section targets of the contents links: the current section
 * is the first one in view, else the last one scrolled past; at the end of
 * the page it is the last one.
 * @param {Element} article
 * @param {Element} toc
 * @param {Document} document
 * @param {Window | undefined} window
 * @param {any} Observer IntersectionObserver
 */
function watchSections(article, toc, document, window, Observer) {
  const previous = observers.get(document);
  if (!Observer || previous?.article === article) return;
  previous?.observer.disconnect();
  observers.delete(document);
  const targets = all(toc, "a[data-toc]")
    .map((a) => document.getElementById(/** @type {string} */ (a.getAttribute("data-toc"))))
    .filter((t) => t !== null);
  if (targets.length === 0) return;
  /** @type {Map<Element, {visible: boolean, above: boolean}>} */
  const seen = new Map(targets.map((t) => [t, { visible: false, above: false }]));
  const refresh = () => {
    if (atEnd(document, window)) {
      markCurrent(toc, targets[targets.length - 1].id);
      return;
    }
    const visible = targets.find((t) => seen.get(t)?.visible);
    const above = [...targets].reverse().find((t) => seen.get(t)?.above);
    const current = visible ?? above ?? null;
    if (current) markCurrent(toc, current.id);
  };
  const observer = new Observer((/** @type {any[]} */ entries) => {
    for (const e of entries) {
      const s = seen.get(e.target);
      if (!s) continue;
      s.visible = Boolean(e.isIntersecting);
      const top = e.rootBounds?.top ?? 0;
      s.above = !e.isIntersecting && e.boundingClientRect.top < top;
    }
    refresh();
  });
  for (const t of targets) observer.observe(t);
  observers.set(document, { article, observer, refresh });
}

/**
 * @param {HTMLButtonElement} button
 * @param {boolean} on
 */
function showExpanded(button, on) {
  button.setAttribute("aria-pressed", String(on));
  button.textContent = on ? "Collapse all" : "Expand all";
}

/**
 * Shows the areas' requirements for `area` ("all" or an area index).
 * @param {Element} section `section[data-part="requirements"]`
 * @param {string} area
 */
export function chooseArea(section, area) {
  const buttons = all(section, '[data-part="areas"] button[data-area]');
  const known = buttons.some((b) => b.getAttribute("data-area") === area);
  const value = known ? area : "all";
  for (const b of buttons) b.setAttribute("aria-pressed", String(b.getAttribute("data-area") === value));
  for (const a of all(section, '[data-part="area"]')) a.hidden = value !== "all" && a.getAttribute("data-area") !== value;
}

/**
 * @param {Document | Element} root
 * @param {ReaderDeps} deps
 */
export function init(root, deps) {
  const article = articleOf(root);
  if (!article) return;
  const { document } = deps;
  const window = deps.window ?? /** @type {Window | undefined} */ (document.defaultView ?? undefined);
  const Observer = deps.IntersectionObserver ?? /** @type {any} */ (window)?.IntersectionObserver;
  const saved = /** @type {Partial<ReaderState> | undefined} */ (deps.state);
  const toc = document.querySelector('[data-region="toc"]');

  // --- contents: current section and progress ---
  if (toc) {
    watchSections(article, toc, document, window, Observer);
    for (const a of all(toc, "a[data-toc]")) {
      if (wired.has(a)) continue;
      wired.add(a);
      a.addEventListener("click", () => markCurrent(toc, a.getAttribute("data-toc")));
    }
    updateProgress(document, window);
    if (window && !wired.has(window)) {
      wired.add(window);
      window.addEventListener(
        "scroll",
        () => {
          updateProgress(document, window);
          observers.get(document)?.refresh();
        },
        { passive: true },
      );
      window.addEventListener("resize", () => updateProgress(document, window));
    }
  }

  // --- raw view ---
  const rawView = /** @type {HTMLDetailsElement | null} */ (article.querySelector('details[data-part="raw"]'));
  if (rawView) {
    if (saved?.raw !== undefined) rawView.open = saved.raw;
    const sync = () => {
      if (rawView.open) article.setAttribute("data-view", "raw");
      else article.removeAttribute("data-view");
    };
    sync();
    if (!wired.has(rawView)) {
      wired.add(rawView);
      rawView.addEventListener("toggle", sync);
    }
  }

  // --- show more answers ---
  if (saved?.more) {
    for (const d of /** @type {HTMLDetailsElement[]} */ (all(article, 'details[data-part="more"]'))) {
      if (saved.more.includes(/** @type {string} */ (d.getAttribute("data-key")))) d.open = true;
    }
  }

  // --- expand all ---
  const expand = /** @type {HTMLButtonElement | null} */ (article.querySelector('button[data-part="expand-all"]'));
  if (expand) {
    expand.hidden = false;
    if (saved?.expanded) for (const d of collapsibles(article)) d.open = true;
    showExpanded(expand, Boolean(saved?.expanded) || expand.getAttribute("aria-pressed") === "true");
    if (!wired.has(expand)) {
      wired.add(expand);
      expand.addEventListener("click", () => {
        const on = expand.getAttribute("aria-pressed") !== "true";
        for (const d of collapsibles(article)) d.open = on;
        showExpanded(expand, on);
      });
    }
  }

  // --- requirement area chips ---
  for (const section of all(article, 'section[data-part="requirements"]')) {
    const group = /** @type {HTMLElement | null} */ (section.querySelector('[data-part="areas"]'));
    if (!group) continue;
    group.hidden = false;
    if (saved?.area !== undefined) chooseArea(section, saved.area);
    for (const b of all(group, "button[data-area]")) {
      if (wired.has(b)) continue;
      wired.add(b);
      b.addEventListener("click", () => chooseArea(section, /** @type {string} */ (b.getAttribute("data-area"))));
    }
  }
}

/**
 * The reader's page-local state, for `init(root, {state})` after a live swap.
 * @param {Document | Element} root
 * @returns {ReaderState}
 */
export function save(root) {
  const article = articleOf(root);
  if (!article) return { raw: false, expanded: false, area: "all", more: [] };
  const rawView = /** @type {HTMLDetailsElement | null} */ (article.querySelector('details[data-part="raw"]'));
  const expand = article.querySelector('button[data-part="expand-all"]');
  const pressed = article.querySelector('[data-part="areas"] button[aria-pressed="true"]');
  return {
    raw: Boolean(rawView?.open),
    expanded: expand?.getAttribute("aria-pressed") === "true",
    area: pressed?.getAttribute("data-area") ?? "all",
    more: /** @type {HTMLDetailsElement[]} */ (all(article, 'details[data-part="more"]'))
      .filter((d) => d.open)
      .map((d) => /** @type {string} */ (d.getAttribute("data-key"))),
  };
}
