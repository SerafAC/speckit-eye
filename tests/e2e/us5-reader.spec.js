// US5 — Read specs and other documents in the document reader (spec.md,
// User Story 5), plus the still-valid document checks of spec 001 that lived
// in us3-artifacts.spec.js (every artifact reachable, raw HTML shown as text,
// links, diagrams, no foreign requests). The tests drive the real CLI against
// temporary copies of the `artifacts` fixture and of this repository's own
// specs (tests/fixtures/projects/README.md lists the fixture's 16 pages).

import { test, expect } from "@playwright/test";
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FIXTURES, REPO_ROOT, asInPage, copyFixture, featurePagePath, navLink, rail, sidebar, startServe } from "./helpers.js";
import { lineParts, missingLines } from "../unit/spec-samples.js";
import { parseSpecStructure } from "../../src/parse/spec-structure.js";

/** @type {import("./helpers.js").ServeHandle | null} */
let server = null;

test.afterEach(async () => {
  await server?.stop();
  server = null;
});

/**
 * Copies the `artifacts` fixture, optionally adjusts it, starts serve mode.
 * @param {(dir: string) => Promise<void>} [prepare]
 */
async function serveArtifacts(prepare) {
  const dir = await copyFixture("artifacts");
  if (prepare) await prepare(dir);
  server = await startServe(dir);
  return { dir, url: server.url };
}

/**
 * Copies this repository's `specs/` and `.specify/` into a temporary folder
 * (so the served files cannot change during the test) and serves it.
 */
async function serveRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "speckit-eye-repo-"));
  await cp(path.join(REPO_ROOT, "specs"), path.join(dir, "specs"), { recursive: true });
  await cp(path.join(REPO_ROOT, ".specify"), path.join(dir, ".specify"), { recursive: true });
  server = await startServe(dir);
  return { dir, url: server.url };
}

const SPEC_002 = "features/002-dashboard-redesign/spec.html";

/** Every artifact page of the fixture, in model order. */
const PAGES = [
  "constitution.html",
  "features/001-full/spec.html",
  "features/001-full/plan.html",
  "features/001-full/research.html",
  "features/001-full/data-model.html",
  "features/001-full/quickstart.html",
  "features/001-full/tasks.html",
  "features/001-full/contracts/cli.html",
  "features/001-full/checklists/requirements.html",
  "features/001-full/decisions.html",
  "features/001-full/run-log.html",
  "features/002-partial/spec.html",
  "features/002-partial/plan.html",
  "assessments/idea-x/intake.html",
  "assessments/idea-x/decision.html",
  "assessments/idea-x/notes.html",
];

const tree = (page) => page.locator('[data-region="tree"]');
const feature = (page, key) => tree(page).locator(`details[data-key="${key}"]`);
// The feature page links every document of its feature: its document tabs
// (several documents of one kind in a tab menu, FR-008) and the tasks.md link
// of the Tasks tab (the overview tree links to the feature page).
const artifactLinks = (page) =>
  page.locator('[data-region="tabs"] a:not([aria-current]), [data-region="tasks"] a[data-part="source"]');
/** Clicks a document link, opening its tab menu first when it sits in one. */
async function clickArtifactLink(link) {
  const menu = link.locator("xpath=ancestor::details[1]");
  if ((await menu.count()) > 0 && !(await menu.evaluate((d) => d.open))) await menu.locator("summary").click();
  await link.click();
}
const article = (page) => page.locator('article[data-region="doc"]');
const formatted = (page) => article(page).locator('[data-part="formatted"]');
const docList = (page) => page.locator('[data-region="doc-list"]');
const toc = (page) => page.locator('[data-region="toc"]');

/**
 * The words of the formatted view: the article without the raw source,
 * tags replaced by spaces (so adjacent elements never merge words).
 * @param {import("@playwright/test").Page} page
 */
async function formattedWords(page) {
  const html = await article(page).evaluate((a) => {
    const copy = /** @type {Element} */ (a.cloneNode(true));
    copy.querySelector('[data-part="raw"]')?.remove();
    return copy.innerHTML;
  });
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w.toLowerCase());
}

