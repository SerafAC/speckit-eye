/**
 * Builds the in-memory Project model (data-model.md) from a scan result.
 * Pure: no I/O.
 */

import { parseSpec } from "../parse/spec.js";
import { parseTasks } from "../parse/tasks.js";
import {
  classifyKind,
  artifactTitle,
  sourceToUrl,
  sortFeatureArtifacts,
  sortAssessmentArtifacts,
} from "../project/artifacts.js";
import { compareWarnings } from "../project/scan.js";
import { selectActive } from "./active.js";
import { applyTaskStates } from "./task-state.js";

/** @typedef {import("../project/scan.js").Warning} Warning */
/** @typedef {import("../project/scan.js").ScanResult} ScanResult */
/** @typedef {import("../project/artifacts.js").Artifact} Artifact */
/** @typedef {import("../parse/spec.js").Story} Story */

/**
 * @typedef {object} Counts
 * @property {number} done
 * @property {number} total
 * @property {number} open
 * @property {number} percent
 */

/**
 * @typedef {object} Task
 * @property {string | null} id
 * @property {boolean} done
 * @property {boolean} parallel
 * @property {string | null} story
 * @property {string} description
 * @property {string[]} dependsOn
 * @property {number} line
 * @property {string} key
 * @property {"completed" | "current" | "blocked" | "future" | null} state set by applyTaskStates
 * @property {string} [sig] change signature, set by applyTaskStates
 */

/**
 * @typedef {object} StoryGroup
 * @property {string} label
 * @property {Story | null} story
 * @property {Task[]} tasks
 * @property {Counts} counts
 * @property {string} key
 * @property {string} [sig]
 */

/**
 * @typedef {object} Phase
 * @property {number | null} number
 * @property {string} title
 * @property {Task[]} tasks every task of the phase in file order (grouped ones included)
 * @property {string[]} storyLabels
 * @property {Story | null} mergedStory
 * @property {StoryGroup[]} groups
 * @property {Counts} counts
 * @property {string} key
 * @property {string} [sig]
 */

/** @typedef {"empty" | "specified" | "planned" | "ready" | "in-progress" | "complete"} Stage */

/**
 * @typedef {object} Feature
 * @property {string} dir
 * @property {string} title
 * @property {Artifact[]} artifacts
 * @property {Story[]} stories
 * @property {Phase[]} phases
 * @property {boolean} hasTasks
 * @property {Counts} counts
 * @property {Stage} stage
 * @property {Warning[]} warnings
 * @property {string} [sig]
 */

/**
 * @typedef {object} Totals
 * @property {Counts} tasks
 * @property {{completed: number, total: number}} specs
 * @property {{completed: number, total: number}} phases
 */

/**
 * @typedef {object} Project
 * @property {string} name
 * @property {string | null} root
 * @property {Feature[]} features
 * @property {Artifact | null} constitution
 * @property {{slug: string, artifacts: Artifact[]}[]} assessments
 * @property {import("./active.js").ActiveSelection} active
 * @property {Totals} totals
 * @property {Warning[]} warnings
 * @property {string} [sig]
 */

/**
 * @param {number} done
 * @param {number} total
 * @returns {Counts}
 */
export function makeCounts(done, total) {
  const open = total - done;
  const percent = total ? Math.min(Math.round((done * 100) / total), open ? 99 : 100) : 0;
  return { done, total, open, percent };
}

/**
 * @param {{done: boolean}[]} tasks
 * @returns {Counts}
 */
export function countTasks(tasks) {
  return makeCounts(tasks.filter((t) => t.done).length, tasks.length);
}

/**
 * @param {string} source
 * @param {string} content
 * @returns {Artifact}
 */
function makeArtifact(source, content) {
  const fileName = source.slice(source.lastIndexOf("/") + 1);
  return {
    kind: classifyKind(source),
    title: artifactTitle(content, fileName),
    source,
    url: /** @type {string} */ (sourceToUrl(source)),
    content,
  };
}

/**
 * @param {{hasSpec: boolean, hasPlan: boolean, hasTasks: boolean, counts: Counts}} f
 * @returns {Stage}
 */
export function deriveStage({ hasSpec, hasPlan, hasTasks, counts }) {
  if (hasTasks && counts.total > 0) {
    if (counts.open === 0) return "complete";
    if (counts.done === 0) return "ready";
    return "in-progress";
  }
  if (hasPlan) return "planned";
  if (hasSpec) return "specified";
  return "empty";
}

/**
 * @param {string} dir
 * @param {Map<string, string>} files
 * @param {Warning[]} scanWarnings warnings from the scan that belong to this feature
 * @returns {Feature}
 */
