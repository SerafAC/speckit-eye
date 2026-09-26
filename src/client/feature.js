/**
 * Feature page behavior (FR-032 to FR-036; contracts/routes.md "Browser
 * modules"): the phase rail ↔ list accordion, the filter chips and text
 * filter, "Expand all" / "Collapse all", task selection with the detail
 * panel, "Copy ID", and the `#task-…` address of the selected task.
 *
 * The page works without this module: phases and task rows open and close as
 * `<details>`, rail blocks jump to their phase, and the filter bar and
 * detail panel stay hidden (FR-053).
 *
 * `init(root, deps)` is idempotent: it runs on load and again after every
 * live swap of `<main>` with the result of `save(root)` in `deps.state`.
 * All state lives in the DOM (pressed chips, the text field, the selected
 * row), so nothing is kept between calls except which elements are wired.
 */

/** How long the "Copied" confirmation stays, in ms. */
export const COPIED_MS = 1500;

/** The phase accordion's group name (`<details name="phases">`). */
const GROUP = "phases";

/** Elements already wired (listeners are added once per element). */
const wired = new WeakSet();

/**
 * @typedef {object} FeatureDeps
 * @property {Document} document
 * @property {Window} [window]
 * @property {Navigator} [navigator]
 * @property {(fn: () => void, ms: number) => any} [setTimeout]
 * @property {unknown} [state] the result of `save()` before a live swap
 */

/**
 * @typedef {object} FeatureState
 * @property {string[]} chips pressed filter chips (All left out)
 * @property {string} text the text filter
 * @property {string | null} selected `data-key` of the selected task row
 */

/**
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
function all(root, selector) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);
}

/** @param {Document | Element} root */
const sectionOf = (root) => /** @type {HTMLElement | null} */ (root.querySelector('[data-region="tasks"]'));

/** @param {Element} section */
const phasesOf = (section) => /** @type {HTMLDetailsElement[]} */ (all(section, 'details[data-part="phase"]'));

/** @param {Element} section */
const rowsOf = (section) => /** @type {HTMLDetailsElement[]} */ (all(section, 'details[data-part="task"]'));

/**
 * Whether the accordion is on (one phase open at a time). It is off while
 * filters are active or after "Expand all".
 * @param {Element} section
 */
const accordionOn = (section) => section.getAttribute("data-accordion") !== "off";

/**
 * Turns the accordion on or off. Off removes the `name` group, since
 * browsers with exclusive `<details>` groups would otherwise close the
 * other phases whenever one is opened.
 * @param {Element} section
 * @param {boolean} on
 */
function setAccordion(section, on) {
  if (on) section.removeAttribute("data-accordion");
  else section.setAttribute("data-accordion", "off");
  for (const phase of phasesOf(section)) {
    if (on) phase.setAttribute("name", GROUP);
    else phase.removeAttribute("name");
  }
}

/**
 * Opens `phase` and, with the accordion on, closes the others.
 * @param {Element} section
 * @param {HTMLDetailsElement} phase
 */
function openPhase(section, phase) {
  if (accordionOn(section)) {
    for (const other of phasesOf(section)) if (other !== phase && other.open) other.open = false;
  }
  phase.open = true;
}

/**
 * The rail's `aria-current` and the caption follow the open phases.
 * @param {Element} section
 */
export function syncRail(section) {
  const open = phasesOf(section).filter((p) => p.open && !p.hasAttribute("data-filtered-out"));
  const keys = new Set(open.map((p) => p.getAttribute("data-key")));
  for (const block of all(section, '[data-part="rail"] [data-phase-key]')) {
    if (keys.has(block.getAttribute("data-phase-key"))) block.setAttribute("aria-current", "true");
    else block.removeAttribute("aria-current");
  }
  const caption = section.querySelector('[data-part="caption"] [data-part="selected"]');
  if (!caption) return;
  if (open.length === 0) caption.textContent = "None";
  else if (open.length === 1) caption.textContent = phaseLabel(open[0]);
  else caption.textContent = `${open.length} phases`;
}

/**
 * "Phase 4: Title" of a phase `<details>`, from its first task row, or its
 * summary.
 * @param {Element} phase
 */
function phaseLabel(phase) {
  const row = phase.querySelector('details[data-part="task"][data-phase]');
  if (row) return /** @type {string} */ (row.getAttribute("data-phase"));
  const name = phase.querySelector('[data-part="phase-name"]')?.textContent ?? "";
  const title = phase.querySelector(':scope > summary [data-part="title"]')?.textContent ?? "";
  return title ? `${name}: ${title}` : name;
}

