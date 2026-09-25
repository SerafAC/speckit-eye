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
 * @param {{slug: string} | null} [options.assessment] the assessment it belongs to
 * @returns {Raw} breadcrumb (Overview › feature title › artifact title) and the article
 */
export function renderArtifact(artifact, bodyHtml, { base, feature = null, assessment = null }) {
  const parent = feature ? feature.title : assessment ? `Assessment: ${assessment.slug}` : null;
  return html`<nav data-region="breadcrumb" aria-label="Breadcrumb"><a href="${base}index.html">Overview</a>${
    parent ? html` <span data-part="sep">›</span> <span data-part="parent">${parent}</span>` : ""
  } <span data-part="sep">›</span> <span data-part="current" aria-current="page">${artifact.title}</span></nav>
<article class="prose" data-region="artifact" data-key="${artifact.source}">
${raw(bodyHtml)}</article>`;
}