test("US5 FR-038 FR-039 document list groups Define, Design, Contracts, Build, Other with the current document marked", async ({ page }) => {
  const { url } = await serveArtifacts();
  await page.goto(`${url}features/001-full/spec.html`);
  const list = docList(page);
  await expect(list).toBeVisible();
  await expect(list.locator('a[data-part="back"]')).toHaveAttribute("href", `/${featurePagePath("001-full")}`);
  await expect(list.locator('[data-part="doc-feature"]')).toContainText("Full Feature");
  await expect(list.locator('[data-part="doc-feature"] .pill')).toBeVisible();
  const groups = list.locator('[data-part="doc-groups"] [data-part="doc-group"]');
  await expect(groups.locator("h2")).toHaveText(["Define", "Design", "Contracts", "Build", "Other"]);
  const names = (i) => groups.nth(i).locator("a");
  await expect(names(0)).toHaveText(["Specification", "Quality checklist"]);
  await expect(names(1)).toHaveText(["Implementation plan", "Research", "Data model", "Quickstart"]);
  await expect(names(2)).toHaveText(["CLI Contract"]);
  await expect(names(3)).toHaveText(["Tasks"]);
  await expect(names(4)).toHaveText(["Decisions", "Run Log"]);
  await expect(list.locator('[data-part="doc-groups"] a[aria-current="page"]')).toHaveText("Specification");

  // A feature with fewer documents leaves the empty groups out.
  await page.goto(`${url}features/002-partial/plan.html`);
  await expect(docList(page).locator('[data-part="doc-groups"] h2')).toHaveText(["Define", "Design"]);
  await expect(docList(page).locator('[data-part="doc-groups"] a[aria-current="page"]')).toHaveText("Implementation plan");

  // Project documents get the project document list.
  await page.goto(`${url}assessments/idea-x/notes.html`);
  await expect(docList(page).locator('[data-part="doc-groups"] h2')).toHaveText(["Project", "Assessment: idea-x"]);
  await expect(docList(page).locator('[data-part="doc-groups"] a[aria-current="page"]')).toHaveAttribute("href", "/assessments/idea-x/notes.html");

  // Choosing a document opens it.
  await page.goto(`${url}features/001-full/spec.html`);
  await docList(page).getByRole("link", { name: "CLI Contract" }).click();
  await expect(page).toHaveURL(`${url}features/001-full/contracts/cli.html`);
  await expect(article(page)).toHaveAttribute("data-key", "specs/001-full/contracts/cli.md");
});

test("US5 FR-042 metadata card and pull quote", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${SPEC_002}`);
  await expect(article(page).locator('[data-part="eyebrow"]')).toHaveText("SPECIFICATION · spec.md");
  await expect(article(page).locator("h1")).toHaveText(/^Feature Specification: Dashboard Redesign/);
  const card = formatted(page).locator('dl[data-part="metadata"]');
  await expect(card.locator("dt")).toHaveText(["Feature Branch", "Created", "Status"]);
  await expect(card.locator("dd").nth(0)).toContainText("002-dashboard-redesign");
  await expect(card.locator("dd").nth(1)).toHaveText("2026-09-26");
  await expect(card.locator("dd").nth(2)).toHaveText("Draft");
  const quote = formatted(page).locator('[data-part="request"] blockquote');
  await expect(quote).toContainText("Take a look at @mockups/001-first-redesign.");
  await expect(quote).not.toContainText("User description");
  expect(await quote.evaluate((q) => getComputedStyle(q).fontStyle)).toBe("italic");
});

test("US5 FR-042 clarifications show N answered · M sessions, first session open, Show N more answers and aligned badges", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${SPEC_002}`);
  const heading = formatted(page).locator('h2#clarifications');
  await expect(heading).toContainText("01");
  await expect(heading.locator('[data-part="count"]')).toHaveText("8 answered · 1 session");
  const session = formatted(page).locator('details[data-part="session"]').first();
  await expect(session).toHaveAttribute("open", "");
  await expect(session.locator(":scope > summary")).toContainText("8 questions");
  const visible = session.locator(':scope > ol > li[data-part="answer"]');
  await expect(visible).toHaveCount(3);
  const more = session.locator('details[data-part="more"]');
  await expect(more.locator("summary")).toHaveText("Show 5 more answers");
  await more.locator("summary").click();
  const answers = session.locator('li[data-part="answer"]');
  await expect(answers).toHaveCount(8);
  await expect(answers.nth(0).locator('[data-part="badge"]')).toHaveText("Yes");
  await expect(answers.nth(5).locator('[data-part="badge"]')).toHaveText("No");
  await expect(answers.nth(1).locator('[data-part="badge"]')).toHaveText("A");
  const xs = await answers.locator('[data-part="badge"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().left)));
  expect(new Set(xs).size, `badge x-positions ${xs}`).toBe(1);
  const widths = await answers.locator('[data-part="badge"]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  expect(new Set(widths)).toEqual(new Set([56]));
});

