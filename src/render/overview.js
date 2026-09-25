/**
 * Overview page body (spec FR-015 to FR-019a, contracts/routes.md
 * "Page structure"). Pure: model in, trusted HTML out.
 *
 * No element carries an inline `style` attribute: the serve-mode CSP
 * (`style-src 'self'`) would block it. Everything visual comes from
 * data attributes styled in `src/styles/input.css`.
 */

import { html } from "./html.js";
import { statusOf } from "../model/task-state.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("../model/build-model.js").Phase} Phase */
/** @typedef {import("../model/build-model.js").StoryGroup} StoryGroup */
/** @typedef {import("../model/build-model.js").Task} Task */
/** @typedef {import("../model/build-model.js").Counts} Counts */
/** @typedef {import("./html.js").Raw} Raw */

/** Plain-language stage labels (FR-012). */
export const STAGE_LABELS = {
  empty: "Empty",
  specified: "Specified",
  planned: "Planned",
  ready: "Ready",
  "in-progress": "In progress",
  complete: "Complete",
};

/**
 * Tree status of a feature, from its stage (data-model.md "Stage").
 * @param {Feature} feature
 * @returns {"done" | "started" | "not-started"}
 */
export function featureStatus(feature) {
  if (feature.stage === "complete") return "done";
  if (feature.stage === "in-progress") return "started";
  return "not-started";
}

/**
 * @param {Counts} counts
 * @returns {string} for example "7 open / 10" (FR-019a)
 */
function openOf(counts) {
  return `${counts.open} open / ${counts.total}`;
}

/**
 * Display name of a task: its ID, or `L<line>` when it has none.
 * @param {Task} task
 */
function taskName(task) {
  return task.id ?? `L${task.line}`;
}

/**
 * Heading of a phase: "Phase N · USn – Title (Pn)" for a merged phase,
 * otherwise "Phase N: Title" (FR-015a). The synthetic phase is "Unphased".
 * @param {Phase} phase
 * @returns {string}
 */
export function phaseHeading(phase) {
  const prefix = phase.number === null ? "Unphased" : `Phase ${phase.number}`;
  const story = phase.mergedStory;
  if (story) {
    const priority = story.priority ? ` (${story.priority})` : "";
    return `${prefix} · ${story.label} – ${story.title ?? phase.title}${priority}`;
  }
  return phase.number === null ? prefix : `${prefix}: ${phase.title}`;
}

/**
 * @param {StoryGroup} group
 * @returns {string} "USn – Title (Pn)", or just the label when spec.md has no such story
 */
export function groupHeading(group) {
  if (!group.story) return group.label;
  const priority = group.story.priority ? ` (${group.story.priority})` : "";
  return `${group.label} – ${group.story.title}${priority}`;
}

/**
 * The children of a phase in tree order: unlabeled tasks directly, and each
 * story group at the position of its first task. Without groups, every task.
 * The tree and the grid both use this, so their orders match (FR-015b).
 * @param {Phase} phase
 * @returns {({task: Task, group?: undefined} | {group: StoryGroup, task?: undefined})[]}
 */
export function phaseItems(phase) {
  if (phase.groups.length === 0) return phase.tasks.map((task) => ({ task }));
  const byLabel = new Map(phase.groups.map((g) => [g.label, g]));
  /** @type {({task: Task} | {group: StoryGroup})[]} */
  const items = [];
  const emitted = new Set();
  for (const task of phase.tasks) {
    const group = task.story ? byLabel.get(task.story) : undefined;
    if (!group) items.push({ task });
    else if (!emitted.has(group.label)) {
      emitted.add(group.label);
      items.push({ group });
    }
  }
  return /** @type {any} */ (items);
}

/**
 * Every task in tree order with its parents' keys and headings.
 * @param {Project} project
 */
function tasksInTreeOrder(project) {
  /** @type {{task: Task, feature: Feature, phase: Phase, group: StoryGroup | null}[]} */
  const out = [];
  for (const feature of project.features) {
    for (const phase of feature.phases) {
      for (const item of phaseItems(phase)) {
        if (item.task) out.push({ task: item.task, feature, phase, group: null });
        else for (const task of item.group.tasks) out.push({ task, feature, phase, group: item.group });
      }
    }
  }
  return out;
}

