import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { startServer, DEFAULT_HOST, DEFAULT_PORT } from "../../src/serve/server.js";

/**
 * Fake createServer: each created server's `listen` fails with the next code
 * from `failures` (or succeeds), without opening a socket.
 */
function fakeCreateServer(failures = []) {
  const created = [];
  const createServer = (handler) => {
    const server = new EventEmitter();
    server.handler = handler;
    server.listenCalls = [];
    server.closed = false;
    server.connectionsClosed = false;
    server.listen = (port, host, cb) => {
      server.listenCalls.push({ port, host });
      const code = failures.shift();
      queueMicrotask(() => {
        if (code) {
          const err = new Error(code);
          err.code = code;
          server.emit("error", err);
        } else {
          server.boundPort = port === 0 ? 51234 : port;
          cb();
        }
      });
      return server;
    };
    server.address = () => ({ address: host(server), port: server.boundPort });
    server.close = (cb) => {
      server.closed = true;
      queueMicrotask(() => cb?.());
    };
    server.closeAllConnections = () => {
      server.connectionsClosed = true;
    };
    created.push(server);
    return server;
  };
  const host = (s) => s.listenCalls.at(-1)?.host;
  return { createServer, created };
}

const handler = () => {};

describe("startServer", () => {
  test("binds to 127.0.0.1:4747 by default", async () => {
    assert.equal(DEFAULT_HOST, "127.0.0.1");
    assert.equal(DEFAULT_PORT, 4747);
    const fake = fakeCreateServer();
    const s = await startServer({ handler, createServer: fake.createServer });
    assert.equal(fake.created.length, 1);
    assert.equal(fake.created[0].handler, handler);
    assert.deepEqual(fake.created[0].listenCalls, [{ port: 4747, host: "127.0.0.1" }]);
    assert.equal(s.url, "http://127.0.0.1:4747/");
    assert.equal(s.port, 4747);
  });

  test("retries once with port 0 on EADDRINUSE and reports the actual port", async () => {
    const fake = fakeCreateServer(["EADDRINUSE"]);
    const s = await startServer({ handler, createServer: fake.createServer });
    assert.equal(fake.created.length, 2);
    assert.deepEqual(fake.created[1].listenCalls, [{ port: 0, host: "127.0.0.1" }]);
    assert.equal(s.url, "http://127.0.0.1:51234/");
  });

  test("gives up when the retry fails too", async () => {
    const fake = fakeCreateServer(["EADDRINUSE", "EACCES"]);
    await assert.rejects(startServer({ handler, createServer: fake.createServer }), { code: "EACCES" });
    assert.equal(fake.created.length, 2);
  });

  test("other listen errors are not retried", async () => {
    const fake = fakeCreateServer(["EACCES"]);
    await assert.rejects(startServer({ handler, createServer: fake.createServer }), { code: "EACCES" });
    assert.equal(fake.created.length, 1);
  });

  test("honors host and port", async () => {
    const fake = fakeCreateServer();
    const s = await startServer({ handler, host: "127.0.0.1", port: 8080, createServer: fake.createServer });
    assert.equal(s.url, "http://127.0.0.1:8080/");
  });

  test("close() stops the server and drops open connections", async () => {
    const fake = fakeCreateServer();
    const s = await startServer({ handler, createServer: fake.createServer });
    await s.close();
    assert.equal(fake.created[0].closed, true);
    assert.equal(fake.created[0].connectionsClosed, true);
  });
});
