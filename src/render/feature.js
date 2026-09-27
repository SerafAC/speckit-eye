/**
 * Feature page body (contracts/routes.md "Feature page `<main>`", FR-029 to
 * FR-037). Pure: model in, trusted HTML of `<main>` out; the shell with the
 * sidebar comes from `layout.js`.
 *
 * - Header: breadcrumb, status pill, folder, title, counts and a progress
 *   ring (FR-030).
 * - Document tabs (FR-031): Tasks (this page) then one tab per document kind;
 *   a tab with several documents is a `<details>` menu listing them (FR-008).
 * - Tasks tab: phase rail, warnings banner, filter bar (shown by
 *   src/client/feature.js), the phase accordion of task rows, and the detail
 *   panel host (FR-032 to FR-036). Without scripts every phase and task row
 *   still opens and closes as `<details>` and every link works (FR-053).
 */

import { html, raw } from "./html.js";
import { icon } from "./icons.js";
import { createMarkdown } from "./markdown.js";
import { renderTaskText, renderKindChip, renderFileChip, renderMarkers } from "./task-text.js";
import { featureStatusLabel } from "../model/build-model.js";
import { statusOf, DISPLAY_LABEL } from "../model/task-state.js";
import { formatRange } from "../model/warnings.js";
import { kindChips as kindChipsOf } from "../model/task-files.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("../model/build-model.js").Phase} Phase */
/** @typedef {import("../model/build-model.js").Task} Task */
/** @typedef {import("./html.js").Raw} Raw */
/** @typedef {import("./markdown.js").MarkdownRender} MarkdownRender */

/**
 * Phases that have tasks, and how many of them have no open task.
 * @param {Feature} feature
 * @returns {{completed: number, total: number}}
 */