/**
 * @param {Element} row
 * @returns {HTMLDetailsElement | null}
 */
function phaseOfRow(row) {
  return /** @type {HTMLDetailsElement | null} */ (row.closest('details[data-part="phase"]'));
}

// ---------------------------------------------------------------------------
// Filters (FR-034)
// ---------------------------------------------------------------------------

/**
 * Whether a task row matches one chip.
 * @param {Element} row
 * @param {string} chip `open`, `tests` or `kind:<label>`
 */
function chipMatches(row, chip) {
  if (chip === "open") return row.getAttribute("data-state") !== "done";
  if (chip === "tests") return row.hasAttribute("data-test");
  if (chip.startsWith("kind:")) return row.getAttribute("data-kind") === chip.slice(5);
  return true;
}

/**
 * Whether a row matches every pressed chip (kind chips among themselves:
 * any of them) and the text filter (ID, text or file names).
 * @param {Element} row
 * @param {string[]} chips
 * @param {string} text lower-cased, trimmed
 */
export function rowMatches(row, chips, text) {
  const kinds = chips.filter((c) => c.startsWith("kind:"));
  const others = chips.filter((c) => !c.startsWith("kind:"));
  if (!others.every((c) => chipMatches(row, c))) return false;
  if (kinds.length > 0 && !kinds.some((c) => chipMatches(row, c))) return false;
  if (!text) return true;
  const hay = `${row.getAttribute("data-text") ?? ""} ${(row.getAttribute("data-files") ?? "").toLowerCase()}`;
  return hay.includes(text);
}

/**
 * The pressed chips (without All) and the text filter of the page.
 * @param {Element} section
 * @returns {{chips: string[], text: string}}
 */
function readFilters(section) {
  const chips = all(section, 'button[data-filter-chip][aria-pressed="true"]')
    .map((b) => /** @type {string} */ (b.getAttribute("data-filter-chip")))
    .filter((c) => c !== "all");
  const input = /** @type {HTMLInputElement | null} */ (section.querySelector('input[data-part="text-filter"]'));
  return { chips, text: (input?.value ?? "").trim().toLowerCase() };
}

/**
 * Sets the pressed chips and the text field.
 * @param {Element} section
 * @param {string[]} chips
 * @param {string} text
 */
function writeFilters(section, chips, text) {
  for (const b of all(section, "button[data-filter-chip]")) {
    const value = b.getAttribute("data-filter-chip");
    b.setAttribute("aria-pressed", String(value === "all" ? chips.length === 0 : chips.includes(/** @type {string} */ (value))));
  }
  const input = /** @type {HTMLInputElement | null} */ (section.querySelector('input[data-part="text-filter"]'));
  if (input) input.value = text;
}

/**
 * Applies the pressed chips and the text filter: hides rows and phases
 * without matches, opens every phase with matches, updates the chip counts
 * and the "No tasks match" message. Clearing every filter restores the
 * accordion and the phases that were open before filtering.
 * @param {Element} section
 * @returns {number} matching rows
 */
export function applyFilters(section) {
  const { chips, text } = readFilters(section);
  const active = chips.length > 0 || text !== "";
  const rows = rowsOf(section);
  const wasFiltering = section.hasAttribute("data-filtering");

  // Chip counts: tasks matching the chip together with the text filter.
  for (const b of all(section, "button[data-filter-chip]")) {
    const value = /** @type {string} */ (b.getAttribute("data-filter-chip"));
    const n = rows.filter((r) => chipMatches(r, value) && rowMatches(r, [], text)).length;
    const count = b.querySelector('[data-part="count"]');
    if (count) count.textContent = String(n);
  }

  let matches = 0;
  if (active) {
    if (!wasFiltering) {
      const openKeys = phasesOf(section)
        .filter((p) => p.open)
        .map((p) => p.getAttribute("data-key"));
      section.setAttribute("data-open-before", JSON.stringify(openKeys));
      section.setAttribute("data-filtering", "");
      setAccordion(section, false);
    }
    for (const row of rows) {
      const ok = rowMatches(row, chips, text);
      if (ok) {
        matches++;
        row.removeAttribute("data-filtered-out");
      } else row.setAttribute("data-filtered-out", "");
    }
    for (const phase of phasesOf(section)) {
      const has = phase.querySelector('details[data-part="task"]:not([data-filtered-out])') !== null;
      if (has) {
        phase.removeAttribute("data-filtered-out");
        phase.open = true;
      } else phase.setAttribute("data-filtered-out", "");
    }
    for (const empty of all(section, 'div[data-part="phase"]')) empty.setAttribute("data-filtered-out", "");
  } else {
    matches = rows.length;
    for (const el of all(section, "[data-filtered-out]")) el.removeAttribute("data-filtered-out");
    if (wasFiltering) {
      section.removeAttribute("data-filtering");
      /** @type {string[]} */
      let before = [];
      try {
        before = JSON.parse(section.getAttribute("data-open-before") ?? "[]");
      } catch {
        before = [];
      }
      section.removeAttribute("data-open-before");
      for (const phase of phasesOf(section)) phase.open = before.includes(/** @type {string} */ (phase.getAttribute("data-key")));
      setAccordion(section, true);
    }
  }

  const none = /** @type {HTMLElement | null} */ (section.querySelector('[data-part="no-match"]'));
  if (none) none.hidden = !(active && matches === 0);
  syncRail(section);
  return matches;
}

