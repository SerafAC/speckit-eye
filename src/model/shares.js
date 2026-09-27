/**
 * Percent shares by the largest-remainder method (data-model "Percent
 * shares", research D6): the one function behind every proportional width
 * (stats bar segments and their parts, phase rail blocks), so the parts of
 * one bar always add up to exactly 100.
 */

/**
 * Integer percentages of `values`: floor each `value * 100 / sum`, then give
 * the remaining points to the entries with the largest fractional parts
 * (ties: earlier entry first). Sums to 100, or is all zeros for an empty
 * array or a zero sum.
 * @param {number[]} values non-negative numbers
 * @returns {number[]}
 */
export function shares(values) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return values.map(() => 0);
  const out = values.map((v) => Math.floor((v * 100) / sum));
  // Remainders compared as `v * 100 - floor * sum` (exact for integers).
  const rest = values.map((v, i) => v * 100 - out[i] * sum);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = values.map((_, i) => i).sort((a, b) => rest[b] - rest[a] || a - b);
  for (const i of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/**
 * {@link shares}, but a non-zero value never gets 0: each one that rounded
 * to 0 is raised to 1 by taking 1 from the largest part (ties: earlier entry
 * first; FeatureSegment `parts` rule). Still sums to 100.
 * @param {number[]} values non-negative numbers
 * @returns {number[]}
 */
export function sharesNoZero(values) {
  const out = shares(values);
  for (let i = 0; i < values.length; i++) {
    if (values[i] <= 0 || out[i] > 0) continue;
    let largest = 0;
    for (let j = 1; j < out.length; j++) if (out[j] > out[largest]) largest = j;
    if (out[largest] <= 1) break; // nothing left to take from
    out[largest] -= 1;
    out[i] = 1;
  }
  return out;
}
