import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeRanks } from "../../src/model/ranks.js";

const counts = (done, total) => {
  const open = total - done;
  const percent = total ? Math.min(Math.round((done * 100) / total), open ? 99 : 100) : 0;
  return { done, total, open, percent };
};
const status = (c) => (c.total === 0 ? "no-tasks" : c.open === 0 ? "done" : c.done === 0 ? "not-started" : "in-progress");
const feature = (dir, title, done, total) => {
  const c = counts(done, total);
  return { dir, title, counts: c, status: status(c) };
};

/** Like the `mixed` fixture: complete, in progress, ready, spec only. */
const MIXED = [
  feature("001-alpha", "Alpha", 30, 30),
  feature("002-beta", "Beta", 10, 20),
  feature("003-gamma", "Gamma", 0, 15),
  feature("004-delta", "Delta", 0, 0),
];

/** Dirs sorted by one order. */
function ordered(features, order) {
  const ranks = computeRanks(features);
  return [...features].sort((a, b) => ranks.get(a.dir)[order] - ranks.get(b.dir)[order]).map((f) => f.dir);
}

describe("computeRanks", () => {
  test("returns 0-based positions for every order", () => {
    const ranks = computeRanks(MIXED);
    assert.deepEqual(ranks.get("002-beta"), { progress: 0, number: 1, least: 1, name: 1 });
    assert.deepEqual(ranks.get("004-delta"), { progress: 2, number: 3, least: 3, name: 2 });
    for (const order of ["progress", "number", "least", "name"]) {
      assert.deepEqual([...ranks.values()].map((r) => r[order]).sort(), [0, 1, 2, 3]);
    }
  });

  test("progress: in progress, not started, no tasks, done", () => {
    assert.deepEqual(ordered(MIXED, "progress"), ["002-beta", "003-gamma", "004-delta", "001-alpha"]);
  });

  test("progress: highest number first inside each group", () => {
    const fs = [
      feature("001-a", "A", 1, 2),
      feature("002-b", "B", 2, 2),
      feature("003-c", "C", 1, 3),
      feature("004-d", "D", 0, 0),
      feature("005-e", "E", 0, 4),
      feature("006-f", "F", 3, 3),
      feature("007-g", "G", 0, 0),
      feature("008-h", "H", 0, 1),
    ];
    assert.deepEqual(ordered(fs, "progress"), ["003-c", "001-a", "008-h", "005-e", "007-g", "004-d", "006-f", "002-b"]);
  });

  test("number: folder order", () => {
    assert.deepEqual(ordered([MIXED[2], MIXED[0], MIXED[3], MIXED[1]], "number"), ["001-alpha", "002-beta", "003-gamma", "004-delta"]);
  });

  test("least: percent ascending, features without tasks last", () => {
    assert.deepEqual(ordered(MIXED, "least"), ["003-gamma", "002-beta", "001-alpha", "004-delta"]);
  });

  test("least ties: more open tasks first, then dir ascending", () => {
    const fs = [
      feature("003-c", "C", 1, 2), // 50 %, 1 open
      feature("001-a", "A", 2, 4), // 50 %, 2 open
      feature("002-b", "B", 1, 2), // 50 %, 1 open
      feature("009-z", "Z", 0, 0),
      feature("005-y", "Y", 0, 0),
    ];
    assert.deepEqual(ordered(fs, "least"), ["001-a", "002-b", "003-c", "005-y", "009-z"]);
  });

  test("name: case-insensitive A–Z, then dir", () => {
    const fs = [
      feature("001-x", "beta", 0, 1),
      feature("002-x", "Alpha", 0, 1),
      feature("003-x", "alpha", 0, 1),
      feature("000-x", "Äpfel", 0, 1),
    ];
    assert.deepEqual(ordered(fs, "name"), ["002-x", "003-x", "000-x", "001-x"]);
  });

  test("empty list", () => assert.equal(computeRanks([]).size, 0));
});
