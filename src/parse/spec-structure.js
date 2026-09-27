/**
 * spec.md → structured blocks for the document reader
 * (contracts/spec-md-structure.md, research D13, FR-042, FR-043). Pure;
 * never throws and never rewrites text.
 *
 * Invariant: `blocks` are in file order, each with 1-based inclusive
 * `from`/`to` line numbers, and the ranges are disjoint and together cover
 * every line of the file. Lines the rules do not claim end up in `plain`
 * blocks carrying their Markdown source unchanged. Lines inside fenced code
 * blocks and HTML comments (`visibleLines`) are never matched by a rule.
 */

import { visibleLines } from "./lines.js";
import { slugify } from "../render/markdown.js";

/**
 * @typedef {object} SpecMetadata
 * @property {string} [branch] inline Markdown, code spans unwrapped
 * @property {string} [created] inline Markdown
 * @property {string} [status] inline Markdown
 */

/**
 * @typedef {object} PlainPart a run of source lines no rule claims
 * @property {"plain"} kind
 * @property {number} from
 * @property {number} to
 * @property {string} markdown the source lines, joined with `\n`
 */

/**
 * @typedef {object} Answer one clarification `- Q: … → A: …` item
 * @property {"qa"} kind
 * @property {string} question inline Markdown
 * @property {string} answer Markdown, continuation lines included
 * @property {"yes" | "no" | "neutral"} badge from the answer's first word
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {object} Session
 * @property {string | null} date the rest of the `### Session` line; null
 *   for answers written before any session heading
 * @property {string | null} heading the heading text (`Session <date>`)
 * @property {string | null} anchor 001 slug of the heading
 * @property {number} from
 * @property {number} to
 * @property {(Answer | PlainPart)[]} items in file order
 */

/**
 * @typedef {object} Scenario one acceptance scenario
 * @property {number | null} number the list number; null for text that is
 *   not a numbered item
 * @property {string} [given]
 * @property {string} [when]
 * @property {string} [then]
 * @property {string} [raw] the whole item when it is not exactly one
 *   Given, When and Then in that order
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {object} Requirement
 * @property {"requirement"} kind
 * @property {string} id `FR-001`
 * @property {string} text Markdown after `**FR-…**:`, continuation lines included
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {object} Entity
 * @property {"entity"} kind
 * @property {string} name inline Markdown
 * @property {string} description Markdown, continuation lines included
 * @property {number} from
 * @property {number} to
 */

/**
 * @typedef {{kind: "title", from: number, to: number, text: string}
 *   | {kind: "metadata", from: number, to: number, field: "branch" | "created" | "status"}
 *   | {kind: "request", from: number, to: number, text: string}
 *   | {kind: "section", from: number, to: number, number: string, heading: string, anchor: string}
 *   | {kind: "clarifications", from: number, to: number, sessions: Session[], answered: number}
 *   | {kind: "story", from: number, to: number, id: string, number: number, title: string, priority: string,
 *      heading: string, anchor: string, description: string, why: string | null, test: string | null,
 *      scenarios: Scenario[], phases?: any[]}
 *   | {kind: "requirements", from: number, to: number, heading: string, anchor: string,
 *      areas: {name: string | null, items: (Requirement | PlainPart)[]}[]}
 *   | {kind: "entities", from: number, to: number, heading: string, anchor: string, items: (Entity | PlainPart)[]}
 *   | PlainPart} Block
 */

/**
 * @typedef {object} SpecStructure
 * @property {SpecMetadata | null} metadata
 * @property {string | null} request the original request, for display
 * @property {Block[]} blocks
 */

