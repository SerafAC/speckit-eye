// US3 — Work through a feature on its feature page (spec 002, User Story 3).
// Every test drives the real CLI against a temporary copy of a fixture
// (tests/fixtures/projects/README.md: `mixed` 002-beta has 20 tasks in phases
// of 4/3/6/7, 10 open, T011 next, T018 blocked by T011 on line 31, and file
// paths giving the chips All 20, Open 10, Tests 2, Vue 1, Go 4; `complete`
// has every task done; `nonstandard` 001-odd has warnings and a duplicated
// T005).

import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyFixture, startServe, featurePagePath } from "./helpers.js";

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

/**
 * Copies a fixture, optionally adjusts it, starts serve mode on it.
 * @param {string} fixture
 * @param {(dir: string) => Promise<void>} [prepare]
 */
async function serve(fixture, prepare) {
  const dir = await copyFixture(fixture);
  if (prepare) await prepare(dir);
  server = await startServe(dir);
  return { dir, url: server.url };
}

/**
 * Opens a feature page of a fixture.
 * @param {import("@playwright/test").Page} page
 * @param {string} fixture
 * @param {string} dir feature folder
 * @param {{hash?: string, prepare?: (dir: string) => Promise<void>}} [options]
 */
async function openFeature(page, fixture, dir, { hash = "", prepare } = {}) {
  const { url } = await serve(fixture, prepare);
  await page.goto(`${url}${featurePagePath(dir)}${hash}`);
  // The module has run once the filter bar is shown.
  await expect(filters(page)).toBeVisible();
  return url;
}

const head = (page) => page.locator('[data-region="feature-head"]');
const tabs = (page) => page.locator('[data-region="tabs"]');
const tasks = (page) => page.locator('[data-region="tasks"]');
const filters = (page) => tasks(page).locator('[data-part="filters"]');
const railBlock = (page, short) => tasks(page).locator('[data-part="rail"] [data-part="block"]').filter({ has: page.locator(`[data-part="short"]:text-is("${short}")`) });
const caption = (page) => tasks(page).locator('[data-part="caption"] [data-part="selected"]');
const phase = (page, n) => tasks(page).locator(`#phase-${n}`);
const phaseSummary = (page, n) => phase(page, n).locator(":scope > summary");
const chip = (page, value) => filters(page).locator(`button[data-filter-chip="${value}"]`);
const textFilter = (page) => filters(page).locator('input[data-part="text-filter"]');
const row = (page, id) => tasks(page).locator(`details[data-part="task"][data-id="${id}"]`);
const rowSummary = (page, id) => row(page, id).locator(":scope > summary");
const detail = (page) => tasks(page).locator('[data-region="detail"]');
const noMatch = (page) => tasks(page).locator('[data-part="no-match"]');

/** IDs of the task rows that are not filtered out, in document order. */
const visibleIds = (page) =>
  tasks(page)
    .locator('details[data-part="task"]:not([data-filtered-out])')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-id")));

/** data-key of every open phase. */
const openPhases = (page) =>
  tasks(page)
    .locator('details[data-part="phase"][open]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-key")));

test("US3 FR-030 header shows pill, folder, title, counts and ring", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  const h = head(page);
  await expect(h.locator('nav[data-part="breadcrumb"]')).toContainText("Overview");
  await expect(h.locator('nav[data-part="breadcrumb"]')).toContainText("Features");
  await expect(h.locator(".pill")).toBeVisible();
  await expect(h.locator(".pill")).not.toHaveText("Complete");
  await expect(h.locator('[data-part="meta"] code')).toHaveText("002-beta");
  await expect(h.locator("h1")).toHaveText("Beta");
  await expect(h.locator('[data-part="counts"]')).toHaveText("10 / 20 tasks · 2 of 4 phases");
  const ring = h.locator('[data-part="ring"]');
  await expect(ring).toBeVisible();
  await expect(ring).toHaveAttribute("data-complete", "false");
  await expect(ring.locator('[data-part="ring-label"]')).toHaveText("50 %");
  await expect(ring.locator('[data-part="ring-value"]')).toHaveAttribute("stroke-dasharray", "50 100");
});

