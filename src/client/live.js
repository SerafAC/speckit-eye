/**
 * Live-update client, serve mode only (contracts/routes.md "Live-update
 * protocol", FR-026 to FR-030). Listens to `/__events`; on `change` it
 * fetches the current page, swaps `<main>`, keeps the viewer's own
 * expand/collapse choices and scroll position, highlights items whose
 * `data-sig` changed, and animates `<progress>` bars to their new values.
 * While the connection is lost it shows the `live-status` banner.
 *
 * Around each swap it keeps the page modules' own state (research D2,
 * FR-051): `app.save(root)` before, `app.reinit(root, state)` after, plus the
 * window scroll and the scroll of every `[data-keep-scroll]` element by name.
 * Shell parts marked `data-live` (sidebar Features list, mobile menu list,
 * footer) are replaced too, so sidebar counts follow the files. After each
 * swap an `sk:change` event is dispatched on `document`.
 *
 * Every browser API is injected so the logic is unit tested with fakes
 * (constitution §IV); only the last line passes the real globals.
 */

import * as app from "./app.js";

export const EVENTS_URL = "/__events";
export const CHANGED_MS = 1500;
export const ANIMATE_MS = 600;
export const RECONNECT_MS = 2000;
/** Event dispatched on `document` after every swap (search reloads its index). */
export const CHANGE_EVENT = "sk:change";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

/**
 * `data-key` → `data-sig` for every element that has both.
 * @param {Iterable<Element>} elements
 * @returns {Map<string, string>}
 */
export function collectSigs(elements) {
  /** @type {Map<string, string>} */
  const sigs = new Map();
  for (const el of elements) {
    const key = el.getAttribute("data-key");
    const sig = el.getAttribute("data-sig");
    if (key === null || sig === null) continue;
    sigs.set(key, sig);
  }
  return sigs;
}

/**
 * Keys whose signature differs between two snapshots, including keys that are
 * new. Keys that disappeared are not listed (there is nothing to highlight).
 * @param {Map<string, string>} oldSigs
 * @param {Map<string, string>} newSigs
 * @returns {Set<string>}
 */
export function changedKeys(oldSigs, newSigs) {
  const changed = new Set();
  for (const [key, sig] of newSigs) {
    if (oldSigs.get(key) !== sig) changed.add(key);
  }
  return changed;
}

/**
 * Re-applies the viewer's own open/closed choices.
 * @param {Iterable<HTMLDetailsElement>} detailsList
 * @param {Map<string, boolean>} toggles `data-key` → open
 */
export function applyToggles(detailsList, toggles) {
  for (const details of detailsList) {
    const key = details.getAttribute("data-key");
    if (key === null || !toggles.has(key)) continue;
    const open = /** @type {boolean} */ (toggles.get(key));
    if (details.open !== open) details.open = open;
  }
}

/**
 * `scrollTop` of every `[data-keep-scroll]` element, by its name.
 * @param {ParentNode} root
 * @returns {Map<string, number>}
 */
export function collectScroll(root) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const el of root.querySelectorAll("[data-keep-scroll]")) {
    const name = el.getAttribute("data-keep-scroll");
    if (name !== null && !out.has(name)) out.set(name, Number(/** @type {Element} */ (el).scrollTop ?? 0));
  }
  return out;
}

/**
 * Sets `scrollTop` of the `[data-keep-scroll]` elements back by name.
 * @param {ParentNode} root
 * @param {Map<string, number>} positions
 */
export function restoreScroll(root, positions) {
  for (const el of root.querySelectorAll("[data-keep-scroll]")) {
    const name = el.getAttribute("data-keep-scroll");
    if (name !== null && positions.has(name)) /** @type {Element} */ (el).scrollTop = /** @type {number} */ (positions.get(name));
  }
}

/**
 * @typedef {object} PageApp
 * @property {(root: any) => Record<string, unknown>} save
 * @property {(root: any, state: Record<string, unknown>) => void} reinit
 */

/** Used when no app is injected (tests of the 001 behavior). */
const NO_APP = { save: () => ({}), reinit: () => {} };

/**
 * @param {object} deps
 * @param {Document} deps.document
 * @param {Window} deps.window
 * @param {typeof EventSource} deps.EventSource
 * @param {typeof fetch} deps.fetch
 * @param {typeof DOMParser} deps.DOMParser
 * @param {(fn: () => void, ms: number) => any} deps.setTimeout
 * @param {(cb: (time: number) => void) => any} deps.requestAnimationFrame
 * @param {PageApp} [deps.app] `assets/app.js` (save / reinit of the page modules)
 */
