// Unit tests of src/render/reader.js (the document reader, T061). The file
// name avoids tests/unit/reader.test.js, which tests src/project/reader.js.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderDocument, documentLabel, documentFile } from "../../src/render/reader.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createMarkdown } from "../../src/render/markdown.js";
import { allArtifacts } from "../../src/render/site.js";
import { createFakeReader } from "./fake-reader.js";

const PLAN = [
  "# Implementation Plan: Full",
  "",
  "Intro <script>alert(1)</script>.",
  "",
  "## Summary",
  "",
  "Text.",
  "",
  "### Detail",
  "",
  "## Technical Context",
  "",
  "More & more.",
  "",
].join("\n");

const FILES = {
  ".specify/memory/constitution.md": "# Constitution\n\n## Principles\n",
  ".specify/assessments/idea-x/intake.md": "# Intake",
  ".specify/assessments/idea-x/notes.md": "# Notes",
  "specs/001-full/spec.md": [
    "# Feature Specification: Full",
    "",
    "## User Scenarios",
    "",
    "### User Story 1 - Read (Priority: P1)",
    "",
    "### User Story 2 - Write (Priority: P2)",
    "",
    "## Requirements",
  ].join("\n"),
  "specs/001-full/plan.md": PLAN,
  "specs/001-full/research.md": "# Research",
  "specs/001-full/data-model.md": "# Data Model",
  "specs/001-full/quickstart.md": "# Quickstart",
  "specs/001-full/tasks.md": "# Tasks\n\n## Phase 1: Setup\n\n- [x] T001 [US1] one\n- [ ] T002 [US1] two\n",
  "specs/001-full/contracts/cli.md": "# CLI Contract",
  "specs/001-full/contracts/api.md": "# API Contract",
  "specs/001-full/checklists/requirements.md": "# Requirements Checklist",
  "specs/001-full/notes.md": "# Working Notes",
  "specs/002-plan-only/plan.md": "# Plan Only",
};

async function setup(base = "/") {
  const project = buildModel(await scan(createFakeReader(FILES), "proj"));
  const entries = allArtifacts(project);
  const md = createMarkdown({ artifactsBySource: new Map(entries.map(({ artifact }) => [artifact.source, artifact])), base });
  /** @param {string} source */
  const render = (source) => {
    const e = entries.find(({ artifact }) => artifact.source === source);
    assert.ok(e, source);
    return renderDocument(e.artifact, { base, project, feature: e.feature, assessment: e.assessment, md }).value;
  };
  return { project, render };
}

/** @param {string} out */
const docGroups = (out) => {
  const at = out.indexOf('<div data-part="doc-groups">');
  return out.slice(at, out.indexOf("</nav>", at));
};
/** @param {string} out */
const tocOf = (out) => out.slice(out.indexOf('<nav data-region="toc"'));

