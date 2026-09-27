/**
 * Overview feature tree behavior (FR-012, FR-019, FR-020, FR-026, research
 * D10; contracts/routes.md "Browser modules"): the Order button, the depth
 * control "Features | Phases | Tasks", the view filter "All features / Open
 * tasks only", and `reveal()` for the task map.
 *
 * The page works without this module: the tree is rendered in the default
 * order, rows open and close as `<details>`, and the controls stay hidden.
 * Ordering rules live in src/model/ranks.js; this module only sorts the
 * feature rows by their `data-rank-<order>` positions and never re-renders.
 *
 * `init(root, deps)` is idempotent: it is called on load and again by
 * `app.reinit` after every live swap of `<main>`, with the depth returned by
 * `save(root)` in `deps.state`. Order and filter are preferences
 * (src/client/prefs.js) and survive reloads.
 */

import { createPrefs, ALLOWED } from "./prefs.js";

/** @typedef {"progress" | "number" | "least" | "name"} Order */
/** @typedef {"features" | "phases" | "tasks"} Depth */

/** Button label of each order; src/render/overview.js renders the default one from here. */
export const ORDER_LABELS = Object.freeze({
  progress: "In progress first",
  number: "Number",
  least: "Least complete",
  name: "Name A–Z",
});

/** The order after `order` when the button is pressed. */
export function nextOrder(/** @type {string} */ order) {
  const list = ALLOWED.order;
  return list[(list.indexOf(order) + 1) % list.length];
}

const DEPTHS = /** @type {readonly Depth[]} */ (Object.freeze(["features", "phases", "tasks"]));

/** Elements already wired (listeners must be added once per element). */
const wired = new WeakSet();
/** Documents with the "click elsewhere clears the selection" listener. */
const docsWired = new WeakSet();

/**
 * @param {Document | Element} root
 * @returns {Element | null}
 */
function treeOf(root) {
  return root.querySelector('[data-region="tree"]');
}

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {Element[]}
 */
function all(root, selector) {
  return [...root.querySelectorAll(selector)];
}

/**
 * The prefs object of `deps`, or one created over `deps.storage`.
 * @param {{prefs?: import("./prefs.js").Prefs, storage?: Storage | null}} deps
 */
function prefsOf(deps) {
  return deps.prefs ?? createPrefs(deps.storage ?? null);
}

/**
 * Sorts the feature rows by `data-rank-<order>` (moves the existing nodes)
 * and updates the Order button.
 * @param {Document | Element} root
 * @param {string} order
 */
