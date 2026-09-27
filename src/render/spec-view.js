/**
 * The structured `spec.md` view of the document reader (FR-042, FR-043;
 * contracts/spec-md-structure.md "Rendering notes"). Pure: the blocks of
 * `parseSpecStructure` in, trusted HTML out.
 *
 * Every text part goes through the shared `markdown-it` instance of
 * `createMarkdown` (raw HTML off, 001 link rules), so `<script>` in a spec
 * stays text. Plain blocks use the 001 Markdown renderer unchanged. Parts
 * that need scripts (the requirement area chips) are rendered `hidden`;
 * everything else opens and closes as `<details>` without JavaScript.
 */

import { html, raw } from "./html.js";
import { renderInline } from "./markdown.js";
import { phaseIds } from "./feature.js";

/** @typedef {import("./html.js").Raw} Raw */
/** @typedef {import("./markdown.js").MarkdownRender} MarkdownRender */
/** @typedef {import("../parse/spec-structure.js").SpecStructure} SpecStructure */
/** @typedef {import("../parse/spec-structure.js").Block} Block */
/** @typedef {import("../model/build-model.js").Feature} Feature */

/** Answers shown before "Show N more answers". */
export const VISIBLE_ANSWERS = 3;

/** Normative keywords, longest first so `MUST NOT` wins over `MUST`. */
const KEYWORD_RE = /\b(MUST NOT|SHOULD NOT|MUST|SHOULD|MAY)\b/g;

const BADGE_TEXT = Object.freeze({ yes: "Yes", no: "No", neutral: "A" });

const META_FIELDS = /** @type {const} */ ([
  ["branch", "Feature Branch"],
  ["created", "Created"],
  ["status", "Status"],
]);

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Renders Markdown as blocks with the shared instance, optionally rewriting
 * the inline tokens first (after every core rule).
 * @param {MarkdownRender} md
 * @param {string} text
 * @param {string} source project-relative path, for link resolution
 * @param {((children: any[], Token: any) => any[]) | null} [transform]
 * @returns {Raw}
 */
function block(md, text, source, transform = null) {
  const instance = md.md;
  const env = { source };
  const tokens = instance.parse(String(text ?? ""), env);
  if (transform) {
    for (const t of tokens) if (t.type === "inline" && t.children) t.children = transform(t.children, t.constructor);
  }
  return raw(instance.renderer.render(tokens, instance.options, env));
}

/**
 * @param {MarkdownRender} md
 * @param {string} text
 * @param {string} source
 * @returns {Raw}
 */
function inline(md, text, source) {
  return raw(renderInline(md, text, { source }));
}

/**
 * Wraps `MUST NOT`, `MUST`, `SHOULD NOT`, `SHOULD` and `MAY` in text tokens
 * (never in code spans) as `<mark data-kw>`.
 * @param {any[]} children
 * @param {any} Token
 * @returns {any[]}
 */
export function markKeywords(children, Token) {
  /** @type {any[]} */
  const out = [];
  for (const t of children) {
    if (t.type !== "text") {
      out.push(t);
      continue;
    }
    let last = 0;
    for (const m of t.content.matchAll(KEYWORD_RE)) {
      const at = /** @type {number} */ (m.index);
      if (at > last) out.push(text(Token, t.content.slice(last, at)));
      const open = new Token("html_inline", "", 0);
      open.content = `<mark data-kw="${m[1].toLowerCase().replace(" ", "-")}">`;
      const close = new Token("html_inline", "", 0);
      close.content = "</mark>";
      out.push(open, text(Token, m[1]), close);
      last = at + m[0].length;
    }
    if (last === 0) out.push(t);
    else if (last < t.content.length) out.push(text(Token, t.content.slice(last)));
  }
  return out;
}

/**
 * @param {any} Token
 * @param {string} content
 */
function text(Token, content) {
  const t = new Token("text", "", 0);
  t.content = content;
  return t;
}

/**
 * @typedef {object} TocEntry
 * @property {string} anchor
 * @property {string} number "01"
 * @property {string} heading inline Markdown
 * @property {{anchor: string, label: string}[]} stories `US1 · <title>`
 */

