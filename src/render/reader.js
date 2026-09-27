/**
 * Document page body: the reader layout (FR-038 to FR-041, FR-044;
 * contracts/routes.md "Document page `<main>`"). Pure: returns the inner HTML
 * of `<main>`; the page shell with the icon rail comes from `layout.js`
 * (`renderPage({ page: "document" })`).
 *
 * - `<nav data-region="doc-list">`: back link, the feature's title and
 *   status and its documents grouped Define / Design / Contracts / Build /
 *   Other (empty groups left out), the current one marked; project
 *   documents (constitution, assessments) get the project document list.
 *   The groups are rendered twice: inside a `<details>` control shown on
 *   narrow screens only, and as the always-open list of wide screens (CSS).
 * - `<article data-region="doc">`: header (eyebrow, title, "Expand all"
 *   shown by `assets/reader.js`, "Raw markdown" as a `<details>` with the
 *   exact source), then the structured view for `spec.md`
 *   (`spec-view.js`) or the 001 Markdown rendering with numbered top-level
 *   sections (tasks.md keeps its `#L<line>` anchors).
 * - `<nav data-region="toc">`: "On this page" links and a progress bar that
 *   `assets/reader.js` shows and moves.
 */

import { html, raw } from "./html.js";
import { renderSpecBlocks, specToc } from "./spec-view.js";
import { renderInline } from "./markdown.js";
import { parseSpecStructure } from "../parse/spec-structure.js";

/** @typedef {import("../project/artifacts.js").Artifact} Artifact */
/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../model/build-model.js").Feature} Feature */
/** @typedef {import("./markdown.js").MarkdownRender} MarkdownRender */
/** @typedef {import("./html.js").Raw} Raw */

/** Eyebrow and document-list names by artifact kind. */
const KIND_LABEL = Object.freeze({
  spec: "Specification",
  plan: "Implementation plan",
  research: "Research",
  "data-model": "Data model",
  quickstart: "Quickstart",
  tasks: "Tasks",
  contract: "Contract",
  checklist: "Checklist",
  constitution: "Constitution",
  assessment: "Assessment",
  other: "Document",
});

/** Kinds listed under their kind name; the others under their title. */
const NAMED_BY_KIND = new Set(["spec", "plan", "research", "data-model", "quickstart", "tasks"]);

/**
 * The file name shown in the eyebrow: the path inside the feature or
 * assessment folder, otherwise the file name.
 * @param {string} source
 */
export function documentFile(source) {
  const m = /^(?:specs\/[^/]+|\.specify\/assessments\/[^/]+)\/(.+)$/.exec(source);
  return m ? m[1] : source.slice(source.lastIndexOf("/") + 1);
}

/**
 * The name of a document in the document list (US5 AC1): the kind for
 * single documents ("Specification", "Implementation plan"), "Quality
 * checklist" for `checklists/requirements.md`, the title otherwise
 * (contracts by title).
 * @param {Artifact} artifact
 * @returns {string}
 */
export function documentLabel(artifact) {
  if (NAMED_BY_KIND.has(artifact.kind)) return KIND_LABEL[artifact.kind];
  if (artifact.kind === "checklist" && documentFile(artifact.source) === "checklists/requirements.md") {
    return "Quality checklist";
  }
  return artifact.title;
}

/**
 * @param {boolean} on
 * @returns {Raw | ""}
 */
const current = (on) => (on ? raw(' aria-current="page"') : "");

/**
 * The groups of the document list, and its heading part.
 * @param {Artifact} artifact
 * @param {{base: string, project: Project, feature: Feature | null}} options
 * @returns {{head: Raw, groups: Raw}}
 */
function docList(artifact, { base, project, feature }) {
  const groups = feature ? (feature.documents?.groups ?? []) : (project.documents?.groups ?? []);
  const list = html`${groups.map(
    (g) =>
      html`<section data-part="doc-group" data-group="${g.name}"><h2>${g.name}</h2><ul>${g.items
        .filter((doc) => doc.url)
        .map(
          (doc) =>
            html`<li><a href="${base}${doc.url}"${current(doc.source === artifact.source)}>${documentLabel(doc)}</a></li>`,
        )}</ul></section>`,
  )}`;
  const head = feature
    ? html`<a data-part="back" href="${base}features/${feature.dir}/index.html">‹ Back to feature</a>
<p data-part="doc-feature"><span data-part="dot" data-status="${feature.status ?? "no-tasks"}"></span><span data-part="name">${feature.title}</span> <span class="pill" data-status="${feature.status ?? "no-tasks"}">${feature.statusLabel ?? ""}</span></p>`
    : html`<a data-part="back" href="${base}index.html">‹ Back to overview</a>
<p data-part="doc-feature"><span data-part="name">Project documents</span></p>`;
  return { head, groups: list };
}

