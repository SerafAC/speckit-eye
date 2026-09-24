import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, raw, html, Raw } from "../../src/render/html.js";

test("escapeHtml escapes the five special characters", () => {
  assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(escapeHtml("plain"), "plain");
  assert.equal(escapeHtml(42), "42");
});

test("escapeHtml escapes an already escaped string again (no special casing)", () => {
  assert.equal(escapeHtml("&amp;"), "&amp;amp;");
});

test("raw wraps a string in a Raw and keeps an existing Raw", () => {
  const r = raw("<b>");
  assert.ok(r instanceof Raw);
  assert.equal(r.value, "<b>");
  assert.equal(raw(r), r);
  assert.equal(String(r), "<b>");
});

test("html escapes interpolated values and returns a Raw", () => {
  const out = html`<p title="${'"x"'}">${"<script>alert(1)</script>"}</p>`;
  assert.ok(out instanceof Raw);
  assert.equal(out.value, '<p title="&quot;x&quot;">&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test("html leaves Raw values and nested templates unescaped", () => {
  const inner = html`<em>${"a & b"}</em>`;
  assert.equal(html`<p>${inner}${raw("<br>")}</p>`.value, "<p><em>a &amp; b</em><br></p>");
});

test("html flattens arrays, including nested arrays, joined with no separator", () => {
  const items = ["<a>", "b"].map((x) => html`<li>${x}</li>`);
  assert.equal(html`<ul>${items}</ul>`.value, "<ul><li>&lt;a&gt;</li><li>b</li></ul>");
  assert.equal(html`${[["x", ["<y>"]], raw("<z>")]}`.value, "x&lt;y&gt;<z>");
});

test("html renders null, undefined and false as empty, but keeps 0 and true", () => {
  assert.equal(html`[${null}${undefined}${false}]`.value, "[]");
  assert.equal(html`[${0}|${true}|${""}]`.value, "[0|true|]");
  assert.equal(html`${[null, false, "a"]}`.value, "a");
});

test("html with no interpolations returns the literal", () => {
  assert.equal(html`<hr>`.value, "<hr>");
});
