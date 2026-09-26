/**
 * Warning groups (data-model WarningGroup, FR-015, FR-033): the warnings of a
 * feature grouped by code and file, with a plain-sentence title, a short note
 * on the consequence, the affected lines merged into ranges ("L254–258") and
 * the raw source lines for "Show lines". Pure.
 */

/** @typedef {import("../project/scan.js").Warning} Warning */

/**
 * @typedef {object} LineRange
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {object} WarningGroup
 * @property {string} code 001 warning code (`W1`–`W12`)
 * @property {string} file project-relative path
 * @property {number} count warnings in this group
 * @property {string} title plain sentence with the count
 * @property {string} note short consequence
 * @property {LineRange[]} lines merged line ranges (empty without lines)
 * @property {{line: number, text: string}[]} sourceLines raw lines concerned
 */

/**
 * Sorted, de-duplicated line numbers merged into ranges of consecutive
 * numbers: 23, 254, 255, 256, 257, 258 → `[{23, 23}, {254, 258}]`.
 * @param {number[]} numbers
 * @returns {LineRange[]}
 */
export function mergeLines(numbers) {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  /** @type {LineRange[]} */
  const out = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n === last.to + 1) last.to = n;
    else out.push({ from: n, to: n });
  }
  return out;
}

/**
 * "L23" or "L254–258" (en dash).
 * @param {LineRange} range
 * @returns {string}
 */
export function formatRange({ from, to }) {
  return from === to ? `L${from}` : `L${from}–${to}`;
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * One title template and note per 001 warning code (tasks-md-format.md).
 * `name` is the file name without its folder.
 * @type {Readonly<Record<string, {title: (n: number, name: string) => string, note: string}>>}
 */
export const WARNING_TEXT = Object.freeze({
  W1: { title: (n, name) => `${plural(n, "checkbox", "checkboxes")} without a task ID in ${name}`, note: "counted, not linkable" },
  W2: { title: (n, name) => `${plural(n, "task", "tasks")} with several story labels in ${name}`, note: "the first label is used" },
  W3: { title: (n, name) => `${plural(n, "task", "tasks")} outside any phase in ${name}`, note: "shown under Unphased" },
  W4: {
    title: (n, name) => `${plural(n, "story label", "story labels")} in ${name} without a user story in spec.md`,
    note: "shown without a story title",
  },
  W5: { title: (n, name) => `${plural(n, "duplicate task ID", "duplicate task IDs")} in ${name}`, note: "both counted" },
  W6: { title: (n, name) => `${plural(n, "dependency", "dependencies")} on a missing task in ${name}`, note: "ignored" },
  W7: { title: (n, name) => `${plural(n, "open dependency", "open dependencies")} of the next task in ${name}`, note: "shown as next anyway" },
  W8: { title: (_n, name) => `${name} contains no tasks`, note: "nothing counted" },
  W9: { title: (n, name) => (n === 1 ? `${name} could not be read` : `${n} files could not be read`), note: "skipped" },
  W10: { title: (_n, name) => `${name} does not name an existing feature`, note: "ignored" },
  W11: { title: (n) => `${plural(n, "name", "names")} not supported for a page`, note: "skipped" },
  W12: { title: (n, name) => `${plural(n, "duplicate phase number", "duplicate phase numbers")} in ${name}`, note: "both shown" },
});

/**
 * @param {string} file
 * @returns {string}
 */
function baseName(file) {
  return file.slice(file.lastIndexOf("/") + 1);
}

/**
 * @param {string} code
 * @returns {number}
 */
function codeNumber(code) {
  return Number(code.replace(/\D/g, "")) || 0;
}

/**
 * Groups warnings by code and file. Warnings without a line form their own
 * group per code and file. Groups with lines come first, ordered by their
 * first line; the others follow by code.
 * @param {Warning[]} warnings
 * @param {Map<string, string> | Record<string, string>} contentByFile file → content already read
 * @returns {WarningGroup[]}
 */
export function groupWarnings(warnings, contentByFile) {
  /** @param {string} file */
  const contentOf = (file) =>
    contentByFile instanceof Map ? contentByFile.get(file) : Object.hasOwn(contentByFile ?? {}, file) ? contentByFile[file] : undefined;

  /** @type {Map<string, {code: string, file: string, warnings: Warning[], lined: boolean}>} */
  const byKey = new Map();
  for (const w of warnings) {
    const lined = typeof w.line === "number";
    const key = `${w.code}\u0000${w.file}\u0000${lined ? "l" : "-"}`;
    let g = byKey.get(key);
    if (!g) byKey.set(key, (g = { code: w.code, file: w.file, warnings: [], lined }));
    g.warnings.push(w);
  }

  const groups = [...byKey.values()].map(({ code, file, warnings: ws, lined }) => {
    const numbers = lined ? ws.map((w) => /** @type {number} */ (w.line)) : [];
    const text = WARNING_TEXT[code];
    const count = ws.length;
    const name = baseName(file);
    const content = contentOf(file);
    const rows = typeof content === "string" ? content.split(/\r?\n/) : null;
    const unique = [...new Set(numbers)].sort((a, b) => a - b);
    return {
      code,
      file,
      count,
      title: text ? text.title(count, name) : `${plural(count, "warning", "warnings")} in ${name}`,
      note: text ? text.note : ws[0]?.message ?? "",
      lines: mergeLines(numbers),
      sourceLines: rows ? unique.filter((n) => n >= 1 && n <= rows.length).map((line) => ({ line, text: rows[line - 1] })) : [],
      first: unique.length ? unique[0] : Infinity,
    };
  });

  groups.sort((a, b) => a.first - b.first || codeNumber(a.code) - codeNumber(b.code) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return groups.map(({ first: _first, ...g }) => g);
}
