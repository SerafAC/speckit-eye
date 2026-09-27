/**
 * Overview task map behavior (FR-024 to FR-026, FR-028, research D8;
 * contracts/routes.md "Browser modules"): the "By feature" / "Stack all"
 * mode toggle, the shared delayed tooltip, the tree highlight of a hovered
 * or focused square, and click / Enter → reveal the task in the tree.
 *
 * The map works without this module: every square keeps its state color, a
 * native `title` and an `href` to its task row in the tree, and the toggle
 * stays hidden (FR-028, FR-053).
 *
 * `init(root, deps)` is idempotent: it runs on load and again after every
 * live swap of `<main>`. The map mode is a preference (src/client/prefs.js),
 * so the module keeps no page-local state and has no `save()`.
 */

import { createPrefs, ALLOWED } from "./prefs.js";
import { reveal } from "./tree.js";

/** Delay between the pointer entering a square and the tooltip (FR-024). */
export const TOOLTIP_DELAY_MS = 500;

/** Text of the mode toggle in each mode: it names the other mode (FR-021). src/render/taskmap.js renders it from here. */
export const MODE_LABELS = Object.freeze({ stacked: "By feature", grouped: "Stack all" });

/** Tooltip text for a checkbox without a task ID (FR-024). */
export const NO_ID_TEXT = "Checkbox without a task ID";

/** Space between the square and the tooltip, in px. */
const GAP = 8;

/** Elements already wired (listeners are added once per element). */
const wired = new WeakSet();

/**
 * @typedef {object} MapState
 * @property {any} timer pending tooltip timer
 * @property {Element | null} hovered square under the pointer
 * @property {boolean} pointerFocus the next focus comes from a pointer press
 */

/** @type {WeakMap<Element, MapState>} */
const states = new WeakMap();

/**
 * @typedef {{left: number, top: number, width: number, height: number}} Box
 */

/**
 * Where the tooltip goes (FR-024): above the square, centred on it when
 * there is room, otherwise aligned with the square's left or right edge,
 * and always clamped to `bounds` (the card and the viewport); below the
 * square only when there is no room above.
 * @param {Box} square the square's viewport rectangle
 * @param {Pick<Box, "width" | "height">} tip the tooltip's size
 * @param {{left: number, right: number, top: number, bottom: number}} bounds
 * @returns {{left: number, top: number, align: "left" | "centre" | "right"}}
 */
export function placeTooltip(square, tip, bounds) {
  const squareRight = square.left + square.width;
  const centre = square.left + square.width / 2 - tip.width / 2;
  /** @type {"left" | "centre" | "right"} */
  let align = "centre";
  let left = centre;
  if (centre < bounds.left) {
    align = "left";
    left = square.left;
  } else if (centre + tip.width > bounds.right) {
    align = "right";
    left = squareRight - tip.width;
  }
  left = Math.max(bounds.left, Math.min(left, bounds.right - tip.width));

  let top = square.top - GAP - tip.height;
  if (top < bounds.top) top = square.top + square.height + GAP;
  top = Math.max(bounds.top, Math.min(top, bounds.bottom - tip.height));
  return { left, top, align };
}

/**
 * @param {string} value
 * @returns {string} an attribute selector value, quoted and escaped
 */
