import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { renderFeaturePage, phaseCounts } from "../../src/render/feature.js";
import { buildModel } from "../../src/model/build-model.js";
import { scan } from "../../src/project/scan.js";
import { createFakeReader } from "./fake-reader.js";

async function model(files) {
  return buildModel(await scan(createFakeReader(files), "proj"));
}

const FILES = {
  "specs/001-done/spec.md": "# Feature Specification: Done <b>thing</b>",
  "specs/001-done/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n## Phase 2: Core\n- [x] T002 two",
  "specs/002-mid/spec.md": "# Feature Specification: Middle",
  "specs/002-mid/plan.md": "# Plan",
  "specs/002-mid/tasks.md": "## Phase 1: Setup\n- [x] T001 one\n## Phase 2: Core\n- [ ] T002 two\n- [ ] T003 three\n## Phase 3: Empty\n",
  "specs/003-bare/spec.md": "# Feature Specification: Bare",
};

const render = async (dir, base = "/") => {
  const m = await model(FILES);
  const f = m.features.find((x) => x.dir === dir);
  return renderFeaturePage(f, m, { base }).value;
};

describe("renderFeaturePage (T022, FR-030)", () => {
  test("header: breadcrumb, status pill, dir, title and counts", async () => {
    const out = await render("002-mid", "/repo/");
    assert.match(out, /^<header data-region="feature-head">/);
    assert.match(out, /<nav data-part="breadcrumb" aria-label="Breadcrumb"><a href="\/repo\/index\.html">Overview<\/a> <span data-part="sep">\/<\/span> <span>Features<\/span><\/nav>/);
    // 002-mid is the active feature, so its pill says "N open".
    assert.match(out, /<span class="pill" data-status="in-progress">2 open<\/span> <code>002-mid<\/code>/);
    assert.match(out, /<h1>Middle<\/h1>/);
    assert.match(out, /1 \/ 3 tasks · 1 of 2 phases/);
  });

  test("a complete feature and a feature without tasks", async () => {
    const done = await render("001-done");
    assert.match(done, /<span class="pill" data-status="done">Complete<\/span>/);
    assert.match(done, /2 \/ 2 tasks · 2 of 2 phases/);
    assert.match(done, /<h1>Done &lt;b&gt;thing&lt;\/b&gt;<\/h1>/);
    const bare = await render("003-bare");
    assert.match(bare, /<span class="pill" data-status="no-tasks">Specified<\/span>/);
    assert.match(bare, /0 \/ 0 tasks · 0 of 0 phases/);
  });

  test("lists the feature's documents as links", async () => {
    const out = await render("002-mid", "/repo/");
    const docs = out.slice(out.indexOf('<section data-region="documents"'));
    assert.match(docs, /<a href="\/repo\/features\/002-mid\/spec\.html">Feature Specification: Middle<\/a>/);
    assert.match(docs, /<a href="\/repo\/features\/002-mid\/plan\.html">Plan<\/a>/);
    assert.match(docs, /<a href="\/repo\/features\/002-mid\/tasks\.html">/);
    assert.doesNotMatch(out, /style=/);
  });

  test("a feature without documents says so", async () => {
    const m = await model(FILES);
    const f = { ...m.features[2], artifacts: undefined };
    assert.match(renderFeaturePage(f, m, { base: "/" }).value, /<p data-part="empty">No documents\.<\/p>/);
  });

  test("phaseCounts counts only phases with tasks", async () => {
    const m = await model(FILES);
    assert.deepEqual(phaseCounts(m.features[1]), { completed: 1, total: 2 });
    assert.deepEqual(phaseCounts({ phases: undefined }), { completed: 0, total: 0 });
  });
});
