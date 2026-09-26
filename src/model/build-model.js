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
import { computeRanks } from "./ranks.js";
import { groupWarnings } from "./warnings.js";
import { shares, sharesNoZero } from "./shares.js";
import { taskFiles, taskKind, taskRefs, kindChips } from "./task-files.js";

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
 * @property {string} anchor `task-` + key with `/` and `@` replaced by `-`
 *   (page fragment on the tree, the map and the feature page)
 * @property {"completed" | "current" | "blocked" | "future" | null} state set by applyTaskStates
 * @property {"done" | "next" | "blocked" | "open"} [display] `state` under the
 *   redesign's names, set by applyTaskStates
 * @property {string[]} [waitingOn] open dependencies of a blocked task, set by
 *   applyTaskStates
 * @property {string} [sig] change signature, set by applyTaskStates
 * @property {string[]} files file paths named in the description (FR-037)
 * @property {import("./task-files.js").TaskKind | null} kind from `files[0]` (FR-035)
 * @property {string[]} refs FR-/SC- references in the description
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

/** @typedef {"done" | "in-progress" | "not-started" | "no-tasks"} FeatureStatus */

/**
 * @typedef {object} DocumentGroup
 * @property {string} name
 * @property {Artifact[]} items
 */

/**
 * @typedef {object} DocumentTab
 * @property {string} label
 * @property {number} count number of documents behind the tab
 * @property {Artifact[]} items
 */

/**
 * @typedef {object} DocumentGroups
 * @property {DocumentGroup[]} groups reader groups, empty ones left out
 * @property {DocumentTab[]} tabs feature-page tabs in display order
 */

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
 * @property {string | null} number numeric or timestamp prefix of `dir`
 * @property {FeatureStatus} status
 * @property {string} statusLabel pill text (data-model FeatureStatus)
 * @property {DocumentGroups} documents reader groups and feature-page tabs
 * @property {import("./ranks.js").FeatureRanks} ranks positions under the four
 *   tree orders (FR-012)
 * @property {import("./warnings.js").WarningGroup[]} warningGroups warnings
 *   grouped by code and file (FR-015)
 * @property {Warning[]} warnings
 * @property {string[]} kindChips distinct kind labels of the tasks, in order
 *   of first appearance (feature-page kind filters, FR-034)
 * @property {number[]} phaseShares percent share of each phase in the
 *   feature's tasks, largest remainder; 0 for phases without tasks (FR-032)
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
 * @property {{groups: DocumentGroup[]}} documents project document list:
 *   "Project" (constitution) and one group per assessment
 * @property {import("./active.js").ActiveSelection} active
 * @property {Totals} totals
 * @property {OverviewStats} overview stats card numbers (FR-011)
 * @property {Warning[]} warnings
 * @property {string} [sig]
 */

/**
 * @typedef {object} FeatureSegment
 * @property {string} dir
 * @property {string | null} number
 * @property {string} title
 * @property {number} share percent of all project tasks (largest remainder)
 * @property {{done: number, open: number, next: number}} parts percents of
 *   the feature's own tasks; blocked tasks count as open
 * @property {Counts} counts
 * @property {boolean} showLabel `share >= 4`
 */

/**
 * @typedef {object} OverviewStats
 * @property {number} percent
 * @property {number} done
 * @property {number} total
 * @property {{completed: number, total: number, inProgress: number}} features
 * @property {{completed: number, total: number, remaining: number}} phases
 * @property {{count: number, features: number}} openTasks
 * @property {FeatureSegment[]} segments features with tasks, in folder order
 * @property {{done: number, open: number, blocked: number, next: number}} legend
 *   counts over all tasks (`open` leaves out blocked and next)
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
function countTasks(tasks) {
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

/** Stage → FeatureStatus (data-model FeatureStatus). */
const STATUS_OF_STAGE = Object.freeze({
  complete: "done",
  "in-progress": "in-progress",
  ready: "not-started",
  empty: "no-tasks",
  specified: "no-tasks",
  planned: "no-tasks",
});

