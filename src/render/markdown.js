/**
 * Markdown → HTML for artifact pages (research R3, FR-020, FR-023, FR-024).
 * Pure: the same source and text always give the same HTML.
 *
 * - `markdown-it` with `html: false`, so raw HTML in a file is escaped and
 *   shown as text; its `validateLink` already drops `javascript:`,
 *   `vbscript:`, `file:` and non-image `data:` links.
 * - GitHub task lists become disabled checkboxes (in-house core rule).
 * - Links: `http:`, `https:` and `mailto:` are kept, `#fragment` links stay
 *   on the page, relative links to a known artifact go to its page (keeping
 *   the fragment), and every other link is rendered as its plain text, so
 *   files that are not artifacts are never exposed.
 * - Images are rendered as their alt text: nothing is fetched from other
 *   servers (FR-038) and no project file is exposed through an image.
 * - Headings get `id`s from `slugify`, unique per page.
 * - Fenced blocks, including `mermaid`, are escaped `<pre><code>` blocks.
 */

import path from "node:path";
import MarkdownIt from "markdown-it";

/** @typedef {{ url: string }} ArtifactRef */

/**
 * Heading slug: lowercase, every run of characters other than `a-z0-9`
 * becomes `-`, leading and trailing `-` are trimmed.
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const KEPT_SCHEMES = new Set(["http:", "https:", "mailto:"]);
const TASK_RE = /^\[([ xX])\][ \t]+/;

/**
 * @param {string} s
 * @returns {string}
 */
function safeDecode(s) {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
}

/**
 * Decides where a link goes.
 * @param {string} href the (normalized) href from markdown-it
 * @param {string} source project-relative path of the file being rendered
 * @param {Map<string, ArtifactRef>} artifactsBySource
 * @param {string} base
 * @returns {string | null} the href to use, or null to render plain text
 */
export function resolveHref(href, source, artifactsBySource, base) {
  if (href.startsWith("#")) return href.length > 1 ? href : null;
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(href);
  if (scheme) return KEPT_SCHEMES.has(scheme[1].toLowerCase()) ? href : null;
  if (href.startsWith("//") || href.startsWith("\\")) return null;

  const hashAt = href.indexOf("#");
  const fragment = hashAt === -1 ? "" : href.slice(hashAt);
  let target = hashAt === -1 ? href : href.slice(0, hashAt);
  const queryAt = target.indexOf("?");
  if (queryAt !== -1) target = target.slice(0, queryAt);
  target = safeDecode(target);
  if (!target) return null;

  const resolved = target.startsWith("/")
    ? path.posix.normalize(target.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(source), target));
  if (resolved === ".." || resolved.startsWith("../")) return null;
  const artifact = artifactsBySource.get(resolved);
  if (!artifact) return null;
  return `${base}${artifact.url}${fragment}`;
}

/**
 * Plain text of an inline token's children (text and code spans).
 * @param {any[]} children
 */
function inlineText(children) {
  return (children ?? [])
    .filter((t) => t.type === "text" || t.type === "code_inline")
    .map((t) => t.content)
    .join("");
}

/**
 * @param {object} options
 * @param {Map<string, ArtifactRef> | Record<string, ArtifactRef>} options.artifactsBySource
 *   known artifacts, keyed by project-relative source path
 * @param {string} options.base normalized base path with leading and trailing `/`
 * @returns {(source: string, text: string) => string}
 */
export function createMarkdown({ artifactsBySource, base }) {
  const known =
    artifactsBySource instanceof Map ? artifactsBySource : new Map(Object.entries(artifactsBySource ?? {}));
  const md = new MarkdownIt({ html: false, linkify: false });

  // Task lists: "- [ ] x" / "- [x] x" → a disabled checkbox.
  md.core.ruler.after("inline", "speckit_task_list", (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "list_item_open") continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== "paragraph_open" || inline?.type !== "inline") continue;
      const first = inline.children?.[0];
      if (!first || first.type !== "text") continue;
      const m = TASK_RE.exec(first.content);
      if (!m) continue;
      first.content = first.content.slice(m[0].length);
      inline.content = inline.content.slice(m[0].length);
      const box = new state.Token("html_inline", "", 0);
      box.content = `<input type="checkbox" disabled${m[1] === " " ? "" : " checked"}> `;
      inline.children.unshift(box);
      tokens[i].attrJoin("class", "task-list-item");
      for (let j = i - 1; j >= 0; j--) {
        const t = tokens[j];
        if ((t.type === "bullet_list_open" || t.type === "ordered_list_open") && t.level === tokens[i].level - 1) {
          if (!(t.attrGet("class") ?? "").includes("contains-task-list")) t.attrJoin("class", "contains-task-list");
          break;
        }
      }
    }
  });

  // Links and images.
  md.core.ruler.after("inline", "speckit_links", (state) => {
    for (const block of state.tokens) {
      if (block.type !== "inline" || !block.children) continue;
      /** @type {any[]} */
      const out = [];
      let dropClose = 0;
      for (const t of block.children) {
        if (t.type === "link_open") {
          const href = resolveHref(t.attrGet("href") ?? "", state.env.source ?? "", known, base);
          if (href === null) {
            dropClose++;
            continue;
          }
          t.attrSet("href", href);
          out.push(t);
        } else if (t.type === "link_close" && dropClose > 0) {
          dropClose--;
        } else if (t.type === "image") {
          const text = new state.Token("text", "", 0);
          text.content = inlineText(t.children) || t.content || "";
          out.push(text);
        } else {
          out.push(t);
        }
      }
      block.children = out;
    }
  });

  // Heading ids, unique per document.
  md.core.ruler.push("speckit_heading_ids", (state) => {
    /** @type {Set<string>} */
    const used = new Set();
    /** @type {Map<string, number>} last suffix per slug */
    const suffix = new Map();
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== "heading_open") continue;
      const slug = slugify(inlineText(tokens[i + 1]?.children)) || "section";
      let id = slug;
      if (used.has(id)) {
        let k = suffix.get(slug) ?? 0;
        do id = `${slug}-${++k}`;
        while (used.has(id));
        suffix.set(slug, k);
      }
      used.add(id);
      tokens[i].attrSet("id", id);
    }
  });

  return (source, text) => md.render(String(text ?? ""), { source });
}
