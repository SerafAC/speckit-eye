/**
 * Inline task text and the chips of a task row on the feature page
 * (contracts/routes.md "Inline task text", FR-035, FR-037). Pure: the task's
 * `description` is never changed; formatting is applied only here, and
 * truncation is left to CSS.
 */

import { html, raw } from "./html.js";
import { renderInline } from "./markdown.js";
import { kindChip, REF_RE } from "../model/task-files.js";

/** @typedef {import("../model/build-model.js").Task} Task */
/** @typedef {import("./html.js").Raw} Raw */
/** @typedef {import("./markdown.js").MarkdownRender} MarkdownRender */

/**
 * The `tasks.md` a task comes from, for resolving its relative links.
 * @param {Pick<Task, "key">} task
 * @returns {string}
 */
function sourceOf(task) {
  const dir = String(task.key ?? "").split("/")[0];
  return dir ? `specs/${dir}/tasks.md` : "";
}

/**
 * Wraps FR-/SC- references of text tokens as chips, never inside link text;
 * code spans become mono chips.
 * @param {any[]} children inline tokens
 * @param {any} Token markdown-it's Token class
 * @returns {any[]}
 */
function chipify(children, Token) {
  /** @type {any[]} */
  const out = [];
  let inLink = 0;
  for (const t of children) {
    if (t.type === "link_open") inLink++;
    else if (t.type === "link_close") inLink = Math.max(0, inLink - 1);
    if (t.type === "code_inline") {
      t.attrJoin("class", "chip");
      t.attrSet("data-part", "code");
      out.push(t);
      continue;
    }
    if (t.type !== "text" || inLink > 0) {
      out.push(t);
      continue;
    }
    const re = new RegExp(REF_RE.source, "g");
    let last = 0;
    for (const m of t.content.matchAll(re)) {
      const at = /** @type {number} */ (m.index);
      if (at > last) out.push(textToken(Token, t.content.slice(last, at)));
      const open = new Token("html_inline", "", 0);
      open.content = '<span class="chip" data-ref>';
      out.push(open, textToken(Token, m[0]));
      const close = new Token("html_inline", "", 0);
      close.content = "</span>";
      out.push(close);
      last = at + m[0].length;
    }
    if (last === 0) out.push(t);
    else if (last < t.content.length) out.push(textToken(Token, t.content.slice(last)));
  }
  return out;
}

/**
 * @param {any} Token
 * @param {string} content
 */
function textToken(Token, content) {
  const t = new Token("text", "", 0);
  t.content = content;
  return t;
}

/**
 * The task text as inline HTML: Markdown formatting (code, bold, emphasis,
 * links under the document rules; raw HTML stays text), `code` as mono
 * chips and FR-/SC- references as chips.
 * @param {MarkdownRender | import("markdown-it").default} md
 * @param {Pick<Task, "description" | "key">} task
 * @returns {Raw}
 */
export function renderTaskText(md, task) {
  return raw(renderInline(md, task.description, { source: sourceOf(task), transform: chipify }));
}

/**
 * The fixed-width kind chip ("Go test", "Vue"), or an empty placeholder of
 * the same width when the task names no file (FR-035).
 * @param {Pick<Task, "kind">} task
 * @returns {Raw}
 */
export function renderKindChip(task) {
  const text = kindChip(task.kind);
  if (!text) return html`<span class="chip" data-part="kind" data-empty></span>`;
  return html`<span class="chip" data-part="kind" title="${text}">${text}</span>`;
}

/**
 * The file name of a file path.
 * @param {string} file
 */
export function fileName(file) {
  return file.slice(file.lastIndexOf("/") + 1);
}

/**
 * The fixed-width file chip: the file name (full path on hover), "N files"
 * when the task names several, or an empty placeholder (FR-035).
 * @param {Pick<Task, "files">} task
 * @returns {Raw}
 */
export function renderFileChip(task) {
  const files = task.files ?? [];
  if (files.length === 0) return html`<span class="chip" data-part="file" data-empty></span>`;
  if (files.length === 1) return html`<span class="chip" data-part="file" title="${files[0]}">${fileName(files[0])}</span>`;
  return html`<span class="chip" data-part="file" title="${files.join("\n")}">${files.length} files</span>`;
}

/**
 * The marker tags of an expanded task row: user story, "Parallel", FR/SC
 * references and "depends on …" (FR-036); "" when there are none.
 * @param {Pick<Task, "story" | "parallel" | "refs" | "dependsOn">} task
 * @returns {Raw | ""}
 */
export function renderMarkers(task) {
  /** @type {Raw[]} */
  const items = [];
  if (task.story) items.push(html`<li class="tag" data-marker="story">${task.story}</li>`);
  if (task.parallel) items.push(html`<li class="tag" data-marker="parallel">Parallel</li>`);
  for (const ref of task.refs ?? []) items.push(html`<li class="tag" data-marker="ref">${ref}</li>`);
  if (task.dependsOn?.length) {
    items.push(html`<li class="tag" data-marker="depends">depends on ${task.dependsOn.join(", ")}</li>`);
  }
  return items.length ? html`<ul data-part="markers">${items}</ul>` : "";
}
