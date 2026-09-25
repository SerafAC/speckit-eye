/**
 * Thin listener over an injected `http.createServer` (plan: handler/server
 * split). Binds to loopback only (FR-007). When the port is busy it retries
 * once with a port chosen by the operating system (contracts/cli.md).
 */

import http from "node:http";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4747;

/**
 * @typedef {object} ListeningServer
 * @property {(port: number, host: string, cb: () => void) => unknown} listen
 * @property {(event: string, cb: (err: any) => void) => unknown} once
 * @property {(event: string, cb: (err: any) => void) => unknown} removeListener
 * @property {() => ({port: number} | string | null)} address
 * @property {(cb?: (err?: Error) => void) => unknown} close
 * @property {() => void} [closeAllConnections]
 */

/**
 * @param {ListeningServer} server
 * @param {number} port
 * @param {string} host
 * @returns {Promise<void>}
 */
function listen(server, port, host) {
  return new Promise((resolve, reject) => {
    const onError = (/** @type {Error} */ err) => reject(err);
    server.once("error", onError);
    server.listen(port, host, () => {
      server.removeListener("error", onError);
      resolve();
    });
  });
}

/**
 * @param {object} options
 * @param {(req: any, res: any) => void} options.handler
 * @param {string} [options.host]
 * @param {number} [options.port]
 * @param {(handler: (req: any, res: any) => void) => ListeningServer} [options.createServer]
 * @returns {Promise<{ url: string, port: number, close: () => Promise<void> }>}
 */
export async function startServer({
  handler,
  host = DEFAULT_HOST,
  port = DEFAULT_PORT,
  createServer = /** @type {any} */ (http.createServer),
}) {
  let server = createServer(handler);
  try {
    await listen(server, port, host);
  } catch (err) {
    if (/** @type {{code?: string}} */ (err)?.code !== "EADDRINUSE") throw err;
    server = createServer(handler);
    await listen(server, 0, host);
  }

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const hostPart = host.includes(":") ? `[${host}]` : host;
  const running = server;
  return {
    url: `http://${hostPart}:${actualPort}/`,
    port: actualPort,
    close: () =>
      new Promise((resolve) => {
        running.close(() => resolve());
        running.closeAllConnections?.();
      }),
  };
}