test("US5 FR-042 user story card has why, independent test, Given/When/Then table and phase progress", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${SPEC_002}`);
  const stories = formatted(page).locator('details[data-part="story"]');
  await expect(stories).toHaveCount(6);
  const first = stories.first();
  await expect(first).toHaveAttribute("open", "");
  await expect(stories.nth(1)).not.toHaveAttribute("open", "");
  const summary = first.locator("summary");
  await expect(summary.locator('[data-part="story-id"]')).toHaveText("US1");
  await expect(summary.locator('[data-part="priority"]')).toHaveText("P1");
  await expect(summary.locator('[data-part="story-title"]')).toHaveText("See where the project stands in the new overview");
  await expect(summary.locator('[data-part="count"]')).toHaveText("9 scenarios");
  await expect(stories.nth(4).locator("summary")).toContainText("US5");
  await expect(stories.nth(4).locator("summary")).toContainText("8 scenarios");
  await expect(first.locator('[data-part="why"] h4')).toHaveText("Why this priority");
  await expect(first.locator('[data-part="why"]')).toContainText("The overview is the first screen");
  await expect(first.locator('[data-part="test"] h4')).toHaveText("Independent test");
  const table = first.locator('[data-part="scenarios"] table');
  await expect(table.locator("thead th")).toHaveText(["#", "Given", "When", "Then"]);
  await expect(table.locator("tbody tr")).toHaveCount(9);
  const row = table.locator("tbody tr").nth(1);
  await expect(row.locator("td")).toHaveCount(4);
  await expect(row.locator("td").nth(0)).toHaveText("2");
  await expect(row.locator("td").nth(1)).toHaveText("the same project");
  // A scenario with several When/Then pairs is one full-width row.
  await expect(table.locator("tbody tr").nth(4).locator("td[colspan='3']")).toHaveCount(1);
  const phase = first.locator('[data-part="phases"] li').first();
  await expect(phase.locator("a")).toHaveText(/^Phase 3: User Story 1/);
  await expect(phase.locator("a")).toHaveAttribute("href", "/features/002-dashboard-redesign/index.html#phase-3");
  await expect(phase.locator('[data-part="progress"]')).toHaveText(/^\d+ \/ \d+$/);
  await phase.locator("a").click();
  await expect(page).toHaveURL(`${url}features/002-dashboard-redesign/index.html#phase-3`);
});

test("US5 FR-042 area chip narrows requirements and MUST is highlighted", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${SPEC_002}`);
  const reqs = formatted(page).locator('section[data-part="requirements"]');
  const chips = reqs.locator('[data-part="areas"] button');
  await expect(chips.first()).toHaveText("All");
  await expect(chips.first()).toHaveAttribute("aria-pressed", "true");
  await expect(chips).toHaveCount(10);
  const all = await reqs.locator('li[data-part="requirement"]:visible').count();
  expect(all).toBeGreaterThan(50);
  await reqs.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(reqs.locator('[data-part="area"]:visible [data-part="area-name"]')).toHaveText(["Theme"]);
  const theme = reqs.locator('li[data-part="requirement"]:visible');
  await expect(theme).toHaveCount(4);
  await expect(theme.first().locator('[data-part="req-id"]')).toHaveText("FR-045");
  const must = theme.first().locator("mark[data-kw]").first();
  await expect(must).toHaveText("MUST");
  expect(await must.evaluate((m) => getComputedStyle(m).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await chips.first().click();
  await expect(reqs.locator('li[data-part="requirement"]:visible')).toHaveCount(all);
});

test("US5 FR-041 contents panel marks the section in view and progress advances on scroll", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${SPEC_002}`);
  const panel = toc(page);
  await expect(panel).toBeVisible();
  await expect(panel.locator("h2")).toHaveText("On this page");
  const top = panel.locator(":scope > ol > li > a");
  await expect(top.first()).toContainText("01");
  await expect(top.first()).toContainText("Clarifications");
  await expect(panel.locator("ol ol a").first()).toHaveText("US1 · See where the project stands in the new overview");
  const bar = panel.locator('[data-part="progress-bar"]');
  await expect(panel.locator('[data-part="progress"]')).toBeVisible();
  const width = () => bar.evaluate((b) => b.getBoundingClientRect().width);
  const before = await width();

  await panel.getByRole("link", { name: /Key Entities|Success Criteria/ }).first().click();
  await expect(panel.locator('a[aria-current="location"]')).toHaveCount(1);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // At the end of the page the last section is the one being read.
  await expect(panel.locator('a[aria-current="location"]')).toContainText("Assumptions");
  await expect.poll(width).toBeGreaterThan(before);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(panel.locator('a[aria-current="location"]')).toContainText("Clarifications");
});

