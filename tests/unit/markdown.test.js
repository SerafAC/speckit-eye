import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createMarkdown, renderInline, slugify, resolveHref } from "../../src/render/markdown.js";

const ARTIFACTS = new Map([
  ["specs/001-full/spec.md", { url: "features/001-full/spec.html" }],
  ["specs/001-full/plan.md", { url: "features/001-full/plan.html" }],
  ["specs/001-full/contracts/cli.md", { url: "features/001-full/contracts/cli.html" }],
  ["specs/002-other/spec.md", { url: "features/002-other/spec.html" }],
  [".specify/memory/constitution.md", { url: "constitution.html" }],
]);

const PLAN = "specs/001-full/plan.md";

const render = (text, { source = PLAN, base = "/" } = {}) => createMarkdown({ artifactsBySource: ARTIFACTS, base })(source, text);

describe("createMarkdown: safety (FR-024)", () => {
  test("script tags are escaped and shown as text", () => {
    const out = render("<script>alert(1)</script>");
    assert.doesNotMatch(out, /<script/i);
    assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test("inline HTML with event handlers is escaped", () => {
    const out = render("<img src=x onerror=alert(1)>\n\nText <b onclick=x>bold</b>");
    assert.doesNotMatch(out, /<img/i);
    assert.doesNotMatch(out, /<b /);
    assert.match(out, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  test("javascript:, vbscript: and data: links are not links", () => {
    for (const href of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "vbscript:x", "data:text/html,x", "file:///etc/passwd"]) {
      const out = render(`[x](${href})`);
      assert.doesNotMatch(out, /<a /, href);
    }
  });

  test("images are rendered as their alt text, never fetched", () => {
    const out = render("![a diagram](https://example.com/x.png) ![local](./img.png)");
    assert.doesNotMatch(out, /<img/);
    assert.match(out, /a diagram/);
    assert.match(out, /local/);
  });
});

describe("createMarkdown: Markdown features (FR-020)", () => {
  test("tables", () => {
    const out = render("| A | B |\n|---|---|\n| 1 | 2 |");
    assert.match(out, /<table>[\s\S]*<th>A<\/th>[\s\S]*<td>2<\/td>[\s\S]*<\/table>/);
  });

  test("task lists become disabled checkboxes, checked when done", () => {
    const out = render("- [ ] open\n- [x] done\n- [X] also done\n- plain");
    assert.match(out, /<ul class="contains-task-list">/);
    assert.match(out, /<li class="task-list-item"><input type="checkbox" disabled> open<\/li>/);
    assert.match(out, /<li class="task-list-item"><input type="checkbox" disabled checked> done<\/li>/);
    assert.match(out, /<li class="task-list-item"><input type="checkbox" disabled checked> also done<\/li>/);
    assert.match(out, /<li>plain<\/li>/);
  });

  test("a bracket without a following space is not a task", () => {
    assert.doesNotMatch(render("- [x]done"), /checkbox/);
    assert.doesNotMatch(render("[ ] not in a list"), /checkbox/);
  });

  test("fenced blocks are escaped code with a language class; mermaid stays code", () => {
    const out = render("```js\nconst a = \"<b>\";\n```\n\n```mermaid\ngraph TD\n  A --> B\n```");
    assert.match(out, /<pre><code class="language-js">const a = &quot;&lt;b&gt;&quot;;\n<\/code><\/pre>/);
    assert.match(out, /<pre><code class="language-mermaid">graph TD\n {2}A --&gt; B\n<\/code><\/pre>/);
  });

  test("block quotes", () => {
    assert.match(render("> quoted"), /<blockquote>\s*<p>quoted<\/p>\s*<\/blockquote>/);
  });

  test("raw HTML is off and bare URLs are not linkified", () => {
    assert.doesNotMatch(render("see https://example.com"), /<a /);
  });
});

describe("createMarkdown: links (FR-023)", () => {
  test("relative link to a known artifact goes to its page", () => {
    assert.match(render("[spec](./spec.md)"), /<a href="\/features\/001-full\/spec.html">spec<\/a>/);
    assert.match(render("[spec](spec.md)"), /<a href="\/features\/001-full\/spec.html">spec<\/a>/);
  });

  test("the fragment is kept", () => {
    assert.match(render("[cli](./contracts/cli.md#synopsis)"), /<a href="\/features\/001-full\/contracts\/cli.html#synopsis">cli<\/a>/);
  });

  test("links resolve against the source file's folder", () => {
    const out = render("[plan](../plan.md) [other](../../002-other/spec.md)", { source: "specs/001-full/contracts/cli.md" });
    assert.match(out, /href="\/features\/001-full\/plan.html"/);
    assert.match(out, /href="\/features\/002-other\/spec.html"/);
    const c = render("[c](../../.specify/memory/constitution.md)");
    assert.match(c, /href="\/constitution.html"/);
  });

  test("the base path is prefixed", () => {
    assert.match(render("[spec](./spec.md)", { base: "/repo/" }), /href="\/repo\/features\/001-full\/spec.html"/);
  });

  test("links to files that are not artifacts become plain text", () => {
    for (const href of ["../../src/index.js", "./missing.md", "../../../outside.md", "/etc/passwd", "//evil.example/x"]) {
      const out = render(`[label](${href})`);
      assert.doesNotMatch(out, /<a /, href);
      assert.match(out, /<p>label<\/p>/, href);
    }
  });

  test("formatted link text stays when the link is dropped", () => {
    assert.match(render("[**src** code](../../src/index.js)"), /<p><strong>src<\/strong> code<\/p>/);
  });

  test("http, https and mailto links are kept; other schemes are dropped", () => {
    assert.match(render("[docs](https://example.com)"), /<a href="https:\/\/example.com">docs<\/a>/);
    assert.match(render("[d](http://example.com/a)"), /<a href="http:\/\/example.com\/a">d<\/a>/);
    assert.match(render("[m](mailto:a@example.com)"), /<a href="mailto:a@example.com">m<\/a>/);
    assert.doesNotMatch(render("[f](ftp://example.com)"), /<a /);
  });

  test("in-page fragment links are kept", () => {
    assert.match(render("[top](#summary)"), /<a href="#summary">top<\/a>/);
  });

  test("a plain-object artifact index works too", () => {
    const r = createMarkdown({ artifactsBySource: { "specs/001-full/spec.md": { url: "features/001-full/spec.html" } }, base: "/" });
    assert.match(r(PLAN, "[s](spec.md)"), /href="\/features\/001-full\/spec.html"/);
  });

  test("resolveHref keeps a malformed escape as is and drops an empty target", () => {
    const m = new Map([["specs/a/%E0%A4.md", { url: "features/a/odd.html" }]]);
    assert.equal(resolveHref("%E0%A4.md", "specs/a/spec.md", m, "/"), "/features/a/odd.html");
    assert.equal(resolveHref("?x=1", "specs/a/spec.md", m, "/"), null);
  });

  test("list items without a leading text paragraph are not task items", () => {
    const out = render("- **[ ] bold**\n-\n- `[x]` code\n");
    assert.doesNotMatch(out, /type="checkbox"/);
    assert.match(out, /<strong>\[ \] bold<\/strong>/);
  });

  test("an empty heading gets the fallback id and missing text renders nothing", () => {
    assert.match(render("#\n"), /<h1 id="section"><\/h1>/);
    assert.equal(createMarkdown({ artifactsBySource: ARTIFACTS, base: "/" })(PLAN, undefined), "");
  });

  test("resolveHref handles encoded names and queries", () => {
    const m = new Map([["specs/a/my file.md", { url: "features/a/x.html" }]]);
    assert.equal(resolveHref("my%20file.md?x=1#h", "specs/a/spec.md", m, "/"), "/features/a/x.html#h");
    assert.equal(resolveHref("#", "specs/a/spec.md", m, "/"), null);
  });
});

describe("slugs", () => {
  test("slugify", () => {
    assert.equal(slugify("Hello, World!"), "hello-world");
    assert.equal(slugify("  R3. Markdown rendering  "), "r3-markdown-rendering");
    assert.equal(slugify("Ünïcode & more"), "n-code-more");
    assert.equal(slugify("---"), "");
  });

  test("headings get ids; duplicates are suffixed -1, -2", () => {
    const out = render("# Intro\n## Intro\n## Intro\n### `code` *here*\n## !!!");
    assert.match(out, /<h1 id="intro">Intro<\/h1>/);
    assert.match(out, /<h2 id="intro-1">Intro<\/h2>/);
    assert.match(out, /<h2 id="intro-2">Intro<\/h2>/);
    assert.match(out, /<h3 id="code-here">/);
    assert.match(out, /<h2 id="section">!!!<\/h2>/);
  });

  test("a suffixed id does not clash with a literal heading of the same name", () => {
    const out = render("# A\n# A-1\n# A");
    assert.match(out, /<h1 id="a">A<\/h1>/);
    assert.match(out, /<h1 id="a-1">A-1<\/h1>/);
    assert.match(out, /<h1 id="a-2">A<\/h1>/);
  });

  test("ids restart for each document", () => {
    const r = createMarkdown({ artifactsBySource: ARTIFACTS, base: "/" });
    r(PLAN, "# X");
    assert.match(r(PLAN, "# X"), /<h1 id="x">/);
  });
});

describe("renderInline (T045)", () => {
  const md = () => createMarkdown({ artifactsBySource: ARTIFACTS, base: "/repo/" });

  test("inline formatting without a paragraph", () => {
    assert.equal(renderInline(md(), "Add `a/b.go` and **bold** _em_"), "Add <code>a/b.go</code> and <strong>bold</strong> <em>em</em>");
  });

  test("inline HTML stays text", () => {
    const out = renderInline(md(), 'Fix <script>alert(1)</script> and <b onclick="x">b</b>');
    assert.doesNotMatch(out, /<script|<b /);
    assert.match(out, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  test("links follow the document rules, resolved from the given source", () => {
    const render = md();
    assert.equal(renderInline(render, "[plan](plan.md)", "specs/001-full/tasks.md"), '<a href="/repo/features/001-full/plan.html">plan</a>');
    assert.doesNotMatch(renderInline(render, "[x](javascript:alert(1))", "specs/001-full/tasks.md"), /<a /);
    assert.equal(renderInline(render, "[y](../../secret.txt)", "specs/001-full/tasks.md"), "y");
    assert.equal(renderInline(render.md, "[w](https://example.com)"), '<a href="https://example.com">w</a>');
  });

  test("the text is not changed", () => {
    assert.equal(renderInline(md(), "T001 [P] [US1] depends on T002"), "T001 [P] [US1] depends on T002");
  });
});

describe("tasks.md task lines are addressable (T045, FR-044)", () => {
  const TASKS = [
    "# Tasks", // 1
    "", // 2
    "## Phase 1: Setup", // 3
    "", // 4
    "- [ ] T001 first `src/a.js`", // 5
    "- [x] T002 second", // 6
    "", // 7
    "```", // 8
    "- [ ] T999 inside a fence", // 9
    "```", // 10
    "<!-- - [ ] T998 in a comment -->", // 11
    "  * [X] T003 nested", // 12
    "- plain item", // 13
  ].join("\n");

  test("every task line is wrapped in <span id=L<line>>", () => {
    const out = render(TASKS, { source: "specs/001-full/tasks.md" });
    assert.match(out, /<span id="L5" data-source-line><input type="checkbox" disabled> T001 first <code>src\/a\.js<\/code><\/span>/);
    assert.match(out, /<span id="L6" data-source-line><input type="checkbox" disabled checked> T002 second<\/span>/);
    assert.match(out, /<span id="L12" data-source-line>/);
    assert.doesNotMatch(out, /id="L9"|id="L11"|id="L13"|id="L1"/);
    assert.equal(out.match(/data-source-line/g).length, 3);
  });

  test("other documents get no line anchors", () => {
    const out = render(TASKS, { source: PLAN });
    assert.doesNotMatch(out, /data-source-line/);
  });

  test("line numbers count CRLF lines like parseTasks", () => {
    const out = render("## Phase 1: A\r\n\r\n- [ ] T001 a\r\n", { source: "specs/001-full/tasks.md" });
    assert.match(out, /<span id="L3" data-source-line>/);
  });
});
