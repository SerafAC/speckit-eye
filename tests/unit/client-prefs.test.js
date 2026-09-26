import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import { KEYS, DEFAULTS, ALLOWED, createPrefs, applyStoredTheme } from "../../src/client/prefs.js";

/** A Map-backed storage like localStorage. */
function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const throwing = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
};

describe("prefs constants", () => {
  test("keys, defaults and allowed values", () => {
    assert.deepEqual({ ...KEYS }, { theme: "sk-theme", order: "sk-order", filter: "sk-filter", map: "sk-map" });
    assert.deepEqual({ ...DEFAULTS }, { theme: "system", order: "progress", filter: "all", map: null });
    assert.deepEqual([...ALLOWED.theme], ["light", "dark", "system"]);
    assert.deepEqual([...ALLOWED.order], ["progress", "number", "least", "name"]);
    assert.deepEqual([...ALLOWED.filter], ["all", "open"]);
    assert.deepEqual([...ALLOWED.map], ["stacked", "grouped"]);
  });
});

describe("createPrefs", () => {
  test("defaults when nothing is stored", () => {
    const prefs = createPrefs(memoryStorage());
    for (const name of Object.keys(KEYS)) assert.equal(prefs.get(name), DEFAULTS[name]);
  });

  test("round trip under the sk-* keys", () => {
    const storage = memoryStorage();
    const prefs = createPrefs(storage);
    prefs.set("theme", "dark");
    prefs.set("order", "least");
    prefs.set("filter", "open");
    prefs.set("map", "grouped");
    assert.deepEqual(Object.fromEntries(storage.data), {
      "sk-theme": "dark",
      "sk-order": "least",
      "sk-filter": "open",
      "sk-map": "grouped",
    });
    assert.deepEqual(
      Object.keys(KEYS).map((n) => prefs.get(n)),
      ["dark", "least", "open", "grouped"],
    );
  });

  test("invalid stored values read as the default", () => {
    const prefs = createPrefs(memoryStorage({ "sk-theme": "neon", "sk-order": "", "sk-filter": "none", "sk-map": "bars" }));
    for (const name of Object.keys(KEYS)) assert.equal(prefs.get(name), DEFAULTS[name]);
  });

  test("invalid values and unknown names are ignored by set", () => {
    const storage = memoryStorage();
    const prefs = createPrefs(storage);
    prefs.set("theme", "neon");
    prefs.set("order", null);
    prefs.set("colour", "red");
    assert.equal(storage.data.size, 0);
    assert.equal(prefs.get("colour"), null);
  });

  test("a throwing storage falls back to defaults and never throws", () => {
    const prefs = createPrefs(throwing);
    assert.equal(prefs.get("theme"), "system");
    assert.doesNotThrow(() => prefs.set("theme", "dark"));
    assert.equal(prefs.get("order"), "progress");
  });

  test("a null storage falls back to defaults and never throws", () => {
    for (const storage of [null, undefined]) {
      const prefs = createPrefs(storage);
      assert.equal(prefs.get("filter"), "all");
      assert.doesNotThrow(() => prefs.set("filter", "open"));
      assert.equal(prefs.get("map"), null);
    }
  });
});

describe("applyStoredTheme", () => {
  const cases = [
    ["light", memoryStorage({ "sk-theme": "light" }), "light"],
    ["dark", memoryStorage({ "sk-theme": "dark" }), "dark"],
    ["system", memoryStorage({ "sk-theme": "system" }), undefined],
    ["missing", memoryStorage(), undefined],
    ["invalid", memoryStorage({ "sk-theme": "neon" }), undefined],
    ["throwing", throwing, undefined],
    ["null", null, undefined],
  ];
  for (const [name, storage, expected] of cases) {
    test(`${name} storage → data-theme ${expected ?? "unset"}`, () => {
      const window = new Window();
      assert.doesNotThrow(() => applyStoredTheme(window.document, storage));
      assert.equal(window.document.documentElement.dataset.theme, expected);
      window.close();
    });
  }
});
