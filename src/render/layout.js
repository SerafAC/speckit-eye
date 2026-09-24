/**
 * Shared page shell (contracts/routes.md "Page structure"). Pure.
 * All internal links are absolute and start with `base` (research R10).
 */

import { html, raw } from "./html.js";

/** @typedef {import("../model/build-model.js").Project} Project */

/**
 * @param {object} options
 * @param {string} options.title page title (plain text)
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @param {"serve" | "static"} options.mode
 * @param {Project} options.project
 * @param {string | import("./html.js").Raw} options.main trusted inner HTML of `<main>`
 * @param {string} options.version
 * @param {string | null} [options.generatedAt] ISO time (static mode footer, added later)
 * @returns {string} a complete HTML document
 */
export function renderPage({ title, base, mode, project, main, version }) {
  const link = (/** @type {string} */ url) => `${base}${url}`;
  const headerLinks = [];
  if (project.constitution) {
    headerLinks.push(html`<a href="${link(project.constitution.url)}">Constitution</a>`);
  }
  for (const a of project.assessments) {
    const first = a.artifacts[0];
    if (first) headerLinks.push(html`<a href="${link(first.url)}">Assessment: ${a.slug}</a>`);
  }

  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="${link("assets/styles.css")}">
<script src="${link("assets/overview.js")}" defer></script>
</head>
<body data-mode="${mode}" data-version="${version}">
<header data-region="header">
<a href="${link("index.html")}" data-region="project-name">${project.name}</a>
${headerLinks.length ? html`<nav>${headerLinks}</nav>` : ""}
</header>
<main>${raw(main)}</main>
<footer>speckit-eye ${version}</footer>
</body>
</html>
`.value;
}