export function createLiveClient({ document, window, EventSource, fetch, DOMParser, setTimeout, requestAnimationFrame, app = NO_APP }) {
  /** The viewer's own open/closed choices, by `data-key`. */
  /** @type {Map<string, boolean>} */
  const toggles = new Map();
  /**
   * The open state each `<details>` had when it was rendered or last set by
   * this script. A `toggle` event whose state matches is an echo of our own
   * change (or of the parser), not a viewer choice.
   * @type {WeakMap<Element, boolean>}
   */
  const expected = new WeakMap();
  /** @type {EventSource | null} */
  let source = null;
  let disconnected = false;
  let busy = false;
  let again = false;

  const main = () => document.querySelector("main");
  /** @param {Document} doc */
  const liveParts = (doc) => [...doc.querySelectorAll("[data-live]")];
  /**
   * The elements with a signature in `<main>` and the given shell parts.
   * @param {Element} root
   * @param {Element[]} parts
   */
  const sigElements = (root, parts) => [
    ...root.querySelectorAll("[data-sig]"),
    ...parts.flatMap((p) => [p, ...p.querySelectorAll("[data-sig]")]),
  ];
  const banner = () => document.querySelector('[data-region="live-status"]');
  const reducedMotion = () => Boolean(window.matchMedia?.(REDUCED_MOTION)?.matches);

  /** @param {Element | null} root */
  const remember = (root) => {
    if (!root) return;
    for (const d of root.querySelectorAll("details[data-key]")) expected.set(d, /** @type {HTMLDetailsElement} */ (d).open);
  };

  /** @param {Event} event */
  const onToggle = (event) => {
    const el = /** @type {HTMLDetailsElement | null} */ (event.target);
    if (!el || typeof el.getAttribute !== "function" || el.tagName?.toLowerCase() !== "details") return;
    const key = el.getAttribute("data-key");
    if (key === null) return;
    if (expected.get(el) === el.open) return;
    expected.set(el, el.open);
    toggles.set(key, el.open);
  };

  /**
   * Animates one bar from `from` to its current value.
   * @param {HTMLProgressElement} bar
   * @param {number} from
   */
  const animate = (bar, from) => {
    const to = Number(bar.value);
    if (from === to || reducedMotion()) return;
    bar.value = from;
    /** @type {number | null} */
    let start = null;
    const step = (/** @type {number} */ now) => {
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / ANIMATE_MS);
      const eased = 1 - (1 - t) * (1 - t);
      bar.value = t >= 1 ? to : from + (to - from) * eased;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const showNotFound = () => {
    const current = main();
    if (!current || current.querySelector('[data-region="not-found"]')) return;
    const notice = document.createElement("div");
    notice.setAttribute("data-region", "not-found");
    notice.setAttribute("role", "alert");
    notice.append(document.createTextNode("This page no longer exists. "));
    const link = document.createElement("a");
    link.setAttribute("href", "/");
    link.textContent = "Back to the overview";
    notice.append(link);
    current.prepend(notice);
  };

  /** Fetches the current page and swaps `<main>`. */
  async function refresh() {
    const oldMain = main();
    if (!oldMain) return;
    const oldSigs = collectSigs(sigElements(oldMain, liveParts(document)));
    /** @type {Map<string, number>} */
    const oldValues = new Map();
    for (const bar of oldMain.querySelectorAll("progress[data-key]")) {
      oldValues.set(/** @type {string} */ (bar.getAttribute("data-key")), Number(/** @type {HTMLProgressElement} */ (bar).value));
    }

    let response;
    try {
      response = await fetch(window.location.pathname, { cache: "no-store" });
    } catch {
      return; // keep the last content; the event stream reports the outage
    }
    if (response.status === 404) {
      showNotFound();
      return;
    }
    if (!response.ok) return;
    const text = await response.text();
    const parsed = new DOMParser().parseFromString(text, "text/html");
    const nextMain = parsed.querySelector("main");
    const target = main();
    if (!nextMain || !target) return;

    const state = app.save(document);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const scrolled = collectScroll(document);

    target.replaceWith(nextMain);
    /** @type {Element[]} */
    const nextParts = [];
    for (const part of liveParts(document)) {
      const name = part.getAttribute("data-live");
      const replacement = parsed.querySelector(`[data-live="${name}"]`);
      if (!replacement) continue;
      part.replaceWith(replacement);
      nextParts.push(replacement);
    }
    const details = [...nextMain.querySelectorAll("details[data-key]")];
    applyToggles(/** @type {HTMLDetailsElement[]} */ (details), toggles);
    remember(nextMain);

    const fresh = sigElements(nextMain, nextParts);
    const changed = changedKeys(oldSigs, collectSigs(fresh));
    for (const el of fresh) {
      const key = el.getAttribute("data-key");
      if (key === null || !changed.has(key)) continue;
      el.setAttribute("data-changed", "");
      setTimeout(() => el.removeAttribute("data-changed"), CHANGED_MS);
    }

    app.reinit(document, state);
    window.scrollTo(scrollX, scrollY);
    restoreScroll(document, scrolled);

    for (const bar of nextMain.querySelectorAll("progress[data-key]")) {
      const from = oldValues.get(/** @type {string} */ (bar.getAttribute("data-key")));
      if (from !== undefined) animate(/** @type {HTMLProgressElement} */ (bar), from);
    }

    const Custom = /** @type {any} */ (window).CustomEvent ?? globalThis.CustomEvent;
    document.dispatchEvent(new Custom(CHANGE_EVENT));
  }

  /** Runs `refresh`, one at a time; a change during a refresh runs one more. */
  async function update() {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        await refresh();
      } while (again);
    } finally {
      busy = false;
    }
  }

  function connect() {
    const es = new EventSource(EVENTS_URL);
    source = es;
    es.addEventListener("hello", () => {
      if (!disconnected) return;
      disconnected = false;
      const b = banner();
      if (b) b.hidden = true;
      void update();
    });
    es.addEventListener("change", () => void update());
    es.addEventListener("error", () => {
      disconnected = true;
      const b = banner();
      if (b) b.hidden = false;
      // The browser retries on its own unless the stream was closed for good.
      if (es.readyState === 2 && source === es) {
        es.close();
        setTimeout(() => {
          if (source === es) connect();
        }, RECONNECT_MS);
      }
    });
  }

  return {
    /** Starts listening. */
    start() {
      remember(document.querySelector("main"));
      document.addEventListener("toggle", onToggle, true);
      connect();
    },
    /** Exposed for tests: runs one update now. */
    update,
    /** Exposed for tests: the viewer's recorded choices. */
    toggles,
  };
}

if (typeof document !== "undefined") {
  createLiveClient({ document, window, EventSource, fetch, DOMParser, setTimeout, requestAnimationFrame, app }).start();
}