describe("renderDocument: document list (FR-039)", () => {
  test("groups Define, Design, Contracts, Build, Other with the documents' names", async () => {
    const { render } = await setup();
    const list = docGroups(render("specs/001-full/spec.md"));
    const groups = [...list.matchAll(/<h2>([^<]+)<\/h2><ul>(.*?)<\/ul>/g)].map((m) => [
      m[1],
      [...m[2].matchAll(/>([^<>]+)<\/a>/g)].map((a) => a[1]),
    ]);
    assert.deepEqual(groups, [
      ["Define", ["Specification", "Quality checklist"]],
      ["Design", ["Implementation plan", "Research", "Data model", "Quickstart"]],
      ["Contracts", ["API Contract", "CLI Contract"]],
      ["Build", ["Tasks"]],
      ["Other", ["Working Notes"]],
    ]);
  });

  test("empty groups are left out", async () => {
    const { render } = await setup();
    const list = docGroups(render("specs/002-plan-only/plan.md"));
    assert.deepEqual([...list.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]), ["Design"]);
  });

  test("the current document is marked", async () => {
    const { render } = await setup();
    const list = docGroups(render("specs/001-full/contracts/cli.md"));
    assert.match(list, /<a href="\/features\/001-full\/contracts\/cli.html" aria-current="page">CLI Contract<\/a>/);
    assert.equal(list.split("aria-current").length, 2);
  });

  test("back link to the feature page, the feature title and status", async () => {
    const { render } = await setup("/repo/");
    const out = render("specs/001-full/plan.md");
    assert.match(out, /<a data-part="back" href="\/repo\/features\/001-full\/index.html">‹ Back to feature<\/a>/);
    assert.match(out, /<p data-part="doc-feature"><span data-part="dot" data-status="in-progress"><\/span><span data-part="name">Full<\/span> <span class="pill" data-status="in-progress">1 open<\/span><\/p>/);
  });

  test("the list is also behind a <details> control for narrow screens", async () => {
    const { render } = await setup();
    const out = render("specs/001-full/plan.md");
    assert.match(out, /<nav data-region="doc-list" data-keep-scroll="docs" aria-label="Documents">/);
    assert.match(out, /<details data-part="doc-menu"><summary>Documents<\/summary><section data-part="doc-group" data-group="Define">/);
  });

  test("project documents get the project document list", async () => {
    const { render } = await setup();
    for (const source of [".specify/memory/constitution.md", ".specify/assessments/idea-x/notes.md"]) {
      const out = render(source);
      assert.match(out, /<a data-part="back" href="\/index.html">‹ Back to overview<\/a>/);
      const list = docGroups(out);
      assert.match(list, /<h2>Project<\/h2><ul><li><a href="\/constitution.html"[^>]*>Constitution<\/a><\/li><\/ul>/);
      assert.match(list, /<h2>Assessment: idea-x<\/h2><ul><li><a href="\/assessments\/idea-x\/intake.html"[^>]*>Intake<\/a><\/li><li><a href="\/assessments\/idea-x\/notes.html"/);
    }
    assert.match(docGroups(render(".specify/assessments/idea-x/notes.md")), /notes.html" aria-current="page">Notes</);
  });

  test("documentLabel and documentFile", () => {
    assert.equal(documentLabel({ kind: "plan", title: "Implementation Plan: X", source: "specs/1-x/plan.md" }), "Implementation plan");
    assert.equal(documentLabel({ kind: "checklist", title: "Req", source: "specs/1-x/checklists/requirements.md" }), "Quality checklist");
    assert.equal(documentLabel({ kind: "checklist", title: "UX", source: "specs/1-x/checklists/ux.md" }), "UX");
    assert.equal(documentFile("specs/1-x/contracts/cli.md"), "contracts/cli.md");
    assert.equal(documentFile(".specify/assessments/a/intake.md"), "intake.md");
    assert.equal(documentFile(".specify/memory/constitution.md"), "constitution.md");
  });
});