test("US5 FR-040 Raw markdown shows the exact source and toggles back", async ({ page }) => {
  const { dir, url } = await serveRepo();
  const source = await readFile(path.join(dir, "specs", "002-dashboard-redesign", "spec.md"), "utf8");
  await page.goto(`${url}${SPEC_002}`);
  const raw = article(page).locator('details[data-part="raw"]');
  await expect(raw.locator("pre")).toBeHidden();
  await expect(formatted(page)).toBeVisible();
  await raw.locator("summary").click();
  await expect(raw.locator("pre")).toBeVisible();
  await expect(formatted(page)).toBeHidden();
  // Exactly the file, line endings as the HTML parser keeps them (helpers.js asInPage).
  expect(await raw.locator("pre").evaluate((p) => p.textContent)).toBe(asInPage(source));
  await raw.locator("summary").click();
  await expect(raw.locator("pre")).toBeHidden();
  await expect(formatted(page)).toBeVisible();

  // Other documents too, for example a plan with raw HTML in it.
  const { url: fixture } = await (async () => {
    await server?.stop();
    return serveArtifacts();
  })();
  const plan = await readFile(path.join(FIXTURES, "artifacts", "specs", "001-full", "plan.md"), "utf8");
  await page.goto(`${fixture}features/001-full/plan.html`);
  await article(page).locator('details[data-part="raw"] summary').click();
  expect(await article(page).locator('details[data-part="raw"] pre').evaluate((p) => p.textContent)).toBe(asInPage(plan));
});

test("US5 FR-040 Expand all opens every collapsed part", async ({ page }) => {
  const { url } = await serveRepo();
  await page.goto(`${url}${SPEC_002}`);
  const button = article(page).locator('button[data-part="expand-all"]');
  await expect(button).toBeVisible();
  const closed = article(page).locator('[data-part="formatted"] details:not([open])');
  expect(await closed.count()).toBeGreaterThan(5);
  await button.click();
  await expect(closed).toHaveCount(0);
  await expect(button).toHaveText("Collapse all");
  await expect(article(page).locator('details[data-part="raw"]')).not.toHaveAttribute("open", "");
  await button.click();
  await expect(article(page).locator('[data-part="formatted"] details[open]')).toHaveCount(0);
  await expect(button).toHaveText("Expand all");
});

test("US5 FR-043 SC-012 every non-blank source line appears in the formatted view", async ({ page }) => {
  test.setTimeout(120_000);
  // Every spec.md of this repository's specs/*/ and of the fixture projects.
  const roots = [{ name: "repo", copy: null }];
  for (const name of await readdir(FIXTURES)) {
    const specs = path.join(FIXTURES, name, "specs");
    const dirs = await readdir(specs).catch(() => []);
    if (dirs.length) roots.push({ name, copy: name });
  }
  let checked = 0;
  for (const root of roots) {
    await server?.stop();
    const { dir, url } = root.copy ? await serveArtifactsLike(root.copy) : await serveRepo();
    for (const feature of await readdir(path.join(dir, "specs"))) {
      const file = path.join(dir, "specs", feature, "spec.md");
      const source = await readFile(file, "utf8").catch(() => null);
      if (source === null) continue;
      // The parser's invariant on the real file: disjoint blocks covering every line.
      const { blocks } = parseSpecStructure(source);
      expect(blocks[0].from).toBe(1);
      for (let i = 1; i < blocks.length; i++) expect(blocks[i].from, `${root.name} ${feature}`).toBe(blocks[i - 1].to + 1);
      expect(blocks.at(-1).to).toBe(source.split("\n").length);

      await page.goto(`${url}features/${feature}/spec.html`);
      await expect(article(page)).toHaveAttribute("data-kind", "spec");
      const words = await formattedWords(page);
      expect(missingLines(source, words), `${root.name}: specs/${feature}/spec.md`).toEqual([]);
      checked++;
    }
  }
  expect(checked).toBeGreaterThanOrEqual(11);
  // The check itself notices a missing line.
  expect(missingLines("only here", ["elsewhere"])).toEqual(["only here"]);
  expect(lineParts("")).toEqual([]);
});

