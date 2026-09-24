import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parentKeys, attachHover } from "../../src/client/overview.js";

/** A minimal element: attributes, listeners and a querySelector over `children` by data-key. */
function fakeElement(attrs = {}, children = []) {
  const attributes = new Map(Object.entries(attrs));
  const listeners = new Map();
  return {
    attributes,
    listeners,
    getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: (name) => attributes.delete(name),
    addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    querySelector: (selector) => {
      const m = /^\[data-key="((?:[^"\\]|\\.)*)"\]$/.exec(selector);
      if (!m) throw new Error(`unexpected selector ${selector}`);
      const key = m[1].replace(/\\(.)/g, "$1");
      return children.find((c) => c.getAttribute("data-key") === key) ?? null;
    },
    fire(type, target) {
      for (const fn of listeners.get(type) ?? []) fn({ type, target });
    },
  };
}

function fakePage() {
  const nodes = {
    feature: fakeElement({ "data-key": "002-beta" }),
    phase: fakeElement({ "data-key": "002-beta/p4" }),
    group: fakeElement({ "data-key": "002-beta/p4/US3" }),
    other: fakeElement({ "data-key": "001-alpha" }),
    phase3: fakeElement({ "data-key": "002-beta/p3" }),
  };
  const tree = fakeElement({}, Object.values(nodes));
  const grid = fakeElement();
  const doc = {
    querySelector: (selector) =>
      selector === '[data-region="grid"]' ? grid : selector === '[data-region="tree"]' ? tree : null,
  };
  const cell = (parents) => fakeElement({ "data-parents": parents });
  const lit = () => Object.entries(nodes).filter(([, n]) => n.attributes.has("data-highlight")).map(([k]) => k);
  return { doc, grid, tree, nodes, cell, lit };
}

describe("parentKeys", () => {
  test("splits on whitespace and drops empties", () => {
    assert.deepEqual(parentKeys("002-beta 002-beta/p4 002-beta/p4/US3"), ["002-beta", "002-beta/p4", "002-beta/p4/US3"]);
    assert.deepEqual(parentKeys("  a   b\tc "), ["a", "b", "c"]);
  });
  test("empty, null and undefined give no keys", () => {
    assert.deepEqual(parentKeys(""), []);
    assert.deepEqual(parentKeys(null), []);
    assert.deepEqual(parentKeys(undefined), []);
  });
  test("keeps @L suffixes intact", () => {
    assert.deepEqual(parentKeys("001-x 001-x/p2@L40"), ["001-x", "001-x/p2@L40"]);
  });
});

describe("attachHover", () => {
  test("registers mouseover, focusin, mouseout and focusout on the grid", () => {
    const { doc, grid } = fakePage();
    attachHover(doc);
    assert.deepEqual([...grid.listeners.keys()].sort(), ["focusin", "focusout", "mouseout", "mouseover"]);
  });

  test("mouseover highlights every parent of the cell", () => {
    const { doc, grid, cell, lit } = fakePage();
    attachHover(doc);
    grid.fire("mouseover", cell("002-beta 002-beta/p4 002-beta/p4/US3"));
    assert.deepEqual(lit(), ["feature", "phase", "group"]);
  });

  test("mouseout clears the highlight", () => {
    const { doc, grid, cell, lit } = fakePage();
    attachHover(doc);
    grid.fire("mouseover", cell("002-beta 002-beta/p4"));
    grid.fire("mouseout", cell("002-beta 002-beta/p4"));
    assert.deepEqual(lit(), []);
  });

  test("focusin and focusout work the same way (keyboard)", () => {
    const { doc, grid, cell, lit } = fakePage();
    attachHover(doc);
    grid.fire("focusin", cell("002-beta 002-beta/p3"));
    assert.deepEqual(lit(), ["feature", "phase3"]);
    grid.fire("focusout", cell("002-beta 002-beta/p3"));
    assert.deepEqual(lit(), []);
  });

  test("moving to another cell replaces the previous highlight", () => {
    const { doc, grid, cell, lit } = fakePage();
    attachHover(doc);
    grid.fire("mouseover", cell("002-beta 002-beta/p4 002-beta/p4/US3"));
    grid.fire("mouseover", cell("001-alpha"));
    assert.deepEqual(lit(), ["other"]);
  });

  test("events on the grid itself (no data-parents) change nothing", () => {
    const { doc, grid, cell, lit } = fakePage();
    attachHover(doc);
    grid.fire("mouseover", cell("002-beta"));
    grid.fire("mouseover", grid);
    grid.fire("mouseover", null);
    grid.fire("mouseover", {});
    assert.deepEqual(lit(), ["feature"]);
  });

  test("unknown keys are ignored", () => {
    const { doc, grid, cell, lit } = fakePage();
    attachHover(doc);
    grid.fire("mouseover", cell("999-missing 002-beta"));
    assert.deepEqual(lit(), ["feature"]);
  });

  test("does nothing on a page without grid or tree", () => {
    assert.doesNotThrow(() => attachHover({ querySelector: () => null }));
    const grid = fakeElement();
    attachHover({ querySelector: (s) => (s === '[data-region="grid"]' ? grid : null) });
    assert.equal(grid.listeners.size, 0);
  });
});