test("US3 FR-030 a complete feature shows Complete and a check in the ring", async ({ page }) => {
  await openFeature(page, "complete", "001-first");
  const h = head(page);
  await expect(h.locator(".pill")).toHaveText("Complete");
  await expect(h.locator('[data-part="meta"] code')).toHaveText("001-first");
  await expect(h.locator("h1")).toHaveText("First");
  await expect(h.locator('[data-part="counts"]')).toHaveText("4 / 4 tasks · 2 of 2 phases");
  const ring = h.locator('[data-part="ring"]');
  await expect(ring).toHaveAttribute("data-complete", "true");
  await expect(ring.locator('[data-part="ring-label"] svg')).toBeVisible();
  await expect(ring.locator('[data-part="ring-label"]')).not.toContainText("%");
  // No open tasks: no phase is open on load.
  expect(await openPhases(page)).toEqual([]);
  await expect(caption(page)).toHaveText("None");
});

test("US3 FR-031 tabs list only existing documents in order", async ({ page }) => {
  const url = await openFeature(page, "mixed", "002-beta", {
    prepare: async (dir) => {
      const gamma = path.join(dir, "specs", "003-gamma");
      await writeFile(path.join(gamma, "quickstart.md"), "# Quickstart: Gamma\n");
      await writeFile(path.join(gamma, "data-model.md"), "# Data model: Gamma\n");
    },
  });
  const labels = (p) =>
    tabs(p)
      .locator('[data-part="tab"]')
      .evaluateAll((els) => els.map((el) => el.textContent.replace(/\s+/g, " ").trim()));
  expect(await labels(page)).toEqual(["Tasks 20", "Specification", "Plan"]);
  await expect(tabs(page).locator('a[data-part="tab"]').first()).toHaveAttribute("aria-current", "page");

  await page.goto(`${url}${featurePagePath("003-gamma")}`);
  expect(await labels(page)).toEqual(["Tasks 15", "Specification", "Plan", "Data model", "Quickstart"]);

  await page.goto(`${url}${featurePagePath("004-delta")}`);
  expect(await labels(page)).toEqual(["Tasks 0", "Specification"]);

  // A document tab opens the document.
  await page.goto(`${url}${featurePagePath("002-beta")}`);
  await tabs(page).getByRole("link", { name: "Plan", exact: true }).click();
  await expect(page).toHaveURL(/\/features\/002-beta\/plan\.html$/);
});

test("US3 FR-008 Contracts tab lists its documents without a navigation", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta", {
    prepare: async (dir) => {
      const contracts = path.join(dir, "specs", "002-beta", "contracts");
      await mkdir(contracts, { recursive: true });
      await writeFile(path.join(contracts, "api.md"), "# API\n");
      await writeFile(path.join(contracts, "events.md"), "# Events\n");
    },
  });
  const menu = tabs(page).locator('details[data-part="tab-menu"]');
  await expect(menu).toHaveCount(1);
  const summary = menu.locator(":scope > summary");
  await expect(summary).toContainText("Contracts");
  await expect(summary.locator('[data-part="count"]')).toHaveText("2");
  const before = page.url();
  await summary.click();
  expect(page.url()).toBe(before);
  const links = menu.locator("ul a");
  await expect(links).toHaveCount(2);
  await expect(links.first()).toBeVisible();
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")));
  expect(hrefs).toEqual(["/features/002-beta/contracts/api.html", "/features/002-beta/contracts/events.html"]);
  await links.nth(1).click();
  await expect(page).toHaveURL(/\/features\/002-beta\/contracts\/events\.html$/);
});

test("US3 FR-032 rail block widths proportional to task counts", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  const blocks = tasks(page).locator('[data-part="rail"] [data-part="block"]');
  await expect(blocks).toHaveCount(4);
  await expect(blocks.locator('[data-part="short"]')).toHaveText(["P1", "P2", "P3", "P4"]);
  await expect(blocks.locator('[data-part="count"]')).toHaveText(["4", "3", "6", "7"]);
  const widths = await blocks.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  const sum = widths.reduce((a, b) => a + b, 0);
  const expected = [4, 3, 6, 7].map((n) => n / 20);
  widths.forEach((w, i) => expect(Math.abs(w / sum - expected[i]), `block ${i + 1}`).toBeLessThan(0.03));
  // Larger phases are wider.
  expect(widths[3]).toBeGreaterThan(widths[2]);
  expect(widths[2]).toBeGreaterThan(widths[0]);
  expect(widths[0]).toBeGreaterThan(widths[1]);
  await expect(tasks(page).locator('[data-part="caption"]')).toContainText("Width = task count");
});

