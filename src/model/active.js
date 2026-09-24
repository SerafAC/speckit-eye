/**
 * Active item selection (FR-014, FR-018; data-model.md "ActiveSelection").
 * Pure: reads only the model and the two candidate names.
 */

/**
 * @typedef {object} ActiveSelection
 * @property {string | null} featureDir
 * @property {string | null} phaseKey
 * @property {string | null} storyLabel only when the active phase has groups
 * @property {string | null} nextTaskKey
 * @property {"feature.json" | "git-branch" | "first-open" | "none"} source
 */

/** @typedef {import("./build-model.js").Project} Project */
/** @typedef {import("./build-model.js").Feature} Feature */

/**
 * @param {Feature} feature
 * @param {ActiveSelection["source"]} source
 * @returns {ActiveSelection}
 */
function selectWithin(feature, source) {
  const phase = feature.phases.find((p) => p.counts.open > 0) ?? null;
  if (!phase) return { featureDir: feature.dir, phaseKey: null, storyLabel: null, nextTaskKey: null, source };

  let storyLabel = null;
  let pool = phase.tasks;
  if (phase.groups.length > 0) {
    const group = phase.groups.find((g) => g.counts.open > 0);
    if (group) {
      storyLabel = group.label;
      pool = group.tasks;
    }
  }
  const next = pool.find((t) => !t.done) ?? null;
  return { featureDir: feature.dir, phaseKey: phase.key, storyLabel, nextTaskKey: next ? next.key : null, source };
}

/**
 * @param {Project} project
 * @param {{featureDirectory?: string | null, gitBranch?: string | null}} inputs
 * @returns {ActiveSelection}
 */
export function selectActive(project, { featureDirectory = null, gitBranch = null } = {}) {
  const byDir = new Map(project.features.map((f) => [f.dir, f]));
  const a = featureDirectory ? byDir.get(featureDirectory) ?? null : null;
  const b = gitBranch ? byDir.get(gitBranch) ?? null : null;
  const anyOpen = project.features.some((f) => f.counts.open > 0);

  if (anyOpen) {
    const usable = (/** @type {Feature | null} */ f) => f !== null && !(f.hasTasks && f.counts.open === 0);
    if (usable(a)) return selectWithin(/** @type {Feature} */ (a), "feature.json");
    if (usable(b)) return selectWithin(/** @type {Feature} */ (b), "git-branch");
    const first = /** @type {Feature} */ (project.features.find((f) => f.counts.open > 0));
    return selectWithin(first, "first-open");
  }

  // FR-018: nothing is open; only a named feature can be active, without phase, story or task.
  const named = a ? { f: a, source: "feature.json" } : b ? { f: b, source: "git-branch" } : null;
  if (!named) return { featureDir: null, phaseKey: null, storyLabel: null, nextTaskKey: null, source: "none" };
  return {
    featureDir: named.f.dir,
    phaseKey: null,
    storyLabel: null,
    nextTaskKey: null,
    source: /** @type {ActiveSelection["source"]} */ (named.source),
  };
}