/** @param {string} name a fixture project */
async function serveArtifactsLike(name) {
  const dir = await copyFixture(name);
  server = await startServe(dir);
  return { dir, url: server.url };
}

test("US5 FR-043 a non-template section renders as ordinary text", async ({ page }) => {
  const { url } = await serveArtifacts(async (dir) => {
    await writeFile(
      path.join(dir, "specs", "002-partial", "spec.md"),
      [
        "# Feature Specification: Partial",
        "",
        "## User Scenarios & Testing",
        "",
        "Free text under the user scenarios, *not* following the template.",
        "",
        "- a plain list",
        "",
        "### Notes",
        "",
        "More free text.",
        "",
        "## Clarifications",
        "",
        "Decided in a meeting; no questions recorded.",
        "",
      ].join("\n"),
    );
  });
  await page.goto(`${url}features/002-partial/spec.html`);
  const view = formatted(page);
  await expect(view.locator("h2")).toHaveCount(2);
  await expect(view.locator("p").filter({ hasText: "Free text under the user scenarios" }).locator("em")).toHaveText("not");
  await expect(view.locator("ul > li")).toContainText(["a plain list"]);
  await expect(view.locator("h3#notes")).toHaveText("Notes");
  await expect(view).toContainText("More free text.");
  await expect(view).toContainText("Decided in a meeting; no questions recorded.");
  await expect(view.locator('details[data-part="story"]')).toHaveCount(0);
});

test("US5 FR-007 document pages show the icon rail instead of the sidebar", async ({ page }) => {
  const { url } = await serveArtifacts();
  for (const p of ["features/001-full/spec.html", "features/001-full/tasks.html", "constitution.html", "assessments/idea-x/intake.html"]) {
    await page.goto(`${url}${p}`);
    await expect(rail(page)).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await expect(rail(page).locator('[data-part="theme"]')).toBeVisible();
    const box = await rail(page).boundingBox();
    expect(box?.width).toBe(72);
    // Reader columns: document list, reading column and contents panel side by side.
    const list = await docList(page).boundingBox();
    const doc = await article(page).boundingBox();
    const panel = await toc(page).boundingBox();
    expect(list && doc && panel).toBeTruthy();
    expect(list.x).toBeGreaterThanOrEqual(72);
    expect(list.x + list.width).toBeLessThanOrEqual(doc.x + 1);
    expect(doc.x + doc.width).toBeLessThanOrEqual(panel.x + 1);
  }
});

test("US3 AC1 a feature page links every artifact and each opens in one step", async ({ page }) => {
  const { url } = await serveArtifacts();
  await page.goto(url);
  await expect(feature(page, "001-full")).toHaveAttribute("open", "");
  await feature(page, "001-full").locator('a[data-part="open-feature"]').click();
  await expect(page).toHaveURL(`${url}${featurePagePath("001-full")}`);
  const expected = [
    ["features/001-full/spec.html", "specs/001-full/spec.md"],
    ["features/001-full/plan.html", "specs/001-full/plan.md"],
    ["features/001-full/research.html", "specs/001-full/research.md"],
    ["features/001-full/data-model.html", "specs/001-full/data-model.md"],
    ["features/001-full/quickstart.html", "specs/001-full/quickstart.md"],
    ["features/001-full/contracts/cli.html", "specs/001-full/contracts/cli.md"],
    ["features/001-full/checklists/requirements.html", "specs/001-full/checklists/requirements.md"],
    ["features/001-full/decisions.html", "specs/001-full/decisions.md"],
    ["features/001-full/run-log.html", "specs/001-full/run-log.md"],
    ["features/001-full/tasks.html", "specs/001-full/tasks.md"],
  ];
  const links = artifactLinks(page);
  await expect(links).toHaveCount(expected.length);
  for (const [i, [href]] of expected.entries()) await expect(links.nth(i)).toHaveAttribute("href", `/${href}`);

  for (const [i, [, source]] of expected.entries()) {
    await page.goto(`${url}${featurePagePath("001-full")}`);
    await clickArtifactLink(artifactLinks(page).nth(i));
    await expect(article(page)).toHaveAttribute("data-key", source);
    await expect(article(page).locator("h1").first()).toBeVisible();
  }
});

