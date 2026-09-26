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
import { themeScript } from "./theme-script.js";

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
 * @property {string | Uint8Array} body text, or bytes for binary assets
 *   (fonts, research D12); bytes are served and written unchanged
 */

/** @typedef {Map<string, SiteEntry>} Site */

/**
 * @typedef {object} SiteAssets
 * @property {string} styles the compiled stylesheet (`dist/styles.css`)
 * @property {Record<string, string>} modules browser module sources by file
 *   name (`app.js`, `prefs.js`, …); `live.js` is required in serve mode and
 *   never published in static mode
 * @property {Record<string, Uint8Array | string>} fonts the files of
 *   `dist/fonts/` by name: `.woff2` bytes and `OFL-*.txt` licence texts
 */

export const HTML_TYPE = "text/html; charset=utf-8";
export const CSS_TYPE = "text/css; charset=utf-8";
export const JS_TYPE = "text/javascript; charset=utf-8";
export const FONT_TYPE = "font/woff2";
export const JSON_TYPE = "application/json; charset=utf-8";
export const TEXT_TYPE = "text/plain; charset=utf-8";

/** The browser module that exists in serve mode only (live updates). */
const LIVE_MODULE = "live.js";

/**
 * @param {string} file a file name from `dist/fonts/`
 * @returns {string} its content type
 */
function fontFileType(file) {
  if (file.endsWith(".woff2")) return FONT_TYPE;
  if (file.endsWith(".txt")) return TEXT_TYPE;
  throw new Error(`renderSite: unexpected font file ${file}`);
}

/**
 * @param {Project} project
 * @param {object} options
 * @param {string} options.base normalized base path (`/` in serve mode)
 * @param {"serve" | "static"} options.mode
 * @param {string} options.version
 * @param {string | null} [options.generatedAt] ISO time, static mode only
 * @param {SiteAssets} options.assets contents of the packaged assets
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
  // Generated in memory from src/client/prefs.js (research D3), never read from disk.
  site.set("assets/theme.js", { type: JS_TYPE, body: themeScript() });
  const modules = assets.modules ?? {};
  if (mode === "serve" && typeof modules[LIVE_MODULE] !== "string") {
    throw new Error(`renderSite: serve mode needs assets.modules["${LIVE_MODULE}"]`);
  }
  for (const [name, source] of Object.entries(modules)) {
    if (name === LIVE_MODULE && mode !== "serve") continue;
    site.set(`assets/${name}`, { type: JS_TYPE, body: source });
  }
  for (const [file, body] of Object.entries(assets.fonts ?? {})) {
    site.set(`assets/fonts/${file}`, { type: fontFileType(file), body });
  }

  return site;
}