const TITLE_RE = /^#[ \t]+(.+?)[ \t]*$/;
const SECTION_RE = /^##[ \t]+(.+?)[ \t]*$/;
const H3_RE = /^###[ \t]+/;
const RULE_RE = /^-{3,}$/;
const META_RE = /^\*\*(Feature Branch|Created|Status)\*\*:[ \t]*(.*)$/;
const INPUT_RE = /^\*\*Input\*\*:[ \t]*(.*)$/;
const SESSION_RE = /^###[ \t]+Session[ \t]+(.+?)[ \t]*$/;
const QA_RE = /^[-*+][ \t]+Q:[ \t]*(.*?)[ \t]*(?:→|->)[ \t]*A:[ \t]*(.*)$/;
// 001 story pattern (src/parse/spec.js).
const STORY_RE = /^###[ \t]+User Story[ \t]+(\d+)[ \t]*[-–—][ \t]*(.+?)[ \t]*\(Priority:[ \t]*(P\d+)\)[ \t]*$/;
const REQUIREMENTS_RE = /^###[ \t]+Functional Requirements[ \t]*$/i;
const ENTITIES_RE = /^###[ \t]+Key Entities[ \t]*$/i;
const LABEL_RE = /^\*\*(Why this priority|Independent Test|Acceptance Scenarios)\*\*:[ \t]*(.*)$/i;
const NUMBERED_RE = /^(\d+)[.)][ \t]+(.*)$/;
const AREA_RE = /^\*\*([^*]+)\*\*$/;
const FR_RE = /^[-*+][ \t]+\*\*(FR-[A-Za-z0-9-]+)\*\*:?[ \t]*(.*)$/;
const ENTITY_RE = /^[-*+][ \t]+\*\*(.+?)\*\*:[ \t]*(.*)$/;
const LIST_ITEM_RE = /^([-*+]|\d+[.)])[ \t]+/;
const FIELD = /** @type {const} */ ({ "Feature Branch": "branch", Created: "created", Status: "status" });

/**
 * The source lines with their fence/comment-aware visible text.
 * @param {string} text
 */
function readLines(text) {
  const raw = text.split("\n");
  /** @type {(string | null)[]} null for lines inside or delimiting a fence */
  const visible = raw.map(() => null);
  for (const { line, text: v } of visibleLines(text)) visible[line - 1] = v;
  const strip = (/** @type {string} */ s) => (s.endsWith("\r") ? s.slice(0, -1) : s);
  return {
    raw,
    /** trimmed visible text of line i (0-based), or null inside a fence */
    t: (/** @type {number} */ i) => {
      const v = visible[i];
      return v === null || v === undefined ? null : strip(v).trim();
    },
    /** the line without its line ending */
    line: (/** @type {number} */ i) => strip(raw[i] ?? ""),
  };
}

/**
 * First word of an answer after trimming punctuation → badge.
 * @param {string} answer
 * @returns {"yes" | "no" | "neutral"}
 */
export function answerBadge(answer) {
  const first = String(answer).trim().split(/\s+/)[0] ?? "";
  const word = first.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "").toLowerCase();
  if (word === "yes") return "yes";
  if (word === "no") return "no";
  return "neutral";
}

/**
 * Splits a scenario item into Given / When / Then when it has exactly one of
 * each, in that order, and no text before Given.
 * @param {string} text the item text without its number
 * @returns {{given: string, when: string, then: string} | null}
 */
export function splitScenario(text) {
  const count = (/** @type {string} */ w) => text.split(`**${w}**`).length - 1;
  if (count("Given") !== 1 || count("When") !== 1 || count("Then") !== 1) return null;
  const g = text.indexOf("**Given**");
  const w = text.indexOf("**When**");
  const t = text.indexOf("**Then**");
  if (!(g < w && w < t) || text.slice(0, g).trim() !== "") return null;
  const clean = (/** @type {string} */ s) => s.trim().replace(/[,;]+$/, "").trim();
  return {
    given: clean(text.slice(g + 9, w)),
    when: clean(text.slice(w + 8, t)),
    then: clean(text.slice(t + 8)),
  };
}

/**
 * Display text of the request: a leading `User description:` and one pair
 * of surrounding quotes removed.
 * @param {string} value
 */
export function requestText(value) {
  let s = value.trim().replace(/^User description:[ \t]*/i, "");
  if ((s.startsWith('"') && s.endsWith('"') && s.length >= 2) || (s.startsWith("“") && s.endsWith("”"))) {
    s = s.slice(1, -1);
  }
  return s.trim();
}

/**
 * @param {string} heading
 * @param {Map<string, number>} used
 */
