/**
 * Artifact helpers: name validation (W11), kind, ordering, title and the
 * source → page URL mapping (data-model.md "Artifact", contracts/routes.md).
 */

import { visibleLines } from "../parse/lines.js";

/** @typedef {"spec" | "plan" | "research" | "data-model" | "quickstart" | "tasks" | "contract" | "checklist" | "constitution" | "assessment" | "other"} ArtifactKind */

/**
 * @typedef {object} Artifact
 * @property {ArtifactKind} kind
 * @property {string} title
 * @property {string} source project-relative path
 * @property {string} url page path without the base path
 * @property {string} [content] the Markdown source
 */

export const CONSTITUTION_SOURCE = ".specify/memory/constitution.md";

const NAME_RE = /^[A-Za-z0-9._-]+$/;

/**
 * True when a file or folder name may become part of a page path.
 * `.` and `..` are rejected too, although they match the character class.
 * @param {string} name
 */
export function isValidName(name) {
  return typeof name === "string" && NAME_RE.test(name) && name !== "." && name !== "..";
}

const FEATURE_ROOT_KINDS = new Map([
  ["spec.md", "spec"],
  ["plan.md", "plan"],
  ["research.md", "research"],
  ["data-model.md", "data-model"],
  ["quickstart.md", "quickstart"],
  ["tasks.md", "tasks"],
]);

/**
 * @param {string} source project-relative path
 * @returns {ArtifactKind}
 */
export function classifyKind(source) {
  if (source === CONSTITUTION_SOURCE) return "constitution";
  if (source.startsWith(".specify/assessments/")) return "assessment";
  const m = /^specs\/[^/]+\/(.+)$/.exec(source);
  if (!m) return "other";
  const rel = m[1];
  const rootKind = FEATURE_ROOT_KINDS.get(rel);
  if (rootKind) return /** @type {ArtifactKind} */ (rootKind);
  if (rel.startsWith("contracts/")) return "contract";
  if (rel.startsWith("checklists/")) return "checklist";
  return "other";
}

/**
 * Plain code-unit string compare (deterministic, locale independent).
 * @param {string} a
 * @param {string} b
 */
export function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

const FEATURE_ORDER = ["spec", "plan", "research", "data-model", "quickstart", "tasks", "contract", "checklist"];

/**
 * Orders a feature's artifacts: spec, plan, research, data-model, quickstart,
 * tasks, contracts by name, checklists by name, then the rest by path.
 * Returns a new array.
 * @template {{kind: string, source: string}} T
 * @param {T[]} list
 * @returns {T[]}
 */
export function sortFeatureArtifacts(list) {
  const rank = (/** @type {T} */ a) => {
    const i = FEATURE_ORDER.indexOf(a.kind);
    return i === -1 ? FEATURE_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || compareStrings(a.source, b.source));
}

const ASSESSMENT_ORDER = ["intake", "research", "problem", "concept", "decision"];

/**
 * Orders an assessment's artifacts: intake, research, problem, concept,
 * decision first, then the rest by name. Returns a new array.
 * @template {{source: string}} T
 * @param {T[]} list
 * @returns {T[]}
 */
export function sortAssessmentArtifacts(list) {
  const stem = (/** @type {string} */ source) => source.slice(source.lastIndexOf("/") + 1).replace(/\.md$/, "");
  const rank = (/** @type {T} */ a) => {
    const i = ASSESSMENT_ORDER.indexOf(stem(a.source));
    return i === -1 ? ASSESSMENT_ORDER.length : i;
  };
  return [...list].sort((a, b) => rank(a) - rank(b) || compareStrings(a.source, b.source));
}

/**
 * The first `# ` heading outside fenced code blocks and HTML comments,
 * otherwise `fileName`.
 * @param {string} markdown
 * @param {string} fileName
 */
export function artifactTitle(markdown, fileName) {
  for (const { text } of visibleLines(markdown)) {
    const h = /^#[ \t]+(.+?)[ \t]*$/.exec(text);
    if (h) {
      const title = h[1].replace(/[ \t]+#+$/, "").trim();
      if (title) return title;
    }
  }
  return fileName;
}

/**
 * Maps a project-relative Markdown source to its page path, or null when the
 * source has no page.
 * @param {string} source
 * @returns {string | null}
 */
export function sourceToUrl(source) {
  if (source === CONSTITUTION_SOURCE) return "constitution.html";
  let m = /^specs\/([^/]+)\/(.+)\.md$/.exec(source);
  if (m) return `features/${m[1]}/${m[2]}.html`;
  m = /^\.specify\/assessments\/([^/]+)\/(.+)\.md$/.exec(source);
  if (m) return `assessments/${m[1]}/${m[2]}.html`;
  return null;
}