// ---------------------------------------------------------------------------
// Selection and the detail panel (FR-036)
// ---------------------------------------------------------------------------

/**
 * @param {Document} document
 * @param {string} text
 */
function li(document, text) {
  const el = document.createElement("li");
  el.textContent = text;
  return el;
}

/**
 * Fills the detail panel from a task row and shows it.
 * @param {Element} section
 * @param {Element} row
 * @param {Document} document
 */
export function fillDetail(section, row, document) {
  const panel = /** @type {HTMLElement | null} */ (section.querySelector('[data-region="detail"]'));
  if (!panel) return;
  const state = row.getAttribute("data-state") ?? "open";
  const mark = row.querySelector(':scope > summary [data-part="mark"]');
  const label = mark?.getAttribute("aria-label") ?? state;
  const set = (/** @type {string} */ part, /** @type {(el: HTMLElement) => void} */ fn) => {
    const el = /** @type {HTMLElement | null} */ (panel.querySelector(`[data-part="${part}"]`));
    if (el) fn(el);
  };

  panel.setAttribute("data-key", row.getAttribute("data-key") ?? "");
  set("mark", (el) => {
    el.setAttribute("data-state", state);
    el.setAttribute("aria-label", label);
  });
  set("id", (el) => (el.textContent = row.getAttribute("data-id") || "No ID"));
  set("status", (el) => {
    el.setAttribute("data-status", state);
    el.textContent = label;
  });
  set("text", (el) => {
    const full = row.querySelector('[data-part="full-text"]');
    el.replaceChildren(...[...(full?.childNodes ?? [])].map((n) => n.cloneNode(true)));
  });
  set("waiting", (el) => {
    const waiting = (row.getAttribute("data-waiting-on") ?? "").split(/\s+/).filter(Boolean);
    el.textContent = waiting.length ? `Waiting on ${waiting.join(", ")}` : "";
    el.hidden = state !== "blocked" || waiting.length === 0;
  });
  set("phase", (el) => (el.textContent = row.getAttribute("data-phase") ?? ""));
  set("markers", (el) => {
    const markers = row.querySelector('[data-part="markers"]');
    if (markers) el.replaceChildren(markers.cloneNode(true));
    else el.textContent = "—";
  });
  set("files", (el) => {
    const files = (row.getAttribute("data-files") ?? "").split(/\s+/).filter(Boolean);
    el.replaceChildren(...(files.length ? files : ["—"]).map((f) => li(document, f)));
  });
  set("copy", (el) => (el.hidden = !row.getAttribute("data-id")));
  set("copied", (el) => (el.hidden = true));
  set("source-line", (el) => {
    const source = panel.getAttribute("data-source");
    if (source) el.setAttribute("href", `${source}#L${row.getAttribute("data-line") ?? ""}`);
  });
  panel.hidden = false;
}

/**
 * Replaces the address fragment without adding a history entry.
 * @param {Window | undefined} window
 * @param {string} hash `#…`, or "" to remove it
 */
function setHash(window, hash) {
  const loc = window?.location;
  const history = window?.history;
  if (!loc || !history || typeof history.replaceState !== "function") return;
  if (loc.hash === hash) return;
  history.replaceState(history.state, "", `${loc.pathname}${loc.search}${hash}`);
}

/**
 * Selects a task row: outlines it, fills the detail panel and, when asked,
 * puts its address in the fragment.
 * @param {Element} section
 * @param {Element} row
 * @param {{document: Document, window?: Window, updateHash?: boolean}} options
 */
export function select(section, row, { document, window, updateHash = true }) {
  for (const el of all(section, "[data-selected]")) if (el !== row) el.removeAttribute("data-selected");
  row.setAttribute("data-selected", "");
  fillDetail(section, row, document);
  if (updateHash) setHash(window, row.id ? `#${row.id}` : "");
}

