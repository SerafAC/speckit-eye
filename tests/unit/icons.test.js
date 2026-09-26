import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { ICONS, icon } from "../../src/render/icons.js";
import { Raw } from "../../src/render/html.js";

const NAMES = [
  "eye",
  "search",
  "grid",
  "shield",
  "layers",
  "sun",
  "moon",
  "monitor",
  "chevron-right",
  "chevron-up-down",
  "arrow-right",
  "alert-triangle",
  "check",
  "check-circle",
  "copy",
  "x",
  "sort",
  "menu",
  "file-text",
];

describe("icons (research D5)", () => {
  test("the map holds exactly the icons the design uses", () => {
    assert.deepEqual(Object.keys(ICONS).sort(), [...NAMES].sort());
  });

  test("every name renders a decorative, trusted 24 × 24 svg with its shapes", () => {
    for (const name of NAMES) {
      const out = icon(name);
      assert.ok(out instanceof Raw, name);
      assert.equal(
        out.value,
        `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`,
        name,
      );
      assert.match(ICONS[name], /^<(path|circle|rect|line) /, name);
    }
  });

  test("no icon carries a style attribute (CSP)", () => {
    for (const name of NAMES) {
      assert.doesNotMatch(icon(name).value, /style=/i, name);
      assert.doesNotMatch(icon(name, { label: "x" }).value, /style=/i, name);
    }
  });

  test("size sets width and height", () => {
    assert.match(icon("eye", { size: 20 }).value, /width="20" height="20"/);
  });

  test("a label makes the icon an accessible image with an escaped title", () => {
    const out = icon("check", { label: "Done <ok>" }).value;
    assert.match(out, /role="img" aria-label="Done &lt;ok&gt;"/);
    assert.match(out, /<title>Done &lt;ok&gt;<\/title>/);
    assert.doesNotMatch(out, /aria-hidden/);
  });

  test("an unknown name throws", () => {
    assert.throws(() => icon("rocket"), /unknown icon rocket/);
    assert.throws(() => icon("toString"), /unknown icon toString/);
  });
});