/** Pill label of a feature without tasks: its stage. */
const STAGE_LABEL = Object.freeze({ empty: "Empty", specified: "Specified", planned: "Planned" });

/**
 * @param {Stage} stage
 * @returns {FeatureStatus}
 */
export function featureStatus(stage) {
  return /** @type {FeatureStatus} */ (STATUS_OF_STAGE[stage]);
}

/**
 * The status pill text: "Complete", "N open", "Ready" ("N open" for the
 * active feature) or the stage label for a feature without tasks.
 * @param {{stage: Stage, counts: Counts}} feature
 * @param {boolean} active
 * @returns {string}
 */
export function featureStatusLabel({ stage, counts }, active) {
  switch (featureStatus(stage)) {
    case "done":
      return "Complete";
    case "in-progress":
      return `${counts.open} open`;
    case "not-started":
      return active ? `${counts.open} open` : "Ready";
    default:
      return STAGE_LABEL[/** @type {"empty" | "specified" | "planned"} */ (stage)];
  }
}

/**
 * The feature number chip: leading digits of the folder name (`001-x` →
 * `"001"`), or its timestamp prefix (`20250101-123456-x` →
 * `"20250101-123456"`); null without a numeric prefix.
 * @param {string} dir
 * @returns {string | null}
 */
export function featureNumber(dir) {
  const m = /^(\d{8}-\d{6}|\d+)(?=-|$)/.exec(dir);
  return m ? m[1] : null;
}

/**
 * @param {string} key
 * @returns {string}
 */
export function taskAnchor(key) {
  return `task-${key.replace(/[/@]/g, "-")}`;
}

/** @type {Readonly<Record<string, string>>} */
const GROUP_OF_KIND = Object.freeze({
  spec: "Define",
  checklist: "Define",
  plan: "Design",
  research: "Design",
  "data-model": "Design",
  quickstart: "Design",
  contract: "Contracts",
  tasks: "Build",
});
const GROUP_ORDER = ["Define", "Design", "Contracts", "Build", "Other"];

/** Single-document tabs, in tab order. */
/** @type {[string, string][]} */
const SINGLE_TABS = [
  ["spec", "Specification"],
  ["plan", "Plan"],
  ["research", "Research"],
  ["data-model", "Data model"],
  ["quickstart", "Quickstart"],
];

/**
 * Places a feature's artifacts (already in 001 order) into the reader groups
 * and the feature-page tabs (data-model DocumentGroups).
 * @param {Artifact[]} artifacts
 * @param {string} dir
 * @returns {DocumentGroups}
 */
export function featureDocuments(artifacts, dir) {
  const groups = GROUP_ORDER.map((name) => ({
    name,
    items: artifacts.filter((a) => (GROUP_OF_KIND[a.kind] ?? "Other") === name),
  })).filter((g) => g.items.length > 0);

  const ofKind = (/** @type {string} */ kind) => artifacts.filter((a) => a.kind === kind);
  /** @type {DocumentTab[]} */
  const tabs = [];
  for (const [kind, label] of SINGLE_TABS) {
    const items = ofKind(kind);
    if (items.length > 0) tabs.push({ label, count: items.length, items });
  }
  const contracts = ofKind("contract");
  if (contracts.length > 0) tabs.push({ label: "Contracts", count: contracts.length, items: contracts });
  const checklists = ofKind("checklist");
  if (checklists.length === 1 && checklists[0].source === `specs/${dir}/checklists/requirements.md`) {
    tabs.push({ label: "Quality checklist", count: 1, items: checklists });
  } else if (checklists.length > 0) {
    tabs.push({ label: "Checklists", count: checklists.length, items: checklists });
  }
  const other = artifacts.filter((a) => !(a.kind in GROUP_OF_KIND));
  if (other.length > 0) tabs.push({ label: "More", count: other.length, items: other });
  return { groups, tabs };
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
    const files = taskFiles(t.description);
    taskOf.set(t, {
      ...t,
      dependsOn: [...t.dependsOn],
      key,
      anchor: taskAnchor(key),
      state: null,
      files,
      kind: taskKind(files[0]),
      refs: taskRefs(t.description),
    });
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

  const stage = deriveStage({ hasSpec: files.has("spec.md"), hasPlan: files.has("plan.md"), hasTasks, counts });
  const status = featureStatus(stage);
  return {
    dir,
    title: spec.title ?? dir,
    artifacts,
    stories: spec.stories,
    phases,
    hasTasks,
    counts,
    stage,
    number: featureNumber(dir),
    status,
    // Recomputed for the active feature once the selection is known (buildModel).
    statusLabel: featureStatusLabel({ stage, counts }, false),
    documents: featureDocuments(artifacts, dir),
    // Set by buildModel once every feature and task state is known.
    ranks: { progress: 0, number: 0, least: 0, name: 0 },
    warningGroups: [],
    warnings,
    kindChips: kindChips(parsed.tasks.map((t) => /** @type {Task} */ (taskOf.get(t)))),
    phaseShares: shares(phases.map((p) => p.counts.total)),
  };
}

