import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createMarkdown } from "../../src/render/markdown.js";
import { renderTaskText, renderKindChip, renderFileChip, renderMarkers, fileName } from "../../src/render/task-text.js";
import { taskFiles, taskKind, taskRefs } from "../../src/model/task-files.js";

const md = createMarkdown({
  artifactsBySource: new Map([["specs/001-x/plan.md", { url: "features/001-x/plan.html" }]]),
  base: "/repo/",
});

/** A task shaped like the model's, from its description. */
function task(description, extra = {}) {
  const files = taskFiles(description);
  return {
    id: "T001",
    key: "001-x/T001",
    description,
    files,
    kind: taskKind(files[0]),
    refs: taskRefs(description),
    story: null,
    parallel: false,
    dependsOn: [],
    ...extra,
  };
}

/** Text content of an HTML fragment (tags removed, entities decoded). */
const textOf = (s) =>
  s
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");

describe("renderTaskText (FR-035, FR-037)", () => {
  test("the text is never altered", () => {
    const d = "Create [P] the list view for T012 & friends (depends on T011)";
    assert.equal(textOf(renderTaskText(md, task(d)).value), d);
  });

  test("code spans become mono chips; formatting is rendered", () => {
    const out = renderTaskText(md, task("Add `internal/input/simulator_test.go` with **bold** and _em_")).value;
    assert.equal(out, 'Add <code class="chip" data-part="code">internal/input/simulator_test.go</code> with <strong>bold</strong> and <em>em</em>');
  });

  test("FR/SC references become chips in text, not inside code or link text", () => {
    const out = renderTaskText(md, task("Covers FR-035 and SC-004; `FR-001` stays code; [see FR-002](plan.md)")).value;
    assert.match(out, /Covers <span class="chip" data-ref>FR-035<\/span> and <span class="chip" data-ref>SC-004<\/span>;/);
    assert.match(out, /<code class="chip" data-part="code">FR-001<\/code>/);
    assert.match(out, /<a href="\/repo\/features\/001-x\/plan\.html">see FR-002<\/a>/);
    assert.doesNotMatch(out, /data-ref>FR-001|data-ref>FR-002/);
  });

  test("<script> in a task text stays text", () => {
    const d = "Escape <script>alert(1)</script> and <img src=x onerror=y>";
    const out = renderTaskText(md, task(d)).value;
    assert.doesNotMatch(out, /<script|<img/);
    assert.equal(textOf(out), d);
  });

  test("links resolve from the feature's tasks.md", () => {
    assert.match(renderTaskText(md, task("See [the plan](plan.md)")).value, /href="\/repo\/features\/001-x\/plan\.html"/);
  });
});

describe("kind and file chips (FR-035)", () => {
  test("Go test and simulator_test.go", () => {
    const t = task("Add `internal/input/simulator_test.go`");
    assert.equal(renderKindChip(t).value, '<span class="chip" data-part="kind" title="Go test">Go test</span>');
    assert.equal(renderFileChip(t).value, '<span class="chip" data-part="file" title="internal/input/simulator_test.go">simulator_test.go</span>');
  });

  test("a task naming two files shows 2 files", () => {
    const t = task("Edit `src/a.go` and `web/B.vue`");
    assert.match(renderFileChip(t).value, />2 files<\/span>$/);
    assert.match(renderFileChip(t).value, /title="src\/a\.go\nweb\/B\.vue"/);
    assert.match(renderKindChip(t).value, />Go<\/span>$/);
  });

  test("no file: empty placeholders with the same classes, so columns stay aligned", () => {
    const t = task("Plain task");
    const kind = renderKindChip(t).value;
    const file = renderFileChip(t).value;
    assert.equal(kind, '<span class="chip" data-part="kind" data-empty></span>');
    assert.equal(file, '<span class="chip" data-part="file" data-empty></span>');
    // Same element and class as a filled chip: the fixed width comes from CSS.
    for (const s of [kind, renderKindChip(task("x `a/b.go`")).value]) assert.match(s, /^<span class="chip" data-part="kind"/);
  });

  test("fileName", () => {
    assert.equal(fileName("a/b/c.js"), "c.js");
    assert.equal(fileName("c.js"), "c.js");
  });
});

describe("renderMarkers (FR-036)", () => {
  test("story, Parallel, refs and dependencies", () => {
    const out = renderMarkers(task("Do FR-001 and SC-002", { story: "US2", parallel: true, dependsOn: ["T012", "T013"] })).value;
    assert.equal(
      out,
      '<ul data-part="markers"><li class="tag" data-marker="story">US2</li><li class="tag" data-marker="parallel">Parallel</li><li class="tag" data-marker="ref">FR-001</li><li class="tag" data-marker="ref">SC-002</li><li class="tag" data-marker="depends">depends on T012, T013</li></ul>',
    );
  });

  test("nothing to show → empty", () => {
    assert.equal(renderMarkers(task("plain")), "");
  });
});