describe("renderDocument: article (FR-040)", () => {
  test("header: eyebrow, title, hidden Expand all, Raw markdown with the exact source", async () => {
    const { render } = await setup();
    const out = render("specs/001-full/plan.md");
    assert.match(out, /<article data-region="doc" data-key="specs\/001-full\/plan.md" data-kind="plan">\n<header data-part="doc-head">\n<p data-part="eyebrow">IMPLEMENTATION PLAN · plan.md<\/p>\n<h1>Implementation Plan: Full<\/h1>/);
    assert.match(out, /<button type="button" data-part="expand-all" hidden>Expand all<\/button>/);
    const raw = /<details data-part="raw" data-key="raw:specs\/001-full\/plan.md"><summary>Raw markdown<\/summary><pre><code>([\s\S]*?)<\/code><\/pre><\/details>/.exec(out);
    assert.ok(raw);
    const decoded = raw[1].replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    assert.equal(decoded, PLAN);
  });

  test("the title heading is shown once; top-level sections are numbered 01, 02, …", async () => {
    const { render } = await setup();
    const out = render("specs/001-full/plan.md");
    assert.equal(out.split("<h1").length, 2);
    assert.match(out, /<h2 id="summary"><span data-part="num">01<\/span> Summary<\/h2>/);
    assert.match(out, /<h2 id="technical-context"><span data-part="num">02<\/span> Technical Context<\/h2>/);
    assert.match(out, /<h3 id="detail">Detail<\/h3>/);
  });

  test("raw HTML in the file stays text", async () => {
    const { render } = await setup();
    const out = render("specs/001-full/plan.md");
    assert.doesNotMatch(out, /<script/);
    assert.match(out, /Intro &lt;script&gt;alert\(1\)&lt;\/script&gt;\./);
    assert.doesNotMatch(out, /\sstyle=/);
  });

  test("tasks.md keeps its #L<line> anchors (FR-044)", async () => {
    const { render } = await setup();
    const out = render("specs/001-full/tasks.md");
    assert.match(out, /<span id="L5" data-source-line>/);
    assert.match(out, /<h2 id="phase-1-setup"><span data-part="num">01<\/span> Phase 1: Setup<\/h2>/);
  });

  test("spec.md uses the structured view without a second title", async () => {
    const { render } = await setup();
    const out = render("specs/001-full/spec.md");
    assert.match(out, /<p data-part="eyebrow">SPECIFICATION · spec.md<\/p>\n<h1>Feature Specification: Full<\/h1>/);
    assert.equal(out.split("<h1").length, 2);
    assert.match(out, /<details data-part="story" class="not-prose" data-key="spec:story:user-story-1-read-priority-p1" id="user-story-1-read-priority-p1" open>/);
    // The story's phase link comes from the model (T059).
    assert.match(out, /<a href="\/features\/001-full\/index.html#phase-1">Phase 1: Setup<\/a> <span data-part="progress">1 \/ 2<\/span>/);
  });

  test("a document without a title heading keeps its whole body", async () => {
    const project = buildModel(await scan(createFakeReader({ "specs/001-x/notes.md": "Just text.\n\n# Later\n" }), "p"));
    const md = createMarkdown({ artifactsBySource: {}, base: "/" });
    const [artifact] = project.features[0].artifacts;
    const out = renderDocument(artifact, { base: "/", project, feature: project.features[0], md }).value;
    assert.match(out, /<h1>Later<\/h1>/);
    assert.match(out, /<p>Just text\.<\/p>/);
  });
});

describe("renderDocument: contents panel (FR-041)", () => {
  test("lists the numbered sections with a hidden progress indicator", async () => {
    const { render } = await setup();
    const toc = tocOf(render("specs/001-full/plan.md"));
    assert.match(toc, /^<nav data-region="toc" aria-label="On this page"><h2>On this page<\/h2><ol>/);
    assert.deepEqual([...toc.matchAll(/<a href="#([^"]+)" data-toc="\1">/g)].map((m) => m[1]), ["summary", "technical-context"]);
    assert.match(toc, /<a href="#summary" data-toc="summary"><span data-part="num">01<\/span> <span>Summary<\/span><\/a>/);
    assert.match(toc, /<div data-part="progress" hidden><span data-part="progress-bar" class="w-pct-0"><\/span><\/div><\/nav>/);
  });

  test("a specification lists its stories under their section", async () => {
    const { render } = await setup();
    const toc = tocOf(render("specs/001-full/spec.md"));
    assert.match(
      toc,
      /<li><a href="#user-scenarios" data-toc="user-scenarios"><span data-part="num">01<\/span> <span>User Scenarios<\/span><\/a><ol><li><a href="#user-story-1-read-priority-p1" data-toc="user-story-1-read-priority-p1">US1 · Read<\/a><\/li><li><a href="#user-story-2-write-priority-p2"[^>]*>US2 · Write<\/a><\/li><\/ol><\/li>/,
    );
    assert.match(toc, /<span data-part="num">02<\/span> <span>Requirements<\/span>/);
  });

  test("a document without sections says so", async () => {
    const { render } = await setup();
    assert.match(tocOf(render("specs/001-full/research.md")), /<p data-part="empty">No sections<\/p>/);
  });
});
