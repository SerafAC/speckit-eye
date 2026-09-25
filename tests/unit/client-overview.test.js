import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parentKeys, attachHover, attachClick } from "../../src/client/overview.js";

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

describe("attachClick (T072)", () => {
  function clickPage({ reduced = false } = {}) {
    const details = (key) => Object.assign(fakeElement({ "data-key": key }), { open: false });
    const nodes = {
      feature: details("002-beta"),
      phase: details("002-beta/p4"),
      group: details("002-beta/p4/US3"),
      other: details("001-alpha"),
    };
    const scrolls = [];
    const task = (key) => Object.assign(fakeElement({ "data-key": key }), { scrollIntoView: (opts) => scrolls.push([key, opts]) });
    const tasks = { t18: task("002-beta/T018"), t1: task("001-alpha/T001") };
    const tree = fakeElement({}, [...Object.values(nodes), ...Object.values(tasks)]);
    const doc = fakeElement();
    doc.querySelector = (selector) => (selector === '[data-region="tree"]' ? tree : null);
    const queries = [];
    const win = { matchMedia: (q) => (queries.push(q), { matches: reduced }) };
    const click = (target) => {
      const event = { type: "click", target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (const fn of doc.listeners.get("click") ?? []) fn(event);
      return event;
    };
    const cell = (key, parents) => fakeElement({ "data-key": key, "data-parents": parents });
    return { doc, win, nodes, tasks, scrolls, queries, click, cell };
  }

  test("registers one click listener on the document", () => {
    const { doc, win } = clickPage();
    attachClick(doc, win);
    assert.deepEqual([...doc.listeners.keys()], ["click"]);
  });

  test("opens the parents, scrolls smoothly to the task and prevents the default jump", () => {
    const { doc, win, nodes, tasks, scrolls, queries, click, cell } = clickPage();
    attachClick(doc, win);
    const event = click(cell("002-beta/T018", "002-beta 002-beta/p4 002-beta/p4/US3"));
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(
      Object.entries(nodes).filter(([, n]) => n.open).map(([k]) => k),
      ["feature", "phase", "group"],
    );
    assert.deepEqual(scrolls, [["002-beta/T018", { block: "center", behavior: "smooth" }]]);
    assert.deepEqual(queries, ["(prefers-reduced-motion: reduce)"]);
    assert.equal(tasks.t18.getAttribute("data-highlight"), "");
  });

  test("reduced motion scrolls with behavior auto", () => {
    const { doc, win, scrolls, click, cell } = clickPage({ reduced: true });
    attachClick(doc, win);
    click(cell("001-alpha/T001", "001-alpha"));
    assert.deepEqual(scrolls, [["001-alpha/T001", { block: "center", behavior: "auto" }]]);
  });

  test("the highlight stays until the next click moves it", () => {
    const { doc, win, tasks, click, cell } = clickPage();
    attachClick(doc, win);
    click(cell("002-beta/T018", "002-beta"));
    click({}); // a click elsewhere keeps it
    assert.equal(tasks.t18.getAttribute("data-highlight"), "");
    click(cell("001-alpha/T001", "001-alpha"));
    assert.equal(tasks.t18.getAttribute("data-highlight"), null);
    assert.equal(tasks.t1.getAttribute("data-highlight"), "");
  });

  test("clicks outside grid squares are left alone (tree toggles keep their native behavior)", () => {
    const { doc, win, nodes, scrolls, click, cell } = clickPage();
    attachClick(doc, win);
    for (const target of [null, {}, nodes.feature, fakeElement({ "data-parents": "002-beta" })]) {
      assert.equal(click(target).defaultPrevented, false);
    }
    assert.equal(nodes.feature.open, false);
    assert.deepEqual(scrolls, []);
    // A square whose task is not in the tree falls back to the native jump.
    assert.equal(click(cell("999-x/T001", "999-x")).defaultPrevented, false);
  });

  test("unknown parent keys are skipped; no tree means no action", () => {
    const { doc, win, nodes, click, cell } = clickPage();
    attachClick(doc, win);
    click(cell("002-beta/T018", "999-missing 002-beta"));
    assert.equal(nodes.feature.open, true);
    const bare = fakeElement();
    bare.querySelector = () => null;
    attachClick(bare);
    for (const fn of bare.listeners.get("click")) {
      const event = { target: cell("002-beta/T018", "002-beta"), preventDefault: () => assert.fail("no tree") };
      fn(event);
    }
  });

  test("defaults the window to doc.defaultView and tolerates a missing matchMedia", () => {
    const { doc, scrolls, click, cell } = clickPage();
    doc.defaultView = {};
    attachClick(doc);
    click(cell("001-alpha/T001", "001-alpha"));
    assert.deepEqual(scrolls, [["001-alpha/T001", { block: "center", behavior: "smooth" }]]);
  });
});