/**
 * The contents panel entries of a spec: every section, with the user
 * stories that follow it (FR-041); stories before the first section are
 * entries of their own, without a number.
 * @param {SpecStructure} spec
 * @returns {TocEntry[]}
 */
export function specToc(spec) {
  /** @type {TocEntry[]} */
  const out = [];
  for (const b of spec.blocks) {
    if (b.kind === "section") out.push({ anchor: b.anchor, number: b.number, heading: b.heading, stories: [] });
    else if (b.kind === "story") {
      const label = `${b.id} · ${b.title}`;
      // A story before any section is an entry of its own.
      if (out.length > 0) out[out.length - 1].stories.push({ anchor: b.anchor, label });
      else out.push({ anchor: b.anchor, number: "", heading: label, stories: [] });
    }
  }
  return out;
}

/**
 * @typedef {object} ViewContext
 * @property {MarkdownRender} md
 * @property {string} source
 * @property {string} base
 * @property {Feature | null} feature
 * @property {Map<string, string>} phaseIdOf phase key → element id on the feature page
 */

/**
 * @param {SpecStructure} spec
 * @param {object} options
 * @param {MarkdownRender} options.md the renderer from createMarkdown
 * @param {Feature | null} [options.feature] the feature, for story phase links
 * @param {string} [options.source] project-relative path of the spec
 *   (default `specs/<feature dir>/spec.md`)
 * @param {string} [options.base] normalized base path
 * @param {boolean} [options.title] render the title block as `<h1>`
 *   (false when the page header already shows it)
 * @returns {Raw}
 */
export function renderSpecBlocks(spec, { md, feature = null, source, base = "/", title = true }) {
  const phases = feature?.phases ?? [];
  const ids = phaseIds(phases);
  /** @type {ViewContext} */
  const ctx = {
    md,
    source: source ?? (feature ? `specs/${feature.dir}/spec.md` : "spec.md"),
    base,
    feature,
    phaseIdOf: new Map(phases.map((p, i) => [p.key, ids[i]])),
  };
  const firstStory = spec.blocks.find((b) => b.kind === "story");
  let metadataShown = false;
  /** @type {Raw[]} */
  const out = [];
  spec.blocks.forEach((b, i) => {
    switch (b.kind) {
      case "title":
        if (title) out.push(html`<h1 data-part="title">${inline(md, b.text, ctx.source)}</h1>\n`);
        break;
      case "metadata":
        if (!metadataShown && spec.metadata) out.push(renderMetadata(spec.metadata, ctx));
        metadataShown = true;
        break;
      case "request":
        out.push(html`<figure data-part="request" class="not-prose"><figcaption>Original request</figcaption><blockquote>${block(md, b.text, ctx.source)}</blockquote></figure>\n`);
        break;
      case "section": {
        const next = spec.blocks[i + 1];
        const count = next?.kind === "clarifications" ? html` <span data-part="count">${clarificationCount(next)}</span>` : "";
        out.push(html`<h2 id="${b.anchor}" data-part="section"><span data-part="num">${b.number}</span> <span data-part="heading">${inline(md, b.heading, ctx.source)}</span>${count}</h2>\n`);
        break;
      }
      case "clarifications":
        out.push(renderClarifications(b, ctx));
        break;
      case "story":
        out.push(renderStory(b, ctx, b === firstStory));
        break;
      case "requirements":
        out.push(renderRequirements(b, ctx));
        break;
      case "entities":
        out.push(renderEntities(b, ctx));
        break;
      default:
        out.push(raw(md(ctx.source, b.markdown)));
    }
  });
  return html`${out}`;
}

/**
 * "13 answered · 3 sessions"; answers written without a session heading
 * count as one session.
 * @param {Extract<Block, {kind: "clarifications"}>} b
 */
function clarificationCount(b) {
  const dated = b.sessions.filter((s) => s.date !== null).length;
  const sessions = dated || (b.answered > 0 ? 1 : 0);
  return `${b.answered} answered · ${plural(sessions, "session", "sessions")}`;
}

