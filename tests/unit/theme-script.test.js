import { test, describe } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { Window } from "happy-dom";
import { themeScript } from "../../src/render/theme-script.js";

/**
 * Runs the script text in a fresh context that only holds `document` and
 * `window`, as a browser would run assets/theme.js.
 */
function run(localStorage) {
  const window = new Window();
  const fakeWindow = {};
  Object.defineProperty(fakeWindow, "localStorage", {
    get() {
      if (localStorage instanceof Error) throw localStorage;
      return localStorage;
    },
  });
  vm.runInNewContext(themeScript(), { document: window.document, window: fakeWindow });
  const theme = window.document.documentElement.dataset.theme;
  window.close();
  return theme;
}

const storage = (value) => ({ getItem: (k) => (k === "sk-theme" ? value : null) });

describe("themeScript", () => {
  test("is a classic script calling applyStoredTheme with document and localStorage", () => {
    const text = themeScript();
    assert.match(text, /^\(function applyStoredTheme\(document, storage\)/);
    assert.match(text, /window\.localStorage/);
    assert.doesNotMatch(text, /\bimport\b|\bexport\b/);
  });

  test("stored dark and light set data-theme", () => {
    assert.equal(run(storage("dark")), "dark");
    assert.equal(run(storage("light")), "light");
  });

  test("system, missing and invalid values leave data-theme unset", () => {
    assert.equal(run(storage("system")), undefined);
    assert.equal(run(storage(null)), undefined);
    assert.equal(run(storage("neon")), undefined);
  });

  test("localStorage access that throws, or a null storage, leaves data-theme unset", () => {
    assert.equal(run(new Error("SecurityError")), undefined);
    assert.equal(run(null), undefined);
    assert.equal(
      run({
        getItem() {
          throw new Error("blocked");
        },
      }),
      undefined,
    );
  });
});
