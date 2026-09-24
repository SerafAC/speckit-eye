/**
 * spec.md parser (title and user stories only), per
 * contracts/tasks-md-format.md "spec.md". Pure; never throws.
 */

import { visibleLines } from "./lines.js";

/**
 * @typedef {object} Story
 * @property {string} label "US<n>"
 * @property {string} title
 * @property {string | null} priority "P1", "P2", …
 */

const TITLE_RE = /^#\s+Feature Specification:\s*(.+)$/;
const STORY_RE = /^###\s+User Story\s+(\d+)\s*[-–—]\s*(.+?)\s*\(Priority:\s*(P\d+)\)\s*$/;

/**
 * @param {unknown} text contents of spec.md
 * @returns {{ title: string | null, stories: Story[] }}
 */
export function parseSpec(text) {
  /** @type {string | null} */
  let title = null;
  /** @type {Story[]} */
  const stories = [];
  for (const { text: line } of visibleLines(text)) {
    if (title === null) {
      const t = TITLE_RE.exec(line);
      if (t && t[1].trim()) {
        title = t[1].trim();
        continue;
      }
    }
    const s = STORY_RE.exec(line);
    if (s) stories.push({ label: `US${Number.parseInt(s[1], 10)}`, title: s[2], priority: s[3] });
  }
  return { title, stories };
}
