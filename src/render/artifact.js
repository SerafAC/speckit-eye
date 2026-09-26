/**
 * Artifact page body (spec US3, contracts/routes.md "Page structure"). Pure:
 * returns the inner HTML of `<main>`; the page shell with the header, menu and
 * footer comes from `layout.js`.
 */

import { html, raw } from "./html.js";

/** @typedef {import("../project/artifacts.js").Artifact} Artifact */
/** @typedef {import("./html.js").Raw} Raw */

/**
 * @param {Artifact} artifact
 * @param {string | Raw} bodyHtml trusted HTML of the rendered Markdown
 * @param {object} options
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @param {{title: string} | null} [options.feature] the feature the artifact belongs to
 * @param {{slug: string, artifacts?: Artifact[]} | null} [options.assessment] the assessment it belongs to
 * @returns {Raw} breadcrumb (Overview › feature title › artifact title), the
 *   sibling document list (assessment and constitution pages) and the article
 */
export function renderArtifact(artifact, bodyHtml, { base, feature = null, assessment = null }) {
  const parent = feature ? feature.title : assessment ? `Assessment: ${assessment.slug}` : null;
  return html`<nav data-region="breadcrumb" aria-label="Breadcrumb"><a href="${base}index.html">Overview</a>${
    parent ? html` <span data-part="sep">›</span> <span data-part="parent">${parent}</span>` : ""
  } <span data-part="sep">›</span> <span data-part="current" aria-current="page">${artifact.title}</span></nav>
${renderSiblings(artifact, { base, assessment })}<article class="prose" data-region="artifact" data-key="${artifact.source}">
${raw(bodyHtml)}</article>`;
}

/**
 * Interim list of sibling documents (decisions.md, T023) so that every
 * assessment document stays reachable (SC-004) while the shell links only each
 * assessment's first document. Replaced by the document list of T061 (US5).
 * @param {Artifact} artifact
 * @param {{base: string, assessment: {slug: string, artifacts?: Artifact[]} | null}} options
 * @returns {Raw | string} the list, or "" for feature documents
 */
function renderSiblings(artifact, { base, assessment }) {
  const docs = assessment ? (assessment.artifacts ?? []) : artifact.kind === "constitution" ? [artifact] : [];
  const linked = docs.filter((doc) => doc.url);
  if (linked.length === 0) return "";
  return html`<nav data-region="siblings" aria-label="Documents"><ul>${linked.map(
    (doc) =>
      html`<li><a href="${base}${doc.url}"${doc.source === artifact.source ? raw(' aria-current="page"') : ""}>${doc.title}</a></li>`,
  )}</ul></nav>
`;
}
