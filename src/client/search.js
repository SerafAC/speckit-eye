/**
 * Search (FR-049 to FR-049c; contracts/search-index.md "Matching" and
 * "Opening a result"; research D14).
 *
 * - `search(entries, query)` is the pure matcher: every typed word must occur
 *   in an entry's `terms`; a task ID typed in full comes first, then labels
 *   starting with the first word, then the rest, ties in page order; groups
 *   Tasks, Features, Documents (documents and headings together), each with
 *   its first 8 results and how many more there are.
 * - `init(root, deps)` un-hides every search entry (`[data-part="search"]`,
 *   rendered `hidden` so it never shows without scripts) and opens
 *   `<dialog data-region="search">` with `showModal()` on ⌘K (macOS) or
 *   Ctrl+K and on an entry's click. The index is fetched on first use from
 *   `{base}assets/search-index.json` and again on the next use after a live
 *   `sk:change` event. Arrow keys move the active option
 *   (`aria-activedescendant`), Enter or a click opens it at `base + url`,
 *   "N more" shows the whole group, Escape closes and focus returns to the
 *   opener. Every text is set with `textContent`.
 *
 * `init` is idempotent: it runs on every page load and after every live swap.
 */

/** Results shown per group before "N more". */
export const GROUP_SIZE = 8;

/** Event dispatched by live.js after every swap (src/client/live.js). */
const CHANGE_EVENT = "sk:change";

const GROUPS = /** @type {const} */ (["Tasks", "Features", "Documents"]);

/** @type {Record<string, (typeof GROUPS)[number]>} */
const GROUP_OF_TYPE = { task: "Tasks", feature: "Features", document: "Documents", heading: "Documents" };

/** Accessible names of the task state marks (as on the pages). */
const STATE_LABEL = { done: "Done", next: "Next", blocked: "Blocked", open: "Open" };

/**
 * @typedef {object} SearchEntry
 * @property {"task" | "feature" | "document" | "heading"} type
 * @property {string} label
 * @property {string} detail
 * @property {string} [context]
 * @property {string} [state]
 * @property {string} url
 * @property {string} terms
 */

/**
 * @typedef {object} ResultGroup
 * @property {(typeof GROUPS)[number]} name
 * @property {SearchEntry[]} items the first {@link GROUP_SIZE} results
 * @property {number} more how many results are not in `items`
 * @property {SearchEntry[]} rest the results not in `items`, in order
 */

/**
 * @param {string} query
 * @returns {string[]} lower-cased words
 */