/**
 * @param {import("../parse/spec-structure.js").SpecMetadata} metadata
 * @param {ViewContext} ctx
 * @returns {Raw}
 */
function renderMetadata(metadata, ctx) {
  const rows = META_FIELDS.filter(([key]) => metadata[key] !== undefined).map(
    ([key, label]) =>
      html`<div data-field="${key}"><dt>${label}</dt><dd>${inline(ctx.md, /** @type {string} */ (metadata[key]), ctx.source)}</dd></div>`,
  );
  return html`<dl data-part="metadata" class="not-prose">${rows}</dl>\n`;
}

/**
 * @param {Extract<Block, {kind: "clarifications"}>} b
 * @param {ViewContext} ctx
 * @returns {Raw}
 */
function renderClarifications(b, ctx) {
  let firstDated = true;
  const sessions = b.sessions.map((s) => {
    const body = renderAnswers(s, ctx);
    if (s.date === null) return html`<div data-part="session">${body}</div>`;
    const open = firstDated;
    firstDated = false;
    const questions = s.items.filter((it) => it.kind === "qa").length;
    return html`<details data-part="session" data-key="spec:${s.anchor}" id="${s.anchor}"${open ? raw(" open") : ""}><summary><span data-part="session-name">${inline(
      ctx.md,
      /** @type {string} */ (s.heading),
      ctx.source,
    )}</span> <span data-part="count">${plural(questions, "question", "questions")}</span></summary>${body}</details>`;
  });
  return html`<div data-part="clarifications" class="not-prose">${sessions}</div>\n`;
}

/**
 * A session's items: the first three answers, then the rest behind
 * "Show N more answers" (a `<details>`, so it works without JS).
 * @param {import("../parse/spec-structure.js").Session} s
 * @param {ViewContext} ctx
 * @returns {Raw}
 */
function renderAnswers(s, ctx) {
  const item = (/** @type {typeof s.items[number]} */ it) =>
    it.kind === "qa"
      ? html`<li data-part="answer" data-badge="${it.badge}"><div data-part="question">${inline(ctx.md, it.question, ctx.source)}</div><span data-part="badge" data-badge="${it.badge}">${BADGE_TEXT[it.badge]}</span><div data-part="answer-text">${block(ctx.md, it.answer, ctx.source)}</div></li>`
      : html`<li data-part="plain">${raw(ctx.md(ctx.source, it.markdown))}</li>`;
  let seen = 0;
  let split = s.items.length;
  for (let i = 0; i < s.items.length; i++) {
    if (s.items[i].kind !== "qa") continue;
    seen++;
    if (seen === VISIBLE_ANSWERS) {
      split = i + 1;
      break;
    }
  }
  const rest = s.items.slice(split);
  const more = rest.filter((it) => it.kind === "qa").length;
  const head = html`<ol data-part="answers">${s.items.slice(0, split).map(item)}</ol>`;
  if (more === 0) return rest.length ? html`${head}<ol data-part="answers">${rest.map(item)}</ol>` : head;
  return html`${head}<details data-part="more" data-key="spec:more:${s.anchor ?? "intro"}"><summary>Show ${more} more ${
    more === 1 ? "answer" : "answers"
  }</summary><ol data-part="answers">${rest.map(item)}</ol></details>`;
}

/**
 * @param {Extract<Block, {kind: "story"}>} b
 * @param {ViewContext} ctx
 * @param {boolean} open
 * @returns {Raw}
 */
