/**
 * The text of `assets/theme.js` (research D3): a classic, blocking script
 * built from the unit-tested `applyStoredTheme` of src/client/prefs.js, so the
 * published file is generated in memory and never read from disk.
 */

import { applyStoredTheme } from "../client/prefs.js";

/**
 * @returns {string}
 */
export function themeScript() {
  return (
    `(${applyStoredTheme.toString()})(document, (function () { try { return window.localStorage; } catch (e) { return null; } })());\n`
  );
}
