/**
 * Overview page body (contracts/routes.md "Overview `<main>`", FR-010 to
 * FR-019): page head with the view filter, stats card with the per-feature
 * segmented bar, Up next bar, the feature tree, and the task map in the right
 * column (src/render/taskmap.js). Pure: model in, trusted HTML out.
 *
 * No element carries an inline `style` attribute: the serve-mode CSP
 * (`style-src 'self'`) would block it. Data-driven widths use the
 * `w-pct-<0..100>` classes (research D6); everything else visual comes from
 * data attributes styled in `src/styles/input.css`. Controls that need
 * scripts (view filter, order, depth) are rendered `hidden` and shown by
 * `assets/tree.js` (FR-053).
 */

import { html } from "./html.js";
import { icon } from "./icons.js";
import { formatRange } from "../model/warnings.js";
import { DISPLAY_LABEL } from "../model/task-state.js";
import { ORDER_LABELS } from "../client/tree.js";
import { renderTaskMap } from "./taskmap.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("../model/build-model.js").Phase} Phase */
/** @typedef {import("../model/build-model.js").StoryGroup} StoryGroup */
/** @typedef {import("../model/build-model.js").Task} Task */
/** @typedef {import("../model/build-model.js").Counts} Counts */
/** @typedef {import("./html.js").Raw} Raw */

/** Label of each tree order (FR-012); defined once, in the browser module. */
export { ORDER_LABELS };

/** 001 task state → display state, for models without `display`. */
const DISPLAY_OF = Object.freeze({ completed: "done", current: "next", blocked: "blocked", future: "open" });

/**
 * Tree status of a feature (data-model FeatureStatus), from its stage when
 * the model has no `status`.
 * @param {Pick<Feature, "stage"> & {status?: string}} feature
 * @returns {"done" | "in-progress" | "not-started" | "no-tasks"}
 */
export function featureStatus(feature) {
  if (feature.status) return /** @type {any} */ (feature.status);
  if (feature.stage === "complete") return "done";
  if (feature.stage === "in-progress") return "in-progress";
  if (feature.stage === "ready") return "not-started";
  return "no-tasks";
}

/**
 * Attribute-safe element ids for keys: `prefix` + the key with every
 * character outside `[A-Za-z0-9_-]` replaced by `-`, plus `-2`, `-3`, … when
 * two keys map to the same id.
 * @param {Iterable<string>} keys
 * @param {string} prefix
 * @returns {Map<string, string>} key → id
 */
export function elementIds(keys, prefix) {
  /** @type {Map<string, string>} */
  const ids = new Map();
  const used = new Set();
  for (const key of keys) {
    if (ids.has(key)) continue;
    const base = prefix + key.replace(/[^A-Za-z0-9_-]/g, "-");
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    ids.set(key, id);
  }
  return ids;
}

/**
 * The display state of a task (done, next, blocked, open).
 * @param {Task} task
 * @returns {"done" | "next" | "blocked" | "open"}
 */
export function displayOf(task) {
  if (task.display) return task.display;
  if (task.state) return DISPLAY_OF[task.state];
  return task.done ? "done" : "open";
}

/**
 * The task's fragment on the tree and the feature page.
 * @param {Task} task
 * @returns {string}
 */
export function anchorOf(task) {
  return task.anchor ?? `task-${task.key.replace(/[/@]/g, "-")}`;
}

/**
 * The id of a feature's tree row (target of segment and map bar links).
 * @param {string} dir
 */
