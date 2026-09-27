import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { shares, sharesNoZero } from "../../src/model/shares.js";

const sum = (a) => a.reduce((x, y) => x + y, 0);

describe("shares (largest remainder)", () => {
  test("the data-model example [123, 32, 72, 15] → [51, 13, 30, 6]", () => {
    assert.deepEqual(shares([123, 32, 72, 15]), [51, 13, 30, 6]);
  });

  test("always sums to 100 for a non-zero sum", () => {
    const cases = [[1], [1, 1, 1], [1, 2, 3, 4, 5, 6, 7], [999, 1], [0, 5, 0], [7, 7, 7, 7, 7, 7], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]];
    for (const values of cases) {
      const out = shares(values);
      assert.equal(sum(out), 100, JSON.stringify(values));
      assert.equal(out.length, values.length);
      for (const n of out) assert.ok(Number.isInteger(n) && n >= 0);
    }
  });

  test("ties in the remainder go to the earlier entry", () => {
    assert.deepEqual(shares([1, 1, 1]), [34, 33, 33]);
    assert.deepEqual(shares([1, 1, 1, 1, 1, 1]), [17, 17, 17, 17, 16, 16]);
  });

  test("exact values need no remainder", () => {
    assert.deepEqual(shares([1, 1]), [50, 50]);
    assert.deepEqual(shares([3, 1]), [75, 25]);
    assert.deepEqual(shares([0, 4]), [0, 100]);
  });

  test("an empty array or a zero sum gives all zeros", () => {
    assert.deepEqual(shares([]), []);
    assert.deepEqual(shares([0, 0, 0]), [0, 0, 0]);
  });

  test("a tiny non-zero value can round to 0", () => {
    assert.deepEqual(shares([1, 999]), [0, 100]);
  });
});

describe("sharesNoZero", () => {
  test("a tiny non-zero part is kept at 1, taken from the largest part", () => {
    assert.deepEqual(sharesNoZero([1, 999]), [1, 99]);
    assert.deepEqual(sharesNoZero([998, 1, 1]), [98, 1, 1]);
  });

  test("zeros stay zero and it still sums to 100", () => {
    const out = sharesNoZero([0, 1, 500, 0, 1000]);
    assert.deepEqual(out, [0, 1, 33, 0, 66]);
    assert.equal(sum(out), 100);
  });

  test("ties for the largest part: the earlier entry gives", () => {
    assert.deepEqual(sharesNoZero([500, 500, 1]), [49, 50, 1]);
  });

  test("equals shares when nothing rounded to 0", () => {
    assert.deepEqual(sharesNoZero([123, 32, 72, 15]), shares([123, 32, 72, 15]));
  });

  test("an empty array or a zero sum gives all zeros", () => {
    assert.deepEqual(sharesNoZero([]), []);
    assert.deepEqual(sharesNoZero([0, 0]), [0, 0]);
  });
});
