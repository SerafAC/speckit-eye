/**
 * Line iteration shared by the Markdown parsers (contracts/tasks-md-format.md
 * "General"): split on `\n`, drop a trailing `\r`, skip fenced code blocks
 * (``` and ~~~) and HTML comments, including multi-line ones.
 */

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

/**
 * Removes the comment parts of one line.
 * @param {string} line
 * @param {{inComment: boolean}} state updated in place
 */
function stripComments(line, state) {
  let out = "";
  let rest = line;
  for (;;) {
    if (state.inComment) {
      const end = rest.indexOf("-->");
      if (end === -1) return out;
      rest = rest.slice(end + 3);
      state.inComment = false;
    } else {
      const start = rest.indexOf("<!--");
      if (start === -1) return out + rest;
      out += rest.slice(0, start);
      rest = rest.slice(start + 4);
      state.inComment = true;
    }
  }
}

/**
 * Yields the visible text of every line outside code fences and comments,
 * with its 1-based line number. Never throws on content.
 * @param {unknown} text
 * @returns {Generator<{line: number, text: string}>}
 */
export function* visibleLines(text) {
  const lines = typeof text === "string" ? text.split("\n") : [];
  /** @type {string | null} */
  let fence = null;
  const state = { inComment: false };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].endsWith("\r") ? lines[i].slice(0, -1) : lines[i];
    if (fence !== null) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      continue;
    }
    const visible = stripComments(line, state);
    const open = FENCE_OPEN.exec(visible);
    if (open) {
      fence = open[1];
      continue;
    }
    yield { line: i + 1, text: visible };
  }
}