export function featureAnchor(dir) {
  return `feature-${dir.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

/**
 * Heading of a phase: "Phase N · USn – Title (Pn)" for a merged phase,
 * otherwise "Phase N: Title" (001 FR-015a). The synthetic phase is "Unphased".
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
 * The next task with its feature and phase, or null.
 * @param {Project} project
 * @returns {{task: Task, feature: Feature, phase: Phase} | null}
 */
function nextEntry(project) {
  const key = project.active?.nextTaskKey;
  if (!key) return null;
  for (const feature of project.features) {
    for (const phase of feature.phases) {
      const task = phase.tasks.find((t) => t.key === key);
      if (task) return { task, feature, phase };
    }
  }
  return null;
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The stats card numbers (data-model OverviewStats), from `project.overview`
 * when present.
 * @param {Project} project
 * @returns {Project["overview"]}
 */
function statsOf(project) {
  if (project.overview) return project.overview;
  const { tasks, specs, phases } = project.totals;
  return {
    percent: tasks.percent,
    done: tasks.done,
    total: tasks.total,
    features: { ...specs, inProgress: project.features.filter((f) => featureStatus(f) === "in-progress").length },
    phases: { ...phases, remaining: phases.total - phases.completed },
    openTasks: { count: tasks.open, features: project.features.filter((f) => f.counts.open > 0).length },
    segments: [],
    legend: { done: tasks.done, open: tasks.open, blocked: 0, next: 0 },
  };
}

/**
 * `<header data-region="page-head">` with the project name, the title and the
 * hidden view filter (FR-010, FR-019).
 * @param {Project} project
 * @returns {Raw}
 */
function renderPageHead(project) {
  return html`<header data-region="page-head">
<p data-part="project-name">${project.name}</p>
<h1>Project overview</h1>
<div role="group" aria-label="Show" data-part="view-filter" hidden><button type="button" class="btn" data-filter="all" aria-pressed="true">All features</button><button type="button" class="btn" data-filter="open" aria-pressed="false">Open tasks only</button></div>
</header>`;
}

/**
 * One segment of the stats bar with its done, open and next parts; its title
 * names the feature and its counts (blocked tasks count as open, FR-011).
 * @param {Project["overview"]["segments"][number]} s
 * @param {Feature | undefined} feature
 * @returns {Raw}
 */
function renderSegment(s, feature) {
  const tasks = feature ? feature.phases.flatMap((p) => p.tasks) : [];
  const next = tasks.filter((t) => !t.done && displayOf(t) === "next").length;
  const open = s.counts.total - s.counts.done - next;
  const label = s.number ? `${s.number} · ${s.title}` : s.title;
  const title = `${label} — ${s.counts.done} done, ${open} open, ${next} next`;
  return html`<a data-key="seg:${s.dir}" data-sig="${feature?.sig ?? ""}" href="#${featureAnchor(s.dir)}" class="w-pct-${s.share} min-w-[3px]" title="${title}" aria-label="${title}"><span data-part="done" class="w-pct-${s.parts.done}"></span><span data-part="open" class="w-pct-${s.parts.open}"></span><span data-part="next" class="w-pct-${s.parts.next}"></span></a>`;
}

/**
 * `<section data-region="stats">` (FR-011).
 * @param {Project} project
 * @returns {Raw}
 */
function renderStats(project) {
  const o = statsOf(project);
  const byDir = new Map(project.features.map((f) => [f.dir, f]));
  const stat = (/** @type {string} */ name, /** @type {string} */ sig, /** @type {Raw} */ body) =>
    html`<div data-stat="${name}" data-key="stat:${name}" data-sig="${sig}">${body}</div>`;

  const counters = html`<div data-part="counters">
${stat("percent", `${o.done}/${o.total}`, html`<span data-part="value">${o.percent} %</span><span data-part="detail">${o.done} of ${plural(o.total, "task", "tasks")}</span>`)}
${stat(
  "features",
  `${o.features.completed}/${o.features.total}:${o.features.inProgress}`,
  html`<span data-part="label">Features</span><span data-part="value">${o.features.completed} / ${o.features.total}</span><span data-part="detail">${o.features.inProgress} in progress</span>`,
)}
${stat(
  "phases",
  `${o.phases.completed}/${o.phases.total}`,
  html`<span data-part="label">Phases</span><span data-part="value">${o.phases.completed} / ${o.phases.total}</span><span data-part="detail">${o.phases.remaining} remaining</span>`,
)}
${stat(
  "open",
  `${o.openTasks.count}:${o.openTasks.features}`,
  html`<span data-part="label">Open tasks</span><span data-part="value">${o.openTasks.count}</span><span data-part="detail">across ${plural(o.openTasks.features, "feature", "features")}</span>`,
)}
</div>`;

  let bar;
  if (o.total === 0 || o.segments.length === 0) {
    bar =
      project.features.length === 0
        ? html`<p data-part="empty">This project has no features yet. Each folder under <code>specs/</code> (created by Spec Kit's specify step) appears here as a feature with its progress.</p>`
        : html`<p data-part="empty">No feature has tasks yet. Progress appears here once a feature has a <code>tasks.md</code> with task checkboxes.</p>`;
  } else {
    bar = html`<div data-part="segments">${o.segments.map((s) => renderSegment(s, byDir.get(s.dir)))}</div>
<div data-part="labels" aria-hidden="true">${o.segments.map(
      (s) => html`<span class="w-pct-${s.share} min-w-[3px]">${s.showLabel && s.number ? s.number : ""}</span>`,
    )}</div>
<ul data-part="legend"><li data-state="done">Done</li><li data-state="open">Open</li><li data-state="next">Next up</li></ul>`;
  }

  return html`<section data-region="stats" aria-label="Progress">
${counters}
${bar}
</section>`;
}

