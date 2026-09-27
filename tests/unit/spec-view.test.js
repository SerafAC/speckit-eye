import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderSpecBlocks, specToc, markKeywords } from "../../src/render/spec-view.js";
import { parseSpecStructure } from "../../src/parse/spec-structure.js";
import { createMarkdown } from "../../src/render/markdown.js";
import { SAMPLES, FULL, DEVIANT, htmlWords, missingLines, lineParts } from "./spec-samples.js";

const md = createMarkdown({
  artifactsBySource: { "specs/005-byte-flow/plan.md": { url: "features/005-byte-flow/plan.html" } },
  base: "/",
});

/** A feature whose phases implement US1 of FULL. */
const FEATURE = {
  dir: "005-byte-flow",
  phases: [
    { key: "005-byte-flow/p1", number: 1, title: "Setup" },
    { key: "005-byte-flow/p3", number: 3, title: "User Story 1" },
  ],
};

/** @param {string} text @param {object} [opts] */
function view(text, opts = {}) {
  const spec = parseSpecStructure(text);
  for (const b of spec.blocks) {
    if (b.kind === "story" && b.id === "US1") {
      b.phases = [{ key: "005-byte-flow/p3", number: 3, title: "User Story 1", counts: { done: 4, total: 9, open: 5, percent: 44 } }];
    }
  }
  return renderSpecBlocks(spec, { md, feature: FEATURE, base: "/repo/", ...opts }).value;
}

/** A 13-answer, 3-session clarifications section (US5 AC3). */
const THIRTEEN = [
  "## Clarifications",
  "",
  "### Session 2026-01-01",
  "",
  ...Array.from({ length: 5 }, (_, i) => `- Q: First ${i}? → A: ${["Yes", "No", "Maybe"][i % 3]} ${i}.`),
  "",
  "### Session 2026-01-02",
  "",
  ...Array.from({ length: 4 }, (_, i) => `- Q: Second ${i}? → A: Yes ${i}.`),
  "",
  "### Session 2026-01-03",
  "",
  ...Array.from({ length: 4 }, (_, i) => `- Q: Third ${i}? → A: No ${i}.`),
].join("\n");

describe("renderSpecBlocks: header parts", () => {
  test("title, metadata card with the source labels, request as a pull quote", () => {
    const out = view(FULL);
    assert.match(out, /^<h1 data-part="title">Feature Specification: Byte Flow &lt;Studio&gt;<\/h1>/);
    assert.match(
      out,
      /<dl data-part="metadata" class="not-prose"><div data-field="branch"><dt>Feature Branch<\/dt><dd>005-byte-flow \(created by the hook\)<\/dd><\/div><div data-field="created"><dt>Created<\/dt><dd>2026-01-15<\/dd><\/div><div data-field="status"><dt>Status<\/dt><dd>Draft<\/dd><\/div><\/dl>/,
    );
    assert.equal(out.split('data-part="metadata"').length, 2, "one card");
    assert.match(out, /<figure data-part="request" class="not-prose"><figcaption>Original request<\/figcaption><blockquote><p>Build a <em>visual<\/em> editor/);
  });

  test("title: false leaves the title to the page header", () => {
    assert.doesNotMatch(view(FULL, { title: false }), /data-part="title"/);
  });

  test("no metadata card without metadata", () => {
    assert.doesNotMatch(view("# T\n\n## A\n"), /data-part="metadata"/);
  });

  test("<script> in the request stays text", () => {
    const out = view(FULL);
    assert.match(out, /Keep it &lt;script&gt;alert\(1\)&lt;\/script&gt; simple\./);
    assert.doesNotMatch(out, /<script/);
  });

  test("numbered section headings with anchors", () => {
    const out = view(FULL);
    assert.match(out, /<h2 id="user-scenarios-testing-mandatory" data-part="section"><span data-part="num">02<\/span> <span data-part="heading">User Scenarios &amp; Testing <em>\(mandatory\)<\/em><\/span><\/h2>/);
  });
});

