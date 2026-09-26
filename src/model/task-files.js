/**
 * Files, kind and references of a task (data-model Task `files`, `kind`,
 * `refs` and TaskKind; FR-035, FR-037). Pure: derived from the task's
 * `description`, which is never changed.
 */

/** @typedef {{label: string, test: boolean}} TaskKind */

/** A backticked span that looks like a path: contains `/` and ends in a file name. */
const PATH_RE = /^[^\s`]*\/[^\s`]*[A-Za-z0-9_-]\.[A-Za-z0-9]+$/;
/** Known file names without an extension. */
const BARE_NAMES = ["Makefile", "Dockerfile"];
const BARE_RE = /(^|\/)(Makefile|Dockerfile)$/;
const CODE_SPAN_RE = /`([^`]+)`/g;
const TEST_NAME_RE = /(^|[._-])(test|spec)s?([._-]|$)/i;
const TEST_DIRS = new Set(["test", "tests", "__tests__", "e2e"]);
export const REF_RE = /\b(?:FR-\d+[a-z]?|SC-\d+)\b/g;

/** Kind label per extension (lower-case, without the dot). */
const LABELS = Object.freeze({
  go: "Go",
  vue: "Vue",
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  jsx: "JSX",
  ts: "TypeScript",
  mts: "TypeScript",
  cts: "TypeScript",
  tsx: "TSX",
  py: "Python",
  rb: "Ruby",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  cs: "C#",
  php: "PHP",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  svelte: "Svelte",
  md: "Markdown",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  sh: "Shell",
  sql: "SQL",
});

/**
 * The file paths named in a task: backticked spans that contain `/` and end
 * in a file name (or in `Makefile`/`Dockerfile`), in order, duplicates removed
 * (FR-037).
 * @param {string} description
 * @returns {string[]}
 */
export function taskFiles(description) {
  /** @type {string[]} */
  const out = [];
  for (const m of String(description ?? "").matchAll(CODE_SPAN_RE)) {
    const span = m[1];
    if (/\s/.test(span)) continue;
    const isPath = PATH_RE.test(span) || (span.includes("/") && BARE_RE.test(span));
    if (isPath && !out.includes(span)) out.push(span);
  }
  return out;
}

/**
 * The kind of a file (data-model TaskKind).
 * @param {string | null | undefined} file
 * @returns {TaskKind | null}
 */
export function taskKind(file) {
  if (!file) return null;
  const parts = file.split("/");
  const name = /** @type {string} */ (parts.pop());
  const test = TEST_NAME_RE.test(name) || parts.some((p) => TEST_DIRS.has(p));
  if (BARE_NAMES.includes(name)) return { label: name, test };
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return null;
  const ext = name.slice(dot + 1);
  const label = LABELS[/** @type {keyof typeof LABELS} */ (ext.toLowerCase())] ?? ext.toUpperCase();
  return { label, test };
}

/**
 * The chip text of a kind: "Go" or "Go test".
 * @param {TaskKind | null | undefined} kind
 * @returns {string}
 */
export function kindChip(kind) {
  if (!kind) return "";
  return kind.test ? `${kind.label} test` : kind.label;
}

/**
 * `FR-…` and `SC-…` references in a task, in order, duplicates removed.
 * @param {string} description
 * @returns {string[]}
 */
export function taskRefs(description) {
  /** @type {string[]} */
  const out = [];
  for (const m of String(description ?? "").matchAll(REF_RE)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}

/**
 * The feature page's kind filter chips: the distinct kind labels of the
 * tasks (without " test"), in order of first appearance.
 * @param {{kind?: TaskKind | null}[]} tasks
 * @returns {string[]}
 */
export function kindChips(tasks) {
  /** @type {string[]} */
  const out = [];
  for (const t of tasks) if (t.kind && !out.includes(t.kind.label)) out.push(t.kind.label);
  return out;
}
