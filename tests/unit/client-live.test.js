import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import {
  collectSigs,
  changedKeys,
  applyToggles,
  createLiveClient,
  CHANGED_MS,
  ANIMATE_MS,
  RECONNECT_MS,
  EVENTS_URL,
} from "../../src/client/live.js";

// ---------------------------------------------------------------------------
// A tiny fake DOM: elements with attributes, children and a querySelector that
// understands `tag`, `[attr]`, `[attr="v"]` and `tag[attr]` / `tag[attr="v"]`.
// ---------------------------------------------------------------------------

function matches(el, selector) {
  const m = /^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/.exec(selector);
  if (!m) throw new Error(`unsupported selector ${selector}`);
  const [, tag, attr, value] = m;
  if (tag && el.tagName.toLowerCase() !== tag) return false;
  if (attr && !el.attributes.has(attr)) return false;
  if (attr && value !== undefined && el.attributes.get(attr) !== value) return false;
  return true;
}

function el(tag, attrs = {}, children = []) {
  const node = {
    tagName: tag.toUpperCase(),
    attributes: new Map(Object.entries(attrs).map(([k, v]) => [k, String(v)])),
    children: [],
    parent: null,
    textContent: "",
    getAttribute: (n) => (node.attributes.has(n) ? node.attributes.get(n) : null),
    setAttribute: (n, v) => node.attributes.set(n, String(v)),
    removeAttribute: (n) => node.attributes.delete(n),
    hasAttribute: (n) => node.attributes.has(n),
    *descendants() {
      for (const c of node.children) {
        if (typeof c !== "object" || !c.tagName) continue;
        yield c;
        yield* c.descendants();
      }
    },
    querySelectorAll: (s) => [...node.descendants()].filter((d) => matches(d, s)),
    querySelector: (s) => node.querySelectorAll(s)[0] ?? null,
    append(...kids) {
      for (const k of kids) {
        if (k && typeof k === "object") k.parent = node;
        node.children.push(k);
      }
    },
    prepend(...kids) {
      for (const k of kids) if (k && typeof k === "object") k.parent = node;
      node.children.unshift(...kids);
    },
    replaceWith(other) {
      const siblings = node.parent.children;
      siblings[siblings.indexOf(node)] = other;
      other.parent = node.parent;
      node.parent = null;
    },
  };
  if (tag === "details") {
    Object.defineProperty(node, "open", {
      get: () => node.attributes.has("open"),
      set: (v) => (v ? node.attributes.set("open", "") : node.attributes.delete("open")),
    });
  }
  if (tag === "progress") {
    Object.defineProperty(node, "value", {
      get: () => Number(node.attributes.get("value") ?? 0),
      set: (v) => node.attributes.set("value", String(v)),
    });
  }
  if (tag === "div") {
    Object.defineProperty(node, "hidden", {
      get: () => node.attributes.has("hidden"),
      set: (v) => (v ? node.attributes.set("hidden", "") : node.attributes.delete("hidden")),
    });
  }
  node.append(...children);
  return node;
}

/** A `<main>` like the overview's, with the given task-1 state and bar value. */
function overviewMain({ done = 1, betaOpen = false, gammaOpen = false, t2sig = "open" } = {}) {
  return el("main", {}, [
    el("section", { "data-region": "progress" }, [
      el("progress", { "data-key": "project", "data-sig": `p${done}`, value: done, max: 4 }),
    ]),
    el("div", { "data-region": "tree" }, [
      el("details", { "data-key": "001-a", "data-sig": `f${done}`, ...(done < 4 ? { open: "" } : {}) }, [
        el("details", { "data-key": "001-a/p1", "data-sig": `ph${done}`, open: "" }, [
          el("li", { "data-key": "001-a/T001", "data-sig": "done" }),
          el("li", { "data-key": "001-a/T002", "data-sig": t2sig }),
        ]),
      ]),
      el("details", { "data-key": "002-b", "data-sig": "b", ...(betaOpen ? { open: "" } : {}) }),
      el("details", { "data-key": "003-c", "data-sig": "c", ...(gammaOpen ? { open: "" } : {}) }),
    ]),
    el("div", { "data-region": "grid" }, [
      el("a", { "data-key": "001-a/T001", "data-sig": "done" }),
      el("a", { "data-key": "001-a/T002", "data-sig": t2sig }),
    ]),
  ]);
}