test("US3 FR-032 choosing a phase opens it and closes the other; choosing it again closes it", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  // On load the active phase is open.
  expect(await openPhases(page)).toEqual(["002-beta/p3"]);
  await expect(caption(page)).toHaveText("Phase 3: User Story 1 - Beta listing (Priority: P1)");
  await expect(railBlock(page, "P3")).toHaveAttribute("aria-current", "true");

  // In the rail.
  await railBlock(page, "P4").click();
  await expect(phase(page, 4)).toHaveAttribute("open", "");
  await expect(phase(page, 3)).not.toHaveAttribute("open");
  expect(await openPhases(page)).toEqual(["002-beta/p4"]);
  await expect(caption(page)).toHaveText("Phase 4: User Stories 2 and 3");
  await expect(railBlock(page, "P4")).toHaveAttribute("aria-current", "true");
  await expect(railBlock(page, "P3")).not.toHaveAttribute("aria-current");
  await railBlock(page, "P4").click();
  expect(await openPhases(page)).toEqual([]);
  await expect(caption(page)).toHaveText("None");

  // In the list.
  await phaseSummary(page, 1).click();
  await expect(phase(page, 1)).toHaveAttribute("open", "");
  await phaseSummary(page, 2).click();
  await expect(phase(page, 2)).toHaveAttribute("open", "");
  await expect(phase(page, 1)).not.toHaveAttribute("open");
  expect(await openPhases(page)).toEqual(["002-beta/p2"]);
  await expect(caption(page)).toHaveText("Phase 2: Foundational");
  await phaseSummary(page, 2).click();
  await expect(phase(page, 2)).not.toHaveAttribute("open");
  expect(await openPhases(page)).toEqual([]);
  await expect(caption(page)).toHaveText("None");
});

test("US3 FR-034 Open filter lists 10 open tasks and hides phases without matches", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  await expect(chip(page, "all").locator('[data-part="count"]')).toHaveText("20");
  await expect(chip(page, "open").locator('[data-part="count"]')).toHaveText("10");
  await chip(page, "open").click();
  await expect(chip(page, "open")).toHaveAttribute("aria-pressed", "true");
  await expect(chip(page, "all")).toHaveAttribute("aria-pressed", "false");
  expect(await visibleIds(page)).toEqual(["T011", "T012", "T013", "T014", "T015", "T016", "T017", "T018", "T019", "T020"]);
  await expect(phase(page, 1)).toBeHidden();
  await expect(phase(page, 2)).toBeHidden();
  await expect(phase(page, 3)).toHaveAttribute("open", "");
  await expect(phase(page, 4)).toHaveAttribute("open", "");
  await expect(row(page, "T011")).toBeVisible();
  await expect(row(page, "T018")).toBeVisible();
  await expect(row(page, "T008")).toBeHidden();

  // All clears the filter and restores the phase open before filtering.
  await chip(page, "all").click();
  expect(await visibleIds(page)).toHaveLength(20);
  await expect(phase(page, 1)).toBeVisible();
  expect(await openPhases(page)).toEqual(["002-beta/p3"]);
});