/**
 * @typedef {object} TocItem
 * @property {string} anchor
 * @property {string} number
 * @property {string} html trusted inline HTML of the heading text
 * @property {{anchor: string, label: string}[]} children
 */

/**
 * Renders a non-spec document with the 001 renderer: the title heading the
 * page header already shows is left out, and every `## ` section gets its
 * number (01, 02, …).
 * @param {Artifact} artifact
 * @param {MarkdownRender} md
 * @returns {{body: string, toc: TocItem[]}}
 */
function renderMarkdownDocument(artifact, md) {
  const instance = md.md;
  const env = { source: artifact.source };
  const tokens = instance.parse(String(artifact.content ?? ""), env);
  /** @type {TocItem[]} */
  const toc = [];
  // The first `# ` heading is the title shown in the header (artifactTitle).
  const h1 = tokens.findIndex((t) => t.type === "heading_open" && t.tag === "h1" && t.markup === "#");
  if (h1 !== -1 && tokens[h1 + 1]?.content.trim() === artifact.title) tokens.splice(h1, 3);
  let n = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== "heading_open" || t.tag !== "h2") continue;
    const number = String(++n).padStart(2, "0");
    const inline = tokens[i + 1];
    const text = instance.renderer.renderInline(inline.children ?? [], instance.options, env);
    toc.push({ anchor: t.attrGet("id") ?? "", number, html: text, children: [] });
    const Token = /** @type {any} */ (t.constructor);
    const num = new Token("html_inline", "", 0);
    num.content = `<span data-part="num">${number}</span> `;
    inline.children = [num, ...(inline.children ?? [])];
  }
  return { body: instance.renderer.render(tokens, instance.options, env), toc };
}

/**
 * @param {TocItem[]} toc
 * @returns {Raw}
 */
function renderToc(toc) {
  const items = toc.map(
    (e) =>
      html`<li><a href="#${e.anchor}" data-toc="${e.anchor}">${e.number ? html`<span data-part="num">${e.number}</span> ` : ""}<span>${raw(e.html)}</span></a>${
        e.children.length
          ? html`<ol>${e.children.map((c) => html`<li><a href="#${c.anchor}" data-toc="${c.anchor}">${c.label}</a></li>`)}</ol>`
          : ""
      }</li>`,
  );
  return html`<nav data-region="toc" aria-label="On this page"><h2>On this page</h2>${
    toc.length ? html`<ol>${items}</ol>` : html`<p data-part="empty">No sections</p>`
  }<div data-part="progress" hidden><span data-part="progress-bar" class="w-pct-0"></span></div></nav>`;
}

/**
 * @param {Artifact} artifact
 * @param {object} options
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @param {Project} options.project
 * @param {Feature | null} [options.feature] the feature the document belongs to
 * @param {{slug: string} | null} [options.assessment] the assessment it belongs
 *   to; its documents are listed in the project document list
 * @param {MarkdownRender} options.md the shared renderer from createMarkdown
 * @returns {Raw} the inner HTML of `<main>`
 */
export function renderDocument(artifact, { base, project, feature = null, md }) {
  const { head, groups } = docList(artifact, { base, project, feature });
  const content = String(artifact.content ?? "");

  /** @type {Raw} */
  let body;
  /** @type {TocItem[]} */
  let toc;
  if (artifact.kind === "spec") {
    const spec = feature?.spec ?? parseSpecStructure(content);
    body = renderSpecBlocks(spec, { md, feature, source: artifact.source, base, title: false });
    toc = specToc(spec).map((e) => ({
      anchor: e.anchor,
      number: e.number,
      html: renderInline(md, e.heading, { source: artifact.source }),
      children: e.stories,
    }));
  } else {
    const rendered = renderMarkdownDocument(artifact, md);
    body = raw(rendered.body);
    toc = rendered.toc;
  }

  const kind = KIND_LABEL[artifact.kind] ?? KIND_LABEL.other;
  return html`<div data-region="reader">
<nav data-region="doc-list" data-keep-scroll="docs" aria-label="Documents">
${head}
<details data-part="doc-menu"><summary>Documents</summary>${groups}</details>
<div data-part="doc-groups">${groups}</div>
</nav>
<article data-region="doc" data-key="${artifact.source}" data-kind="${artifact.kind}">
<header data-part="doc-head">
<p data-part="eyebrow">${kind.toUpperCase()} · ${documentFile(artifact.source)}</p>
<h1>${artifact.title}</h1>
<div data-part="doc-actions"><button type="button" data-part="expand-all" hidden>Expand all</button><details data-part="raw" data-key="raw:${artifact.source}"><summary>Raw markdown</summary><pre><code>${content}</code></pre></details></div>
</header>
<div data-part="formatted" class="prose">
${body}</div>
</article>
${renderToc(toc)}
</div>`;
}