describe("renderSpecBlocks: clarifications", () => {
  test("N answered · M sessions in the heading; first session open with its question count", () => {
    const out = view(THIRTEEN);
    assert.match(out, /<span data-part="heading">Clarifications<\/span> <span data-part="count">13 answered · 3 sessions<\/span><\/h2>/);
    const sessions = [...out.matchAll(/<details data-part="session"[^>]*>/g)].map((m) => m[0]);
    assert.equal(sessions.length, 3);
    assert.match(sessions[0], / open>$/);
    assert.doesNotMatch(sessions[1], / open/);
    assert.match(out, /Session 2026-01-01<\/span> <span data-part="count">5 questions<\/span>/);
    assert.match(out, /Session 2026-01-02<\/span> <span data-part="count">4 questions<\/span>/);
  });

  test("the first three answers are visible, the rest behind Show N more answers", () => {
    const out = view(THIRTEEN);
    const first = out.slice(out.indexOf("Session 2026-01-01"), out.indexOf("Session 2026-01-02"));
    const [visible, hidden] = first.split('<details data-part="more"');
    assert.equal(visible.split('data-part="answer"').length - 1, 3);
    assert.match(hidden, /<summary>Show 2 more answers<\/summary>/);
    assert.equal(hidden.split('data-part="answer"').length - 1, 2);
  });

  test("Show 10 more answers", () => {
    const text = ["## Clarifications", "", "### Session 1", "", ...Array.from({ length: 13 }, (_, i) => `- Q: q${i}? → A: a${i}`)].join("\n");
    assert.match(view(text), /<summary>Show 10 more answers<\/summary>/);
  });

  test("one row per answer: question, fixed badge, answer text", () => {
    const out = view(FULL);
    assert.match(
      out,
      /<li data-part="answer" data-badge="no"><div data-part="question">Is USB input required\?<\/div><span data-part="badge" data-badge="no">No<\/span><div data-part="answer-text"><p>No\. Deferred to v2\.<\/p>\n<\/div><\/li>/,
    );
    assert.match(out, /<span data-part="badge" data-badge="yes">Yes<\/span><div data-part="answer-text"><p>Yes, every 5 seconds\.<\/p>/);
    assert.match(out, /<span data-part="badge" data-badge="neutral">A<\/span><div data-part="answer-text"><p>Merge them: one level only\.<\/p>/);
  });

  test("items not in Q → A form render as ordinary text", () => {
    const out = view(DEVIANT);
    assert.match(out, /<li data-part="plain"><p>Answers were collected in a meeting\.<\/p>/);
    assert.match(out, /<span data-part="count">1 answered · 1 session<\/span>/);
  });
});

