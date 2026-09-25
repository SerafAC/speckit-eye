#!/usr/bin/env node
/**
 * Writes a large Spec Kit project for the scale checks (SC-010):
 * 50 features × 40 tasks, each with spec.md, plan.md and tasks.md in 4
 * phases of 10 tasks. Feature `i` (0-based) has `round(40 · i / 49)` tasks
 * checked, so the project has 1,000 of 2,000 tasks done, with complete,
 * started and not-started features.
 *
 *   node tests/fixtures/generate-large.js <dir>
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FEATURES = 50;
export const TASKS_PER_FEATURE = 40;
const PHASES = ["Setup", "Foundational", "User Story 1 - Core flow (Priority: P1)", "Polish & Cross-Cutting Concerns"];

/**
 * @param {number} index 0-based feature index
 * @returns {number} checked tasks in that feature
 */
export function doneCount(index) {
  return Math.round((TASKS_PER_FEATURE * index) / (FEATURES - 1));
}

/**
 * @param {number} index
 * @returns {string} the feature folder name, e.g. `007-feature-7`
 */
export function featureDir(index) {
  const n = index + 1;
  return `${String(n).padStart(3, "0")}-feature-${n}`;
}

/**
 * @param {number} index
 * @returns {string} the feature's tasks.md
 */
function tasksMd(index) {
  const done = doneCount(index);
  const perPhase = TASKS_PER_FEATURE / PHASES.length;
  const lines = [`# Tasks: Feature ${index + 1}`, ""];
  let t = 0;
  PHASES.forEach((title, p) => {
    lines.push(`## Phase ${p + 1}: ${title}`, "");
    for (let k = 0; k < perPhase; k++, t++) {
      const id = `T${String(t + 1).padStart(3, "0")}`;
      const story = p === 2 ? "[US1] " : "";
      lines.push(`- [${t < done ? "x" : " "}] ${id} ${story}Task ${t + 1} of feature ${index + 1}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

/**
 * Writes the project into `dir` (created if missing).
 * @param {string} dir
 */
export async function generateLarge(dir) {
  for (let i = 0; i < FEATURES; i++) {
    const feature = path.join(dir, "specs", featureDir(i));
    await mkdir(feature, { recursive: true });
    await writeFile(
      path.join(feature, "spec.md"),
      `# Feature Specification: Feature ${i + 1}\n\n## User Scenarios & Testing\n\n### User Story 1 - Core flow (Priority: P1)\n\nGenerated story.\n`,
    );
    await writeFile(path.join(feature, "plan.md"), `# Implementation Plan: Feature ${i + 1}\n\n## Summary\n\nGenerated plan.\n`);
    await writeFile(path.join(feature, "tasks.md"), tasksMd(i));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: node tests/fixtures/generate-large.js <dir>");
    process.exit(2);
  }
  await generateLarge(path.resolve(dir));
  console.log(`wrote ${FEATURES} features × ${TASKS_PER_FEATURE} tasks to ${path.resolve(dir)}`);
}
