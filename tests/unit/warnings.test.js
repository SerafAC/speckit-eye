import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mergeLines, formatRange, groupWarnings, WARNING_TEXT } from "../../src/model/warnings.js";

const FILE = "specs/001-x/tasks.md";
const w = (code, line, file = FILE) => ({ code, file, line, message: `m ${code}` });

describe("mergeLines", () => {
  test("merges consecutive numbers", () => {
    assert.deepEqual(mergeLines([23, 254, 255, 256, 257, 258]), [
      { from: 23, to: 23 },
      { from: 254, to: 258 },
    ]);
  });
  test("sorts and de-duplicates", () => {
    assert.deepEqual(mergeLines([5, 3, 4, 4, 9]), [
      { from: 3, to: 5 },
      { from: 9, to: 9 },
    ]);
  });
  test("empty", () => assert.deepEqual(mergeLines([]), []));
});

describe("formatRange", () => {
  test("single line", () => assert.equal(formatRange({ from: 23, to: 23 }), "L23"));
  test("range with en dash", () => assert.equal(formatRange({ from: 254, to: 258 }), "L254–258"));
});

describe("groupWarnings", () => {
  const content = Array.from({ length: 260 }, (_, i) => `line ${i + 1}`).join("\n");

  test("six W1 warnings: one group with title, note, merged lines and source lines", () => {
    const ws = [23, 254, 255, 256, 257, 258].map((l) => w("W1", l));
    const [g, ...rest] = groupWarnings(ws, new Map([[FILE, content]]));
    assert.equal(rest.length, 0);
    assert.equal(g.code, "W1");
    assert.equal(g.file, FILE);
    assert.equal(g.count, 6);
    assert.equal(g.title, "6 checkboxes without a task ID in tasks.md");
    assert.equal(g.note, "counted, not linkable");
    assert.deepEqual(g.lines.map(formatRange), ["L23", "L254–258"]);
    assert.deepEqual(g.sourceLines[0], { line: 23, text: "line 23" });
    assert.equal(g.sourceLines.length, 6);
  });

  test("singular title", () => {
    assert.equal(groupWarnings([w("W1", 2)], {})[0].title, "1 checkbox without a task ID in tasks.md");
    assert.equal(groupWarnings([w("W6", 2), w("W6", 3)], {})[0].title, "2 dependencies on a missing task in tasks.md");
    assert.equal(groupWarnings([w("W6", 2)], {})[0].title, "1 dependency on a missing task in tasks.md");
  });

  test("groups ordered by first line; same code in another file is its own group", () => {
    const ws = [w("W4", 40), w("W1", 12), w("W1", 50), w("W1", 5, "specs/001-x/other.md")];
    const groups = groupWarnings(ws, { [FILE]: content });
    assert.deepEqual(
      groups.map((g) => [g.code, g.file, g.lines.map(formatRange).join(",")]),
      [
        ["W1", "specs/001-x/other.md", "L5"],
        ["W1", FILE, "L12,L50"],
        ["W4", FILE, "L40"],
      ],
    );
    // No content for other.md: no source lines, still grouped.
    assert.deepEqual(groups[0].sourceLines, []);
  });

  test("warnings without a line form their own group per code, after lined groups", () => {
    const ws = [w("W8", null), w("W1", null), w("W1", 3)];
    const groups = groupWarnings(ws, {});
    assert.deepEqual(groups.map((g) => [g.code, g.lines.length]), [
      ["W1", 1],
      ["W1", 0],
      ["W8", 0],
    ]);
    assert.equal(groups[2].title, "tasks.md contains no tasks");
  });

  test("every 001 code has a title and a note", () => {
    for (let i = 1; i <= 12; i++) {
      const code = `W${i}`;
      assert.ok(WARNING_TEXT[code], code);
      assert.ok(WARNING_TEXT[code].note.length > 0, code);
      const g = groupWarnings([w(code, 1), w(code, 2)], {})[0];
      assert.equal(typeof g.title, "string");
      assert.ok(g.title.length > 0, code);
    }
  });

  test("unknown code falls back to a generic title and the message", () => {
    const g = groupWarnings([w("W99", 1)], {})[0];
    assert.equal(g.title, "1 warning in tasks.md");
    assert.equal(g.note, "m W99");
  });

  test("lines outside the content are left out of source lines", () => {
    const g = groupWarnings([w("W1", 1), w("W1", 99)], { [FILE]: "only\nthree\nlines" })[0];
    assert.deepEqual(g.sourceLines, [{ line: 1, text: "only" }]);
  });
});
