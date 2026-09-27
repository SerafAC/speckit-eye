import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSearchIndex, searchTerms, featureLabel } from "../../src/render/search-index.js";
import { renderSite } from "../../src/render/site.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

async function model(files) {
  return buildModel(await scan(createFakeReader(files), "proj"));
}

const SPEC = [
  "# Feature Specification: Alpha",
  "",
  "## Clarifications",
  "",
  "### Session 2026-01-01",
  "",
  "- Q: Why? → A: Because.",
  "",
  "## User Scenarios & Testing *(mandatory)*",
  "",
  "### User Story 1 - List items (Priority: P1)",
  "",
  "Body of the story mentions zebrafish.",
  "",
  "#### Deeper heading",
  "",
  "## Requirements *(mandatory)*",
  "",
  "### Functional Requirements",
  "",
  "- **FR-001**: Users MUST list.",
  "",
  "### Key Entities",
  "",
  "- **Item**: a thing.",
].join("\n");

const FILES = {
  ".specify/memory/constitution.md": "# Constitution\n\n## Core Principles\n\nNever say platypus.",
  ".specify/assessments/idea-x/intake.md": "# Intake\n\n## Problem",
  "specs/001-alpha/spec.md": SPEC,
  "specs/001-alpha/plan.md": "# Implementation Plan: Alpha\n\n## Technical Context\n\nUses the quokka library.\n\n## Summary\n\n## Summary\n\nSetext\n------\n",
  "specs/001-alpha/contracts/api.md": "# API\n\n## `GET /items`",
  "specs/001-alpha/tasks.md": [
    "# Tasks",
    "## Phase 1: Setup",
    "- [x] T001 Create   project skeleton",
    "- [ ] T002 [P] [US1] Moving average in `src/avg.js`",
    "- [ ] no id task",
    "## Phase 2: More",
    "- [ ] T003 Depends on T002",
  ].join("\n"),
  "specs/002-beta/spec.md": "# Feature Specification: Beta",
  "specs/misc/spec.md": "# Feature Specification: Misc",
};

let cached = null;
async function index() {
  if (!cached) {
    const project = await model(FILES);
    cached = { project, index: buildSearchIndex(project) };
  }
  return cached;
}

const brief = (e) => `${e.type}:${e.label}`;

