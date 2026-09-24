/**
 * Overview enhancement (FR-015b, spec US1 AC9): hovering or focusing a task
 * square in the grid highlights its feature, phase and story in the tree.
 * Optional: the overview is complete without it (FR-037). Loaded as an ES
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

if (typeof document !== "undefined") attachHover(document);