export function phaseCounts(feature) {
  let completed = 0;
  let total = 0;
  for (const p of feature.phases ?? []) {
    if (p.counts.total === 0) continue;
    total++;
    if (p.counts.open === 0) completed++;
  }
  return { completed, total };
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The element id of each phase: `phase-<n>` (`phase-u` for Unphased), with
 * `-2`, `-3`, … for repeated phase numbers.
 * @param {Phase[]} phases
 * @returns {string[]}
 */
export function phaseIds(phases) {
  const used = new Set();
  return phases.map((p) => {
    const base = `phase-${p.number ?? "u"}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

/**
 * "Phase 4: Title", or "Unphased".
 * @param {Phase} phase
 */
export function phaseName(phase) {
  return phase.number === null ? "Unphased" : `Phase ${phase.number}: ${phase.title}`;
}

/**
 * The phase open on load: the active phase for the active feature, the
 * first phase with open tasks for any other, none when nothing is open
 * (FR-032).
 * @param {Feature} feature
 * @param {Project} project
 * @returns {string | null} phase key
 */
export function openPhaseKey(feature, project) {
  if (project.active?.featureDir === feature.dir && project.active.phaseKey) return project.active.phaseKey;
  return feature.phases.find((p) => p.counts.open > 0)?.key ?? null;
}

/**
 * The progress ring: a circle of circumference 100 so the dash is the
 * percentage; a check mark when complete, the percentage otherwise.
 * @param {Feature} feature
 * @returns {Raw}
 */
function renderRing(feature) {
  const { percent, total, open } = feature.counts;
  const complete = total > 0 && open === 0;
  return html`<div data-part="ring" data-complete="${String(complete)}"><svg viewBox="0 0 36 36" width="56" height="56" aria-hidden="true"><circle data-part="ring-track" cx="18" cy="18" r="15.9155" fill="none" stroke-width="3"/><circle data-part="ring-value" cx="18" cy="18" r="15.9155" fill="none" stroke-width="3" stroke-linecap="round" stroke-dasharray="${percent} 100" transform="rotate(-90 18 18)"/></svg><span data-part="ring-label">${
    complete ? icon("check", { size: 20, label: "Complete" }) : html`${percent} %`
  }</span></div>`;
}

/**
 * `<header data-region="feature-head">` (FR-030).
 * @param {Feature} feature
 * @param {Project} project
 * @param {string} base
 * @returns {Raw}
 */
function renderHead(feature, project, base) {
  const active = project.active?.featureDir === feature.dir;
  const label = feature.stage ? featureStatusLabel(feature, active) : (feature.statusLabel ?? "");
  const status = feature.status ?? "no-tasks";
  const phases = phaseCounts(feature);
  return html`<header data-region="feature-head">
<div data-part="head-text">
<nav data-part="breadcrumb" aria-label="Breadcrumb"><a href="${base}index.html">Overview</a> <span data-part="sep">/</span> <span>Features</span></nav>
<p data-part="meta"><span class="pill" data-status="${status}">${label}</span> <code>${feature.dir}</code></p>
<h1>${feature.title}</h1>
<p data-part="counts">${feature.counts.done} / ${feature.counts.total} tasks · ${phases.completed} of ${phases.total} phases</p>
</div>
${renderRing(feature)}
</header>`;
}

/**
 * `<nav data-region="tabs">` (FR-031, FR-008).
 * @param {Feature} feature
 * @param {string} base
 * @returns {Raw}
 */
function renderTabs(feature, base) {
  const tabs = feature.documents?.tabs ?? [];
  const counted = new Set(["Contracts", "Checklists", "More"]);
  const count = (/** @type {number} */ n) => html` <span data-part="count">${n}</span>`;
  return html`<nav data-region="tabs" aria-label="Documents">
<a data-part="tab" href="${base}features/${feature.dir}/index.html" aria-current="page">Tasks${count(feature.counts.total)}</a>${tabs.map((tab) => {
    const label = html`${tab.label}${counted.has(tab.label) ? count(tab.count) : ""}`;
    if (tab.items.length === 1) return html`<a data-part="tab" href="${base}${tab.items[0].url}">${label}</a>`;
    return html`<details data-part="tab-menu"><summary data-part="tab">${label}</summary><ul>${tab.items.map(
      (a) => html`<li><a href="${base}${a.url}">${a.title}</a></li>`,
    )}</ul></details>`;
  })}
</nav>`;
}

/**
 * The phase rail and its caption (FR-032).
 * @param {Feature} feature
 * @param {string[]} ids
 * @param {string | null} openKey
 * @returns {Raw}
 */
function renderRail(feature, ids, openKey) {
  const shares = feature.phaseShares ?? [];
  const open = feature.phases.find((p) => p.key === openKey) ?? null;
  const blocks = feature.phases.map((p, i) => {
    const short = p.number === null ? "U" : `P${p.number}`;
    const title = `${phaseName(p)} · ${plural(p.counts.total, "task", "tasks")}`;
    const inner = html`<span data-part="short">${short}</span><span data-part="count">${p.counts.total}</span>`;
    if (p.tasks.length === 0) {
      return html`<span data-part="block" class="w-pct-0" data-status="empty" data-empty title="${title}">${inner}</span>`;
    }
    return html`<a data-part="block" href="#${ids[i]}" class="w-pct-${shares[i] ?? 0}" data-status="${statusOf(p.counts)}" data-phase-key="${p.key}" title="${title}"${
      p.key === openKey ? raw(' aria-current="true"') : ""
    }>${inner}</a>`;
  });
  return html`<nav data-part="rail" aria-label="Phases">${blocks}</nav>
<p data-part="caption">Width = task count · Selected: <span data-part="selected">${open ? phaseName(open) : "None"}</span></p>`;
}

/**
 * The amber warnings banner (FR-033).
 * @param {Feature} feature
 * @returns {Raw | ""}
 */
function renderWarnings(feature) {
  const groups = feature.warningGroups ?? [];
  if (groups.length === 0) return "";
  return html`<section id="warnings" data-part="warnings" aria-label="Warnings">${groups.map(
    (g) => html`<div data-part="warning" data-code="${g.code}">${icon("alert-triangle")}<div data-part="warning-body"><p><span data-part="warning-title">${g.title}</span> <span data-part="note">— ${g.note}</span>${
      g.lines.length ? html` <span data-part="lines">${g.lines.map((r) => html`<span class="chip" data-part="line">${formatRange(r)}</span>`)}</span>` : ""
    }</p>${
      g.sourceLines.length
        ? html`<details data-part="show-lines"><summary>Show lines</summary><ol>${g.sourceLines.map(
            (l) => html`<li><span data-part="line-no">L${l.line}</span> <code>${l.text}</code></li>`,
          )}</ol></details>`
        : ""
    }</div></div>`,
  )}</section>`;
}

/**
 * The filter bar, hidden until src/client/feature.js runs (FR-034).
 * @param {Feature} feature
 * @param {Task[]} tasks
 * @returns {Raw}
 */
function renderFilters(feature, tasks) {
  const kinds = feature.kindChips ?? kindChipsOf(tasks);
  const chip = (/** @type {string} */ value, /** @type {string} */ label, /** @type {number} */ n, pressed = false) =>
    html`<button type="button" class="chip" data-filter-chip="${value}" aria-pressed="${String(pressed)}">${label} <span data-part="count">${n}</span></button>`;
  return html`<div data-part="filters" hidden>
<div role="group" aria-label="Filter tasks" data-part="chips">${chip("all", "All", tasks.length, true)}${chip(
    "open",
    "Open",
    tasks.filter((t) => !t.done).length,
  )}${chip("tests", "Tests", tasks.filter((t) => t.kind?.test).length)}${kinds.map((k) =>
    chip(`kind:${k}`, k, tasks.filter((t) => t.kind?.label === k).length),
  )}</div>
<input type="search" data-part="text-filter" aria-label="Filter by ID, text or file" placeholder="Filter by ID, text or file">
<button type="button" data-part="expand-all">Expand all</button><button type="button" data-part="collapse-all">Collapse all</button>
</div>`;
}

/**
 * A task row (FR-035, FR-036).
 * @param {Task} task
 * @param {Phase} phase
 * @param {MarkdownRender} md
 * @returns {Raw}
 */
function renderTask(task, phase, md) {
  const state = task.display ?? (task.done ? "done" : "open");
  const attrs = html` data-key="${task.key}"${task.id ? html` id="${task.anchor}"` : ""} data-state="${state}" data-sig="${task.sig ?? ""}" data-id="${task.id ?? ""}" data-kind="${task.kind?.label ?? ""}"${
    task.kind?.test ? raw(" data-test") : ""
  } data-files="${(task.files ?? []).join(" ")}" data-text="${`${task.id ?? ""} ${task.description}`.toLowerCase()}" data-waiting-on="${(task.waitingOn ?? []).join(" ")}" data-line="${task.line}" data-phase="${phaseName(phase)}"`;
  const text = renderTaskText(md, task);
  return html`<details data-part="task"${attrs}>
<summary>${icon("chevron-right")}<span data-part="mark" data-state="${state}" role="img" aria-label="${DISPLAY_LABEL[state]}"></span><span data-part="id">${task.id ?? "No ID"}</span><span data-part="text">${text}</span>${renderKindChip(task)}${renderFileChip(task)}</summary>
<div data-part="body"><p data-part="full-text">${text}</p>${renderMarkers(task)}</div>
</details>`;
}

/**
 * A phase of the accordion: `<details name="phases">`, or a plain row
 * without a chevron when it has no tasks (FR-032).
 * @param {Phase} phase
 * @param {string} id
 * @param {boolean} open
 * @param {MarkdownRender} md
 * @returns {Raw}
 */
function renderPhase(phase, id, open, md) {
  const priority = phase.mergedStory?.priority;
  const complete = phase.counts.total > 0 && phase.counts.open === 0;
  const head = html`<span data-part="phase-name">${phase.number === null ? "Unphased" : `Phase ${phase.number}`}</span><span data-part="title" title="${phase.title}">${
    phase.number === null ? "" : phase.title
  }</span>${priority ? html`<span data-part="priority" data-priority="${priority}">${priority}</span>` : ""}${
    phase.counts.total === 0
      ? html`<span data-part="count">—</span>`
      : html`<span data-part="count">${phase.counts.done}/${phase.counts.total}</span>${complete ? html`<span data-part="done-mark">${icon("check", { label: "Complete" })}</span>` : ""}`
  }`;
  if (phase.tasks.length === 0) {
    return html`<div data-part="phase" data-key="${phase.key}" id="${id}" data-status="empty" data-empty><span data-part="chevron-space"></span>${head}</div>`;
  }
  return html`<details name="phases" data-part="phase" data-key="${phase.key}" id="${id}" data-status="${statusOf(phase.counts)}" data-sig="${phase.sig ?? ""}"${
    open ? raw(" open") : ""
  }>
<summary>${icon("chevron-right")}${head}</summary>
<div data-part="tasks">${phase.tasks.map((t) => renderTask(t, phase, md))}</div>
</details>`;
}

/**
 * The empty Tasks tab of a feature without tasks, explaining its stage.
 * @param {Feature} feature
 * @returns {string}
 */
export function emptyStageText(feature) {
  if (feature.hasTasks) return "tasks.md has no tasks yet.";
  switch (feature.stage) {
    case "planned":
      return "Planned: this feature has a plan but no tasks.md yet.";
    case "specified":
      return "Specified: this feature has a specification but no plan or tasks.md yet.";
    default:
      return "Empty: this feature has no specification, plan or tasks.md yet.";
  }
}

/**
 * The detail panel host, filled by src/client/feature.js (FR-036).
 * @param {Feature} feature
 * @param {string} base
 * @returns {Raw}
 */
function renderDetail(feature, base) {
  const tasksDoc = (feature.artifacts ?? []).find((a) => a.kind === "tasks" && a.url);
  return html`<aside data-region="detail" aria-label="Task details" data-source="${tasksDoc ? `${base}${tasksDoc.url}` : ""}" hidden>
<header><span data-part="mark" role="img"></span><span data-part="id"></span><span class="pill" data-part="status"></span><button type="button" data-part="close" aria-label="Close details">${icon("x")}</button></header>
<div data-part="text"></div>
<p data-part="waiting" hidden></p>
<dl>
<dt>Phase</dt><dd data-part="phase"></dd>
<dt>Markers</dt><dd data-part="markers"></dd>
<dt>Files</dt><dd><ul data-part="files"></ul></dd>
</dl>
<div data-part="actions"><button type="button" data-part="copy">${icon("copy")}Copy ID</button><span data-part="copied" role="status" hidden>Copied</span>${
    tasksDoc ? html`<a data-part="source-line" href="${base}${tasksDoc.url}">View source line</a>` : ""
  }</div>
</aside>`;
}

/**
 * `<section data-region="tasks">`: the Tasks tab (FR-032 to FR-036).
 * @param {Feature} feature
 * @param {Project} project
 * @param {string} base
 * @param {MarkdownRender} md
 * @returns {Raw}
 */
function renderTasksTab(feature, project, base, md) {
  const tasks = feature.phases.flatMap((p) => p.tasks);
  const tasksDoc = (feature.artifacts ?? []).find((a) => a.kind === "tasks" && a.url);
  const source = tasksDoc ? html`<a data-part="source" href="${base}${tasksDoc.url}">${icon("file-text")}tasks.md</a>` : "";
  if (tasks.length === 0) {
    return html`<section data-region="tasks" aria-label="Tasks">${renderWarnings(feature)}<p data-part="empty-stage">${emptyStageText(feature)}</p>${source}</section>`;
  }
  const ids = phaseIds(feature.phases);
  const openKey = openPhaseKey(feature, project);
  return html`<section data-region="tasks" aria-label="Tasks">
${renderRail(feature, ids, openKey)}
${renderWarnings(feature)}
${renderFilters(feature, tasks)}
<div data-part="columns">
<div data-part="list" data-keep-scroll="tasks">${feature.phases.map((p, i) => renderPhase(p, ids[i], p.key === openKey, md))}
<p data-part="no-match" hidden>No tasks match the filters. <button type="button" data-part="clear">Clear filters</button></p>
${source}</div>
${renderDetail(feature, base)}
</div>
</section>`;
}

/**
 * @param {Feature} feature
 * @param {Project} project
 * @param {object} options
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @param {MarkdownRender} [options.markdown] the site's Markdown renderer
 *   (task texts link like documents); one is created from the feature's
 *   artifacts when omitted
 * @returns {Raw}
 */
export function renderFeaturePage(feature, project, { base, markdown }) {
  const md =
    markdown ??
    createMarkdown({
      artifactsBySource: new Map((feature.artifacts ?? []).filter((a) => a.url).map((a) => [a.source, a])),
      base,
    });
  return html`${renderHead(feature, project, base)}
${renderTabs(feature, base)}
${renderTasksTab(feature, project, base, md)}`;
}