/**
 * @param {Project} project
 * @returns {Task | null}
 */
function nextTask(project) {
  const key = project.active?.nextTaskKey;
  if (!key) return null;
  for (const feature of project.features) {
    for (const phase of feature.phases) {
      const task = phase.tasks.find((t) => t.key === key);
      if (task) return task;
    }
  }
  return null;
}

/**
 * @param {Project} project
 * @returns {Raw}
 */
function renderProgress(project) {
  const { tasks, specs, phases } = project.totals;
  const next = nextTask(project);
  const allDone = tasks.total > 0 && tasks.open === 0;
  const counter = (/** @type {string} */ name, /** @type {string} */ label, /** @type {{completed: number, total: number}} */ c) =>
    html`<li data-counter="${name}"><span data-part="label">${label}</span> <span data-part="value">${c.completed} / ${c.total}</span></li>`;

  return html`<section data-region="progress">
<p data-part="summary">${tasks.done} / ${tasks.total} tasks (${tasks.percent} %)</p>
<progress data-key="project" data-sig="${project.sig ?? ""}" value="${tasks.done}" max="${tasks.total}">${tasks.percent} %</progress>
<ul data-part="counters">
${counter("specs", "Specs", specs)}
${counter("phases", "Phases", phases)}
${counter("tasks", "Tasks", { completed: tasks.done, total: tasks.total })}
</ul>
${next ? html`<p data-part="next">Next: <strong>${taskName(next)}</strong> · ${next.description}</p>` : ""}
${allDone ? html`<p data-part="complete">All tasks are complete.</p>` : ""}
${
  project.features.length === 0
    ? html`<p data-part="empty">This project has no features yet. Each folder under <code>specs/</code> (created by Spec Kit's specify step) appears here as a feature with its progress.</p>`
    : ""
}
</section>`;
}

/**
 * @param {Task} task
 * @param {string | null} nextKey
 * @returns {Raw}
 */
function renderTaskItem(task, nextKey) {
  const isNext = task.key === nextKey;
  return html`<li data-key="${task.key}" data-sig="${task.sig ?? ""}" data-state="${task.state ?? "future"}"><span data-part="id">${taskName(task)}</span> <span data-part="desc">${task.description}</span>${isNext ? html` <span data-part="next">next</span>` : ""}</li>`;
}

/**
 * @param {string} key
 * @param {string} sig
 * @param {string} status
 * @param {boolean} active
 * @param {Raw} summary
 * @param {Raw} body
 * @returns {Raw}
 */
function detailsNode(key, sig, status, active, summary, body) {
  return html`<details data-key="${key}" data-sig="${sig}" data-status="${status}"${active ? html` data-active` : ""}${active ? html` open` : ""}>
<summary>${summary}</summary>
${body}
</details>`;
}

/**
 * @param {Feature} feature
 * @param {Phase} phase
 * @param {Project["active"]} active
 * @returns {Raw}
 */
function renderPhase(feature, phase, active) {
  const phaseActive = feature.dir === active?.featureDir && phase.key === active?.phaseKey;
  const nextKey = active?.nextTaskKey ?? null;
  const children = phaseItems(phase).map((item) => {
    if (item.task) return renderTaskItem(item.task, nextKey);
    const group = item.group;
    const groupActive = phaseActive && group.label === active?.storyLabel;
    return html`<li data-part="group">${detailsNode(
      group.key,
      group.sig ?? "",
      statusOf(group.counts),
      groupActive,
      html`<span data-part="title">${groupHeading(group)}</span> · <span data-part="count">${openOf(group.counts)}</span>`,
      html`<ul data-part="tasks">${group.tasks.map((t) => renderTaskItem(t, nextKey))}</ul>`,
    )}</li>`;
  });
  return html`<li data-part="phase">${detailsNode(
    phase.key,
    phase.sig ?? "",
    statusOf(phase.counts),
    phaseActive,
    html`<span data-part="title">${phaseHeading(phase)}</span> · <span data-part="count">${openOf(phase.counts)}</span>`,
    phase.tasks.length ? html`<ul data-part="tasks">${children}</ul>` : html`<p data-part="no-tasks">No tasks in this phase.</p>`,
  )}</li>`;
}

/**
 * @param {Feature} feature
 * @returns {Raw}
 */
function renderWarnings(feature) {
  if (feature.warnings.length === 0) return html``;
  return html`<ul data-part="warnings">${feature.warnings.map(
    (w) => html`<li>${w.file}${w.line ? `:${w.line}` : ""} ${w.message}</li>`,
  )}</ul>`;
}

/**
 * Links to the feature's present artifacts, in model order (US3 AC1, AC5).
 * @param {Feature} feature
 * @param {string} base
 * @returns {Raw}
 */
function renderArtifactLinks(feature, base) {
  const artifacts = feature.artifacts ?? [];
  if (artifacts.length === 0) return html``;
  return html`<ul data-part="artifacts">${artifacts.map(
    (a) => html`<li><a href="${base}${a.url}" data-kind="${a.kind}">${a.title}</a></li>`,
  )}</ul>`;
}

/**
 * @param {Feature} feature
 * @param {Project["active"]} active
 * @param {string} base
 * @returns {Raw}
 */
function renderFeature(feature, active, base) {
  const isActive = feature.dir === active?.featureDir;
  const n = feature.warnings.length;
  const summary = html`<span data-part="title">${feature.title}</span> · <span data-part="stage">${STAGE_LABELS[feature.stage]}</span> · <span data-part="count">${openOf(feature.counts)}</span>${
    n ? html` <span data-part="warning-count">${n} ${n === 1 ? "warning" : "warnings"}</span>` : ""
  }`;
  const body = html`${renderArtifactLinks(feature, base)}${renderWarnings(feature)}${
    feature.phases.length
      ? html`<ul data-part="phases">${feature.phases.map((p) => renderPhase(feature, p, active))}</ul>`
      : html`<p data-part="no-tasks">${feature.hasTasks ? "tasks.md has no phases yet." : "No tasks.md yet."}</p>`
  }`;
  return detailsNode(feature.dir, feature.sig ?? "", featureStatus(feature), isActive, summary, body);
}

/**
 * @param {Project} project
 * @param {string} base
 * @returns {Raw}
 */
function renderTree(project, base) {
  const projectWarnings = project.warnings ?? [];
  return html`<div data-region="tree">
${project.features.map((f) => renderFeature(f, project.active, base))}
${
  projectWarnings.length
    ? html`<ul data-part="warnings">${projectWarnings.map(
        (w) => html`<li>${w.file}${w.line ? `:${w.line}` : ""} ${w.message}</li>`,
      )}</ul>`
    : ""
}
</div>`;
}

/**
 * One square per task in tree order (FR-015b). No `href` until the click
 * behavior is decided (T034).
 * @param {Project} project
 * @returns {Raw}
 */
function renderGrid(project) {
  const cells = tasksInTreeOrder(project).map(({ task, feature, phase, group }) => {
    const parents = [feature.dir, phase.key, group?.key].filter(Boolean).join(" ");
    const title = `${taskName(task)} · ${task.description} — ${feature.title} › ${phaseHeading(phase)}`;
    return html`<a tabindex="0" data-key="${task.key}" data-sig="${task.sig ?? ""}" data-state="${task.state ?? "future"}" data-parents="${parents}" title="${title}"></a>`;
  });
  return html`<div data-region="grid">${cells}</div>`;
}

/**
 * The inner HTML of `<main>` for the overview page.
 * @param {Project} project
 * @param {{base: string}} [options] normalized base path for the artifact links
 * @returns {Raw}
 */
export function renderOverview(project, { base } = { base: "/" }) {
  return html`${renderProgress(project)}
<div data-region="columns">
${renderTree(project, base)}
${renderGrid(project)}
</div>`;
}
