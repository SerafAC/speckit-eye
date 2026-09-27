/**
 * Serve-mode request handler (contracts/routes.md). Pure `(req, res)`
 * function: it answers only paths present in the site map from `getSite()`
 * and never touches the file system (FR-007, SC-008). The listening server
 * lives in `server.js`.
 */

/** @typedef {import("../render/site.js").Site} Site */

export const CSP = "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:";

/** Headers sent with every response. */
const BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": CSP,
});

const TYPES = /** @type {Record<string, string>} */ ({
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  txt: "text/plain; charset=utf-8",
  woff2: "font/woff2",
});

/**
 * @param {string} path
 * @returns {string} the Content-Type for the path's extension
 */
export function contentTypeFor(path) {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return (m && TYPES[m[1].toLowerCase()]) || "application/octet-stream";
}

/**
 * Maps a request URL to a site-map key, or null when it can never be a valid
 * key (`..`, encoded characters, backslashes, empty segments).
 * @param {string | undefined} url
 * @returns {string | null}
 */
export function routeKey(url) {
  const raw = String(url ?? "/");
  const pathname = raw.split(/[?#]/, 1)[0];
  if (!pathname.startsWith("/")) return null;
  if (pathname === "/") return "index.html";
  const key = pathname.slice(1);
  if (/[%\\]/.test(key)) return null;
  const segments = key.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return key;
}

/**
 * @typedef {object} Res
 * @property {(status: number, headers: Record<string, string | number>) => unknown} writeHead
 * @property {(body?: string | Uint8Array) => unknown} end
 */

/**
 * @param {Res} res
 * @param {number} status
 * @param {string} method
 * @param {string} type
 * @param {string | Uint8Array} body
 * @param {Record<string, string>} [extra]
 */
function send(res, status, method, type, body, extra = {}) {
  // Text is encoded as UTF-8; bytes (fonts, research D12) go out unchanged.
  const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  res.writeHead(status, {
    ...BASE_HEADERS,
    "Content-Type": type,
    "Content-Length": buffer.byteLength,
    ...extra,
  });
  if (method === "HEAD") res.end();
  else res.end(buffer);
}

/** Route of the live-update stream (serve mode only, contracts/routes.md). */
const EVENTS_KEY = "__events";

/**
 * @typedef {object} EventsHub
 * @property {(req: any, res: any) => void} add
 */

/**
 * Stamps the model version a page was served at on its `<body>`
 * (`data-model-version`), so the live client can tell whether a change
 * happened between this response and its `/__events` connection (the
 * `hello` event carries the current version).
 * @param {string} html
 * @param {number} version
 * @returns {string}
 */
export function stampVersion(html, version) {
  return html.replace("<body ", `<body data-model-version="${Number(version)}" `);
}

/**
 * @param {{ getSite: () => Site, events?: EventsHub | null, getVersion?: (() => number) | null }} options
 *   `events` answers `GET /__events`; without it that path is a 404.
 *   `getVersion` gives the model version of `getSite()`'s current site; with
 *   it, HTML pages are stamped with it ({@link stampVersion}).
 * @returns {(req: {method?: string, url?: string}, res: Res) => void}
 */
export function createHandler({ getSite, events = null, getVersion = null }) {
  return function handle(req, res) {
    const method = String(req.method ?? "GET").toUpperCase();
    const key = routeKey(req.url);
    if (key === EVENTS_KEY && events) {
      // The stream is not part of the site map (it is not a page or asset).
      if (method !== "GET") {
        send(res, 405, method, TYPES.txt, "Method Not Allowed\n", { Allow: "GET" });
        return;
      }
      events.add(req, res);
      return;
    }
    if (method !== "GET" && method !== "HEAD") {
      send(res, 405, method, TYPES.txt, "Method Not Allowed\n", { Allow: "GET, HEAD" });
      return;
    }
    const entry = key === null ? undefined : getSite().get(key);
    if (!entry || key === null) {
      send(res, 404, method, TYPES.txt, "Not Found\n");
      return;
    }
    const type = contentTypeFor(key);
    const body = getVersion && type === TYPES.html && typeof entry.body === "string" ? stampVersion(entry.body, getVersion()) : entry.body;
    send(res, 200, method, type, body);
  };
}