export function applyOrder(root, order) {
  const tree = treeOf(root);
  const list = tree?.querySelector('ul[data-part="features"]');
  if (list) {
    const rows = all(list, ":scope > li[data-feature]");
    const rank = (/** @type {Element} */ li) => {
      const n = Number(li.getAttribute(`data-rank-${order}`));
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    const sorted = [...rows].sort((a, b) => rank(a) - rank(b));
    // The page is rendered in the default order: moving 50 rows that are
    // already in place would only cost style and layout work before load.
    if (sorted.some((li, i) => li !== rows[i])) for (const li of sorted) list.appendChild(li);
  }
  for (const button of all(root, 'button[data-part="order"]')) {
    const label = ORDER_LABELS[/** @type {Order} */ (order)] ?? order;
    button.setAttribute("data-order", order);
    button.setAttribute("title", `Order: ${label}`);
    const text = button.querySelector('[data-part="order-label"]');
    if (text) text.textContent = label;
  }
}

/**
 * Opens or closes the tree to one depth (FR-012): "features" closes every
 * row; "phases" opens features and closes phases and story levels; "tasks"
 * opens features and every phase and story level with tasks.
 * @param {Document | Element} root
 * @param {Depth} depth
 */
export function applyDepth(root, depth) {
  const tree = treeOf(root);
  if (!tree) return;
  for (const d of /** @type {HTMLDetailsElement[]} */ (all(tree, "li[data-feature] > details"))) {
    d.open = depth !== "features";
  }
  for (const d of /** @type {HTMLDetailsElement[]} */ (all(tree, 'li[data-part="phase"] > details, li[data-part="group"] > details'))) {
    d.open = depth === "tasks" && d.querySelector("li[data-state]") !== null;
  }
  showDepth(root, depth);
}

/**
 * Marks the chosen depth button (`aria-pressed`); `null` marks none.
 * @param {Document | Element} root
 * @param {Depth | null} depth
 */
function showDepth(root, depth) {
  for (const button of all(root, '[data-part="depth"] button[data-depth]')) {
    button.setAttribute("aria-pressed", String(button.getAttribute("data-depth") === depth));
  }
}

/**
 * The depth currently shown as selected, or null.
 * @param {Document | Element} root
 * @returns {Depth | null}
 */
function currentDepth(root) {
  const b = root.querySelector('[data-part="depth"] button[aria-pressed="true"]');
  const d = b?.getAttribute("data-depth");
  return d && DEPTHS.includes(/** @type {Depth} */ (d)) ? /** @type {Depth} */ (d) : null;
}

/**
 * Sets the tree's `data-filter` (CSS hides complete items and done tasks for
 * "open", FR-019) and the filter buttons' `aria-pressed`.
 * @param {Document | Element} root
 * @param {string} filter
 */
export function applyFilter(root, filter) {
  treeOf(root)?.setAttribute("data-filter", filter);
  for (const button of all(root, 'button[data-filter]')) {
    button.setAttribute("aria-pressed", String(button.getAttribute("data-filter") === filter));
  }
}

/**
 * Removes the selection outline from every row of the tree.
 * @param {Document | Element} root
 */
export function clearSelection(root) {
  const tree = treeOf(root);
  if (!tree) return;
  for (const el of all(tree, "[data-selected]")) el.removeAttribute("data-selected");
}

/**
 * Reveals a task in the tree (FR-026): opens its feature, phase and story
 * `<details>`, scrolls the tree card — not the window — so the row is in
 * view, and outlines the row as selected (clearing any other selection).
 * @param {Document | Element} root
 * @param {string} anchor the task row's id (Task `anchor`)
 * @returns {Element | null} the row, or null when it is not in the tree
 */
export function reveal(root, anchor) {
  const tree = treeOf(root);
  if (!tree) return null;
  const row = all(tree, "li[data-state][id]").find((li) => li.id === anchor) ?? null;
  if (!row) return null;
  for (let el = row.parentElement; el && el !== tree; el = el.parentElement) {
    if (el.tagName === "DETAILS") /** @type {HTMLDetailsElement} */ (el).open = true;
  }
  clearSelection(root);
  row.setAttribute("data-selected", "");
  scrollIntoTree(tree, row);
  return row;
}

/**
 * Scrolls `tree` (its own scroll box) so that `row` sits in the middle.
 * @param {Element} tree
 * @param {Element} row
 */
function scrollIntoTree(tree, row) {
  const box = tree.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  const offset = r.top - box.top - (box.height - r.height) / 2;
  tree.scrollTop = Math.max(0, tree.scrollTop + offset);
}

/**
 * @param {Document | Element} root
 * @param {object} deps
 * @param {Document} deps.document
 * @param {import("./prefs.js").Prefs} [deps.prefs]
 * @param {Storage | null} [deps.storage]
 * @param {unknown} [deps.state] the result of `save()` before a live swap
 */
export function init(root, deps) {
  const tree = treeOf(root);
  if (!tree) return;
  const prefs = prefsOf(deps);
  const saved = /** @type {{depth?: string} | undefined} */ (deps.state);

  for (const el of all(root, '[data-part="view-filter"], button[data-part="order"], [data-part="depth"]')) {
    el.removeAttribute("hidden");
  }

  applyOrder(root, prefs.get("order") ?? "progress");
  applyFilter(root, prefs.get("filter") ?? "all");
  const depth = saved?.depth;
  if (depth && DEPTHS.includes(/** @type {Depth} */ (depth))) applyDepth(root, /** @type {Depth} */ (depth));
  else showDepth(root, null);

  for (const button of all(root, 'button[data-part="order"]')) {
    if (wired.has(button)) continue;
    wired.add(button);
    button.addEventListener("click", () => {
      const order = nextOrder(button.getAttribute("data-order") ?? "progress");
      prefs.set("order", order);
      applyOrder(root, order);
    });
  }

  for (const button of all(root, '[data-part="depth"] button[data-depth]')) {
    if (wired.has(button)) continue;
    wired.add(button);
    button.addEventListener("click", () => applyDepth(root, /** @type {Depth} */ (button.getAttribute("data-depth"))));
  }

  for (const button of all(root, "button[data-filter]")) {
    if (wired.has(button)) continue;
    wired.add(button);
    button.addEventListener("click", () => {
      const filter = button.getAttribute("data-filter") ?? "all";
      prefs.set("filter", filter);
      applyFilter(root, filter);
    });
  }

  if (!wired.has(tree)) {
    wired.add(tree);
    // A manual toggle (a click on a row's summary, by mouse or keyboard)
    // means the tree no longer matches one depth.
    tree.addEventListener("click", (event) => {
      const target = /** @type {Element | null} */ (event.target);
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("a")) return; // links inside a summary do not toggle it
      if (target.closest("summary")) showDepth(root, null);
    });
  }

  const doc = deps.document;
  if (doc && !docsWired.has(doc)) {
    docsWired.add(doc);
    // Choosing a task row selects it; pressing anywhere else — except on a
    // map square, whose click reveals its own task — clears the selection.
    doc.addEventListener("pointerdown", (event) => {
      const target = /** @type {Element | null} */ (event.target);
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("[data-parents]")) return;
      const row = target.closest('[data-region="tree"] li[data-state]');
      const current = doc.querySelector('[data-region="tree"] [data-selected]');
      if (row === current && row) return;
      clearSelection(doc);
      if (row) row.setAttribute("data-selected", "");
    });
  }
}

/**
 * The page-local state kept across live updates: the selected depth.
 * @param {Document | Element} root
 * @returns {{depth: Depth | null}}
 */
export function save(root) {
  return { depth: currentDepth(root) };
}