class FakeEventSource {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = new Map();
    this.closed = false;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type, fn) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(type, data = { version: 1 }) {
    for (const fn of this.listeners.get(type) ?? []) fn({ type, data: JSON.stringify(data) });
  }
}

/** Builds a page, a server with a queue of responses and the client. */
function setup({ main = overviewMain(), reduced = false } = {}) {
  FakeEventSource.instances = [];
  const body = el("body", {}, [
    main,
    el("div", { "data-region": "live-status", hidden: "" }),
  ]);
  const docListeners = new Map();
  const document = {
    body,
    querySelector: (s) => body.querySelector(s),
    addEventListener: (type, fn, capture) => docListeners.set(type, { fn, capture }),
    createElement: (tag) => el(tag),
    createTextNode: (text) => ({ nodeType: 3, textContent: text }),
  };
  const window = {
    scrollX: 0,
    scrollY: 0,
    location: { pathname: "/index.html" },
    scrollTo(x, y) {
      window.scrolledTo = [x, y];
      window.scrollX = x;
      window.scrollY = y;
    },
    matchMedia: (q) => ({ matches: reduced && q === "(prefers-reduced-motion: reduce)" }),
  };
  const server = { next: [], requests: [] };
  const fetch = async (url, init) => {
    server.requests.push({ url, init });
    const r = server.next.shift() ?? { status: 500 };
    if (r.reject) throw new Error("offline");
    return { status: r.status, ok: r.status >= 200 && r.status < 300, text: async () => r.id ?? "" };
  };
  const pages = new Map();
  class DOMParser {
    parseFromString(text) {
      const m = pages.get(text);
      return { querySelector: (s) => (s === "main" ? m ?? null : null) };
    }
  }
  const frames = [];
  const requestAnimationFrame = (cb) => frames.push(cb);
  const runFrames = (now) => {
    const batch = frames.splice(0);
    for (const cb of batch) cb(now);
  };
  const client = createLiveClient({
    document,
    window,
    EventSource: FakeEventSource,
    fetch,
    DOMParser,
    setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
    requestAnimationFrame,
  });
  /** Queues a 200 response whose body parses to `nextMain`. */
  const respond = (nextMain) => {
    const id = `page-${pages.size}`;
    pages.set(id, nextMain);
    server.next.push({ status: 200, id });
  };
  const toggle = (details) => docListeners.get("toggle").fn({ type: "toggle", target: details });
  const es = () => FakeEventSource.instances.at(-1);
  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return { document, window, server, client, respond, toggle, es, flush, frames, runFrames, docListeners, body };
}

describe("collectSigs / changedKeys / applyToggles", () => {
  test("collectSigs maps data-key to data-sig and skips incomplete elements", () => {
    const sigs = collectSigs([
      el("li", { "data-key": "a", "data-sig": "1" }),
      el("li", { "data-key": "b" }),
      el("li", { "data-sig": "x" }),
      el("li", { "data-key": "c", "data-sig": "" }),
    ]);
    assert.deepEqual([...sigs], [["a", "1"], ["c", ""]]);
  });

  test("changedKeys lists changed and new keys, not removed ones", () => {
    const old = new Map([["a", "1"], ["b", "2"], ["gone", "x"]]);
    const now = new Map([["a", "1"], ["b", "3"], ["new", "y"]]);
    assert.deepEqual([...changedKeys(old, now)].sort(), ["b", "new"]);
    assert.equal(changedKeys(now, now).size, 0);
  });

  test("applyToggles sets open only for recorded keys", () => {
    const a = el("details", { "data-key": "a" });
    const b = el("details", { "data-key": "b", open: "" });
    const c = el("details", { "data-key": "c", open: "" });
    applyToggles([a, b, c], new Map([["a", true], ["b", false]]));
    assert.equal(a.open, true);
    assert.equal(b.open, false);
    assert.equal(c.open, true);
  });
});