describe("buildSearchIndex", () => {
  test("version 1 and entries in page order: feature, its tasks, its documents with headings; then project documents", async () => {
    const { index: idx } = await index();
    assert.equal(idx.version, 1);
    assert.deepEqual(idx.entries.map(brief), [
      "feature:001 · Alpha",
      "task:T001",
      "task:T002",
      "task:No ID",
      "task:T003",
      "document:Feature Specification: Alpha",
      "heading:Clarifications",
      "heading:Session 2026-01-01",
      "heading:User Scenarios & Testing (mandatory)",
      "heading:User Story 1 - List items (Priority: P1)",
      "heading:Requirements (mandatory)",
      "heading:Functional Requirements",
      "heading:Key Entities",
      "document:Implementation Plan: Alpha",
      "heading:Technical Context",
      "heading:Summary",
      "heading:Summary",
      "document:Tasks",
      "heading:Phase 1: Setup",
      "heading:Phase 2: More",
      "document:API",
      "heading:GET /items",
      "feature:002 · Beta",
      "document:Feature Specification: Beta",
      "feature:Misc",
      "document:Feature Specification: Misc",
      "document:Constitution",
      "heading:Core Principles",
      "document:Intake",
      "heading:Problem",
    ]);
  });

  test("task entries: ID or No ID, text as written, feature context, display state, feature-page URL", async () => {
    const { index: idx } = await index();
    const tasks = idx.entries.filter((e) => e.type === "task");
    assert.deepEqual(tasks, [
      {
        type: "task",
        label: "T001",
        detail: "Create   project skeleton",
        context: "001 · Alpha",
        state: "done",
        url: "features/001-alpha/index.html#task-001-alpha-T001",
        terms: "t001 create project skeleton",
      },
      {
        type: "task",
        label: "T002",
        detail: "Moving average in `src/avg.js`",
        context: "001 · Alpha",
        state: "next",
        url: "features/001-alpha/index.html#task-001-alpha-T002",
        terms: "t002 moving average in `src/avg.js`",
      },
      {
        type: "task",
        label: "No ID",
        detail: "no id task",
        context: "001 · Alpha",
        state: "open",
        url: "features/001-alpha/index.html#phase-1",
        terms: "no id no id task",
      },
      {
        type: "task",
        label: "T003",
        detail: "Depends on T002",
        context: "001 · Alpha",
        state: "blocked",
        url: "features/001-alpha/index.html#task-001-alpha-T003",
        terms: "t003 depends on t002",
      },
    ]);
  });

  test("feature entries: number · title, status label and counts, feature page, terms by number and name", async () => {
    const { index: idx } = await index();
    const features = idx.entries.filter((e) => e.type === "feature");
    assert.deepEqual(features, [
      { type: "feature", label: "001 · Alpha", detail: "3 open · 1/4", url: "features/001-alpha/index.html", terms: "001 alpha" },
      { type: "feature", label: "002 · Beta", detail: "Specified · 0/0", url: "features/002-beta/index.html", terms: "002 beta" },
      { type: "feature", label: "Misc", detail: "Specified · 0/0", url: "features/misc/index.html", terms: "misc" },
    ]);
    assert.ok(!("context" in features[0]), "features have no context");
  });

  test("document entries: title, file name, feature / Project / Assessment context, page URL", async () => {
    const { index: idx } = await index();
    const docs = idx.entries.filter((e) => e.type === "document");
    const byTitle = Object.fromEntries(docs.map((d) => [d.label, d]));
    assert.deepEqual(byTitle["Implementation Plan: Alpha"], {
      type: "document",
      label: "Implementation Plan: Alpha",
      detail: "plan.md",
      context: "001 · Alpha",
      url: "features/001-alpha/plan.html",
      terms: "implementation plan: alpha plan.md",
    });
    assert.equal(byTitle.API.detail, "contracts/api.md");
    assert.equal(byTitle.API.url, "features/001-alpha/contracts/api.html");
    assert.equal(byTitle.Constitution.context, "Project");
    assert.equal(byTitle.Constitution.url, "constitution.html");
    assert.equal(byTitle.Intake.context, "Assessment: idea-x");
    assert.equal(byTitle.Intake.url, "assessments/idea-x/intake.html");
  });

  test("heading entries: text, document title, context and the 001 slug anchor; ## and ### only", async () => {
    const { index: idx } = await index();
    const headings = idx.entries.filter((e) => e.type === "heading");
    const plan = headings.filter((h) => h.detail === "Implementation Plan: Alpha");
    assert.deepEqual(plan, [
      { type: "heading", label: "Technical Context", detail: "Implementation Plan: Alpha", context: "001 · Alpha", url: "features/001-alpha/plan.html#technical-context", terms: "technical context" },
      { type: "heading", label: "Summary", detail: "Implementation Plan: Alpha", context: "001 · Alpha", url: "features/001-alpha/plan.html#summary", terms: "summary" },
      { type: "heading", label: "Summary", detail: "Implementation Plan: Alpha", context: "001 · Alpha", url: "features/001-alpha/plan.html#summary-1", terms: "summary" },
    ]);
    const labels = headings.map((h) => h.label);
    assert.ok(!labels.includes("Deeper heading"), "#### is not indexed");
    assert.ok(!labels.includes("Setext"), "setext headings are not ## headings");
    assert.ok(!labels.some((l) => /^(Feature Specification|Implementation Plan|Constitution)/.test(l)), "# titles are documents, not headings");
    assert.equal(headings.find((h) => h.label === "GET /items").url, "features/001-alpha/contracts/api.html#get-items");
  });

  test("no document body text is in the index", async () => {
    const { index: idx } = await index();
    const json = JSON.stringify(idx);
    for (const word of ["zebrafish", "quokka", "platypus", "Because", "Users MUST list", "a thing"]) {
      assert.ok(!json.includes(word), `${word} is body text`);
    }
  });

  test("URLs are relative to the site root: no base, no leading slash", async () => {
    const { index: idx } = await index();
    for (const e of idx.entries) {
      assert.ok(!e.url.startsWith("/"), e.url);
      assert.match(e.url, /^(features\/[^/]+\/|assessments\/[^/]+\/|constitution\.html)/, e.url);
    }
  });

  test("every task URL is a task row (or, without an ID, a phase) of its feature page, and every document and heading URL exists (T051 search-result links)", async () => {
    const { project, index: idx } = await index();
    const site = renderSite(project, { base: "/", mode: "static", version: "1", assets: { styles: "", modules: {}, fonts: {} } });
    for (const e of idx.entries) {
      const [path, anchor] = e.url.split("#");
      const page = site.get(path);
      assert.ok(page, `${e.url}: page exists`);
      if (!anchor) continue;
      const body = String(page.body);
      const hits = body.match(new RegExp(`\\sid="${anchor}"`, "g")) ?? [];
      assert.equal(hits.length, 1, `${e.url}: one element with that id`);
      if (e.type === "task" && e.label !== "No ID") {
        assert.match(body, new RegExp(`<details data-part="task"[^>]* id="${anchor}"`), `${e.url}: a task row`);
      }
    }
  });

  test("terms: lower-case label + detail for tasks and documents, whitespace collapsed", () => {
    assert.equal(searchTerms("  T018\tSearch  BOX\n"), "t018 search box");
    assert.equal(searchTerms("001 · Serial Data"), "001 serial data");
    assert.equal(featureLabel({ number: "001", title: "X" }), "001 · X");
    assert.equal(featureLabel({ number: null, title: "X" }), "X");
  });

  test("an empty project has no entries", async () => {
    assert.deepEqual(buildSearchIndex(await model({})), { version: 1, entries: [] });
  });
});