test("US3 AC2 the sidebar or rail lists the constitution and opens it in one step", async ({ page }) => {
  const { url } = await serveArtifacts();
  for (const start of ["", featurePagePath("001-full"), "features/002-partial/plan.html", "assessments/idea-x/notes.html"]) {
    await page.goto(`${url}${start}`);
    const link = navLink(page, "Constitution");
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(`${url}constitution.html`);
    await expect(article(page)).toHaveAttribute("data-key", ".specify/memory/constitution.md");
    await expect(article(page).locator("h1")).toHaveText("Artifacts Fixture Constitution");
  }
});

test("US3 AC3 tables, task lists, code and links to other artifacts render", async ({ page }) => {
  const { url } = await serveArtifacts();
  await page.goto(`${url}features/001-full/plan.html`);
  const a = formatted(page);

  await expect(a.locator("table th")).toHaveText(["Module", "Purpose"]);
  await expect(a.locator("table tbody tr")).toHaveCount(2);

  const boxes = a.locator('li.task-list-item input[type="checkbox"]');
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(boxes.nth(i)).toBeDisabled();
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
  await expect(boxes.nth(2)).toBeChecked();

  const code = a.locator("pre code.language-js");
  expect(await code.textContent()).toBe('const answer = 40 + 2;\nconsole.log("<b>" + answer);\n');
  expect(await code.evaluate((el) => getComputedStyle(el.parentElement).whiteSpace)).toMatch(/^pre/);

  await a.getByRole("link", { name: "spec", exact: true }).click();
  await expect(page).toHaveURL(`${url}features/001-full/spec.html`);
  await expect(article(page)).toHaveAttribute("data-key", "specs/001-full/spec.md");

  await page.goto(`${url}features/001-full/plan.html`);
  await formatted(page).getByRole("link", { name: "cli", exact: true }).click();
  await expect(page).toHaveURL(`${url}features/001-full/contracts/cli.html#synopsis`);
  await expect(page.locator("#synopsis")).toHaveText("01 Synopsis");
});

test("US3 AC4 no script from a file runs", async ({ page }) => {
  const { url } = await serveArtifacts();
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  await page.goto(`${url}features/001-full/plan.html`);
  await expect(formatted(page)).toContainText("<script>alert(1)</script>");
  await expect(formatted(page)).toContainText("<img src=x onerror=alert(1)>");
  await expect(article(page).locator("script, img, iframe, object, embed")).toHaveCount(0);
  await expect(formatted(page)).toContainText("[x](javascript:alert(1))");
  await expect(article(page).locator('a[href^="javascript" i]')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(dialogs).toEqual([]);
});

test("US3 AC5 no link for a missing artifact", async ({ page }) => {
  const { url } = await serveArtifacts();
  await page.goto(`${url}${featurePagePath("002-partial")}`);
  const links = artifactLinks(page);
  await expect(links).toHaveCount(2);
  await expect(links.nth(0)).toHaveAttribute("href", "/features/002-partial/spec.html");
  await expect(links.nth(1)).toHaveAttribute("href", "/features/002-partial/plan.html");
  await expect(page.locator('[data-region="tabs"] a[href*="research"], main a[href*="tasks.html"]')).toHaveCount(0);
});

test("US3 AC6 every artifact page links back to the overview and has the rail", async ({ page }) => {
  const { url } = await serveArtifacts();
  for (const p of PAGES) {
    await page.goto(`${url}${p}`);
    await expect(rail(page)).toBeVisible();
    await expect(sidebar(page)).toHaveCount(0);
    await expect(navLink(page, "Overview")).toBeVisible();
    await expect(navLink(page, "Overview")).toHaveAttribute("href", "/index.html");
    const back = p.startsWith("features/") ? `/features/${p.split("/")[1]}/index.html` : "/index.html";
    await expect(page.locator('[data-region="doc-list"] a[data-part="back"]')).toHaveAttribute("href", back);
  }
  await navLink(page, "Overview").click();
  await expect(page).toHaveURL(`${url}index.html`);
  await expect(page.locator('[data-region="stats"]')).toBeVisible();
});

test("US3 FR-029 every feature has a feature page reachable from the sidebar, listing its documents", async ({ page }) => {
  const { url } = await serveArtifacts();
  for (const [dir, title, docs] of [
    ["001-full", "Full", 10],
    ["002-partial", "Partial", 2],
  ]) {
    await page.goto(url);
    await sidebar(page).locator(`a[data-key="side:${dir}"]`).click();
    await expect(page).toHaveURL(`${url}${featurePagePath(dir)}`);
    await expect(sidebar(page).locator(`a[data-key="side:${dir}"]`)).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-region="feature-head"] code')).toHaveText(dir);
    await expect(page.locator('[data-region="feature-head"] h1')).toContainText(title);
    await expect(artifactLinks(page)).toHaveCount(docs);
  }
});

