/**
 * Feature page body (contracts/routes.md "Feature page `<main>`", FR-029,
 * FR-030). Pure: model in, trusted HTML of `<main>` out; the shell with the
 * sidebar comes from `layout.js`.
 *
 * For now it renders the header and a plain list of the feature's documents;
 * the tabs, phase rail and task list are added by US3.
 */

import { html } from "./html.js";
import { featureStatusLabel } from "../model/build-model.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("./html.js").Raw} Raw */

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
 * @param {Feature} feature
 * @param {Project} project
 * @param {object} options
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @returns {Raw}
 */
export function renderFeaturePage(feature, project, { base }) {
  const active = project.active?.featureDir === feature.dir;
  const label = feature.stage ? featureStatusLabel(feature, active) : (feature.statusLabel ?? "");
  const status = feature.status ?? "no-tasks";
  const phases = phaseCounts(feature);
  const docs = (feature.artifacts ?? []).filter((a) => a.url);

  return html`<header data-region="feature-head">
<nav data-part="breadcrumb" aria-label="Breadcrumb"><a href="${base}index.html">Overview</a> <span data-part="sep">/</span> <span>Features</span></nav>
<p data-part="meta"><span class="pill" data-status="${status}">${label}</span> <code>${feature.dir}</code></p>
<h1>${feature.title}</h1>
<p data-part="counts">${feature.counts.done} / ${feature.counts.total} tasks · ${phases.completed} of ${phases.total} phases</p>
</header>
<section data-region="documents" aria-label="Documents">${
    docs.length
      ? html`<ul>${docs.map((a) => html`<li><a href="${base}${a.url}">${a.title}</a></li>`)}</ul>`
      : html`<p data-part="empty">No documents.</p>`
  }</section>`;
}