/**
 * Clears the selection and hides the detail panel.
 * @param {Element} section
 * @param {Window | undefined} window
 */
export function clearSelection(section, window) {
  for (const el of all(section, "[data-selected]")) el.removeAttribute("data-selected");
  const panel = /** @type {HTMLElement | null} */ (section.querySelector('[data-region="detail"]'));
  if (panel) panel.hidden = true;
  setHash(window, "");
}

/**
 * Opens a task: its phase (accordion rules), the row itself, selects it and
 * scrolls it into view (FR-036, US3 AC10).
 * @param {Element} section
 * @param {HTMLDetailsElement} row
 * @param {{document: Document, window?: Window, scroll?: boolean, updateHash?: boolean}} options
 */
export function openTask(section, row, { document, window, scroll = true, updateHash = false }) {
  const phase = phaseOfRow(row);
  if (phase) openPhase(section, phase);
  row.open = true;
  select(section, row, { document, window, updateHash });
  syncRail(section);
  if (scroll && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "center" });
}

/**
 * The task row a `#task-…` fragment names in this section, or null.
 * @param {Element} section
 * @param {string | undefined} hash
 * @returns {HTMLDetailsElement | null}
 */
function rowOfHash(section, hash) {
  if (!hash || !hash.startsWith("#task-")) return null;
  let id = hash.slice(1);
  try {
    id = decodeURIComponent(id);
  } catch {
    // keep the raw id
  }
  return rowsOf(section).find((r) => r.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Copy ID
// ---------------------------------------------------------------------------

/**
 * Copies `text` with the Clipboard API, or with a selected text area and
 * `execCommand("copy")` where that API is missing or refused.
 * @param {string} text
 * @param {{document: Document, navigator?: Navigator}} deps
 * @returns {Promise<boolean>}
 */
export async function copyText(text, { document, navigator }) {
  if (navigator?.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall back below
    }
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.className = "sr-only";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = typeof document.execCommand === "function" && document.execCommand("copy") === true;
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

// ---------------------------------------------------------------------------
// init / save
// ---------------------------------------------------------------------------

/**
 * @param {Document | Element} root
 * @param {FeatureDeps} deps
 */
export function init(root, deps) {
  const section = sectionOf(root);
  if (!section) return;
  const { document } = deps;
  const window = deps.window ?? /** @type {Window | undefined} */ (document.defaultView ?? undefined);
  const navigator = deps.navigator ?? window?.navigator;
  const setTimer = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const saved = /** @type {Partial<FeatureState> | undefined} */ (deps.state);

  const bar = /** @type {HTMLElement | null} */ (section.querySelector('[data-part="filters"]'));
  if (bar) bar.hidden = false;

  // --- phases: accordion and rail ---
  for (const phase of phasesOf(section)) {
    if (wired.has(phase)) continue;
    wired.add(phase);
    phase.addEventListener("toggle", () => {
      if (phase.open && accordionOn(section)) {
        for (const other of phasesOf(section)) if (other !== phase && other.open) other.open = false;
      }
      syncRail(section);
    });
  }

  for (const block of all(section, '[data-part="rail"] a[data-phase-key]')) {
    if (wired.has(block)) continue;
    wired.add(block);
    block.addEventListener("click", (event) => {
      event.preventDefault();
      const key = block.getAttribute("data-phase-key");
      const phase = phasesOf(section).find((p) => p.getAttribute("data-key") === key);
      if (!phase) return;
      if (phase.open) phase.open = false;
      else {
        phase.removeAttribute("data-filtered-out");
        openPhase(section, phase);
        if (typeof phase.scrollIntoView === "function") phase.scrollIntoView({ block: "nearest" });
      }
      syncRail(section);
    });
  }

  // --- filters ---
  for (const chip of all(section, "button[data-filter-chip]")) {
    if (wired.has(chip)) continue;
    wired.add(chip);
    chip.addEventListener("click", () => {
      const value = /** @type {string} */ (chip.getAttribute("data-filter-chip"));
      const { chips } = readFilters(section);
      const next = value === "all" ? [] : chips.includes(value) ? chips.filter((c) => c !== value) : [...chips, value];
      const input = /** @type {HTMLInputElement | null} */ (section.querySelector('input[data-part="text-filter"]'));
      writeFilters(section, next, input?.value ?? "");
      applyFilters(section);
    });
  }

  const input = /** @type {HTMLInputElement | null} */ (section.querySelector('input[data-part="text-filter"]'));
  if (input && !wired.has(input)) {
    wired.add(input);
    input.addEventListener("input", () => applyFilters(section));
  }

  const clear = section.querySelector('button[data-part="clear"]');
  if (clear && !wired.has(clear)) {
    wired.add(clear);
    clear.addEventListener("click", () => {
      writeFilters(section, [], "");
      applyFilters(section);
      input?.focus?.();
    });
  }

  // --- expand / collapse all ---
  const expand = section.querySelector('button[data-part="expand-all"]');
  if (expand && !wired.has(expand)) {
    wired.add(expand);
    expand.addEventListener("click", () => {
      setAccordion(section, false);
      for (const phase of phasesOf(section)) if (!phase.hasAttribute("data-filtered-out")) phase.open = true;
      for (const row of rowsOf(section)) if (!row.hasAttribute("data-filtered-out")) row.open = true;
      syncRail(section);
    });
  }
  const collapse = section.querySelector('button[data-part="collapse-all"]');
  if (collapse && !wired.has(collapse)) {
    wired.add(collapse);
    collapse.addEventListener("click", () => {
      for (const row of rowsOf(section)) row.open = false;
      for (const phase of phasesOf(section)) phase.open = false;
      if (!section.hasAttribute("data-filtering")) setAccordion(section, true);
      syncRail(section);
    });
  }

  // --- selection: opening a task row selects it ---
  const list = section.querySelector('[data-part="list"]');
  if (list && !wired.has(list)) {
    wired.add(list);
    list.addEventListener("click", (event) => {
      const target = /** @type {Element | null} */ (event.target);
      if (!target || typeof target.closest !== "function") return;
      if (target.closest("a")) return; // links in the task text navigate
      const summary = target.closest("summary");
      const row = /** @type {HTMLDetailsElement | null} */ (summary?.parentElement ?? null);
      if (!summary || !row || row.getAttribute("data-part") !== "task") return;
      // Captured before the row toggles: a closed row is being opened.
      if (!row.open) select(section, row, { document, window });
    }, true);
  }

  const panel = section.querySelector('[data-region="detail"]');
  const close = panel?.querySelector('button[data-part="close"]');
  if (close && !wired.has(close)) {
    wired.add(close);
    close.addEventListener("click", () => clearSelection(section, window));
  }

  const copy = /** @type {HTMLElement | null | undefined} */ (panel?.querySelector('button[data-part="copy"]'));
  if (copy && panel && !wired.has(copy)) {
    wired.add(copy);
    copy.addEventListener("click", async () => {
      const id = panel.querySelector('[data-part="id"]')?.textContent ?? "";
      if (!id || id === "No ID") return;
      const ok = await copyText(id, { document, navigator });
      const note = /** @type {HTMLElement | null} */ (panel.querySelector('[data-part="copied"]'));
      if (!note) return;
      note.textContent = ok ? `Copied ${id}` : "Copy failed";
      note.hidden = false;
      setTimer(() => {
        note.hidden = true;
      }, COPIED_MS);
    });
  }

  // --- state after a live swap, then the address ---
  if (saved && (saved.chips?.length || saved.text)) {
    writeFilters(section, saved.chips ?? [], saved.text ?? "");
    applyFilters(section);
  } else if (section.hasAttribute("data-filtering") || readFilters(section).chips.length || readFilters(section).text) {
    applyFilters(section);
  }

  const fromHash = rowOfHash(section, window?.location?.hash);
  if (saved && saved.selected) {
    const row = rowsOf(section).find((r) => r.getAttribute("data-key") === saved.selected);
    if (row) select(section, row, { document, window, updateHash: false });
    else clearSelection(section, window);
  } else if (fromHash) {
    openTask(section, fromHash, { document, window });
  }
  syncRail(section);

  if (window && !wired.has(/** @type {any} */ (window))) {
    wired.add(/** @type {any} */ (window));
    window.addEventListener("hashchange", () => {
      const current = sectionOf(document);
      if (!current) return;
      const row = rowOfHash(current, window.location.hash);
      if (row && !row.hasAttribute("data-selected")) openTask(current, row, { document, window });
    });
  }
}

/**
 * The page-local state kept across live updates.
 * @param {Document | Element} root
 * @returns {FeatureState}
 */
export function save(root) {
  const section = sectionOf(root);
  if (!section) return { chips: [], text: "", selected: null };
  const { chips } = readFilters(section);
  const input = /** @type {HTMLInputElement | null} */ (section.querySelector('input[data-part="text-filter"]'));
  const selected = section.querySelector('details[data-part="task"][data-selected]')?.getAttribute("data-key") ?? null;
  return { chips, text: input?.value ?? "", selected };
}
