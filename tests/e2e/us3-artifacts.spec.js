// US3 — Read any artifact in two steps or fewer (spec.md, User Story 3).
// Every test drives the real CLI against a temporary copy of the `artifacts`
// fixture (tests/fixtures/projects/README.md lists its 16 artifact pages).

import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { copyFixture, featurePagePath, navLink, rail, sidebar, startServe } from "./helpers.js";

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
const article = (page) => page.locator('article[data-region="artifact"]');

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
  const a = article(page);

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
  await article(page).getByRole("link", { name: "cli", exact: true }).click();
  await expect(page).toHaveURL(`${url}features/001-full/contracts/cli.html#synopsis`);
  await expect(page.locator("#synopsis")).toHaveText("Synopsis");
});

test("US3 AC4 no script from a file runs", async ({ page }) => {
  const { url } = await serveArtifacts();
  const dialogs = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.dismiss();
  });
  await page.goto(`${url}features/001-full/plan.html`);
  await expect(article(page)).toContainText("<script>alert(1)</script>");
  await expect(article(page)).toContainText("<img src=x onerror=alert(1)>");
  await expect(article(page).locator("script, img, iframe, object, embed")).toHaveCount(0);
  await expect(article(page)).toContainText("[x](javascript:alert(1))");
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
    await expect(page.locator('[data-region="breadcrumb"] a')).toHaveAttribute("href", "/index.html");
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
  await expect(article(page).getByText("<script>alert(1)</script>")).toBeVisible();
  await page.waitForTimeout(500);
  expect(fired).toBe(false);
});

test("US3 FR-023 a link to a file that is not an artifact is plain text and the file is not served", async ({ page }) => {
  const { url } = await serveArtifacts(async (dir) => {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "index.js"), "export const secret = 42;\n");
  });
  await page.goto(`${url}features/001-full/plan.html`);
  await expect(article(page)).toContainText("Source code: src.");
  await expect(article(page).getByRole("link", { name: "src", exact: true })).toHaveCount(0);
  await expect(article(page).locator('a[href*="index.js"]')).toHaveCount(0);
  const res = await page.request.get(`${url}src/index.js`);
  expect(res.status()).toBe(404);
  expect(await res.text()).not.toContain("secret");
});

test("US3 FR-020 a mermaid block is shown as code", async ({ page }) => {
  const { url } = await serveArtifacts();
  await page.goto(`${url}features/001-full/plan.html`);
  const block = article(page).locator("pre code.language-mermaid");
  await expect(block).toHaveCount(1);
  expect(await block.textContent()).toBe("graph TD\n  A[Overview] --> B[Artifact]\n");
  await expect(article(page).locator("svg")).toHaveCount(0);
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