describe("renderSpecBlocks: user stories", () => {
  test("first story open as a card, others collapsed rows with ID, priority, title and scenario count", () => {
    const out = view(FULL);
    const stories = [...out.matchAll(/<details data-part="story"[^>]*><summary>.*?<\/summary>/g)].map((m) => m[0]);
    assert.equal(stories.length, 2);
    assert.match(stories[0], /id="user-story-1-build-a-flow-priority-p1" open><summary><span class="chip" data-part="story-id">US1<\/span> <span class="pill" data-part="priority" data-priority="P1">P1<\/span> <span data-part="story-title">Build a flow<\/span> <span data-part="count">3 scenarios<\/span><\/summary>/);
    assert.match(stories[1], /id="user-story-2-share-a-flow-priority-p2"><summary>.*US2.*P2.*Share a flow.*1 scenario</);
  });

  test("Why this priority and Independent test boxes", () => {
    const out = view(FULL);
    assert.match(out, /<div data-part="why"><h4>Why this priority<\/h4><p>It is the core of the product\.<\/p>\n<\/div>/);
    assert.match(out, /<div data-part="test"><h4>Independent test<\/h4><p>Open the editor and add two blocks\.<\/p>\n<\/div>/);
  });

  test("numbered Given / When / Then table; raw scenarios as one full-width row", () => {
    const out = view(FULL);
    assert.match(out, /<thead><tr><th scope="col" data-part="n">#<\/th><th scope="col">Given<\/th><th scope="col">When<\/th><th scope="col">Then<\/th><\/tr><\/thead>/);
    assert.match(out, /<tr><td data-part="n">1<\/td><td>a blank canvas<\/td><td>the user adds a block<\/td><td>a flow forms\.<\/td><\/tr>/);
    assert.match(out, /<tr data-raw><td data-part="n">3<\/td><td colspan="3"><p><strong>Given<\/strong> A, <strong>Then<\/strong> B;/);
  });

  test("the linked phase with done/total, linking to the feature page", () => {
    const out = view(FULL);
    assert.match(out, /<div data-part="phases"><h4>Implemented in<\/h4><ul><li><a href="\/repo\/features\/005-byte-flow\/index.html#phase-3">Phase 3: User Story 1<\/a> <span data-part="progress">4 \/ 9<\/span><\/li><\/ul><\/div>/);
    const us2 = out.slice(out.indexOf('data-key="spec:story:user-story-2'));
    assert.doesNotMatch(us2.slice(0, us2.indexOf("</details>")), /data-part="phases"/);
  });
});

describe("renderSpecBlocks: requirements and entities", () => {
  test("hidden area chips with All pressed; area headings; ID chips", () => {
    const out = view(FULL);
    assert.match(
      out,
      /<div data-part="areas" role="group" aria-label="Requirement areas" hidden><button type="button" data-area="all" aria-pressed="true">All<\/button><button type="button" data-area="1" aria-pressed="false">Editing<\/button><button type="button" data-area="2" aria-pressed="false">Sharing<\/button><\/div>/,
    );
    assert.match(out, /<div data-part="area" data-area="0"><ul data-part="requirement-list"><li data-part="requirement" id="fr-000"><span class="chip" data-part="req-id">FR-000<\/span>/);
    assert.match(out, /<div data-part="area" data-area="1"><h4 data-part="area-name">Editing<\/h4>/);
  });

  test("normative keywords highlighted as whole upper-case words, longest first, never in code", () => {
    const out = view(FULL);
    assert.match(out, /blocks <mark data-kw="must-not">MUST NOT<\/mark> overlap/);
    assert.match(out, /Users <mark data-kw="must">MUST<\/mark> be able/);
    assert.match(out, /<mark data-kw="should-not">SHOULD NOT<\/mark> hide/);
    assert.match(out, /It <mark data-kw="may">MAY<\/mark> show/);
    assert.match(out, /<code>MUST<\/code> in code stays plain/);
    assert.doesNotMatch(out, /<code><mark/);
  });

  test("markKeywords leaves lower-case words and longer words alone", () => {
    const tokens = md.md.parseInline("must MAYBE MUSTER MAY", {})[0].children;
    const html = md.md.renderer.renderInline(markKeywords(tokens, tokens[0].constructor), md.md.options, {});
    assert.equal(html, 'must MAYBE MUSTER <mark data-kw="may">MAY</mark>');
  });

  test("text that is not a requirement stays in its area as ordinary text", () => {
    assert.match(view(FULL), /<li data-part="plain"><p>Some text that is not a requirement\.<\/p>/);
  });

  test("key entities as a grid of cards", () => {
    assert.match(
      view(FULL),
      /<section data-part="entities" class="not-prose"><h3 id="key-entities">Key Entities<\/h3><div data-part="entity-grid"><div data-part="entity"><h4>Flow<\/h4><p>an ordered set of blocks and links\.<\/p>\n<\/div><div data-part="entity"><h4>Block<\/h4>/,
    );
  });
});

describe("renderSpecBlocks: plain blocks and safety", () => {
  test("a non-template section renders as ordinary Markdown", () => {
    const out = view(DEVIANT);
    assert.match(out, /<p>Free text under “User Scenarios”|<p>Free text under &quot;User Scenarios&quot;/);
    assert.match(out, /<h3 id="requirements">Requirements<\/h3>/);
    assert.match(out, /<table>/);
    assert.match(out, /<pre><code class="language-md">### User Story 9 - Inside a fence/);
  });

  test("links follow the 001 rules", () => {
    const out = view("## A\n\n- Q: See [plan](plan.md)? → A: Yes, [x](javascript:alert(1)).\n".replace("## A", "## Clarifications"));
    assert.match(out, /<a href="\/features\/005-byte-flow\/plan.html">plan<\/a>/);
    assert.doesNotMatch(out, /href="javascript/i);
    assert.match(out, /1 answered · 1 session</);
  });

  test("no <script>, no style attributes", () => {
    for (const text of Object.values(SAMPLES)) {
      const out = view(`${text}\n<script>alert(1)</script>\n`);
      assert.doesNotMatch(out, /<script/);
      assert.doesNotMatch(out, /\sstyle=/);
    }
  });
});

describe("renderSpecBlocks: coverage (SC-012)", () => {
  for (const [name, text] of Object.entries(SAMPLES)) {
    test(`${name}: every non-blank source line's text appears in the output`, () => {
      assert.deepEqual(missingLines(text, htmlWords(view(text))), []);
    });
  }

  test("the check notices a missing line", () => {
    assert.deepEqual(missingLines("# A\n\nmissing words here\n", htmlWords("<h1>A</h1>")), ["missing words here"]);
    assert.deepEqual(lineParts("- Q: Why? → A: Because."), [["why"], ["because"]]);
    assert.deepEqual(lineParts("```js"), []);
  });
});

describe("specToc", () => {
  test("every section, with the stories under their section", () => {
    const toc = specToc(parseSpecStructure(FULL));
    assert.deepEqual(
      toc.map((e) => [e.number, e.anchor, e.stories.map((s) => s.label)]),
      [
        ["01", "clarifications", []],
        ["02", "user-scenarios-testing-mandatory", ["US1 · Build a flow", "US2 · Share a flow"]],
        ["03", "requirements-mandatory", []],
        ["04", "success-criteria-mandatory", []],
      ],
    );
    assert.equal(toc[1].stories[0].anchor, "user-story-1-build-a-flow-priority-p1");
  });

  test("a story before any section is an entry of its own", () => {
    const toc = specToc(parseSpecStructure("# T\n\n### User Story 1 - Lone (Priority: P1)\n\n## After\n"));
    assert.deepEqual(toc.map((e) => [e.number, e.heading, e.anchor]), [
      ["", "US1 · Lone", "user-story-1-lone-priority-p1"],
      ["01", "After", "after"],
    ]);
  });
});
