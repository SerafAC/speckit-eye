import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderArtifact } from "../../src/render/artifact.js";

const PLAN = { kind: "plan", title: "Implementation Plan: <Full>", source: "specs/001-full/plan.md", url: "features/001-full/plan.html" };

const render = (artifact, body, opts) => renderArtifact(artifact, body, { base: "/", ...opts }).value;

describe("renderArtifact", () => {
  test("breadcrumb: Overview › feature title › artifact title", () => {
    const out = render(PLAN, "<p>x</p>", { feature: { title: "Full & Feature" } });
    const nav = out.slice(0, out.indexOf("</nav>"));
    assert.match(nav, /^<nav data-region="breadcrumb" aria-label="Breadcrumb">/);
    assert.match(nav, /<a href="\/index.html">Overview<\/a>/);
    assert.match(nav, /›<\/span> <span data-part="parent">Full &amp; Feature<\/span>/);
    assert.match(nav, /<span data-part="current" aria-current="page">Implementation Plan: &lt;Full&gt;<\/span>/);
    assert.ok(nav.indexOf("Overview") < nav.indexOf("Full &amp;") && nav.indexOf("Full &amp;") < nav.indexOf("Implementation"));
  });

  test("the article carries the prose class, region and source key", () => {
    const out = render(PLAN, "<p>x</p>", { feature: { title: "F" } });
    assert.match(out, /<article class="prose" data-region="artifact" data-key="specs\/001-full\/plan.md">\n<p>x<\/p><\/article>$/);
  });

  test("the body is inserted as trusted HTML", () => {
    assert.match(render(PLAN, "<h1 id=\"a\">A</h1>", { feature: { title: "F" } }), /<h1 id="a">A<\/h1>/);
  });

  test("constitution: no parent level", () => {
    const c = { kind: "constitution", title: "Constitution", source: ".specify/memory/constitution.md", url: "constitution.html" };
    const out = render(c, "");
    assert.doesNotMatch(out, /data-part="parent"/);
    assert.match(out, /<a href="\/index.html">Overview<\/a> <span data-part="sep">›<\/span> <span data-part="current"[^>]*>Constitution<\/span>/);
  });

  test("assessment: the assessment is the parent", () => {
    const a = { kind: "assessment", title: "Intake", source: ".specify/assessments/idea-x/intake.md", url: "assessments/idea-x/intake.html" };
    assert.match(render(a, "", { assessment: { slug: "idea-x" } }), /<span data-part="parent">Assessment: idea-x<\/span>/);
  });

  test("the overview link uses the base path", () => {
    assert.match(render(PLAN, "", { base: "/repo/", feature: { title: "F" } }), /<a href="\/repo\/index.html">Overview<\/a>/);
  });

  test("no inline style attributes (serve-mode CSP)", () => {
    assert.doesNotMatch(render(PLAN, "<p>x</p>", { feature: { title: "F" } }), /\sstyle=/);
  });
});
