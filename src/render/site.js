/**
 * The site map: every page and asset that serve mode answers and build mode
 * writes (contracts/routes.md "Page paths"). This is the only place that
 * decides which pages exist (FR-031, constitution §III). Pure: callers read the
 * asset files and pass their contents in.
 */

import { renderPage } from "./layout.js";
import { renderOverview } from "./overview.js";

/** @typedef {import("../model/build-model.js").Project} Project */

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
 * @param {{styles: string, overview: string}} options.assets contents of the
 *   compiled stylesheet and the overview client script
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

  site.set("assets/styles.css", { type: CSS_TYPE, body: assets.styles });
  site.set("assets/overview.js", { type: JS_TYPE, body: assets.overview });

  return site;
}
