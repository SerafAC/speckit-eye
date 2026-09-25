// SC-005: the counts speckit-eye shows for this repository's own features
// equal the checkboxes in their tasks.md files. The expected counts are
// computed here, independently of src/parse, with the task-line regex from
// contracts/tasks-md-format.md, skipping fenced code blocks and HTML comments.

import { test, expect } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, runBuild, serveStatic } from "./helpers.js";

const TASK_LINE = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Counts checkboxes outside fenced code blocks and HTML comments.
 * @param {string} text
 * @returns {{ done: number, total: number }}
 */
function countCheckboxes(text) {
  // Blank out comments but keep their line breaks, so line structure survives.
  const visible = text.replace(/<!--[\s\S]*?(?:-->|$)/g, (m) => m.replace(/[^\n]/g, ""));
  let fence = null;
  let done = 0;
  let total = 0;
  for (const raw of visible.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && line.trim() === f[1]) fence = null;
      continue;
    }
    if (f) {
      fence = f[1];
      continue;
    }
    const m = TASK_LINE.exec(line);
    if (!m) continue;
    total++;
    if (m[1] !== " ") done++;
  }
  return { done, total };
}

/** @type {(() => Promise<unknown>)[]} */
let cleanup = [];

test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

test("SC-005 this repository's own features show open / total equal to their checkbox counts", async ({ page }) => {
  const specsDir = path.join(REPO_ROOT, "specs");
  const features = (await readdir(specsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  /** @type {{ dir: string, done: number, total: number }[]} */
  const expected = [];
  for (const dir of features) {
    let text;
    try {
      text = await readFile(path.join(specsDir, dir, "tasks.md"), "utf8");
    } catch {
      continue;
    }
    expected.push({ dir, ...countCheckboxes(text) });
  }
  expect(expected.length).toBeGreaterThan(0);

  const outRoot = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-self-"));
  cleanup.push(() => rm(outRoot, { recursive: true, force: true }));
  const out = path.join(outRoot, "site");
  const result = await runBuild(REPO_ROOT, out);
  expect(result.code, result.stderr).toBe(0);
  const host = await serveStatic(out);
  cleanup.push(() => host.close());

  await page.goto(host.url);
  for (const { dir, done, total } of expected) {
    const count = page.locator(`[data-region="tree"] details[data-key="${dir}"] > summary [data-part="count"]`);
    await expect(count, dir).toHaveText(`${total - done} open / ${total}`);
  }
  const sum = expected.reduce((acc, e) => ({ done: acc.done + e.done, total: acc.total + e.total }), { done: 0, total: 0 });
  const bar = page.locator('progress[data-key="project"]');
  await expect(bar).toHaveAttribute("value", String(sum.done));
  await expect(bar).toHaveAttribute("max", String(sum.total));
});
