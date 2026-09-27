/**
 * Viewer preferences in `localStorage` (research D9). Every storage access of
 * the browser modules goes through this file; each one is wrapped in
 * `try/catch`, so a throwing or missing storage (private mode, blocked
 * cookies) falls back to the defaults and never throws.
 *
 * `applyStoredTheme` is also the source of the blocking `assets/theme.js`
 * (src/render/theme-script.js reuses its text), so it must stay
 * self-contained.
 */

/** localStorage key of each preference. */
export const KEYS = Object.freeze({ theme: "sk-theme", order: "sk-order", filter: "sk-filter", map: "sk-map" });

/** Value used when nothing valid is stored (`map: null` = decided by the page). */
export const DEFAULTS = Object.freeze({ theme: "system", order: "progress", filter: "all", map: null });

/** Values each preference may take. */
export const ALLOWED = Object.freeze({
  theme: Object.freeze(["light", "dark", "system"]),
  order: Object.freeze(["progress", "number", "least", "name"]),
  filter: Object.freeze(["all", "open"]),
  map: Object.freeze(["stacked", "grouped"]),
});

/** @typedef {keyof typeof KEYS} PrefName */

/**
 * @typedef {object} Prefs
 * @property {(name: PrefName) => string | null} get the stored value, or the
 *   default when it is missing, invalid or unreadable
 * @property {(name: PrefName, value: string) => void} set stores a valid
 *   value; invalid values and storage errors are ignored
 */

/**
 * @param {Pick<Storage, "getItem" | "setItem"> | null | undefined} storage
 * @returns {Prefs}
 */
export function createPrefs(storage) {
  /** @param {string} name */
  const known = (name) => Object.hasOwn(KEYS, name);
  return {
    get(name) {
      if (!known(name)) return null;
      let value = null;
      try {
        value = storage ? storage.getItem(KEYS[name]) : null;
      } catch {
        value = null;
      }
      return value !== null && ALLOWED[name].includes(value) ? value : DEFAULTS[name];
    },
    set(name, value) {
      if (!known(name) || !ALLOWED[name].includes(value)) return;
      try {
        if (storage) storage.setItem(KEYS[name], value);
      } catch {
        // Storage full, blocked or unavailable: the choice lasts for this page only.
      }
    },
  };
}

/**
 * `window.localStorage`, or null when reading it throws (some browsers throw
 * on access when site data is blocked).
 * @param {{localStorage?: Storage} | null | undefined} window
 * @returns {Storage | null}
 */
export function browserStorage(window) {
  try {
    return window?.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Sets `data-theme` on `<html>` to the stored `light` or `dark` choice before
 * first paint (research D3, SC-005). Does nothing for `system`, a missing or
 * invalid value, or a throwing or missing storage, so the page follows the OS.
 *
 * Self-contained on purpose: its source text becomes `assets/theme.js`
 * (src/render/theme-script.js). Do not reference anything outside this body.
 * @param {Document} document
 * @param {Pick<Storage, "getItem"> | null | undefined} storage
 */
export function applyStoredTheme(document, storage) {
  var value = null;
  try {
    value = storage ? storage.getItem("sk-theme") : null;
  } catch (e) {
    value = null;
  }
  if (value === "light" || value === "dark") document.documentElement.dataset.theme = value;
}
