/**
 * Task states (FR-015b) and change signatures (FR-028; data-model.md
 * "TaskState" and "Change signature"). Mutates the project in place.
 */

import { compareWarnings } from "../project/scan.js";

/** @typedef {import("./build-model.js").Project} Project */
/** @typedef {import("./build-model.js").Feature} Feature */
/** @typedef {import("./build-model.js").Counts} Counts */
/** @typedef {import("./build-model.js").Task} Task */

/**
 * not-started / started / done, from counts (routes.md `data-status`).
 * @param {Counts} counts
 * @returns {"done" | "started" | "not-started"}
 */
export function statusOf(counts) {
  if (counts.total > 0 && counts.open === 0) return "done";
  if (counts.done > 0) return "started";
  return "not-started";
}

/**
 * @param {Counts} counts
 * @param {string} status
 * @param {boolean} active
 * @returns {string}
 */
function sigOf(counts, status, active) {
  return `${counts.done}/${counts.total}:${status}${active ? ":a" : ""}`;
}

/**
 * @param {Task} task
 * @returns {string}
 */
function taskName(task) {
  return task.id ?? `L${task.line}`;
}

/**
 * Sets `state` on every task, adds W7 for a current task with an open
 * dependency, and sets `sig` on the project, features, phases, groups and tasks.
 * Requires `project.active` (selectActive). Idempotent.
 * @param {Project} project
 * @returns {Project}
 */
export function applyTaskStates(project) {
  const active = project.active ?? { featureDir: null, phaseKey: null, storyLabel: null, nextTaskKey: null };

  for (const feature of project.features) {
    const tasks = feature.phases.flatMap((p) => p.tasks);
    /** @type {Map<string, boolean>} id → true when any task with that ID is open */
    const openById = new Map();
    for (const t of tasks) {
      if (t.id === null) continue;
      openById.set(t.id, (openById.get(t.id) ?? false) || !t.done);
    }

    feature.warnings = feature.warnings.filter((w) => w.code !== "W7");
    /** @type {import("../project/scan.js").Warning[]} */
    const w7 = [];

    for (const t of tasks) {
      const openDeps = t.dependsOn.filter((id) => openById.get(id) === true);
      if (t.done) t.state = "completed";
      else if (t.key === active.nextTaskKey) {
        t.state = "current";
        for (const dep of openDeps) {
          w7.push({
            code: "W7",
            file: `specs/${feature.dir}/tasks.md`,
            line: t.line,
            message: `next task ${taskName(t)} depends on open task ${dep}`,
          });
        }
      } else if (openDeps.length > 0) t.state = "blocked";
      else t.state = "future";
      t.sig = `${t.state}${t.key === active.nextTaskKey ? ":a" : ""}`;
    }

    if (w7.length > 0) {
      feature.warnings = [...feature.warnings, ...w7].sort(compareWarnings);
    }

    const featureActive = feature.dir === active.featureDir;
    for (const phase of feature.phases) {
      const phaseActive = featureActive && phase.key === active.phaseKey;
      phase.sig = sigOf(phase.counts, statusOf(phase.counts), phaseActive);
      for (const group of phase.groups) {
        group.sig = sigOf(group.counts, statusOf(group.counts), phaseActive && group.label === active.storyLabel);
      }
    }
    feature.sig = sigOf(feature.counts, feature.stage, featureActive);
  }

  const t = project.totals;
  project.sig = `${t.tasks.done}/${t.tasks.total}:${t.specs.completed}/${t.specs.total}:${t.phases.completed}/${t.phases.total}:${active.featureDir ?? "-"}`;
  return project;
}