test("US3 FR-034 text filter narrows and a nonsense word shows No tasks match with Clear filters", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  await textFilter(page).fill("paging");
  expect(await visibleIds(page)).toEqual(["T011"]);
  await expect(row(page, "T011")).toBeVisible();
  await expect(phase(page, 4)).toBeHidden();
  // IDs and file names match too.
  await textFilter(page).fill("t018");
  expect(await visibleIds(page)).toEqual(["T018"]);
  await textFilter(page).fill("list_test");
  expect(await visibleIds(page)).toEqual(["T010", "T012"]);
  await expect(noMatch(page)).toBeHidden();

  await textFilter(page).fill("xyzzyplugh");
  expect(await visibleIds(page)).toEqual([]);
  await expect(noMatch(page)).toBeVisible();
  await expect(noMatch(page)).toContainText("No tasks match");
  await noMatch(page).getByRole("button", { name: "Clear filters" }).click();
  await expect(textFilter(page)).toHaveValue("");
  await expect(noMatch(page)).toBeHidden();
  expect(await visibleIds(page)).toHaveLength(20);
  await expect(chip(page, "all")).toHaveAttribute("aria-pressed", "true");
});

test("US3 FR-034 Tests chip and each kind chip filter the list and show their counts", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  const chipValues = await filters(page)
    .locator("button[data-filter-chip]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-filter-chip")));
  expect(chipValues).toEqual(["all", "open", "tests", "kind:Vue", "kind:Go"]);
  await expect(chip(page, "tests")).toContainText("Tests");
  await expect(chip(page, "tests").locator('[data-part="count"]')).toHaveText("2");
  await expect(chip(page, "kind:Vue").locator('[data-part="count"]')).toHaveText("1");
  await expect(chip(page, "kind:Go").locator('[data-part="count"]')).toHaveText("4");

  await chip(page, "tests").click();
  expect(await visibleIds(page)).toEqual(["T010", "T016"]);
  await chip(page, "tests").click();
  expect(await visibleIds(page)).toHaveLength(20);

  await chip(page, "kind:Vue").click();
  expect(await visibleIds(page)).toEqual(["T009"]);
  await chip(page, "kind:Vue").click();

  await chip(page, "kind:Go").click();
  expect(await visibleIds(page)).toEqual(["T010", "T011", "T012", "T016"]);
  // Chips combine: Go and Open.
  await chip(page, "open").click();
  expect(await visibleIds(page)).toEqual(["T011", "T012", "T016"]);
  // Chips and text combine; counts follow the text filter.
  await textFilter(page).fill("detail");
  expect(await visibleIds(page)).toEqual(["T016"]);
  await expect(chip(page, "kind:Go").locator('[data-part="count"]')).toHaveText("1");
  await expect(chip(page, "all").locator('[data-part="count"]')).toHaveText("3");
});

test("US3 duplicate task IDs can each be selected on their own", async ({ page }) => {
  await openFeature(page, "nonstandard", "001-odd");
  const dupes = tasks(page).locator('details[data-part="task"][data-id="T005"]');
  await expect(dupes).toHaveCount(2);
  const ids = await dupes.evaluateAll((els) => els.map((el) => el.id));
  expect(ids[0]).not.toBe(ids[1]);
  expect(ids.every((id) => id.startsWith("task-"))).toBe(true);

  await dupes.nth(0).locator(":scope > summary").click();
  await expect(dupes.nth(0)).toHaveAttribute("data-selected", "");
  await expect(dupes.nth(1)).not.toHaveAttribute("data-selected");
  await expect(detail(page).locator('[data-part="id"]')).toHaveText("T005");
  await expect(detail(page).locator('[data-part="text"]')).toContainText("Supporting work");
  await expect(page).toHaveURL(new RegExp(`#${ids[0]}$`));

  await dupes.nth(1).locator(":scope > summary").click();
  await expect(dupes.nth(1)).toHaveAttribute("data-selected", "");
  await expect(dupes.nth(0)).not.toHaveAttribute("data-selected");
  await expect(detail(page).locator('[data-part="text"]')).toContainText("Same ID written twice");
  await expect(detail(page).locator('[data-part="status"]')).toHaveText("Done");
  await expect(page).toHaveURL(new RegExp(`#${ids[1]}$`));
});