function renderStory(b, ctx, open) {
  const { md, source } = ctx;
  const count = b.scenarios.filter((s) => s.number !== null).length;
  const box = (/** @type {string} */ part, /** @type {string} */ label, /** @type {string | null} */ body) =>
    body === null ? "" : html`<div data-part="${part}"><h4>${label}</h4>${block(md, body, source)}</div>`;
  const rows = b.scenarios.map((s) =>
    s.raw !== undefined
      ? html`<tr data-raw><td data-part="n">${s.number ?? ""}</td><td colspan="3">${block(md, s.raw, source)}</td></tr>`
      : html`<tr><td data-part="n">${s.number ?? ""}</td><td>${inline(md, s.given ?? "", source)}</td><td>${inline(
          md,
          s.when ?? "",
          source,
        )}</td><td>${inline(md, s.then ?? "", source)}</td></tr>`,
  );
  const table = b.scenarios.length
    ? html`<div data-part="scenarios"><h4>Acceptance scenarios</h4><div data-part="table-wrap"><table><thead><tr><th scope="col" data-part="n">#</th><th scope="col">Given</th><th scope="col">When</th><th scope="col">Then</th></tr></thead><tbody>${rows}</tbody></table></div></div>`
    : "";
  const links = (b.phases ?? []).map((p) => {
    const id = ctx.phaseIdOf.get(p.key);
    const name = p.number === null ? "Unphased" : `Phase ${p.number}: ${p.title}`;
    const href = ctx.feature && id ? `${ctx.base}features/${ctx.feature.dir}/index.html#${id}` : null;
    return html`<li>${href ? html`<a href="${href}">${name}</a>` : name} <span data-part="progress">${p.counts.done} / ${p.counts.total}</span></li>`;
  });
  const phases = links.length ? html`<div data-part="phases"><h4>Implemented in</h4><ul>${links}</ul></div>` : "";
  return html`<details data-part="story" class="not-prose" data-key="spec:story:${b.anchor}" id="${b.anchor}"${open ? raw(" open") : ""}><summary><span class="chip" data-part="story-id">${b.id}</span> <span class="pill" data-part="priority" data-priority="${b.priority}">${b.priority}</span> <span data-part="story-title">${inline(
    md,
    b.title,
    source,
  )}</span> <span data-part="count">${plural(count, "scenario", "scenarios")}</span></summary><div data-part="story-body">${
    b.description ? html`<div data-part="description">${block(md, b.description, source)}</div>` : ""
  }${box("why", "Why this priority", b.why)}${box("test", "Independent test", b.test)}${table}${phases}</div></details>\n`;
}

/**
 * @param {Extract<Block, {kind: "requirements"}>} b
 * @param {ViewContext} ctx
 * @returns {Raw}
 */
function renderRequirements(b, ctx) {
  const { md, source } = ctx;
  const named = b.areas.map((a, i) => ({ a, i })).filter(({ a }) => a.name !== null);
  const chips = named.length
    ? html`<div data-part="areas" role="group" aria-label="Requirement areas" hidden><button type="button" data-area="all" aria-pressed="true">All</button>${named.map(
        ({ a, i }) => html`<button type="button" data-area="${i}" aria-pressed="false">${inline(md, /** @type {string} */ (a.name), source)}</button>`,
      )}</div>`
    : "";
  const areas = b.areas.map(
    (a, i) =>
      html`<div data-part="area" data-area="${i}">${a.name !== null ? html`<h4 data-part="area-name">${inline(md, a.name, source)}</h4>` : ""}<ul data-part="requirement-list">${a.items.map(
        (it) =>
          it.kind === "requirement"
            ? html`<li data-part="requirement" id="${it.id.toLowerCase()}"><span class="chip" data-part="req-id">${it.id}</span><div data-part="req-text">${block(
                md,
                it.text,
                source,
                markKeywords,
              )}</div></li>`
            : html`<li data-part="plain">${raw(md(source, it.markdown))}</li>`,
      )}</ul></div>`,
  );
  return html`<section data-part="requirements" class="not-prose"><h3 id="${b.anchor}">${inline(md, b.heading, source)}</h3>${chips}${areas}</section>\n`;
}

/**
 * @param {Extract<Block, {kind: "entities"}>} b
 * @param {ViewContext} ctx
 * @returns {Raw}
 */
function renderEntities(b, ctx) {
  const { md, source } = ctx;
  const items = b.items.map((it) =>
    it.kind === "entity"
      ? html`<div data-part="entity"><h4>${inline(md, it.name, source)}</h4>${block(md, it.description, source)}</div>`
      : html`<div data-part="plain">${raw(md(source, it.markdown))}</div>`,
  );
  return html`<section data-part="entities" class="not-prose"><h3 id="${b.anchor}">${inline(md, b.heading, source)}</h3><div data-part="entity-grid">${items}</div></section>\n`;
}