test("US3 SC-004 FR-022 every artifact page is reachable from the overview in at most 2 link clicks", async ({ page }) => {
  const { url } = await serveArtifacts();
  const origin = new URL(url).origin;
  /** @type {Map<string, number>} page path → clicks needed */
  const depth = new Map([["/", 0]]);
  let frontier = ["/"];
  for (let d = 1; d <= 2; d++) {
    const next = [];
    for (const p of frontier) {
      await page.goto(`${origin}${p}`);
      const hrefs = await page.locator("a[href]").evaluateAll((els) => els.map((el) => /** @type {HTMLAnchorElement} */ (el).href));
      for (const href of hrefs) {
        const u = new URL(href);
        if (u.origin !== origin || !u.pathname.endsWith(".html")) continue;
        if (depth.has(u.pathname)) continue;
        depth.set(u.pathname, d);
        next.push(u.pathname);
      }
    }
    frontier = next;
  }
  const missing = PAGES.filter((p) => !depth.has(`/${p}`));
  expect(missing, "artifact pages not reachable in 2 clicks").toEqual([]);
  // Each reached page really is that artifact.
  for (const p of PAGES) {
    const res = await page.request.get(`${origin}/${p}`);
    expect(res.status(), p).toBe(200);
  }
});

test("US3 FR-024 no dialog fires on the plan page and <script> shows as text", async ({ page }) => {
  const { url } = await serveArtifacts();
  let fired = false;
  page.on("dialog", (d) => {
    fired = true;
    d.dismiss();
  });
  await page.goto(`${url}features/001-full/plan.html`);
  await page.waitForLoadState("load");
  await expect(formatted(page).getByText("<script>alert(1)</script>")).toBeVisible();
  await page.waitForTimeout(500);
  expect(fired).toBe(false);
});

test("US3 FR-023 a link to a file that is not an artifact is plain text and the file is not served", async ({ page }) => {
  const { url } = await serveArtifacts(async (dir) => {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "index.js"), "export const secret = 42;\n");
  });
  await page.goto(`${url}features/001-full/plan.html`);
  await expect(formatted(page)).toContainText("Source code: src.");
  await expect(article(page).getByRole("link", { name: "src", exact: true })).toHaveCount(0);
  await expect(article(page).locator('a[href*="index.js"]')).toHaveCount(0);
  const res = await page.request.get(`${url}src/index.js`);
  expect(res.status()).toBe(404);
  expect(await res.text()).not.toContain("secret");
});

test("US3 FR-020 a mermaid block is shown as code", async ({ page }) => {
  const { url } = await serveArtifacts();
  await page.goto(`${url}features/001-full/plan.html`);
  const block = formatted(page).locator("pre code.language-mermaid");
  await expect(block).toHaveCount(1);
  expect(await block.textContent()).toBe("graph TD\n  A[Overview] --> B[Artifact]\n");
  await expect(formatted(page).locator("svg")).toHaveCount(0);
});

test("US3 FR-038 every request while loading artifact pages goes to the server's own origin", async ({ page }) => {
  const { url } = await serveArtifacts();
  const origin = new URL(url).origin;
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  for (const p of PAGES) {
    await page.goto(`${url}${p}`);
    await page.waitForLoadState("load");
  }
  expect(requests.length).toBeGreaterThan(PAGES.length);
  const foreign = requests.filter((r) => new URL(r).origin !== origin);
  expect(foreign).toEqual([]);
});