function buildFeature(dir, files, scanWarnings) {
  const tasksFile = `specs/${dir}/tasks.md`;
  const spec = parseSpec(files.get("spec.md") ?? "");
  const hasTasks = files.has("tasks.md");
  const parsed = hasTasks ? parseTasks(files.get("tasks.md"), tasksFile) : { phases: [], tasks: [], warnings: [] };
  const storyByLabel = new Map();
  for (const story of spec.stories) if (!storyByLabel.has(story.label)) storyByLabel.set(story.label, story);

  /** @param {(string | null)[]} values */
  const repeated = (values) => {
    const seen = new Map();
    for (const v of values) seen.set(v, (seen.get(v) ?? 0) + 1);
    // Only called with values from `values`, so `seen` always has `v`.
    return (/** @type {string | null} */ v) => /** @type {number} */ (seen.get(v)) > 1;
  };
  const idRepeated = repeated(parsed.tasks.map((t) => t.id).filter((id) => id !== null));
  const phaseRepeated = repeated(
    parsed.phases.map((p) => (p.number === null ? null : String(p.number))).filter((n) => n !== null),
  );

  /** @type {Map<import("../parse/tasks.js").ParsedTask, Task>} */
  const taskOf = new Map();
  for (const t of parsed.tasks) {
    let key = `${dir}/${t.id ?? `L${t.line}`}`;
    if (t.id !== null && idRepeated(t.id)) key += `@L${t.line}`;
    taskOf.set(t, { ...t, dependsOn: [...t.dependsOn], key, state: null });
  }

  const phases = parsed.phases.map((p) => {
    let key = `${dir}/p${p.number ?? "u"}`;
    if (p.number !== null && phaseRepeated(String(p.number))) key += `@L${p.line}`;
    const tasks = p.tasks.map((t) => /** @type {Task} */ (taskOf.get(t)));
    /** @type {string[]} */
    const storyLabels = [];
    for (const t of tasks) if (t.story && !storyLabels.includes(t.story)) storyLabels.push(t.story);

    /** @type {Story | null} */
    let mergedStory = null;
    if (tasks.length > 0 && storyLabels.length === 1 && tasks.every((t) => t.story === storyLabels[0])) {
      mergedStory = storyByLabel.get(storyLabels[0]) ?? { label: storyLabels[0], title: null, priority: null };
    }

    /** @type {StoryGroup[]} */
    const groups =
      storyLabels.length > 1
        ? storyLabels.map((label) => {
            const groupTasks = tasks.filter((t) => t.story === label);
            return {
              label,
              story: storyByLabel.get(label) ?? null,
              tasks: groupTasks,
              counts: countTasks(groupTasks),
              key: `${key}/${label}`,
            };
          })
        : [];

    return { number: p.number, title: p.title, tasks, storyLabels, mergedStory, groups, counts: countTasks(tasks), key };
  });

  /** @type {Warning[]} */
  const w4 = [];
  const reported = new Set();
  for (const t of parsed.tasks) {
    if (t.story && !storyByLabel.has(t.story) && !reported.has(t.story)) {
      reported.add(t.story);
      w4.push({
        code: "W4",
        file: tasksFile,
        line: t.line,
        message: `story label ${t.story} has no matching user story in spec.md`,
      });
    }
  }

  const counts = countTasks(parsed.tasks);
  const artifacts = sortFeatureArtifacts(
    [...files].map(([rel, content]) => makeArtifact(`specs/${dir}/${rel}`, content)),
  );
  const warnings = [...scanWarnings, ...parsed.warnings, ...w4].sort(compareWarnings);

  return {
    dir,
    title: spec.title ?? dir,
    artifacts,
    stories: spec.stories,
    phases,
    hasTasks,
    counts,
    stage: deriveStage({ hasSpec: files.has("spec.md"), hasPlan: files.has("plan.md"), hasTasks, counts }),
    warnings,
  };
}

/**
 * @param {Feature[]} features
 * @returns {Totals}
 */
export function computeTotals(features) {
  let done = 0;
  let total = 0;
  let specsCompleted = 0;
  let phasesCompleted = 0;
  let phasesTotal = 0;
  for (const f of features) {
    done += f.counts.done;
    total += f.counts.total;
    if (f.hasTasks && f.counts.total > 0 && f.counts.open === 0) specsCompleted++;
    for (const p of f.phases) {
      if (p.counts.total === 0) continue;
      phasesTotal++;
      if (p.counts.open === 0) phasesCompleted++;
    }
  }
  return {
    tasks: makeCounts(done, total),
    specs: { completed: specsCompleted, total: features.length },
    phases: { completed: phasesCompleted, total: phasesTotal },
  };
}

/**
 * @param {ScanResult & {root?: string}} scanResult
 * @returns {Project}
 */
export function buildModel(scanResult) {
  const scanWarnings = scanResult.warnings ?? [];
  const claimed = new Set();
  const features = scanResult.features.map(({ dir, files }) => {
    const prefix = `specs/${dir}/`;
    const own = scanWarnings.filter((w) => w.file.startsWith(prefix));
    for (const w of own) claimed.add(w);
    return buildFeature(dir, files, own);
  });

  const constitution = scanResult.constitution
    ? makeArtifact(scanResult.constitution.source, scanResult.constitution.content)
    : null;

  const assessments = scanResult.assessments.map(({ slug, files }) => ({
    slug,
    artifacts: sortAssessmentArtifacts(
      [...files].map(([rel, content]) => makeArtifact(`.specify/assessments/${slug}/${rel}`, content)),
    ),
  }));

  /** @type {Project} */
  const project = {
    name: scanResult.name,
    root: scanResult.root ?? null,
    features,
    constitution,
    assessments,
    active: /** @type {any} */ (null),
    totals: computeTotals(features),
    warnings: scanWarnings.filter((w) => !claimed.has(w)),
  };
  project.active = selectActive(project, {
    featureDirectory: scanResult.featureDirectory ?? null,
    gitBranch: scanResult.gitBranch ?? null,
  });
  return applyTaskStates(project);
}