/**
 * Short phase name for the Up next bar: "Phase 3 · Title" or "Unphased".
 * @param {Phase} phase
 */
function phaseLabel(phase) {
  return phase.number === null ? "Unphased" : `Phase ${phase.number} · ${phase.title}`;
}

/**
 * `<section data-region="up-next">` (FR-013).
 * @param {Project} project
 * @param {string} base
 * @returns {Raw}
 */
function renderUpNext(project, base) {
  const entry = nextEntry(project);
  if (!entry) {
    const total = statsOf(project).total;
    const complete = total > 0;
    return html`<section data-region="up-next" class="always-dark" aria-label="Up next" data-empty="${complete ? "complete" : "no-tasks"}">
<span data-part="eyebrow">Up next</span>
<span data-part="text">${
      complete
        ? statsOf(project).done === total
          ? "Every task is complete"
          : "Every task of the active feature is complete"
        : "No tasks yet"
    }</span>
</section>`;
  }
  const { task, feature, phase } = entry;
  const where = `${feature.title} › ${phaseLabel(phase)}`;
  const quickstart = (feature.artifacts ?? []).find((a) => a.kind === "quickstart");
  const featureUrl = `${base}features/${feature.dir}/index.html`;
  return html`<section data-region="up-next" class="always-dark" aria-label="Up next" data-key="up-next" data-sig="${task.key}">
<span data-part="eyebrow">Up next</span>
<span data-part="id" class="chip">${task.id ?? "No ID"}</span>
<span data-part="text" title="${task.description}">${task.description}</span>
<span data-part="where" title="${where}">${where}</span>
<span data-part="actions">${
    quickstart ? html`<a data-part="quickstart" class="btn" href="${base}${quickstart.url}">Open quickstart</a>` : ""
  }<a data-part="view-task" class="btn" href="${featureUrl}#${anchorOf(task)}">View task${icon("arrow-right")}</a></span>
</section>`;
}

/**
 * "done/total" plus a check when complete, or "—" without tasks.
 * @param {Counts} counts
 * @returns {Raw}
 */
function doneOfTotal(counts) {
  if (counts.total === 0) return html`<span data-part="count">—</span>`;
  const complete = counts.open === 0;
  return html`<span data-part="count">${counts.done}/${counts.total}</span>${complete ? html`<span data-part="done-mark">${icon("check", { label: "Complete" })}</span>` : ""}`;
}

/**
 * @param {string | null | undefined} priority
 * @returns {Raw | ""}
 */
function priorityBadge(priority) {
  return priority ? html`<span data-part="priority" data-priority="${priority}">${priority}</span>` : "";
}

/**
 * A task row (FR-017).
 * @param {Task} task
 * @param {Feature} feature
 * @param {string | null} nextKey
 * @param {string} base
 * @returns {Raw}
 */
function renderTaskRow(task, feature, nextKey, base) {
  const state = displayOf(task);
  const isNext = task.key === nextKey;
  const anchor = anchorOf(task);
  const id = task.id
    ? html`<a data-part="id" href="${base}features/${feature.dir}/index.html#${anchor}">${task.id}</a>`
    : html`<span data-part="id">No ID</span>`;
  return html`<li data-key="${task.key}" id="${anchor}" data-state="${state}" data-sig="${task.sig ?? ""}"${isNext ? html` data-next` : ""}><span data-part="mark" data-state="${state}" role="img" aria-label="${DISPLAY_LABEL[state]}"></span>${id}<span data-part="text" title="${task.description}">${task.description}</span>${
    isNext ? html`<span data-part="next">NEXT</span>` : ""
  }</li>`;
}