test("US3 FR-035 kind and file chips line up in columns", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  // Phase 3 (open on load) has rows with and without files.
  await expect(row(page, "T009").locator('[data-part="kind"]')).toHaveText("Vue");
  await expect(row(page, "T009").locator('[data-part="file"]')).toHaveText("List.vue");
  await expect(row(page, "T010").locator('[data-part="kind"]')).toHaveText("Go test");
  await expect(row(page, "T010").locator('[data-part="file"]')).toHaveText("list_test.go");
  await expect(row(page, "T011").locator('[data-part="kind"]')).toHaveText("Go");
  await expect(row(page, "T012").locator('[data-part="file"]')).toHaveText("2 files");
  await expect(row(page, "T011").locator('[data-part="text"] code').first()).toHaveText("src/list.go");

  const boxes = await phase(page, 3)
    .locator('details[data-part="task"] > summary')
    .evaluateAll((summaries) =>
      summaries.map((s) => {
        const box = (sel) => {
          const r = s.querySelector(sel).getBoundingClientRect();
          return { left: r.left, width: r.width };
        };
        return { kind: box('[data-part="kind"]'), file: box('[data-part="file"]') };
      }),
    );
  expect(boxes).toHaveLength(6);
  for (const b of boxes) {
    expect(Math.abs(b.kind.left - boxes[0].kind.left)).toBeLessThan(1);
    expect(Math.abs(b.kind.width - boxes[0].kind.width)).toBeLessThan(1);
    expect(Math.abs(b.file.left - boxes[0].file.left)).toBeLessThan(1);
    expect(Math.abs(b.file.width - boxes[0].file.width)).toBeLessThan(1);
  }
  expect(boxes[0].kind.width).toBeGreaterThan(0);
  expect(boxes[0].file.left).toBeGreaterThan(boxes[0].kind.left);
});

test("US3 FR-036 clicking T018 expands it and the detail panel says Waiting on T011", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta");
  await expect(detail(page)).toBeHidden();
  await railBlock(page, "P4").click();
  await rowSummary(page, "T018").click();
  const r = row(page, "T018");
  await expect(r).toHaveAttribute("open", "");
  await expect(r).toHaveAttribute("data-selected", "");
  await expect(r).toHaveAttribute("data-state", "blocked");
  await expect(r.locator('[data-part="full-text"]')).toBeVisible();
  await expect(r.locator('[data-part="full-text"]')).toContainText("Search box, depends on T011");
  await expect(r.locator('[data-part="markers"]')).toContainText("US3");
  await expect(page).toHaveURL(/#task-002-beta-T018$/);

  const d = detail(page);
  await expect(d).toBeVisible();
  await expect(d.locator('[data-part="id"]')).toHaveText("T018");
  await expect(d.locator('[data-part="status"]')).toHaveText("Blocked");
  await expect(d.locator('[data-part="text"]')).toContainText("Search box, depends on T011");
  await expect(d.locator('[data-part="waiting"]')).toBeVisible();
  await expect(d.locator('[data-part="waiting"]')).toHaveText("Waiting on T011");
  await expect(d.locator('dd[data-part="phase"]')).toHaveText("Phase 4: User Stories 2 and 3");

  // A task with files lists every path; a task that is not blocked has no waiting line.
  await railBlock(page, "P3").click();
  await rowSummary(page, "T012").click();
  await expect(d.locator('[data-part="id"]')).toHaveText("T012");
  await expect(d.locator('ul[data-part="files"] li')).toHaveText(["src/list.go", "src/list_test.go"]);
  await expect(d.locator('[data-part="waiting"]')).toBeHidden();

  // A second click collapses the row.
  await rowSummary(page, "T012").click();
  await expect(row(page, "T012")).not.toHaveAttribute("open");

  // The close button hides the panel.
  await d.locator('button[data-part="close"]').click();
  await expect(d).toBeHidden();
});

test("US3 FR-036 Copy ID puts T018 on the clipboard", async ({ page, context, browserName }) => {
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openFeature(page, "mixed", "002-beta", { hash: "#task-002-beta-T018" });
  const d = detail(page);
  await expect(d.locator('[data-part="id"]')).toHaveText("T018");
  await d.getByRole("button", { name: "Copy ID" }).click();
  const note = d.locator('[data-part="copied"]');
  await expect(note).toBeVisible();
  if (browserName === "chromium") {
    await expect(note).toHaveText("Copied T018");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("T018");
  } else {
    await expect(note).toHaveText(/Copied T018|Copy failed/);
  }
  // The confirmation is short.
  await expect(note).toBeHidden({ timeout: 5_000 });
});

