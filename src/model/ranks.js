/**
 * The four feature orders of the overview tree (data-model FeatureRanks,
 * FR-012, research D10). The ordering rules live only here: the page carries
 * each feature's positions as `data-rank-*` attributes and the browser sorts
 * by them without re-implementing the rules. Pure.
 */

/** @typedef {import("./build-model.js").Feature} Feature */

/**
 * @typedef {object} FeatureRanks 0-based position under each order
 * @property {number} progress "In progress first" (default, sidebar order)
 * @property {number} number folder order
 * @property {number} least least complete first
 * @property {number} name title A–Z
 */

/** @typedef {Pick<Feature, "dir" | "title" | "status" | "counts">} RankInput */

/**
 * @param {string} a
 * @param {string} b
 * @returns {number} plain code-unit comparison (stable across locales)
 */
function byDir(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Group of a feature in the "In progress first" order: features with open
 * tasks (in progress before not started), then features without tasks, then
 * complete features.
 * @param {RankInput} f
 * @returns {number}
 */
function progressGroup(f) {
  if (f.counts.total === 0 || f.status === "no-tasks") return 2;
  if (f.counts.open === 0 || f.status === "done") return 3;
  return f.status === "in-progress" ? 0 : 1;
}

/** @type {Record<keyof FeatureRanks, (a: RankInput, b: RankInput) => number>} */
export const COMPARATORS = {
  progress: (a, b) => progressGroup(a) - progressGroup(b) || byDir(b.dir, a.dir),
  number: (a, b) => byDir(a.dir, b.dir),
  least: (a, b) => {
    const ea = a.counts.total === 0 ? 1 : 0;
    const eb = b.counts.total === 0 ? 1 : 0;
    if (ea || eb) return ea - eb || byDir(a.dir, b.dir);
    return a.counts.percent - b.counts.percent || b.counts.open - a.counts.open || byDir(a.dir, b.dir);
  },
  name: (a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }) || byDir(a.dir, b.dir),
};

/**
 * Position of every feature under each order.
 * @param {RankInput[]} features
 * @returns {Map<string, FeatureRanks>} dir → ranks
 */
export function computeRanks(features) {
  /** @type {Map<string, FeatureRanks>} */
  const out = new Map(features.map((f) => [f.dir, { progress: 0, number: 0, least: 0, name: 0 }]));
  for (const order of /** @type {(keyof FeatureRanks)[]} */ (Object.keys(COMPARATORS))) {
    [...features].sort(COMPARATORS[order]).forEach((f, i) => {
      /** @type {FeatureRanks} */ (out.get(f.dir))[order] = i;
    });
  }
  return out;
}
