/**
 * The overview task map (FR-021 to FR-023, FR-027, FR-028;
 * contracts/routes.md "Overview `<main>`"): one square per task — checkboxes
 * without a task ID included — in folder and task order, never the tree
 * order. Pure: model in, trusted HTML out.
 *
 * Layouts (FR-027): `stacked` up to `MAP_GROUPED_THRESHOLD` tasks, `grouped`
 * ("By feature") up to `MAP_BARS_THRESHOLD`, and `bars` above it. The
 * stacked and grouped layouts share one markup — a block per feature with
 * its name, done/total and squares — and differ only in `data-layout`: the
 * stacked layout flattens the blocks by CSS, so `assets/taskmap.js` can
 * switch modes without re-rendering. The mode toggle is rendered `hidden`
 * and shown by that module (FR-053); `bars` has no toggle.
 *
 * Without scripts every square keeps its state color, a native `title`
 * naming its task, and an `href` to the task row in the tree (FR-028).
 * No element carries a `style` attribute (CSP); bar widths use `w-pct-N`.
 */

import { html } from "./html.js";
import { icon } from "./icons.js";
import { DISPLAY_LABEL } from "../model/task-state.js";
import { displayOf, anchorOf, featureAnchor } from "./overview.js";
import { MODE_LABELS } from "../client/taskmap.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("../model/build-model.js").Phase} Phase */
/** @typedef {import("../model/build-model.js").Task} Task */
/** @typedef {import("./html.js").Raw} Raw */
/** @typedef {"stacked" | "grouped" | "bars"} MapLayout */

/** Above this many tasks in total the map opens "By feature" (FR-027). */
export const MAP_GROUPED_THRESHOLD = 1000;

/** Above this many tasks in total the map shows one progress bar per feature (FR-027). */
export const MAP_BARS_THRESHOLD = 5000;

/**
 * The map layout for a project with `total` tasks.
 * @param {number} total
 * @returns {MapLayout}
 */
export function mapLayout(total) {
  if (total > MAP_BARS_THRESHOLD) return "bars";
  if (total > MAP_GROUPED_THRESHOLD) return "grouped";
  return "stacked";
}

/** Text of the mode toggle in each mode (FR-021); defined once, in the browser module. */
export { MODE_LABELS };

/**
 * The native tooltip and accessible name of a square:
 * "<ID or No ID> · <state label> — <text> — <feature>".
 * @param {Task} task
 * @param {Feature} feature
 * @returns {string}
 */
export function squareTitle(task, feature) {
  return `${task.id ?? "No ID"} · ${DISPLAY_LABEL[displayOf(task)]} — ${task.description} — ${feature.title}`;
}

/**
 * The tree keys a square's task sits under: feature, phase and, when the
 * task belongs to a story group of its phase, that group.
 * @param {Feature} feature
 * @param {Phase} phase
 * @param {Task} task
 * @returns {string}
 */
function parentsOf(feature, phase, task) {
  const group = task.story ? phase.groups.find((g) => g.label === task.story) : undefined;
  return [feature.dir, phase.key, group?.key].filter(Boolean).join(" ");
}

/**
 * One square: a link to the task row in the tree. `tabindex="0"` makes it a
 * Tab stop in every engine: WebKit leaves plain links out of the Tab order
 * unless the viewer turned on Option+Tab (FR-050). The `title` is also its
 * accessible name (an empty link is named by its title), so the square
 * carries no copy of it in `aria-label`: 2,000 squares would add about
 * 140 KB to the overview (SC-007).
 * @param {Task} task
 * @param {Feature} feature
 * @param {Phase} phase
 * @returns {Raw}
 */
function renderSquare(task, feature, phase) {
  const title = squareTitle(task, feature);
  return html`<a data-key="${task.key}" data-sig="${task.sig ?? ""}" data-state="${displayOf(task)}" data-parents="${parentsOf(feature, phase, task)}" href="#${anchorOf(task)}" tabindex="0" title="${title}"></a>`;
}

