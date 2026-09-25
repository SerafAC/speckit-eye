/**
 * Overview enhancements (FR-015b, spec US1 AC9): hovering or focusing a task
 * square in the grid highlights its feature, phase and story in the tree, and
 * clicking a square opens them and scrolls smoothly to the task (spec
 * Assumptions "Open design items"). Optional: the overview is complete
 * without it (FR-037); a square's `href` already jumps to the task. Loaded as an ES
 * module (`assets/overview.js`); `document` is injected so it can be unit
 * tested with fakes.
 */

/**
 * The tree keys listed in a grid cell's `data-parents` attribute.
 * @param {string | null | undefined} dataParents space-separated keys
 * @returns {string[]}
 */
export function parentKeys(dataParents) {
  return String(dataParents ?? "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * @param {string} key
 * @returns {string} an attribute selector matching `data-key="<key>"`
 */
function keySelector(key) {
  return `[data-key="${key.replace(/["\\]/g, "\\$&")}"]`;
}

/**
 * Registers the grid → tree hover highlight. Does nothing when the page has
 * no grid or no tree.
 * @param {Pick<Document, "querySelector">} doc
 */
export function attachHover(doc) {
  const grid = doc.querySelector('[data-region="grid"]');
  const tree = doc.querySelector('[data-region="tree"]');
  if (!grid || !tree) return;

  /** @type {Element[]} */
  let lit = [];

  const clear = () => {
    for (const el of lit) el.removeAttribute("data-highlight");
    lit = [];
  };

  const show = (/** @type {Event} */ event) => {
    const cell = /** @type {Element | null} */ (event.target);
    const parents = cell && typeof cell.getAttribute === "function" ? cell.getAttribute("data-parents") : null;
    if (parents === null) return;
    clear();
    for (const key of parentKeys(parents)) {
      const el = tree.querySelector(keySelector(key));
      if (!el) continue;
      el.setAttribute("data-highlight", "");
      lit.push(el);
    }
  };

  grid.addEventListener("mouseover", show);
  grid.addEventListener("focusin", show);
  grid.addEventListener("mouseout", clear);
  grid.addEventListener("focusout", clear);
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * Registers the grid → tree click. The listener sits on the document, so it
 * keeps working after a live update swaps `<main>`. A click on a square
 * (an element with `data-parents`) opens the `<details>` listed there,
 * scrolls the task into the middle of the view (smooth unless the viewer
 * prefers reduced motion, FR-036) and marks it with `data-highlight` until
 * the next click. Other clicks, including tree toggles, are left alone.
 * @param {Pick<Document, "querySelector" | "addEventListener">} doc
 * @param {{matchMedia?: (query: string) => {matches: boolean}} | null} [win]
 */
export function attachClick(doc, win = /** @type {any} */ (doc).defaultView) {
  /** @type {Element | null} */
  let marked = null;

  doc.addEventListener("click", (event) => {
    const cell = /** @type {Element | null} */ (event.target);
    const parents = cell && typeof cell.getAttribute === "function" ? cell.getAttribute("data-parents") : null;
    const key = parents === null ? null : /** @type {Element} */ (cell).getAttribute("data-key");
    if (key === null) return;
    const tree = doc.querySelector('[data-region="tree"]');
    const task = tree?.querySelector(keySelector(key));
    if (!tree || !task) return;
    event.preventDefault();
    for (const parent of parentKeys(parents)) {
      const details = /** @type {HTMLDetailsElement | null} */ (tree.querySelector(keySelector(parent)));
      if (details) details.open = true;
    }
    marked?.removeAttribute("data-highlight");
    task.setAttribute("data-highlight", "");
    marked = task;
    const reduced = Boolean(win?.matchMedia?.(REDUCED_MOTION)?.matches);
    task.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  });
}

if (typeof document !== "undefined") for (const attach of [attachHover, attachClick]) attach(document);
