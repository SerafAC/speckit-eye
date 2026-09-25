/**
 * The site map: every page and asset that serve mode answers and build mode
 * writes (contracts/routes.md "Page paths"). This is the only place that
 * decides which pages exist (FR-031, constitution §III). Pure: callers read the
 * asset files and pass their contents in.
 */

import { renderPage } from "./layout.js";
import { renderOverview } from "./overview.js";
import { renderArtifact } from "./artifact.js";
import { createMarkdown } from "./markdown.js";

/** @typedef {import("../model/build-model.js").Project} Project */
/** @typedef {import("../project/artifacts.js").Artifact} Artifact */

/**
 * Every artifact of the project with the feature or assessment it belongs to:
 * the constitution, each feature's artifacts, each assessment's artifacts.
 * @param {Project} project
 * @returns {{artifact: Artifact, feature: {title: string} | null, assessment: {slug: string} | null}[]}
 */
export function allArtifacts(project) {
  const out = [];
  if (project.constitution) out.push({ artifact: project.constitution, feature: null, assessment: null });
  for (const feature of project.features) {
    for (const artifact of feature.artifacts ?? []) out.push({ artifact, feature, assessment: null });
  }
  for (const assessment of project.assessments) {
    for (const artifact of assessment.artifacts) out.push({ artifact, feature: null, assessment });
  }
  return out;
}

/**
 * @typedef {object} SiteEntry
 * @property {string} type MIME type of the body
 * @property {string} body
 */

/** @typedef {Map<string, SiteEntry>} Site */

export const HTML_TYPE = "text/html; charset=utf-8";
export const CSS_TYPE = "text/css; charset=utf-8";
export const JS_TYPE = "text/javascript; charset=utf-8";

/**
 * @param {Project} project
 * @param {object} options
 * @param {string} options.base normalized base path (`/` in serve mode)
 * @param {"serve" | "static"} options.mode
 * @param {string} options.version
 * @param {string | null} [options.generatedAt] ISO time, static mode only
 * @param {{styles: string, overview: string, live?: string}} options.assets
 *   contents of the compiled stylesheet and the client scripts (`live` is
 *   needed in serve mode only)
 * @returns {Site}
 */
export function renderSite(project, { base, mode, version, generatedAt = null, assets }) {
  /** @type {Site} */
  const site = new Map();

  site.set("index.html", {
    type: HTML_TYPE,
    body: renderPage({
      title: `${project.name} · speckit-eye`,
      base,
      mode,
      project,
      main: renderOverview(project, { base }),
      version,
      generatedAt,
    }),
  });

  // One page per artifact (US3, FR-021), keyed by its url.
  const entries = allArtifacts(project).filter(({ artifact }) => artifact.url);
  const renderMarkdown = createMarkdown({
    artifactsBySource: new Map(entries.map(({ artifact }) => [artifact.source, artifact])),
    base,
  });
  for (const { artifact, feature, assessment } of entries) {
    const body = renderMarkdown(artifact.source, artifact.content ?? "");
    site.set(artifact.url, {
      type: HTML_TYPE,
      body: renderPage({
        title: `${artifact.title} · ${project.name} · speckit-eye`,
        base,
        mode,
        project,
        main: renderArtifact(artifact, body, { base, feature, assessment }),
        version,
        generatedAt,
      }),
    });
  }

  site.set("assets/styles.css", { type: CSS_TYPE, body: assets.styles });
  site.set("assets/overview.js", { type: JS_TYPE, body: assets.overview });
  if (mode === "serve") {
    if (typeof assets.live !== "string") throw new Error("renderSite: serve mode needs assets.live");
    site.set("assets/live.js", { type: JS_TYPE, body: assets.live });
  }

  return site;
}
