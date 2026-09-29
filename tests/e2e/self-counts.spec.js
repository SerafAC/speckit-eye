// SC-004 (spec 002; 001 SC-005): every count speckit-eye shows for this
// repository's own features (stats card, segments, sidebar, tree, map legend,
// feature pages) equals the checkboxes in their tasks.md files. The expected counts are
// computed independently of src/parse by `countCheckboxes` (helpers.js), with
// the task-line regex from contracts/tasks-md-format.md, skipping fenced code
// blocks and HTML comments.

import { test, expect } from "@playwright/test";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REPO_ROOT, countCheckboxes, featurePagePath, runBuild, serveStatic, sidebarFeature } from "./helpers.js";

/** @type {(() => Promise<unknown>)[]} */
let cleanup = [];

test.afterEach(async () => {
  for (const fn of cleanup.reverse()) await fn();
  cleanup = [];
});

test("SC-004 counts on stats card, segments, sidebar, tree, map legend and feature pages match this repository's checkboxes", async ({ page }) => {
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
    if (total > 0) await expect(count, dir).toHaveText(`${done}/${total}`);
    else await expect(count, dir).toHaveCount(0);
  }
  // The sidebar shows each feature's open count (or a check mark when done).
  for (const { dir, done, total } of expected) {
    const count = sidebarFeature(page, dir).locator('[data-part="count"]');
    if (total > 0 && done === total) await expect(count.locator("svg"), dir).toHaveCount(1);
    else await expect(count, dir).toHaveText(total - done > 0 ? String(total - done) : "");
  }
  const sum = expected.reduce((acc, e) => ({ done: acc.done + e.done, total: acc.total + e.total }), { done: 0, total: 0 });
  const stats = page.locator('[data-region="stats"]');
  await expect(stats.locator('[data-stat="percent"] [data-part="detail"]')).toHaveText(`${sum.done} of ${sum.total} tasks`);
  await expect(stats.locator('[data-stat="percent"] [data-part="value"]')).toHaveText(
    // Rounded, but never 100 % while a task is open.
    `${Math.min(Math.round((sum.done * 100) / sum.total), sum.done < sum.total ? 99 : 100)} %`,
  );
  await expect(stats.locator('[data-stat="open"] [data-part="value"]')).toHaveText(String(sum.total - sum.done));
  const withOpen = expected.filter((e) => e.done < e.total).length;
  await expect(stats.locator('[data-stat="open"] [data-part="detail"]')).toHaveText(`across ${withOpen} ${withOpen === 1 ? "feature" : "features"}`);
  const complete = expected.filter((e) => e.total > 0 && e.done === e.total).length;
  await expect(stats.locator('[data-stat="features"] [data-part="value"]')).toHaveText(`${complete} / ${features.length}`);

  // One segment per feature with tasks; its title states done, open and next.
  const segments = stats.locator('[data-part="segments"] > a');
  const withTasks = expected.filter((e) => e.total > 0);
  await expect(segments).toHaveCount(withTasks.length);
  for (const { dir, done, total } of withTasks) {
    const title = await stats.locator(`[data-part="segments"] > a[data-key="seg:${dir}"]`).getAttribute("title");
    const m = /— (\d+) done, (\d+) open, (\d+) next$/.exec(title ?? "");
    expect(m, `${dir}: ${title}`).not.toBeNull();
    expect(Number(m[1]), dir).toBe(done);
    expect(Number(m[2]) + Number(m[3]), dir).toBe(total - done);
  }

  // The task map has one square per checkbox; its legend adds up.
  const map = page.locator('[data-region="taskmap"]');
  await expect(map.locator("a[data-state]")).toHaveCount(sum.total);
  const legend = Object.fromEntries(
    (await map.locator('[data-part="legend"] li[data-state]').allTextContents()).map((t) => {
      const m = /^(\D+?)\s+(\d+)$/.exec(t.trim());
      return [m?.[1] ?? t, Number(m?.[2])];
    }),
  );
  expect(legend.Done).toBe(sum.done);
  expect(legend.Open + legend.Blocked + legend.Next).toBe(sum.total - sum.done);

  // Each feature page states the same done / total.
  for (const { dir, done, total } of expected) {
    await page.goto(`${host.url}${featurePagePath(dir)}`);
    await expect(page.locator('[data-region="feature-head"]'), dir).toContainText(`${done} / ${total} tasks`);
  }
});
