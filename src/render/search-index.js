/**
 * The search index (contracts/search-index.md, research D14, FR-049a):
 * model in, `assets/search-index.json` data out. Pure.
 *
 * Entries are in page order: each feature (folder order) followed by its
 * tasks (file order) and its documents (001 artifact order), each document
 * followed by its `##` and `###` headings; then the project documents
 * (constitution, assessments). Only labels and details are indexed, never
 * the body text of a document (clarified scope).
 *
 * URLs carry no base: the browser prefixes `document.body.dataset.base`.
 * Task URLs point at the task's row on its feature page (`#task-…`, the
 * T014 anchor) or, for a task without an ID (whose row has no id), at its
 * phase (`#phase-<n>`). Heading URLs use the 001 slug the document page
 * gives the heading (`createMarkdown`'s heading ids).
 */

import { createMarkdown } from "./markdown.js";
import { phaseIds } from "./feature.js";
import { displayOf } from "./overview.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("../project/artifacts.js").Artifact} Artifact */

/**
 * @typedef {object} SearchEntry
 * @property {"task" | "feature" | "document" | "heading"} type
 * @property {string} label what the result shows first
 * @property {string} detail task text, feature status and counts, file name
 *   or the heading's document title
 * @property {string} [context] `number · title`, `Project` or `Assessment: <slug>`
 *   (not on features)
 * @property {"done" | "next" | "blocked" | "open"} [state] tasks only
 * @property {string} url page path without base
 * @property {string} terms the lower-cased text that is searched
 */

/**
 * @typedef {object} SearchIndex
 * @property {1} version
 * @property {SearchEntry[]} entries
 */

/**
 * Lower-cased, whitespace collapsed, `·` separators dropped.
 * @param {string} text
 * @returns {string}
 */
export function searchTerms(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s·(?=\s)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * "<number> · <title>", or the title alone without a number.
 * @param {Pick<Feature, "number" | "title">} feature
 * @returns {string}
 */
export function featureLabel(feature) {
  return feature.number ? `${feature.number} · ${feature.title}` : feature.title;
}

/**
 * The file name a document result shows: its path inside the feature or
 * assessment folder (`plan.md`, `contracts/api.md`), else its file name.
 * @param {string} source
 * @returns {string}
 */
function fileName(source) {
  const m = /^(?:specs\/[^/]+|\.specify\/assessments\/[^/]+)\/(.+)$/.exec(source);
  return m ? m[1] : source.slice(source.lastIndexOf("/") + 1);
}

/**
 * @param {any[]} children inline tokens
 * @returns {string}
 */
function inlineText(children) {
  return children
    .filter((t) => t.type === "text" || t.type === "code_inline")
    .map((t) => t.content)
    .join("");
}

/**
 * The `##` and `###` headings of a Markdown document with the id its page
 * gives them (the 001 slug, unique per page).
 * @param {import("./markdown.js").MarkdownRender} md
 * @param {Artifact} artifact
 * @returns {{text: string, anchor: string}[]}
 */
export function documentHeadings(md, artifact) {
  const tokens = md.md.parse(String(artifact.content ?? ""), { source: artifact.source });
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open" || (t.markup !== "##" && t.markup !== "###")) continue;
    const text = inlineText(tokens[i + 1]?.children ?? []).replace(/\s+/g, " ").trim();
    const anchor = t.attrGet("id");
    if (text && anchor) out.push({ text, anchor });
  }
  return out;
}

/**
 * A document entry followed by its heading entries.
 * @param {import("./markdown.js").MarkdownRender} md
 * @param {Artifact} artifact
 * @param {string} context
 * @returns {SearchEntry[]}
 */
function documentEntries(md, artifact, context) {
  const file = fileName(artifact.source);
  /** @type {SearchEntry[]} */
  const out = [
    { type: "document", label: artifact.title, detail: file, context, url: artifact.url, terms: searchTerms(`${artifact.title} ${file}`) },
  ];
  for (const h of documentHeadings(md, artifact)) {
    out.push({ type: "heading", label: h.text, detail: artifact.title, context, url: `${artifact.url}#${h.anchor}`, terms: searchTerms(h.text) });
  }
  return out;
}

/**
 * @param {Project} project
 * @returns {SearchIndex}
 */
export function buildSearchIndex(project) {
  // Heading ids only: links are not rendered, so no artifact map is needed.
  const md = createMarkdown({ artifactsBySource: new Map(), base: "/" });
  /** @type {SearchEntry[]} */
  const entries = [];

  for (const feature of project.features ?? []) {
    const label = featureLabel(feature);
    const page = `features/${feature.dir}/index.html`;
    const counts = feature.counts ?? { done: 0, total: 0 };
    entries.push({
      type: "feature",
      label,
      detail: `${feature.statusLabel ?? ""} · ${counts.done}/${counts.total}`,
      url: page,
      terms: searchTerms(label),
    });

    const phases = feature.phases ?? [];
    const ids = phaseIds(phases);
    phases.forEach((phase, i) => {
      for (const task of phase.tasks ?? []) {
        const id = task.id ?? "No ID";
        entries.push({
          type: "task",
          label: id,
          detail: task.description,
          context: label,
          state: displayOf(task),
          url: `${page}#${task.id ? task.anchor : ids[i]}`,
          terms: searchTerms(`${id} ${task.description}`),
        });
      }
    });

    for (const artifact of feature.artifacts ?? []) {
      if (artifact.url) entries.push(...documentEntries(md, artifact, label));
    }
  }

  if (project.constitution?.url) entries.push(...documentEntries(md, project.constitution, "Project"));
  for (const assessment of project.assessments ?? []) {
    for (const artifact of assessment.artifacts ?? []) {
      if (artifact.url) entries.push(...documentEntries(md, artifact, `Assessment: ${assessment.slug}`));
    }
  }

  return { version: 1, entries };
}