test("US3 FR-044 View source line opens tasks.html#L31 highlighted", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta", { hash: "#task-002-beta-T018" });
  const link = detail(page).getByRole("link", { name: "View source line" });
  await expect(link).toHaveAttribute("href", "/features/002-beta/tasks.html#L31");
  await link.click();
  await expect(page).toHaveURL(/\/features\/002-beta\/tasks\.html#L31$/);
  const line = page.locator("#L31");
  await expect(line).toBeInViewport();
  await expect(line).toContainText("Search box, depends on T011");
  const look = await line.evaluate((el) => ({
    target: el.matches(":target"),
    background: getComputedStyle(el).backgroundColor,
    other: getComputedStyle(/** @type {Element} */ (document.getElementById("L30"))).backgroundColor,
  }));
  expect(look.target).toBe(true);
  expect(look.background).not.toBe(look.other);
  expect(look.background).not.toBe("rgba(0, 0, 0, 0)");
});

test("US3 FR-036 opening an address with #task-… shows the task open, selected and in view", async ({ page }) => {
  await openFeature(page, "mixed", "002-beta", { hash: "#task-002-beta-T018" });
  const r = row(page, "T018");
  await expect(phase(page, 4)).toHaveAttribute("open", "");
  expect(await openPhases(page)).toEqual(["002-beta/p4"]);
  await expect(caption(page)).toHaveText("Phase 4: User Stories 2 and 3");
  await expect(r).toHaveAttribute("open", "");
  await expect(r).toHaveAttribute("data-selected", "");
  await expect(r).toBeInViewport();
  await expect(detail(page)).toBeVisible();
  await expect(detail(page).locator('[data-part="id"]')).toHaveText("T018");
});

test("US3 FR-033 amber banner and Show lines reveal the source lines", async ({ page }) => {
  await openFeature(page, "nonstandard", "001-odd");
  const banner = tasks(page).locator('[data-part="warnings"]');
  await expect(banner).toBeVisible();
  const w1 = banner.locator('[data-part="warning"][data-code="W1"]');
  await expect(w1).toBeVisible();
  await expect(w1.locator('[data-part="line"]')).toContainText(["L10"]);
  // Amber: the banner's color has more red than blue.
  const rgb = await w1.evaluate((el) => {
    const c = getComputedStyle(el);
    for (const v of [c.backgroundColor, c.borderLeftColor, c.borderTopColor, c.color]) {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(v);
      if (m && (m[4] === undefined || Number(m[4]) > 0) && !(m[1] === m[2] && m[2] === m[3])) return m.slice(1, 4).map(Number);
    }
    return null;
  });
  expect(rgb).not.toBeNull();
  expect(rgb[0]).toBeGreaterThan(rgb[2]);

  const lines = w1.locator('details[data-part="show-lines"]');
  const source = lines.locator("ol");
  await expect(source).toBeHidden();
  await lines.locator("summary").getByText("Show lines").click();
  await expect(source).toBeVisible();
  await expect(source).toContainText("L10");
  await expect(source).toContainText("Checkbox line without a task ID");
});

test("US3 SC-009 detail panel right of the task list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFeature(page, "mixed", "002-beta", { hash: "#task-002-beta-T011" });
  await expect(detail(page)).toBeVisible();
  const list = await tasks(page).locator('[data-part="list"]').boundingBox();
  const panel = await detail(page).boundingBox();
  const rail = await tasks(page).locator('[data-part="rail"]').boundingBox();
  const header = await head(page).boundingBox();
  expect(list && panel && rail && header).toBeTruthy();
  // Header above the rail, rail above the list, panel beside the list.
  expect(header.y + header.height).toBeLessThanOrEqual(rail.y + 1);
  expect(rail.y + rail.height).toBeLessThanOrEqual(list.y + 1);
  expect(panel.x).toBeGreaterThanOrEqual(list.x + list.width - 1);
  expect(panel.y).toBeLessThan(list.y + list.height);
  expect(panel.y + panel.height).toBeGreaterThan(list.y);
  // No horizontal page scrolling.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