describe("createLiveClient", () => {
  beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
  afterEach(() => mock.timers.reset());

  test("start connects to /__events and listens for toggle events in the capture phase", () => {
    const t = setup();
    t.client.start();
    assert.equal(t.es().url, EVENTS_URL);
    assert.equal(t.docListeners.get("toggle").capture, true);
  });

  test("records only the viewer's own toggles, not echoes of rendered state", () => {
    const t = setup();
    t.client.start();
    const beta = t.body.querySelector('details[data-key="002-b"]');
    const feature = t.body.querySelector('details[data-key="001-a"]');
    t.toggle(feature); // echo of the server-rendered open state
    assert.equal(t.client.toggles.size, 0);
    beta.open = true;
    t.toggle(beta);
    feature.open = false;
    t.toggle(feature);
    assert.deepEqual([...t.client.toggles], [["002-b", true], ["001-a", false]]);
  });

  test("change swaps <main>, keeps the viewer's toggles and scroll position", async () => {
    const t = setup();
    t.client.start();
    t.body.querySelector('details[data-key="002-b"]').open = true;
    t.toggle(t.body.querySelector('details[data-key="002-b"]'));
    const phase = t.body.querySelector('details[data-key="001-a/p1"]');
    phase.open = false;
    t.toggle(phase);
    t.window.scrollX = 3;
    t.window.scrollY = 420;

    const next = overviewMain({ done: 2, t2sig: "done" });
    t.respond(next);
    t.es().emit("change");
    await t.flush();

    assert.equal(t.server.requests.length, 1);
    assert.equal(t.server.requests[0].url, "/index.html");
    assert.equal(t.body.querySelector("main"), next, "main replaced");
    assert.equal(next.querySelector('details[data-key="002-b"]').open, true, "viewer-opened stays open");
    assert.equal(next.querySelector('details[data-key="001-a/p1"]').open, false, "viewer-closed stays closed");
    assert.equal(next.querySelector('details[data-key="001-a"]').open, true, "server default kept");
    assert.equal(next.querySelector('details[data-key="003-c"]').open, false);
    assert.deepEqual(t.window.scrolledTo, [3, 420]);
  });

  test("the toggle echo after a swap is not recorded as a viewer choice", async () => {
    const t = setup();
    t.client.start();
    const next = overviewMain({ done: 2, gammaOpen: true });
    t.respond(next);
    t.es().emit("change");
    await t.flush();
    t.toggle(next.querySelector('details[data-key="003-c"]'));
    assert.equal(t.client.toggles.size, 0);
  });

  test("data-changed is set on changed items and cleared after 1.5 s", async () => {
    const t = setup();
    t.client.start();
    const next = overviewMain({ done: 2, t2sig: "done" });
    t.respond(next);
    t.es().emit("change");
    await t.flush();
    const flagged = [...next.querySelectorAll("[data-changed]")].map((e) => `${e.tagName}:${e.getAttribute("data-key")}`).sort();
    assert.deepEqual(flagged, [
      "A:001-a/T002",
      "DETAILS:001-a",
      "DETAILS:001-a/p1",
      "LI:001-a/T002",
      "PROGRESS:project",
    ]);
    mock.timers.tick(CHANGED_MS - 1);
    assert.equal(next.querySelectorAll("[data-changed]").length, 5);
    mock.timers.tick(1);
    assert.equal(next.querySelectorAll("[data-changed]").length, 0);
  });

  test("progress bars animate from the old value to the new one", async () => {
    const t = setup();
    t.client.start();
    const next = overviewMain({ done: 3 });
    t.respond(next);
    t.es().emit("change");
    await t.flush();
    const bar = next.querySelector("progress");
    assert.equal(bar.value, 1, "starts at the old value");
    t.runFrames(1000);
    assert.equal(bar.value, 1);
    t.runFrames(1000 + ANIMATE_MS / 2);
    assert.ok(bar.value > 1 && bar.value < 3, `mid-animation ${bar.value}`);
    t.runFrames(1000 + ANIMATE_MS);
    assert.equal(bar.value, 3);
    assert.equal(t.frames.length, 0, "animation stopped");
  });

  test("reduced motion skips the animation", async () => {
    const t = setup({ reduced: true });
    t.client.start();
    const next = overviewMain({ done: 3 });
    t.respond(next);
    t.es().emit("change");
    await t.flush();
    assert.equal(next.querySelector("progress").value, 3);
    assert.equal(t.frames.length, 0);
  });

  test("a 404 shows a notice linking to the overview and keeps the content", async () => {
    const t = setup();
    t.client.start();
    const before = t.body.querySelector("main");
    t.server.next.push({ status: 404 });
    t.es().emit("change");
    await t.flush();
    assert.equal(t.body.querySelector("main"), before);
    const notice = before.querySelector('[data-region="not-found"]');
    assert.ok(notice);
    assert.equal(before.children[0], notice, "shown at the top");
    assert.equal(notice.querySelector("a").getAttribute("href"), "/");
    // A second 404 does not add a second notice.
    t.server.next.push({ status: 404 });
    t.es().emit("change");
    await t.flush();
    assert.equal(before.querySelectorAll('[data-region="not-found"]').length, 1);
  });

  test("a failed fetch or server error keeps the last content", async () => {
    const t = setup();
    t.client.start();
    const before = t.body.querySelector("main");
    t.server.next.push({ reject: true }, { status: 500 });
    t.es().emit("change");
    await t.flush();
    t.es().emit("change");
    await t.flush();
    assert.equal(t.body.querySelector("main"), before);
  });

  test("a page without <main> starts and ignores changes without fetching", async () => {
    const t = setup({ main: el("section") });
    t.client.start();
    t.es().emit("change");
    await t.flush();
    assert.equal(t.server.requests.length, 0);
  });

  test("a response without <main> keeps the last content", async () => {
    const t = setup();
    t.client.start();
    const before = t.body.querySelector("main");
    t.respond(null);
    t.es().emit("change");
    await t.flush();
    assert.equal(t.server.requests.length, 1);
    assert.equal(t.body.querySelector("main"), before);
  });

  test("toggle events from non-details elements or details without data-key are ignored", () => {
    const t = setup();
    t.client.start();
    t.toggle(null);
    t.toggle({});
    t.toggle(el("div", { "data-key": "x" }));
    const unkeyed = el("details", { open: "" });
    t.toggle(unkeyed);
    assert.equal(t.client.toggles.size, 0);
  });

  test("error shows the banner; the next hello hides it and fetches once", async () => {
    const t = setup();
    t.client.start();
    const banner = t.body.querySelector('[data-region="live-status"]');
    t.es().emit("hello");
    await t.flush();
    assert.equal(t.server.requests.length, 0, "first hello does not fetch");
    assert.equal(banner.hidden, true);

    t.es().emit("error");
    assert.equal(banner.hidden, false);
    t.es().emit("error");
    assert.equal(banner.hidden, false);

    const next = overviewMain({ done: 2 });
    t.respond(next);
    t.es().emit("hello");
    await t.flush();
    assert.equal(banner.hidden, true);
    assert.equal(t.server.requests.length, 1);
    assert.equal(t.body.querySelector("main"), next);

    t.es().emit("hello");
    await t.flush();
    assert.equal(t.server.requests.length, 1, "only once per reconnect");
  });

  test("a stream closed for good is reopened after a delay", () => {
    const t = setup();
    t.client.start();
    const first = t.es();
    first.readyState = 2;
    first.emit("error");
    assert.equal(FakeEventSource.instances.length, 1);
    mock.timers.tick(RECONNECT_MS);
    assert.equal(FakeEventSource.instances.length, 2);
    assert.equal(first.closed, true);
  });

  test("changes during a refresh lead to exactly one more refresh", async () => {
    const t = setup();
    t.client.start();
    t.respond(overviewMain({ done: 2 }));
    const last = overviewMain({ done: 3 });
    t.respond(last);
    t.es().emit("change");
    t.es().emit("change");
    t.es().emit("change");
    await t.flush();
    await t.flush();
    assert.equal(t.server.requests.length, 2);
    assert.equal(t.body.querySelector("main"), last);
  });
});