export function queryWords(query) {
  return String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Matches and ranks the index entries for a query (contracts/search-index.md
 * "Matching").
 * @param {SearchEntry[]} entries in page order
 * @param {string} query
 * @returns {{groups: ResultGroup[], empty: boolean}} groups without results
 *   are left out; `empty` is true when a non-empty query matched nothing
 */
export function search(entries, query) {
  const words = queryWords(query);
  if (words.length === 0) return { groups: [], empty: false };
  const whole = words.join(" ");
  const first = words[0];
  /** @type {Map<string, {entry: SearchEntry, rank: number, order: number}[]>} */
  const found = new Map(GROUPS.map((g) => [g, []]));
  (entries ?? []).forEach((entry, order) => {
    const terms = entry.terms ?? "";
    if (!words.every((w) => terms.includes(w))) return;
    const label = String(entry.label ?? "").toLowerCase();
    const rank = entry.type === "task" && label === whole ? 0 : label.startsWith(first) ? 1 : 2;
    found.get(GROUP_OF_TYPE[entry.type] ?? "Documents")?.push({ entry, rank, order });
  });
  /** @type {ResultGroup[]} */
  const groups = [];
  for (const name of GROUPS) {
    const list = /** @type {{entry: SearchEntry, rank: number, order: number}[]} */ (found.get(name));
    if (list.length === 0) continue;
    list.sort((a, b) => a.rank - b.rank || a.order - b.order);
    const all = list.map((r) => r.entry);
    groups.push({ name, items: all.slice(0, GROUP_SIZE), more: Math.max(0, all.length - GROUP_SIZE), rest: all.slice(GROUP_SIZE) });
  }
  return { groups, empty: groups.length === 0 };
}

/**
 * @typedef {object} SearchDeps
 * @property {Document} document
 * @property {Window} [window]
 * @property {typeof fetch} [fetch]
 * @property {Navigator} [navigator]
 */

/**
 * True on macOS (and iOS), where the shortcut is ⌘K.
 * @param {Navigator | undefined} navigator
 * @returns {boolean}
 */
export function isMac(navigator) {
  const nav = /** @type {any} */ (navigator);
  const platform = nav?.userAgentData?.platform || nav?.platform || "";
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/**
 * @typedef {object} SearchState
 * @property {SearchDeps} deps
 * @property {SearchEntry[] | null} entries the loaded index
 * @property {boolean} stale a live update happened since the last load
 * @property {Promise<void> | null} loading
 * @property {boolean} failed the last load failed
 * @property {Element | null} opener focused when the dialog opened
 * @property {Set<string>} expanded groups whose "N more" was chosen
 * @property {number} active index of the active option
 */

/** @type {WeakMap<Document, SearchState>} */
const states = new WeakMap();

/** Entries and documents already wired. */
const wired = new WeakSet();

/**
 * @param {Document} document
 * @returns {HTMLDialogElement | null}
 */
const dialogOf = (document) => /** @type {HTMLDialogElement | null} */ (document.querySelector('dialog[data-region="search"]'));

/**
 * @param {Document} document
 * @returns {string} the site base, `/` by default
 */
const baseOf = (document) => document.body?.dataset.base || "/";

/**
 * @param {Document} document
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(document, tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Fills the empty dialog once: the search box and the results list.
 * @param {Document} document
 * @param {HTMLDialogElement} dialog
 */
function build(document, dialog) {
  if (dialog.querySelector('input[data-part="query"]')) return;
  const box = el(document, "div", { "data-part": "box" });
  const input = /** @type {HTMLInputElement} */ (
    el(document, "input", {
      type: "search",
      "data-part": "query",
      role: "combobox",
      "aria-expanded": "false",
      "aria-controls": "search-results",
      "aria-autocomplete": "list",
      "aria-label": "Search tasks, features and documents",
      placeholder: "Search tasks, specs…",
      autocomplete: "off",
      spellcheck: "false",
    })
  );
  const hint = el(document, "kbd", { "data-part": "esc" }, "Esc");
  box.append(input, hint);
  const results = el(document, "div", { "data-part": "results", id: "search-results", role: "listbox", "aria-label": "Results" });
  const status = el(document, "p", { "data-part": "status", role: "status" });
  dialog.append(box, results, status);
}

/**
 * @param {Document} document
 * @returns {HTMLElement[]} the options in display order
 */
const optionsOf = (document) => /** @type {HTMLElement[]} */ ([...(dialogOf(document)?.querySelectorAll('[role="option"]') ?? [])]);

/**
 * Marks the active option and points the box at it.
 * @param {Document} document
 * @param {SearchState} state
 * @param {number} index
 */
function setActive(document, state, index) {
  const options = optionsOf(document);
  const input = dialogOf(document)?.querySelector('input[data-part="query"]');
  state.active = options.length ? Math.max(0, Math.min(index, options.length - 1)) : -1;
  options.forEach((o, i) => o.setAttribute("aria-selected", String(i === state.active)));
  const current = options[state.active];
  if (current) {
    input?.setAttribute("aria-activedescendant", current.id);
    if (typeof current.scrollIntoView === "function") current.scrollIntoView({ block: "nearest" });
  } else input?.removeAttribute("aria-activedescendant");
}

/**
 * One result option.
 * @param {Document} document
 * @param {SearchEntry} entry
 * @param {string} id
 * @returns {HTMLElement}
 */
function renderOption(document, entry, id) {
  const href = baseOf(document) + entry.url;
  const option = el(document, "a", { role: "option", id, href, "data-part": "result", "data-type": entry.type, "aria-selected": "false", tabindex: "-1" });
  if (entry.type === "task") {
    const state = entry.state ?? "open";
    option.append(
      el(document, "span", { "data-part": "mark", "data-state": state, role: "img", "aria-label": STATE_LABEL[/** @type {keyof STATE_LABEL} */ (state)] ?? state }),
      el(document, "span", { "data-part": "id" }, entry.label),
      el(document, "span", { "data-part": "text" }, entry.detail),
      el(document, "span", { "data-part": "context" }, entry.context ?? ""),
    );
  } else if (entry.type === "feature") {
    option.append(el(document, "span", { "data-part": "title" }, entry.label), el(document, "span", { "data-part": "context" }, entry.detail));
  } else {
    const where = entry.type === "heading" ? `${entry.detail} · ${entry.context ?? ""}` : entry.context ?? "";
    option.append(el(document, "span", { "data-part": "title" }, entry.label), el(document, "span", { "data-part": "context" }, where));
  }
  return option;
}

/**
 * Renders the results of the current query.
 * @param {Document} document
 * @param {SearchState} state
 */
function render(document, state) {
  const dialog = dialogOf(document);
  if (!dialog) return;
  const input = /** @type {HTMLInputElement} */ (dialog.querySelector('input[data-part="query"]'));
  const results = /** @type {HTMLElement} */ (dialog.querySelector('[data-part="results"]'));
  const status = /** @type {HTMLElement} */ (dialog.querySelector('[data-part="status"]'));
  results.replaceChildren();
  status.textContent = "";
  status.hidden = true;
  const query = input.value.trim();
  if (state.entries === null) {
    if (query && state.failed) {
      status.textContent = "Search is not available right now.";
      status.hidden = false;
    }
    input.setAttribute("aria-expanded", "false");
    setActive(document, state, -1);
    return;
  }
  const { groups, empty } = search(state.entries, query);
  let n = 0;
  for (const group of groups) {
    const section = el(document, "div", { role: "group", "data-part": "group", "data-group": group.name, "aria-labelledby": `search-group-${group.name}` });
    section.append(el(document, "p", { "data-part": "group-name", id: `search-group-${group.name}` }, group.name));
    const shown = state.expanded.has(group.name) ? [...group.items, ...group.rest] : group.items;
    for (const entry of shown) section.append(renderOption(document, entry, `search-option-${n++}`));
    if (group.more > 0 && !state.expanded.has(group.name)) {
      section.append(
        el(document, "div", { role: "option", id: `search-option-${n++}`, "data-part": "more", "data-group": group.name, "aria-selected": "false" }, `${group.more} more`),
      );
    }
    results.append(section);
  }
  if (empty) {
    status.textContent = `No results for "${query}"`;
    status.hidden = false;
  }
  input.setAttribute("aria-expanded", String(groups.length > 0));
  setActive(document, state, 0);
}

/**
 * Loads the index when it is missing or stale, then renders.
 * @param {Document} document
 * @param {SearchState} state
 * @returns {Promise<void>}
 */
function load(document, state) {
  if (state.loading) return state.loading;
  if (state.entries !== null && !state.stale) return Promise.resolve();
  const fetchFn = state.deps.fetch;
  if (typeof fetchFn !== "function") {
    state.failed = true;
    return Promise.resolve();
  }
  state.stale = false;
  state.loading = (async () => {
    try {
      const res = await fetchFn(`${baseOf(document)}assets/search-index.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      state.entries = Array.isArray(data?.entries) ? data.entries : [];
      state.failed = false;
    } catch {
      state.failed = true;
    } finally {
      state.loading = null;
    }
    render(document, state);
  })();
  return state.loading;
}

/**
 * Opens the dialog with the cursor in the box.
 * @param {Document} document
 * @param {SearchState} state
 * @param {Element | null} opener
 * @returns {Promise<void>} resolves once the index is loaded
 */
function open(document, state, opener) {
  const dialog = dialogOf(document);
  if (!dialog) return Promise.resolve();
  if (!dialog.open) {
    state.opener = opener ?? document.activeElement;
    dialog.showModal();
  }
  const input = /** @type {HTMLInputElement | null} */ (dialog.querySelector('input[data-part="query"]'));
  input?.focus();
  input?.select();
  render(document, state);
  return load(document, state);
}

/**
 * Opens an option: a result navigates to its page, "N more" shows the group.
 * @param {Document} document
 * @param {SearchState} state
 * @param {HTMLElement} option
 */
function choose(document, state, option) {
  if (option.getAttribute("data-part") === "more") {
    const group = option.getAttribute("data-group") ?? "";
    const index = optionsOf(document).indexOf(option);
    state.expanded.add(group);
    render(document, state);
    setActive(document, state, index);
    return;
  }
  const href = option.getAttribute("href");
  dialogOf(document)?.close();
  if (href) state.deps.window?.location.assign(href);
}

/**
 * Wires the dialog: typing, keys, clicks and focus return. Once per dialog.
 * @param {Document} document
 * @param {HTMLDialogElement} dialog
 * @param {SearchState} state
 */
function wireDialog(document, dialog, state) {
  if (wired.has(dialog)) return;
  wired.add(dialog);
  const input = /** @type {HTMLInputElement} */ (dialog.querySelector('input[data-part="query"]'));
  input.addEventListener("input", () => {
    state.expanded.clear();
    render(document, state);
  });
  dialog.addEventListener("keydown", (event) => {
    const e = /** @type {KeyboardEvent} */ (event);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const count = optionsOf(document).length;
      if (!count) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive(document, state, (state.active + step + count) % count);
    } else if (e.key === "Enter") {
      const option = optionsOf(document)[state.active];
      if (!option) return;
      e.preventDefault();
      choose(document, state, option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dialog.close();
    }
  });
  dialog.addEventListener("click", (event) => {
    const target = /** @type {Element | null} */ (event.target);
    if (target === dialog) {
      dialog.close();
      return;
    }
    const option = /** @type {HTMLElement | null} */ (target?.closest?.('[role="option"]') ?? null);
    if (!option) return;
    const mouse = /** @type {MouseEvent} */ (event);
    // New tab / window: let the browser handle the link.
    if (option.getAttribute("data-part") === "result" && (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.button === 1)) return;
    event.preventDefault();
    choose(document, state, option);
  });
  dialog.addEventListener("close", () => {
    const opener = /** @type {HTMLElement | null} */ (state.opener);
    state.opener = null;
    if (opener && typeof opener.focus === "function" && opener.isConnected) opener.focus();
  });
}

/**
 * @param {Document | Element} root
 * @param {SearchDeps} deps
 */
export function init(root, deps) {
  const { document } = deps;
  const dialog = dialogOf(document);
  if (!dialog) return;
  let state = states.get(document);
  if (!state) {
    state = { deps, entries: null, stale: false, loading: null, failed: false, opener: null, expanded: new Set(), active: -1 };
    states.set(document, state);
  } else state.deps = { ...state.deps, ...deps };
  const current = state;
  build(document, dialog);
  wireDialog(document, dialog, current);

  const mac = isMac(deps.navigator);
  for (const entry of /** @type {HTMLElement[]} */ ([...root.querySelectorAll('[data-part="search"]')])) {
    entry.hidden = false;
    const kbd = entry.querySelector("kbd");
    if (kbd) kbd.textContent = mac ? "⌘K" : "Ctrl K";
    if (entry.hasAttribute("title")) entry.setAttribute("title", `Search (${mac ? "⌘K" : "Ctrl+K"})`);
    if (wired.has(entry)) continue;
    wired.add(entry);
    entry.addEventListener("click", () => void open(document, current, entry));
  }

  if (!wired.has(document)) {
    wired.add(document);
    document.addEventListener("keydown", (event) => {
      const e = /** @type {KeyboardEvent} */ (event);
      if (e.key !== "k" && e.key !== "K") return;
      if (!(mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      void open(document, current, document.activeElement);
    });
    document.addEventListener(CHANGE_EVENT, () => {
      current.stale = true;
    });
  }
}

/**
 * Opens search from code (tests and other modules).
 * @param {Document} document
 * @param {Element | null} [opener]
 * @returns {Promise<void>} resolves once the index is loaded
 */
export function openSearch(document, opener = null) {
  const state = states.get(document);
  return state ? open(document, state, opener) : Promise.resolve();
}