function quoted(value) {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

/**
 * The tree keys in a square's `data-parents` (feature, phase, story group).
 * @param {Element} square
 * @returns {string[]}
 */
function parentKeys(square) {
  return (square.getAttribute("data-parents") ?? "").split(/\s+/).filter(Boolean);
}

/**
 * The tree rows of a square's task, by key: the task row and its feature,
 * phase and story group rows (`data-parents`), each only when the tree has
 * it. The hover path runs this with 2,000 squares (SC-006), so it never
 * scans the tree: the task row is found by its id (the square's `href`
 * fragment) and its parents by walking up from it. A key not found that way
 * (a task without a row, markup from elsewhere) falls back to a selector.
 * @param {Element} tree
 * @param {Element} square
 * @returns {Map<string, Element>}
 */
export function treeRows(tree, square) {
  const key = square.getAttribute("data-key") ?? "";
  const keys = [...parentKeys(square), key].filter(Boolean);
  /** @type {Map<string, Element>} */
  const rows = new Map();
  const anchor = anchorOf(square);
  const doc = tree.ownerDocument;
  const taskRow = anchor && doc ? doc.getElementById(anchor) : null;
  if (taskRow && key && taskRow.getAttribute("data-key") === key && tree.contains(taskRow)) {
    const wanted = new Set(keys);
    for (let el = /** @type {Element | null} */ (taskRow); el && el !== tree; el = el.parentElement) {
      const k = el.getAttribute("data-key");
      if (k !== null && wanted.has(k) && !rows.has(k)) rows.set(k, el);
    }
  }
  for (const k of keys) {
    if (rows.has(k)) continue;
    const el = tree.querySelector(`[data-key=${quoted(k)}]`);
    if (el) rows.set(k, el);
  }
  return rows;
}

/**
 * What the tooltip shows for a square: ID (or "Checkbox without a task ID"),
 * state and its label, task text and feature name. The ID and label come
 * from the square's title ("T018 · Blocked — text — feature"); the text and
 * feature name from the tree rows when present, else from the title.
 * @param {Element} square
 * @param {Element | null} tree
 * @returns {{id: string, state: string, label: string, text: string, feature: string}}
 */
export function tooltipContent(square, tree) {
  const title = square.getAttribute("title") ?? "";
  const m = /^(.*?) · (.*?) — ([\s\S]*) — (.*)$/.exec(title);
  const state = square.getAttribute("data-state") ?? "open";
  const name = m ? m[1] : "";
  let text = m ? m[3] : title;
  let feature = m ? m[4] : "";
  const rows = tree ? treeRows(tree, square) : new Map();
  const key = square.getAttribute("data-key");
  const taskRow = key ? rows.get(key) : null;
  const row = taskRow?.tagName === "LI" ? taskRow.querySelector('[data-part="text"]') : null;
  if (row) text = row.getAttribute("title") ?? row.textContent ?? text;
  const dir = parentKeys(square)[0];
  const featureRow = dir ? rows.get(dir) : null;
  const featureTitle =
    featureRow?.tagName === "DETAILS" && featureRow.parentElement?.matches("li[data-feature]")
      ? featureRow.querySelector(':scope > summary [data-part="title"]')
      : null;
  if (featureTitle) feature = featureTitle.textContent ?? feature;
  return {
    id: !name || name === "No ID" ? NO_ID_TEXT : name,
    state,
    label: m ? m[2] : state,
    text,
    feature,
  };
}

/**
 * Whether a tree row is on screen as far as the tree is concerned: every
 * `<details>` around it is open and the "Open tasks only" filter does not
 * hide it.
 * @param {Element} el
 * @param {Element} tree
 */
function isShown(el, tree) {
  for (let p = el.parentElement; p && p !== tree; p = p.parentElement) {
    if (p.tagName === "DETAILS" && !(/** @type {HTMLDetailsElement} */ (p).open)) return false;
  }
  if (tree.getAttribute("data-filter") === "open") {
    if (el.closest("[data-complete]")) return false;
    if (el.matches('li[data-state="done"]')) return false;
  }
  return true;
}

/**
 * The rows each root's last {@link highlight} tinted.
 * @type {WeakMap<Document | Element, Element[]>}
 */
const tinted = new WeakMap();

/**
 * Removes the rows the last {@link highlight} tinted, without scanning the
 * tree (the hover path, SC-006).
 * @param {Document | Element} root
 */
function untint(root) {
  for (const el of tinted.get(root) ?? []) el.removeAttribute("data-hl");
  tinted.delete(root);
}

/**
 * Removes every map highlight from the tree.
 * @param {Document | Element} root
 */
export function clearHighlight(root) {
  untint(root);
  for (const el of root.querySelectorAll('[data-region="tree"] [data-hl]')) el.removeAttribute("data-hl");
}

/**
 * Tints the tree rows of a square's task (FR-025): `data-hl="ancestor"` on
 * its visible feature, phase and story rows, and `data-hl="deepest"` on the
 * deepest visible one — the task row itself when it is visible.
 * @param {Document | Element} root
 * @param {Element} square
 */
export function highlight(root, square) {
  untint(root);
  const tree = root.querySelector('[data-region="tree"]');
  if (!tree) return;
  const found = treeRows(tree, square);
  const keys = [...parentKeys(square), square.getAttribute("data-key") ?? ""].filter(Boolean);
  const rows = keys.map((key) => found.get(key) ?? null).filter((el) => el !== null && isShown(el, tree));
  for (const el of rows) el.setAttribute("data-hl", "ancestor");
  rows.at(-1)?.setAttribute("data-hl", "deepest");
  tinted.set(root, rows);
}

/**
 * Shows a mode: sets `data-layout` and the toggle's text and `aria-pressed`.
 * @param {Element} map
 * @param {"stacked" | "grouped"} mode
 */
export function applyMode(map, mode) {
  map.setAttribute("data-layout", mode);
  const button = map.querySelector('button[data-part="map-mode"]');
  if (!button) return;
  button.setAttribute("aria-pressed", String(mode === "grouped"));
  const label = button.querySelector('[data-part="mode-label"]');
  if (label) label.textContent = MODE_LABELS[mode];
}

/**
 * The square an event happened on, or null.
 * @param {EventTarget | null} target
 * @returns {HTMLAnchorElement | null}
 */
function squareOf(target) {
  const el = /** @type {Element | null} */ (target);
  if (!el || typeof el.closest !== "function") return null;
  return /** @type {HTMLAnchorElement | null} */ (el.closest('[data-region="taskmap"] a[data-state][data-parents]'));
}

/**
 * The fragment a square links to (the task row's id).
 * @param {Element} square
 */
function anchorOf(square) {
  return (square.getAttribute("href") ?? "").replace(/^#/, "");
}

/**
 * @param {Document} document
 * @param {string} tag
 * @param {string} part
 * @param {string} text
 */
function part(document, tag, part, text) {
  const el = document.createElement(tag);
  el.setAttribute("data-part", part);
  el.textContent = text;
  return el;
}

/**
 * @param {Document | Element} root
 * @param {object} deps
 * @param {Document} deps.document
 * @param {Window} [deps.window]
 * @param {import("./prefs.js").Prefs} [deps.prefs]
 * @param {Storage | null} [deps.storage]
 * @param {(fn: () => void, ms: number) => any} [deps.setTimeout]
 * @param {(id: any) => void} [deps.clearTimeout]
 */
export function init(root, deps) {
  const map = root.querySelector('[data-region="taskmap"]');
  if (!map) return;
  const document = deps.document;
  const prefs = deps.prefs ?? createPrefs(deps.storage ?? null);
  const setTimer = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimeout ?? ((id) => clearTimeout(id));
  const tip = /** @type {HTMLElement | null} */ (document.querySelector('[data-region="tooltip"]'));

  /** @type {MapState} */
  const state = states.get(map) ?? { timer: null, hovered: null, pointerFocus: false };
  states.set(map, state);

  const hide = () => {
    if (state.timer !== null) clearTimer(state.timer);
    state.timer = null;
    if (tip) tip.hidden = true;
  };

  /** @param {Element} square */
  const show = (square) => {
    if (state.timer !== null) clearTimer(state.timer);
    state.timer = null;
    if (!tip) return;
    const c = tooltipContent(square, root.querySelector('[data-region="tree"]'));
    const head = document.createElement("span");
    head.setAttribute("data-part", "head");
    const pill = part(document, "span", "status", c.label);
    pill.className = "pill";
    pill.setAttribute("data-status", c.state);
    head.append(part(document, "span", "id", c.id), pill);
    tip.replaceChildren(head, part(document, "span", "text", c.text), part(document, "span", "feature", c.feature));
    tip.hidden = false;

    const view = deps.window ?? document.defaultView;
    const vw = view?.innerWidth ?? document.documentElement.clientWidth;
    const vh = view?.innerHeight ?? document.documentElement.clientHeight;
    const card = (map.querySelector('[data-part="card"]') ?? map).getBoundingClientRect();
    const place = placeTooltip(square.getBoundingClientRect(), tip.getBoundingClientRect(), {
      left: Math.max(0, card.left),
      right: Math.min(vw, card.left + card.width),
      top: 0,
      bottom: vh,
    });
    tip.style.left = `${Math.round(place.left)}px`;
    tip.style.top = `${Math.round(place.top)}px`;
    tip.setAttribute("data-align", place.align);
  };

  // A live swap replaces the squares: drop what belonged to the old ones.
  hide();
  clearHighlight(root);
  state.hovered = null;

  const mode = prefs.get("map");
  const button = map.querySelector('button[data-part="map-mode"]');
  if (button && map.getAttribute("data-layout") !== "bars") {
    button.removeAttribute("hidden");
    const current = map.getAttribute("data-layout");
    applyMode(map, /** @type {"stacked" | "grouped"} */ (mode ?? (current === "grouped" ? "grouped" : "stacked")));
    if (!wired.has(button)) {
      wired.add(button);
      button.addEventListener("click", () => {
        const next = map.getAttribute("data-layout") === "grouped" ? "stacked" : "grouped";
        if (ALLOWED.map.includes(next)) prefs.set("map", next);
        hide();
        applyMode(map, next);
      });
    }
  }

  if (wired.has(map)) return;
  wired.add(map);

  // Pointer: `pointerover`/`pointerout` are the bubbling forms of
  // pointerenter/pointerleave, so one delegated listener serves every square.
  map.addEventListener("pointerover", (event) => {
    const square = squareOf(event.target);
    if (!square || square === state.hovered) return;
    state.hovered = square;
    highlight(root, square);
    hide();
    if (/** @type {PointerEvent} */ (event).pointerType === "touch") return;
    state.timer = setTimer(() => {
      state.timer = null;
      if (state.hovered === square) show(square);
    }, TOOLTIP_DELAY_MS);
  });

  map.addEventListener("pointerout", (event) => {
    const square = squareOf(event.target);
    if (!square) return;
    const to = /** @type {Node | null} */ (/** @type {PointerEvent} */ (event).relatedTarget);
    if (to && square.contains(to)) return;
    if (state.hovered === square) state.hovered = null;
    hide();
    untint(root);
  });

  // A press focuses the link too; that focus must not show the tooltip at
  // once (only keyboard focus does).
  map.addEventListener("pointerdown", (event) => {
    if (!squareOf(event.target)) return;
    state.pointerFocus = true;
    if (/** @type {PointerEvent} */ (event).pointerType === "touch") hide();
    setTimer(() => {
      state.pointerFocus = false;
    }, 0);
  });

  map.addEventListener("focusin", (event) => {
    const square = squareOf(event.target);
    if (!square) return;
    highlight(root, square);
    if (state.pointerFocus) return;
    show(square);
  });

  map.addEventListener("focusout", (event) => {
    if (!squareOf(event.target)) return;
    hide();
    untint(root);
  });

  // Click, tap or Enter: reveal the task in the tree instead of jumping.
  const pick = (/** @type {Event} */ event) => {
    const square = squareOf(event.target);
    if (!square) return;
    if (reveal(root, anchorOf(square))) event.preventDefault();
  };
  map.addEventListener("click", pick);
  map.addEventListener("keydown", (event) => {
    if (/** @type {KeyboardEvent} */ (event).key === "Enter") pick(event);
  });
}
