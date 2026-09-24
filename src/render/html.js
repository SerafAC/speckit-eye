/**
 * Minimal auto-escaping HTML templating (research R4).
 *
 * Every value interpolated into an `html` template is escaped, except values
 * wrapped with `raw()` (trusted fragments such as nested templates or
 * rendered Markdown).
 */

/** A trusted HTML fragment that is inserted without escaping. */
export class Raw {
  /** @param {string} value */
  constructor(value) {
    /** @type {string} */
    this.value = value;
  }

  toString() {
    return this.value;
  }
}

/** @type {Record<string, string>} */
const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Escapes `& < > " '` for use in HTML text and attribute values.
 * @param {unknown} s
 * @returns {string}
 */
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Marks a string as trusted HTML.
 * @param {string | Raw} s
 * @returns {Raw}
 */
export function raw(s) {
  return s instanceof Raw ? s : new Raw(String(s));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function renderValue(value) {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof Raw) return value.value;
  if (Array.isArray(value)) return value.map(renderValue).join("");
  return escapeHtml(value);
}

/**
 * Tagged template that escapes interpolated values, flattens arrays and
 * renders `null`/`undefined`/`false` as the empty string.
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {Raw}
 */
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += renderValue(values[i]) + strings[i + 1];
  }
  return new Raw(out);
}