/**
 * @param {Counts} counts
 * @returns {boolean}
 */
const isComplete = (counts) => counts.total > 0 && counts.open === 0;

/**
 * @param {Counts} counts
 * @returns {"done" | "started" | "not-started"}
 */
function countsStatus(counts) {
  if (isComplete(counts)) return "done";
  if (counts.done > 0) return "started";
  return "not-started";
}

/**
 * A phase row (FR-016): a `<details>` when it has tasks; a plain row with
 * "—" and no chevron when it has none.
 * @param {Feature} feature
 * @param {Phase} phase
 * @param {Project["active"]} active
 * @param {string} base
 * @returns {Raw}
 */
function renderPhase(feature, phase, active, base) {
  const phaseActive = feature.dir === active?.featureDir && phase.key === active?.phaseKey;
  const nextKey = active?.nextTaskKey ?? null;
  const name = phase.number === null ? "Unphased" : `Phase ${phase.number}`;
  const title = phase.number === null ? "" : phase.title;
  const priority = phase.mergedStory?.priority;
  const head = html`<span data-part="phase-name">${name}</span><span data-part="title" title="${title}">${title}</span>${priorityBadge(priority)}${doneOfTotal(phase.counts)}`;

  if (phase.tasks.length === 0) {
    return html`<li data-part="phase"><div data-key="${phase.key}" data-sig="${phase.sig ?? ""}" data-status="${countsStatus(phase.counts)}" data-empty><span data-part="chevron-space"></span>${head}</div></li>`;
  }

  const children = phaseItems(phase).map((item) => {
    if (item.task) return renderTaskRow(item.task, feature, nextKey, base);
    const group = item.group;
    const groupActive = phaseActive && group.label === active?.storyLabel;
    const groupHead = html`${icon("chevron-right")}<span data-part="phase-name">${group.label}</span><span data-part="title" title="${group.story?.title ?? ""}">${group.story?.title ?? ""}</span>${priorityBadge(group.story?.priority)}${doneOfTotal(group.counts)}`;
    return html`<li data-part="group"><details data-key="${group.key}" data-sig="${group.sig ?? ""}" data-status="${countsStatus(group.counts)}"${
      isComplete(group.counts) ? html` data-complete` : ""
    }${groupActive ? html` data-active open` : ""}>
<summary>${groupHead}</summary>
<ul data-part="tasks">${group.tasks.map((t) => renderTaskRow(t, feature, nextKey, base))}</ul>
</details></li>`;
  });

  return html`<li data-part="phase"><details data-key="${phase.key}" data-sig="${phase.sig ?? ""}" data-status="${countsStatus(phase.counts)}"${
    isComplete(phase.counts) ? html` data-complete` : ""
  }${phaseActive ? html` data-active open` : ""}>
<summary>${icon("chevron-right")}${head}</summary>
<ul data-part="tasks">${children}</ul>
</details></li>`;
}

/**
 * The amber warning rows of an expanded feature (FR-015).
 * @param {Feature} feature
 * @param {string} base
 * @returns {Raw | ""}
 */
function renderWarningRows(feature, base) {
  const groups = feature.warningGroups ?? [];
  if (groups.length === 0) return "";
  const href = `${base}features/${feature.dir}/index.html#warnings`;
  return html`<ul data-part="warnings">${groups.map(
    (g) =>
      html`<li><a data-part="warning" data-code="${g.code}" href="${href}">${icon("alert-triangle")}<span data-part="warning-text"><span data-part="warning-title">${g.title}</span> <span data-part="note">— ${g.note}</span></span>${
        g.lines.length ? html`<span data-part="lines">${g.lines.map((r) => html`<span class="chip" data-part="line">${formatRange(r)}</span>`)}</span>` : ""
      }<span data-part="details">Details</span></a></li>`,
  )}</ul>`;
}

/**
 * A feature row with its warning rows and phases (FR-014).
 * @param {Feature} feature
 * @param {Project["active"]} active
 * @param {string} base
 * @returns {Raw}
 */
