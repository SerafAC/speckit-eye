import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createEventHub, formatEvent, PING_MS } from "../../src/serve/events.js";

function fakeRes() {
  const res = new EventEmitter();
  res.status = null;
  res.headers = null;
  res.chunks = [];
  res.ended = false;
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers;
  };
  res.write = (chunk) => {
    res.chunks.push(chunk);
    return true;
  };
  res.end = () => {
    res.ended = true;
  };
  res.text = () => res.chunks.join("");
  return res;
}

describe("createEventHub", () => {
  let hub;
  beforeEach(() => mock.timers.enable({ apis: ["setInterval"] }));
  afterEach(() => {
    hub?.close();
    mock.timers.reset();
  });

  const make = (opts = {}) =>
    (hub = createEventHub({
      setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
      clearInterval: (h) => globalThis.clearInterval(h),
      ...opts,
    }));

  test("formatEvent writes one SSE message", () => {
    assert.equal(formatEvent("change", 3), 'event: change\ndata: {"version":3}\n\n');
  });

  test("add writes the stream headers and a hello with the current version", () => {
    make({ version: 4 });
    const req = new EventEmitter();
    const res = fakeRes();
    hub.add(req, res);
    assert.equal(res.status, 200);
    assert.equal(res.headers["Content-Type"], "text/event-stream");
    assert.equal(res.headers["Cache-Control"], "no-store");
    // A stream's connection is never reused for another request.
    assert.equal(res.headers.Connection, "close");
    assert.equal(res.text(), 'event: hello\ndata: {"version":4}\n\n');
    assert.equal(hub.size(), 1);
  });

  test("broadcast sends change to every client; later clients get the new version in hello", () => {
    make();
    const a = fakeRes();
    const b = fakeRes();
    hub.add(new EventEmitter(), a);
    hub.add(new EventEmitter(), b);
    hub.broadcast(1);
    for (const res of [a, b]) assert.equal(res.chunks.at(-1), 'event: change\ndata: {"version":1}\n\n');
    const c = fakeRes();
    hub.add(new EventEmitter(), c);
    assert.equal(c.text(), 'event: hello\ndata: {"version":1}\n\n');
  });

  test("a client is removed when its request or response closes", () => {
    make();
    const req = new EventEmitter();
    const res = fakeRes();
    hub.add(req, res);
    const res2 = fakeRes();
    hub.add(new EventEmitter(), res2);
    assert.equal(hub.size(), 2);
    req.emit("close");
    assert.equal(hub.size(), 1);
    res2.emit("close");
    assert.equal(hub.size(), 0);
    hub.broadcast(2);
    assert.equal(res.chunks.length, 1, "only the hello");
  });

  test("a client whose write throws is dropped", () => {
    make();
    const res = fakeRes();
    hub.add(new EventEmitter(), res);
    res.write = () => {
      throw new Error("EPIPE");
    };
    hub.broadcast(1);
    assert.equal(hub.size(), 0);
  });

  test("sends a ping comment every 25 s", () => {
    make();
    const res = fakeRes();
    hub.add(new EventEmitter(), res);
    mock.timers.tick(PING_MS - 1);
    assert.equal(res.chunks.length, 1);
    mock.timers.tick(1);
    assert.equal(res.chunks.at(-1), ": ping\n\n");
    mock.timers.tick(PING_MS);
    assert.equal(res.chunks.filter((c) => c === ": ping\n\n").length, 2);
  });

  test("close ends every stream, stops the ping and ignores later calls", () => {
    make();
    const res = fakeRes();
    hub.add(new EventEmitter(), res);
    hub.close();
    assert.equal(res.ended, true);
    assert.equal(hub.size(), 0);
    mock.timers.tick(PING_MS * 3);
    hub.broadcast(9);
    assert.equal(res.chunks.length, 1);
    const late = fakeRes();
    hub.add(new EventEmitter(), late);
    assert.equal(late.ended, true);
    assert.equal(hub.size(), 0);
    hub.close();
  });

  test("close ignores a stream whose end throws", () => {
    make();
    const res = fakeRes();
    res.end = () => {
      throw new Error("socket gone");
    };
    const ok = fakeRes();
    hub.add(new EventEmitter(), res);
    hub.add(new EventEmitter(), ok);
    assert.doesNotThrow(() => hub.close());
    assert.equal(ok.ended, true);
    assert.equal(hub.size(), 0);
  });
});
