/**
 * Server-Sent Events hub for serve mode (contracts/routes.md "Live-update
 * protocol"). Keeps the open `GET /__events` responses, greets each one with
 * `hello`, sends `change` after every rescan that changed the site, and a
 * `: ping` comment every 25 s so proxies keep the connection open. Timers
 * are injected so the module is unit tested with fakes.
 */

export const PING_MS = 25_000;

/**
 * `Connection: close`: a stream never ends, so its connection can never be
 * reused for another request. Saying so up front makes the browser drop the
 * socket when the page closes the stream (on leaving the page), instead of
 * keeping it in its per-host pool (six connections per host) waiting for a
 * body that never finishes, where it would hold up the next page's requests
 * (WebKit navigation stalls in CI).
 */
const EVENT_HEADERS = Object.freeze({
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  Connection: "close",
});

/**
 * @param {string} event
 * @param {number} version
 * @returns {string} one SSE message
 */
export function formatEvent(event, version) {
  return `event: ${event}\ndata: ${JSON.stringify({ version })}\n\n`;
}

/**
 * @typedef {object} SseResponse
 * @property {(status: number, headers: Record<string, string>) => unknown} writeHead
 * @property {(chunk: string) => unknown} write
 * @property {() => unknown} end
 * @property {(event: "close", cb: () => void) => unknown} [on]
 */

/**
 * @param {object} [options]
 * @param {(fn: () => void, ms: number) => any} [options.setInterval]
 * @param {(handle: any) => void} [options.clearInterval]
 * @param {number} [options.version] the model version sent in `hello` until the first broadcast
 */
export function createEventHub({
  setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval,
  version = 0,
} = {}) {
  /** @type {Set<SseResponse>} */
  const clients = new Set();
  let current = version;
  let closed = false;

  const pinger = setInterval(() => {
    for (const res of clients) safeWrite(res, ": ping\n\n");
  }, PING_MS);
  pinger?.unref?.();

  /**
   * @param {SseResponse} res
   * @param {string} chunk
   */
  function safeWrite(res, chunk) {
    try {
      res.write(chunk);
    } catch {
      clients.delete(res);
    }
  }

  return {
    /**
     * Registers a client for `GET /__events`.
     * @param {{ on?: (event: "close", cb: () => void) => unknown }} req
     * @param {SseResponse} res
     */
    add(req, res) {
      res.writeHead(200, { ...EVENT_HEADERS });
      if (closed) {
        res.end();
        return;
      }
      clients.add(res);
      const remove = () => clients.delete(res);
      req?.on?.("close", remove);
      res.on?.("close", remove);
      safeWrite(res, formatEvent("hello", current));
    },

    /**
     * Sends `change` with the new model version to every client.
     * @param {number} nextVersion
     */
    broadcast(nextVersion) {
      current = nextVersion;
      if (closed) return;
      const message = formatEvent("change", nextVersion);
      for (const res of clients) safeWrite(res, message);
    },

    /** @returns {number} the number of connected clients */
    size: () => clients.size,

    /** Stops the ping and ends every open stream. */
    close() {
      if (closed) return;
      closed = true;
      clearInterval(pinger);
      for (const res of clients) {
        try {
          res.end();
        } catch {
          // already gone
        }
      }
      clients.clear();
    },
  };
}