function renderFeature(feature, active, base) {
  const isActive = feature.dir === active?.featureDir;
  const status = featureStatus(feature);
  const complete = status === "done";
  const warnings = feature.warnings?.length ?? 0;
  const ranks = feature.ranks ?? { progress: 0, number: 0, least: 0, name: 0 };
  const hasTasks = feature.counts.total > 0;
  const summary = html`${icon("chevron-right")}<span data-part="dot" data-status="${status}"></span>${
    feature.number ? html`<span data-part="number" class="chip">${feature.number}</span>` : ""
  }<span data-part="title" title="${feature.title}">${feature.title}</span>${
    warnings ? html`<span data-part="warnings-badge" class="pill" data-status="warning">${plural(warnings, "warning", "warnings")}</span>` : ""
  }<span data-part="pill" class="pill" data-status="${status}">${feature.statusLabel ?? ""}</span>${
    hasTasks
      ? html`<span data-part="bar"><span class="w-pct-${feature.counts.percent}"></span></span><span data-part="count">${feature.counts.done}/${feature.counts.total}</span>`
      : ""
  }<a data-part="open-feature" href="${base}features/${feature.dir}/index.html" aria-label="Open feature page: ${feature.title}" title="Open feature page">${icon("arrow-right")}</a>`;

  const body = feature.phases.length
    ? html`<ul data-part="phases">${feature.phases.map((p) => renderPhase(feature, p, active, base))}</ul>`
    : html`<p data-part="no-tasks">${feature.hasTasks ? "tasks.md has no phases yet." : "No tasks.md yet."}</p>`;

  return html`<li data-feature="${feature.dir}" data-rank-progress="${ranks.progress}" data-rank-number="${ranks.number}" data-rank-least="${ranks.least}" data-rank-name="${ranks.name}"${
    complete ? html` data-complete` : ""
  }><details data-key="${feature.dir}" data-sig="${feature.sig ?? ""}" data-status="${status}" id="${featureAnchor(feature.dir)}"${
    isActive ? html` data-active open` : ""
  }>
<summary>${summary}</summary>
${renderWarningRows(feature, base)}${body}
</details></li>`;
}

/**
 * Features in `ranks.progress` order (folder order without ranks).
 * @param {Feature[]} features
 * @returns {Feature[]}
 */
function progressOrder(features) {
  if (!features.every((f) => typeof f.ranks?.progress === "number")) return [...features];
  return [...features].sort((a, b) => a.ranks.progress - b.ranks.progress);
}

/**
 * `<section data-region="features">` with the header controls and the tree
 * (FR-012, FR-014–FR-018).
 * @param {Project} project
 * @param {string} base
 * @returns {Raw}
 */
function renderFeatures(project, base) {
  const projectWarnings = project.warnings ?? [];
  const depth = [
    ["features", "Features"],
    ["phases", "Phases"],
    ["tasks", "Tasks"],
  ];
  return html`<section data-region="features" aria-labelledby="features-heading">
<header data-part="features-head"><h2 id="features-heading">Features</h2><button type="button" class="btn" data-part="order" data-order="progress" hidden>${icon("sort")}<span data-part="order-label">${ORDER_LABELS.progress}</span></button><div role="group" aria-label="Depth" data-part="depth" hidden>${depth.map(
    ([value, label]) => html`<button type="button" class="btn" data-depth="${value}" aria-pressed="false">${label}</button>`,
  )}</div></header>
<div data-region="tree" data-keep-scroll="tree" data-filter="all">
${
  project.features.length
    ? html`<ul data-part="features">${progressOrder(project.features).map((f) => renderFeature(f, project.active, base))}</ul>`
    : html`<p data-part="empty">No features yet.</p>`
}
${
  projectWarnings.length
    ? html`<ul data-part="project-warnings">${projectWarnings.map(
        (w) => html`<li>${w.file}${w.line ? `:${w.line}` : ""} ${w.message}</li>`,
      )}</ul>`
    : ""
}
</div>
</section>`;
}

/**
 * The inner HTML of `<main>` for the overview page.
 * @param {Project} project
 * @param {{base: string}} [options] normalized base path for links
 * @returns {Raw}
 */
export function renderOverview(project, { base } = { base: "/" }) {
  return html`${renderPageHead(project)}
${renderStats(project)}
${renderUpNext(project, base)}
<div data-region="columns">
${renderFeatures(project, base)}
${renderTaskMap(project, { base })}
</div>`;
}
