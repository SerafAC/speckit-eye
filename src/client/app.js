/**
 * Bootstrap of the browser modules (contracts/routes.md "Browser modules",
 * research D2). Reads `data-page` from `<body>`, wires the shared shell (theme
 * switch) and runs `init(root, deps)` of every module registered for the page.
 * `live.js` calls `save(root)` before it swaps `<main>` and `reinit(root,
 * state)` after, so each module gets its page-local state back.
 *
 * Every browser API is injected through `deps` so the logic is unit tested
 * with happy-dom; only the guarded last line passes the real globals.
 */

import { createPrefs, browserStorage, ALLOWED } from "./prefs.js";
import * as tree from "./tree.js";
import * as taskmap from "./taskmap.js";

/**
 * @typedef {object} Deps
 * @property {Document} document
 * @property {Window & typeof globalThis} window
 * @property {Storage | null} storage
 * @property {import("./prefs.js").Prefs} prefs
 * @property {(fn: () => void, ms: number) => any} setTimeout
 * @property {(id: any) => void} clearTimeout
 * @property {typeof fetch} [fetch]
 * @property {Navigator} [navigator]
 * @property {unknown} [state] the module's own `save()` result after a live swap
 */

/**
 * @typedef {object} PageModule
 * @property {string} name key of the module's state in `save()`
 * @property {(root: Document | Element, deps: Deps) => void} init idempotent
 * @property {(root: Document | Element) => unknown} [save]
 */

/**
 * The overview feature tree: order, depth, view filter and `reveal()`
 * (src/client/tree.js). Its depth is page-local state kept across live swaps.
 * @type {PageModule}
 */
const treeModule = { name: "tree", init: tree.init, save: tree.save };

/**
 * The overview task map: mode toggle, tooltip, tree highlight and click →
 * `tree.reveal` (src/client/taskmap.js). Its mode is a preference, so it
 * has no page-local state to save.
 * @type {PageModule}
 */
const taskmapModule = { name: "taskmap", init: taskmap.init };

/**
 * The modules run on each page type; `all` runs on every page first.
 * @type {Record<"overview" | "feature" | "document" | "all", PageModule[]>}
 */
export const MODULES = {
  all: [],
  overview: [treeModule, taskmapModule],
  feature: [],
  document: [],
};

/** Theme switch buttons already wired (idempotent `initShell`). */
const wired = new WeakSet();

/**
 * Un-hides and wires the theme switch (FR-045, US4 AC5): `aria-pressed`
 * reflects the stored choice; a click stores it and sets or removes
 * `data-theme` on `<html>` at once, so the switch works even when storage
 * fails. Idempotent.
 * @param {Document | Element} root
 * @param {Pick<Deps, "document" | "prefs">} deps
 */
export function initShell(root, { document, prefs }) {
  const groups = [...root.querySelectorAll('[data-part="theme"]')];
  /** @param {string} choice */
  const show = (choice) => {
    for (const button of root.querySelectorAll("[data-theme-choice]")) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-theme-choice") === choice));
    }
  };
  // The choice made on this page wins over storage that could not keep it.
  const html = document.documentElement;
  show(html.dataset.theme ?? prefs.get("theme") ?? "system");
  for (const group of groups) {
    group.removeAttribute("hidden");
    for (const button of group.querySelectorAll("[data-theme-choice]")) {
      if (wired.has(button)) continue;
      wired.add(button);
      button.addEventListener("click", () => {
        const choice = button.getAttribute("data-theme-choice") ?? "system";
        if (!ALLOWED.theme.includes(choice)) return;
        prefs.set("theme", choice);
        if (choice === "system") delete html.dataset.theme;
        else html.dataset.theme = choice;
        show(choice);
      });
    }
  }
}

/** @type {{deps: Deps, modules: PageModule[]} | null} */
let running = null;

/**
 * @param {Record<string, PageModule[]>} table
 * @param {string | undefined} page
 * @returns {PageModule[]}
 */
function modulesFor(table, page) {
  const own = page && page !== "all" && Object.hasOwn(table, page) ? table[page] : [];
  return [...(table.all ?? []), ...own];
}

/**
 * Starts the page: shell first, then each module of `data-page`.
 * @param {object} options
 * @param {Document} options.document
 * @param {Window & typeof globalThis} options.window
 * @param {Storage | null} [options.storage]
 * @param {Record<string, PageModule[]>} [options.modules] the module table (tests)
 * @returns {Deps}
 */
export function start({ document, window, storage = null, modules = MODULES }) {
  /** @type {Deps} */
  const deps = {
    document,
    window,
    storage,
    prefs: createPrefs(storage),
    setTimeout: (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    fetch: typeof window.fetch === "function" ? window.fetch.bind(window) : undefined,
    navigator: window.navigator,
  };
  const list = modulesFor(modules, document.body?.dataset.page);
  running = { deps, modules: list };
  initShell(document, deps);
  for (const m of list) m.init(document, deps);
  return deps;
}

/**
 * The page-local state of every running module that has `save`, by name.
 * @param {Document | Element} root
 * @returns {Record<string, unknown>}
 */
export function save(root) {
  /** @type {Record<string, unknown>} */
  const state = {};
  for (const m of running?.modules ?? []) if (m.save) state[m.name] = m.save(root);
  return state;
}

/**
 * Runs the shell and every module again after a live swap, giving each
 * module its saved state.
 * @param {Document | Element} root
 * @param {Record<string, unknown>} [state]
 */
export function reinit(root, state = {}) {
  if (!running) return;
  const { deps, modules } = running;
  initShell(root, deps);
  for (const m of modules) m.init(root, { ...deps, state: state[m.name] });
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  start({ document, window: /** @type {any} */ (window), storage: browserStorage(window) });
}