function uniqueSlug(heading, used) {
  const slug = slugify(heading.replace(/`/g, "")) || "section";
  const n = used.get(slug) ?? 0;
  used.set(slug, n + 1);
  return n === 0 ? slug : `${slug}-${n}`;
}

/**
 * @param {string} text contents of spec.md
 * @returns {SpecStructure}
 */
export function parseSpecStructure(text) {
  try {
    return parse(typeof text === "string" ? text : "");
  } catch {
    // Never throws: fall back to one plain block over the whole file.
    const src = typeof text === "string" ? text : "";
    const n = src.split("\n").length;
    return { metadata: null, request: null, blocks: [{ kind: "plain", from: 1, to: n, markdown: src }] };
  }
}

/**
 * @param {string} text
 * @returns {SpecStructure}
 */
function parse(text) {
  const L = readLines(text);
  const n = L.raw.length;
  /** @type {Block[]} */
  const blocks = [];
  /** @type {SpecMetadata} */
  const metadata = {};
  let request = /** @type {string | null} */ (null);
  let titleSeen = false;
  let sectionCount = 0;
  const slugs = new Map();

  const source = (/** @type {number} */ from, /** @type {number} */ to) => L.raw.slice(from, to + 1).join("\n");
  /** @param {number} from 0-based @param {number} to 0-based inclusive @returns {PlainPart} */
  const plain = (from, to) => ({ kind: "plain", from: from + 1, to: to + 1, markdown: source(from, to) });

  let plainStart = -1;
  const flush = (/** @type {number} */ end) => {
    if (plainStart !== -1) blocks.push(plain(plainStart, end - 1));
    plainStart = -1;
  };
  const isSection = (/** @type {number} */ i) => {
    const t = L.t(i);
    return t !== null && SECTION_RE.test(t) && !t.startsWith("###");
  };
  const isH3 = (/** @type {number} */ i) => {
    const t = L.t(i);
    return t !== null && H3_RE.test(t);
  };
  /** end (exclusive) of the range starting at `i` that stops at a `## ` heading */
  const sectionEnd = (/** @type {number} */ i) => {
    let j = i;
    while (j < n && !isSection(j)) j++;
    return j;
  };
  /** end (exclusive) of a range that stops at the next `### ` or `## ` heading */
  const subsectionEnd = (/** @type {number} */ i) => {
    let j = i;
    while (j < n && !isSection(j) && !isH3(j)) j++;
    return j;
  };

  let i = 0;
  while (i < n) {
    const t = L.t(i);
    if (t === null) {
      if (plainStart === -1) plainStart = i;
      i++;
      continue;
    }

    // title: the first `# ` heading
    const title = !titleSeen && !t.startsWith("##") ? TITLE_RE.exec(t) : null;
    if (title) {
      flush(i);
      titleSeen = true;
      blocks.push({ kind: "title", from: i + 1, to: i + 1, text: title[1].replace(/[ \t]+#+$/, "") });
      i++;
      continue;
    }

    // metadata and request: before the first `## ` heading
    if (sectionCount === 0) {
      const meta = META_RE.exec(t);
      if (meta) {
        const field = FIELD[/** @type {keyof typeof FIELD} */ (meta[1])];
        if (!(field in metadata)) {
          flush(i);
          metadata[field] = field === "branch" ? meta[2].replace(/`([^`]*)`/g, "$1") : meta[2];
          blocks.push({ kind: "metadata", from: i + 1, to: i + 1, field });
          i++;
          continue;
        }
      }
      const input = INPUT_RE.exec(t);
      if (input && request === null) {
        flush(i);
        request = requestText(input[1]);
        blocks.push({ kind: "request", from: i + 1, to: i + 1, text: request });
        i++;
        continue;
      }
    }

    // `## ` section heading
    const section = !t.startsWith("###") ? SECTION_RE.exec(t) : null;
    if (section) {
      flush(i);
      sectionCount++;
      const heading = section[1].replace(/[ \t]+#+$/, "");
      blocks.push({
        kind: "section",
        from: i + 1,
        to: i + 1,
        number: String(sectionCount).padStart(2, "0"),
        heading,
        anchor: uniqueSlug(heading, slugs),
      });
      i++;
      if (/^Clarifications$/i.test(heading.trim())) {
        const end = sectionEnd(i);
        if (end > i) blocks.push(parseClarifications(L, i, end, plain, slugs));
        i = end;
      }
      continue;
    }

    const story = STORY_RE.exec(t);
    if (story) {
      flush(i);
      let end = i + 1;
      while (end < n && !isSection(end) && !isH3(end) && !RULE_RE.test(L.t(end) ?? "")) end++;
      blocks.push(parseStory(L, i, end, story, slugs, plain));
      i = end;
      continue;
    }

    if (REQUIREMENTS_RE.test(t) || ENTITIES_RE.test(t)) {
      flush(i);
      const end = subsectionEnd(i + 1);
      const heading = t.replace(H3_RE, "");
      const anchor = uniqueSlug(heading, slugs);
      if (REQUIREMENTS_RE.test(t)) {
        blocks.push({ kind: "requirements", from: i + 1, to: end, heading, anchor, areas: parseRequirements(L, i + 1, end, plain) });
      } else {
        blocks.push({ kind: "entities", from: i + 1, to: end, heading, anchor, items: parseEntities(L, i + 1, end, plain) });
      }
      i = end;
      continue;
    }

    if (plainStart === -1) plainStart = i;
    i++;
  }
  flush(n);

  return { metadata: Object.keys(metadata).length > 0 ? metadata : null, request, blocks };
}

/** @typedef {ReturnType<typeof readLines>} Lines */
/** @typedef {(from: number, to: number) => PlainPart} PlainOf */

/**
 * Removes the indentation the non-blank lines have in common.
 * @param {string[]} lines
 */
function dedent(lines) {
  const indents = lines.filter((s) => s.trim() !== "").map((s) => /** @type {RegExpExecArray} */ (/^[ \t]*/.exec(s))[0].length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return lines.map((s) => s.slice(cut));
}

/**
 * Collects list items with continuation lines between `from` and `end`
 * (0-based, end exclusive). `match(t)` recognizes an item's first line;
 * everything else becomes plain parts. Blank lines only separate.
 * A continuation line is an indented non-blank line, or a non-blank line
 * right after the item's previous line that starts no new item.
 * @template T
 * @param {Lines} L
 * @param {number} from
 * @param {number} end
 * @param {(t: string, i: number) => ((lines: string[], from: number, to: number) => T) | null} match
 * @param {PlainOf} plain
 * @returns {(T | PlainPart)[]}
 */
function collectItems(L, from, end, match, plain) {
  /** @type {(T | PlainPart)[]} */
  const out = [];
  let plainStart = -1;
  let i = from;
  const blank = (/** @type {number} */ k) => L.line(k).trim() === "";
  const flush = (/** @type {number} */ k) => {
    if (plainStart !== -1) {
      // Trailing blank lines stay in the range but are not a plain part.
      let last = k - 1;
      while (last >= plainStart && blank(last)) last--;
      let first = plainStart;
      while (first <= last && blank(first)) first++;
      if (first <= last) out.push(plain(first, last));
    }
    plainStart = -1;
  };
  while (i < end) {
    const t = L.t(i);
    const make = t === null ? null : match(t, i);
    if (!make) {
      if (plainStart === -1) plainStart = i;
      i++;
      continue;
    }
    flush(i);
    /** @type {string[]} continuation lines as written */
    const more = [];
    let j = i + 1;
    let prevBlank = false;
    while (j < end) {
      const raw = L.line(j);
      if (raw.trim() === "") {
        prevBlank = true;
        j++;
        continue;
      }
      const tj = L.t(j);
      const indented = /^[ \t]/.test(raw);
      const startsItem = tj !== null && (LIST_ITEM_RE.test(tj) || match(tj, j) !== null || /^#{1,6}[ \t]/.test(tj) || AREA_RE.test(tj));
      // An indented line (fenced lines inside the item included), or a lazy
      // continuation right after the previous line.
      if (!indented && (prevBlank || startsItem || tj === null)) break;
      // Blank lines inside the item are kept in its text.
      while (more.length < j - i - 1) more.push("");
      more.push(raw);
      prevBlank = false;
      j++;
    }
    const lines = [/** @type {string} */ (t), ...dedent(more)];
    // The item ends at its last non-blank line.
    const last = i + lines.length - 1;
    out.push(make(lines, i + 1, last + 1));
    i = last + 1;
  }
  flush(end);
  return out;
}

/**
 * @param {Lines} L
 * @param {number} from 0-based first line after `## Clarifications`
 * @param {number} end exclusive
 * @param {PlainOf} plain
 * @param {Map<string, number>} slugs
 */
function parseClarifications(L, from, end, plain, slugs) {
  /** @type {Session[]} */
  const sessions = [];
  // Session boundaries.
  /** @type {{at: number, date: string | null}[]} */
  const starts = [];
  for (let i = from; i < end; i++) {
    const s = SESSION_RE.exec(L.t(i) ?? "");
    if (s) starts.push({ at: i, date: s[1] });
  }
  const ranges = [];
  const firstAt = starts.length > 0 ? starts[0].at : end;
  if (firstAt > from) ranges.push({ at: from, body: from, stop: firstAt, date: null });
  starts.forEach((s, k) => ranges.push({ at: s.at, body: s.at + 1, stop: k + 1 < starts.length ? starts[k + 1].at : end, date: s.date }));

  const qa = (/** @type {string} */ t) => {
    const m = QA_RE.exec(t);
    if (!m) return null;
    return (/** @type {string[]} */ lines, /** @type {number} */ f, /** @type {number} */ to) => {
      const answer = [m[2], ...lines.slice(1)].join("\n").trim();
      return /** @type {Answer} */ ({ kind: "qa", question: m[1], answer, badge: answerBadge(m[2]), from: f, to });
    };
  };

  for (const r of ranges) {
    const items = collectItems(L, r.body, r.stop, qa, plain);
    const heading = r.date === null ? null : `Session ${r.date}`;
    sessions.push({
      date: r.date,
      heading,
      anchor: heading === null ? null : uniqueSlug(heading, slugs),
      from: r.at + 1,
      to: r.stop,
      items,
    });
  }
  const answered = sessions.reduce((n, s) => n + s.items.filter((it) => it.kind === "qa").length, 0);
  // A leading range without session heading and without content is dropped
  // from display (its lines are blank), but its lines stay in the block.
  const shown = sessions.filter((s) => s.date !== null || s.items.length > 0);
  return /** @type {Block} */ ({ kind: "clarifications", from: from + 1, to: end, sessions: shown, answered });
}

/**
 * @param {Lines} L
 * @param {number} at 0-based heading line
 * @param {number} end exclusive
 * @param {RegExpExecArray} m STORY_RE match
 * @param {Map<string, number>} slugs
 * @param {PlainOf} plain
 * @returns {Block}
 */
function parseStory(L, at, end, m, slugs, plain) {
  const heading = /** @type {string} */ (L.t(at)).replace(H3_RE, "");
  /** @type {{label: string, first: string, from: number, to: number}[]} */
  const parts = [];
  let descEnd = end;
  for (let i = at + 1; i < end; i++) {
    const lab = LABEL_RE.exec(L.t(i) ?? "");
    if (!lab) continue;
    if (parts.length === 0) descEnd = i;
    if (parts.length > 0) parts[parts.length - 1].to = i;
    parts.push({ label: lab[1].toLowerCase(), first: lab[2], from: i, to: end });
  }
  const text = (/** @type {number} */ from, /** @type {number} */ to) =>
    L.raw.slice(from, to).map((s) => (s.endsWith("\r") ? s.slice(0, -1) : s)).join("\n").trim();

  /** @type {string | null} */
  let why = null;
  /** @type {string | null} */
  let test = null;
  /** @type {Scenario[]} */
  const scenarios = [];
  /** @type {string[]} text of repeated or unknown parts, kept as description */
  const extra = [];
  for (const p of parts) {
    const body = [p.first, text(p.from + 1, p.to)].filter((s) => s !== "").join("\n");
    if (p.label === "why this priority" && why === null) why = body;
    else if (p.label === "independent test" && test === null) test = body;
    else if (p.label === "acceptance scenarios" && scenarios.length === 0) {
      if (p.first.trim() !== "") scenarios.push({ number: null, raw: p.first.trim(), from: p.from + 1, to: p.from + 1 });
      const numbered = (/** @type {string} */ t) => {
        const nm = NUMBERED_RE.exec(t);
        if (!nm) return null;
        return (/** @type {string[]} */ lines, /** @type {number} */ f, /** @type {number} */ to) => {
          const item = [nm[2], ...lines.slice(1)].join("\n").trim();
          const gwt = splitScenario(item);
          return /** @type {Scenario} */ (gwt ? { number: Number(nm[1]), ...gwt, from: f, to } : { number: Number(nm[1]), raw: item, from: f, to });
        };
      };
      for (const item of collectItems(L, p.from + 1, p.to, numbered, plain)) {
        if ("kind" in item && item.kind === "plain") scenarios.push({ number: null, raw: item.markdown.trim(), from: item.from, to: item.to });
        else scenarios.push(/** @type {Scenario} */ (item));
      }
    } else extra.push(L.raw.slice(p.from, p.to).join("\n").trim());
  }
  const description = [text(at + 1, descEnd), ...extra].filter((s) => s !== "").join("\n\n");
  return {
    kind: "story",
    from: at + 1,
    to: end,
    id: `US${Number.parseInt(m[1], 10)}`,
    number: Number.parseInt(m[1], 10),
    title: m[2],
    priority: m[3],
    heading,
    anchor: uniqueSlug(heading, slugs),
    description,
    why,
    test,
    scenarios,
  };
}

/**
 * @param {Lines} L
 * @param {number} from 0-based first line after the heading
 * @param {number} end exclusive
 * @param {PlainOf} plain
 */
function parseRequirements(L, from, end, plain) {
  /** @type {{name: string | null, items: (Requirement | PlainPart)[]}[]} */
  const areas = [];
  let current = /** @type {{name: string | null, items: (Requirement | PlainPart)[]} | null} */ (null);
  const req = (/** @type {string} */ t) => {
    const m = FR_RE.exec(t);
    if (!m) return null;
    return (/** @type {string[]} */ lines, /** @type {number} */ f, /** @type {number} */ to) =>
      /** @type {Requirement} */ ({ kind: "requirement", id: m[1], text: [m[2], ...lines.slice(1)].join("\n").trim(), from: f, to });
  };
  // Split the range at area headings (a paragraph that is only `**Area**`).
  let start = from;
  const push = (/** @type {number} */ stop, /** @type {string | null} */ name) => {
    const items = collectItems(L, start, stop, req, plain);
    if (current) current.items.push(...items);
    else if (items.length > 0) areas.push((current = { name: null, items }));
    if (name !== null) areas.push((current = { name, items: [] }));
  };
  for (let i = from; i < end; i++) {
    const t = L.t(i);
    const prevBlank = i === from || L.line(i - 1).trim() === "";
    const nextBlank = i + 1 >= end || L.line(i + 1).trim() === "";
    const area = t !== null && prevBlank && nextBlank ? AREA_RE.exec(t) : null;
    if (area && !/^FR-/.test(area[1])) {
      push(i, area[1].trim());
      start = i + 1;
    }
  }
  push(end, null);
  return areas;
}

/**
 * @param {Lines} L
 * @param {number} from
 * @param {number} end
 * @param {PlainOf} plain
 */
function parseEntities(L, from, end, plain) {
  const entity = (/** @type {string} */ t) => {
    const m = ENTITY_RE.exec(t);
    if (!m) return null;
    return (/** @type {string[]} */ lines, /** @type {number} */ f, /** @type {number} */ to) =>
      /** @type {Entity} */ ({ kind: "entity", name: m[1], description: [m[2], ...lines.slice(1)].join("\n").trim(), from: f, to });
  };
  return collectItems(L, from, end, entity, plain);
}
