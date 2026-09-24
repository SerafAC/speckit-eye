/**
 * tasks.md parser, exactly per contracts/tasks-md-format.md. Pure; never throws.
 */

import { visibleLines } from "./lines.js";

/**
 * @typedef {object} ParsedTask
 * @property {string | null} id
 * @property {boolean} done
 * @property {boolean} parallel
 * @property {string | null} story
 * @property {string} description
 * @property {string[]} dependsOn
 * @property {number} line 1-based
 */

/**
 * @typedef {object} ParsedPhase
 * @property {number | null} number null for the synthetic "Unphased" phase
 * @property {string} title
 * @property {number | null} line 1-based line of the heading (null for Unphased)
 * @property {ParsedTask[]} tasks
 */

/** @typedef {import("../project/scan.js").Warning} Warning */

const PHASE_RE = /^##\s+Phase\s+(\d+)\s*:\s*(.+?)\s*$/;
const TASK_RE = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const ID_RE = /^(T\d+)\b/;
const MARKER_RE = /^\s*\[(P|US\d+)\]/;
const DEPENDS_RE = /depends on\s+(T\d+(?:\s*(?:,\s*and|,|and|&)\s*T\d+)*)/gi;

export const MSG = {
  W1: () => "checkbox without a task ID (counted)",
  W2: (/** @type {string} */ first) => `task has several story labels; using ${first}`,
  W3: () => 'task outside any "## Phase N:" section (shown under Unphased)',
  W5: (/** @type {string} */ id) => `duplicate task ID ${id} (both counted)`,
  W6: (/** @type {string} */ id) => `dependency ${id} not found (ignored)`,
  W8: () => "tasks.md contains no tasks",
  W12: (/** @type {number} */ n) => `duplicate phase number ${n} (both shown)`,
};

/**
 * @param {unknown} text contents of tasks.md
 * @param {string} file project-relative path, used in warnings
 * @returns {{ phases: ParsedPhase[], tasks: ParsedTask[], warnings: Warning[] }}
 */
export function parseTasks(text, file) {
  /** @type {Warning[]} */
  const warnings = [];
  /** @type {ParsedPhase[]} */
  const phases = [];
  /** @type {ParsedTask[]} */
  const tasks = [];
  /** @type {ParsedPhase | null} */
  let current = null;
  /** @type {ParsedPhase | null} */
  let unphased = null;
  const seenPhaseNumbers = new Set();
  const seenIds = new Set();

  const warn = (/** @type {string} */ code, /** @type {number | null} */ line, /** @type {string} */ message) =>
    warnings.push({ code, file, line, message });

  for (const { line, text: visible } of visibleLines(text)) {
    const phaseMatch = PHASE_RE.exec(visible);
    if (phaseMatch) {
      const number = Number.parseInt(phaseMatch[1], 10);
      if (seenPhaseNumbers.has(number)) warn("W12", line, MSG.W12(number));
      seenPhaseNumbers.add(number);
      current = { number, title: phaseMatch[2], line, tasks: [] };
      phases.push(current);
      continue;
    }

    const taskMatch = TASK_RE.exec(visible);
    if (!taskMatch) continue;

    let rest = taskMatch[2];
    const idMatch = ID_RE.exec(rest);
    const id = idMatch ? idMatch[1] : null;
    if (idMatch) rest = rest.slice(idMatch[1].length);
    else warn("W1", line, MSG.W1());

    let parallel = false;
    /** @type {string | null} */
    let story = null;
    let secondStory = false;
    for (let m = MARKER_RE.exec(rest); m; m = MARKER_RE.exec(rest)) {
      if (m[1] === "P") parallel = true;
      else if (story === null) story = m[1];
      else if (m[1] !== story) secondStory = true;
      rest = rest.slice(m[0].length);
    }
    if (secondStory && story) warn("W2", line, MSG.W2(story));

    const description = rest.trim();
    /** @type {string[]} */
    const dependsOn = [];
    for (const dep of description.matchAll(DEPENDS_RE)) {
      for (const ref of dep[1].match(/T\d+/gi) ?? []) {
        const depId = ref.toUpperCase();
        if (!dependsOn.includes(depId)) dependsOn.push(depId);
      }
    }

    if (id !== null) {
      if (seenIds.has(id)) warn("W5", line, MSG.W5(id));
      seenIds.add(id);
    }

    /** @type {ParsedTask} */
    const task = { id, done: taskMatch[1] !== " ", parallel, story, description, dependsOn, line };
    tasks.push(task);

    if (current === null) {
      if (unphased === null) {
        unphased = { number: null, title: "Unphased", line: null, tasks: [] };
        phases.unshift(unphased);
      }
      warn("W3", line, MSG.W3());
      unphased.tasks.push(task);
    } else {
      current.tasks.push(task);
    }
  }

  for (const task of tasks) {
    const known = task.dependsOn.filter((depId) => {
      if (seenIds.has(depId)) return true;
      warn("W6", task.line, MSG.W6(depId));
      return false;
    });
    task.dependsOn = known;
  }

  if (tasks.length === 0) warn("W8", null, MSG.W8());

  warnings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0));
  return { phases, tasks, warnings };
}