/**
 * @param {Feature[]} features
 * @returns {Totals}
 */
function computeTotals(features) {
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
 * The stats card numbers (data-model OverviewStats, FeatureSegment).
 * Requires task display states (applyTaskStates) and feature statuses.
 * @param {Feature[]} features
 * @param {Totals} totals
 * @returns {OverviewStats}
 */
export function overviewStats(features, totals) {
  const legend = { done: 0, open: 0, blocked: 0, next: 0 };
  const withTasks = features.filter((f) => f.counts.total > 0);
  const segmentShares = shares(withTasks.map((f) => f.counts.total));
  const segments = withTasks.map((f, i) => {
    const tasks = f.phases.flatMap((p) => p.tasks);
    const next = tasks.filter((t) => !t.done && t.display === "next").length;
    const done = f.counts.done;
    const [pd, po, pn] = sharesNoZero([done, f.counts.total - done - next, next]);
    return {
      dir: f.dir,
      number: f.number,
      title: f.title,
      share: segmentShares[i],
      parts: { done: pd, open: po, next: pn },
      counts: f.counts,
      showLabel: segmentShares[i] >= 4,
    };
  });
  for (const f of features) {
    for (const p of f.phases) {
      for (const t of p.tasks) {
        const d = t.done ? "done" : (t.display ?? "open");
        legend[d === "done" || d === "next" || d === "blocked" ? d : "open"]++;
      }
    }
  }
  return {
    percent: totals.tasks.percent,
    done: totals.tasks.done,
    total: totals.tasks.total,
    features: {
      completed: totals.specs.completed,
      total: totals.specs.total,
      inProgress: features.filter((f) => f.status === "in-progress").length,
    },
    phases: {
      completed: totals.phases.completed,
      total: totals.phases.total,
      remaining: totals.phases.total - totals.phases.completed,
    },
    openTasks: { count: totals.tasks.open, features: features.filter((f) => f.counts.open > 0).length },
    segments,
    legend,
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
    documents: {
      groups: [
        ...(constitution ? [{ name: "Project", items: [constitution] }] : []),
        ...assessments.map((a) => ({ name: `Assessment: ${a.slug}`, items: a.artifacts })),
      ],
    },
    active: /** @type {any} */ (null),
    totals: computeTotals(features),
    overview: /** @type {any} */ (null), // set once task states are known
    warnings: scanWarnings.filter((w) => !claimed.has(w)),
  };
  project.active = selectActive(project, {
    featureDirectory: scanResult.featureDirectory ?? null,
    gitBranch: scanResult.gitBranch ?? null,
  });
  for (const f of features) f.statusLabel = featureStatusLabel(f, f.dir === project.active.featureDir);
  applyTaskStates(project);
  const ranks = computeRanks(features);
  for (const f of features) {
    f.ranks = /** @type {import("./ranks.js").FeatureRanks} */ (ranks.get(f.dir));
    // After applyTaskStates, so W7 is grouped too.
    f.warningGroups = groupWarnings(f.warnings, new Map(f.artifacts.map((a) => [a.source, a.content])));
  }
  project.overview = overviewStats(features, project.totals);
  return project;
}