/**
 * A feature's block: name, done/total and its squares in task order.
 * @param {Feature} feature
 * @returns {Raw}
 */
function renderGroup(feature) {
  const squares = feature.phases.flatMap((phase) => phase.tasks.map((task) => renderSquare(task, feature, phase)));
  return html`<div data-part="group" data-key="map:${feature.dir}"><div data-part="group-head"><span data-part="name" title="${feature.title}">${feature.title}</span><span data-part="count">${feature.counts.done}/${feature.counts.total}</span></div><div data-part="squares">${squares}</div></div>`;
}

/**
 * One progress bar per feature, linking to the feature in the tree.
 * @param {Feature} feature
 * @returns {Raw}
 */
function renderBar(feature) {
  const label = `${feature.title} · ${feature.counts.done} / ${feature.counts.total}`;
  return html`<a data-part="bar" data-key="map:${feature.dir}" data-sig="${feature.sig ?? ""}" href="#${featureAnchor(feature.dir)}" title="${label}"><span data-part="label">${label}</span><span data-part="track"><span class="w-pct-${feature.counts.percent}"></span></span></a>`;
}

/**
 * Legend counts: `project.overview.legend`, or one computed from the tasks.
 * @param {Project} project
 * @returns {{done: number, open: number, blocked: number, next: number}}
 */
function legendOf(project) {
  if (project.overview?.legend) return project.overview.legend;
  const legend = { done: 0, open: 0, blocked: 0, next: 0 };
  for (const f of project.features) for (const p of f.phases) for (const t of p.tasks) legend[displayOf(t)]++;
  return legend;
}

/**
 * `<ul data-part="legend">` (FR-023): counts per state and what one mark is.
 * @param {Project} project
 * @param {MapLayout} layout
 * @returns {Raw}
 */
function renderLegend(project, layout) {
  const legend = legendOf(project);
  const items = /** @type {const} */ (["done", "open", "blocked", "next"]).map(
    (state) => html`<li data-state="${state}"><span data-part="swatch"></span>${DISPLAY_LABEL[state]} <span data-part="count">${legend[state]}</span></li>`,
  );
  const unit = layout === "bars" ? "1 bar = 1 feature" : "1 dot = 1 task";
  return html`<ul data-part="legend">${items}<li data-part="unit">${unit}</li></ul>`;
}

/**
 * `<section data-region="taskmap">`: header with the title and the hidden
 * mode toggle above the card; the card holds the map and its legend.
 * @param {Project} project
 * @param {{base?: string}} [_options] kept for symmetry with the other renderers; map links are fragments
 * @returns {Raw}
 */
export function renderTaskMap(project, _options = {}) {
  const withTasks = project.features.filter((f) => f.counts.total > 0);
  const total = withTasks.reduce((n, f) => n + f.counts.total, 0);
  const layout = mapLayout(total);

  const toggle =
    layout === "bars"
      ? ""
      : html`<button type="button" class="btn" data-part="map-mode" aria-pressed="${layout === "grouped" ? "true" : "false"}" hidden>${icon("grid")}<span data-part="mode-label">${MODE_LABELS[/** @type {"stacked" | "grouped"} */ (layout)]}</span></button>`;

  let body;
  if (total === 0) {
    body = html`<p data-part="empty">No tasks yet. Every task checkbox of a <code>tasks.md</code> appears here as one square.</p>`;
  } else if (layout === "bars") {
    body = html`<div data-part="bars">${withTasks.map(renderBar)}</div>
${renderLegend(project, layout)}`;
  } else {
    body = html`<div data-part="grid">${withTasks.map(renderGroup)}</div>
${renderLegend(project, layout)}`;
  }

  return html`<section data-region="taskmap" data-layout="${layout}" aria-labelledby="taskmap-heading">
<header data-part="taskmap-head"><h2 id="taskmap-heading">Task map</h2>${toggle}</header>
<div data-part="card">
${body}
</div>
</section>`;
}
