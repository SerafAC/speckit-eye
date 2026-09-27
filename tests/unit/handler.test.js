import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHandler, routeKey, contentTypeFor, stampVersion, CSP } from "../../src/serve/handler.js";

const SITE = new Map([
  ["index.html", { type: "text/html", body: "<!doctype html><p>hi ✓</p>" }],
  ["assets/styles.css", { type: "text/css", body: "body{}" }],
  ["assets/app.js", { type: "text/javascript", body: "export {};" }],
  ["features/001-a/spec.html", { type: "text/html", body: "<p>spec</p>" }],
]);

function fakeRes() {
  return {
    status: null,
    headers: null,
    body: undefined,
    ended: false,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.ended = true;
      this.body = body;
    },
  };
}

let siteCalls = 0;
const handle = createHandler({
  getSite: () => {
    siteCalls++;
    return SITE;
  },
});

function request(url, method = "GET") {
  const res = fakeRes();
  handle({ method, url }, res);
  return res;
}

const text = (res) => (res.body === undefined ? undefined : Buffer.from(res.body).toString("utf8"));

describe("routeKey", () => {
  test("maps / to index.html and strips the leading slash", () => {
    assert.equal(routeKey("/"), "index.html");
    assert.equal(routeKey("/assets/styles.css"), "assets/styles.css");
    assert.equal(routeKey("/index.html?x=1#y"), "index.html");
    assert.equal(routeKey("/?v=2"), "index.html");
  });

  test("rejects traversal and encoded variants", () => {
    for (const url of [
      "/../etc/passwd",
      "/assets/../index.html",
      "/%2e%2e/secret",
      "/assets%2Fstyles.css",
      "/..%2fpackage.json",
      "/a\\..\\b",
      "//index.html",
      "/./index.html",
      "index.html",
    ]) {
      assert.equal(routeKey(url), null, url);
    }
  });
});

describe("contentTypeFor", () => {
  test("by extension", () => {
    assert.equal(contentTypeFor("index.html"), "text/html; charset=utf-8");
    assert.equal(contentTypeFor("assets/styles.css"), "text/css; charset=utf-8");
    assert.equal(contentTypeFor("assets/app.js"), "text/javascript; charset=utf-8");
    assert.equal(contentTypeFor("assets/fonts/geist-latin-wght-normal.woff2"), "font/woff2");
    assert.equal(contentTypeFor("assets/fonts/OFL-geist.txt"), "text/plain; charset=utf-8");
    assert.equal(contentTypeFor("x.unknown"), "application/octet-stream");
    assert.equal(contentTypeFor("noext"), "application/octet-stream");
  });
});

describe("createHandler", () => {
  test("serves / and every site path with its body", () => {
    let res = request("/");
    assert.equal(res.status, 200);
    assert.equal(text(res), "<!doctype html><p>hi ✓</p>");
    assert.equal(res.headers["Content-Type"], "text/html; charset=utf-8");
    assert.equal(res.headers["Content-Length"], Buffer.byteLength("<!doctype html><p>hi ✓</p>"));

    res = request("/assets/styles.css");
    assert.equal(res.status, 200);
    assert.equal(text(res), "body{}");
    assert.equal(res.headers["Content-Type"], "text/css; charset=utf-8");

    res = request("/assets/app.js");
    assert.equal(res.headers["Content-Type"], "text/javascript; charset=utf-8");

    res = request("/features/001-a/spec.html");
    assert.equal(text(res), "<p>spec</p>");
  });

  test("reads the site on every request (it can change)", () => {
    const before = siteCalls;
    request("/");
    request("/");
    assert.equal(siteCalls, before + 2);
  });

  test("unknown and traversal paths are 404 (FR-007)", () => {
    for (const url of ["/nope.html", "/../package.json", "/%2e%2e/package.json", "/assets/", "/features/001-a/", "/src/cli/main.js"]) {
      const res = request(url);
      assert.equal(res.status, 404, url);
      assert.equal(res.headers["Content-Type"], "text/plain; charset=utf-8");
      assert.equal(text(res), "Not Found\n");
    }
  });

  test("methods other than GET and HEAD are 405", () => {
    for (const method of ["POST", "PUT", "DELETE", "PATCH", "OPTIONS"]) {
      const res = request("/", method);
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.Allow, "GET, HEAD");
    }
  });

  test("HEAD sends headers without a body", () => {
    const res = request("/", "HEAD");
    assert.equal(res.status, 200);
    assert.equal(res.ended, true);
    assert.equal(res.body, undefined);
    assert.equal(res.headers["Content-Length"], Buffer.byteLength("<!doctype html><p>hi ✓</p>"));
    const miss = request("/nope", "HEAD");
    assert.equal(miss.status, 404);
    assert.equal(miss.body, undefined);
  });

  test("every response carries the security headers", () => {
    for (const [url, method] of [["/", "GET"], ["/nope", "GET"], ["/", "POST"], ["/", "HEAD"]]) {
      const res = request(url, method);
      assert.equal(res.headers["Cache-Control"], "no-store");
      assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
      assert.equal(res.headers["Content-Security-Policy"], CSP);
      assert.equal(CSP, "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:");
    }
  });
});

describe("createHandler: defaults", () => {
  test("a request without method or url is a GET of /", () => {
    const res = fakeRes();
    handle({}, res);
    assert.equal(res.status, 200);
    assert.equal(text(res), "<!doctype html><p>hi ✓</p>");
  });

  test("binary bodies are sent as they are", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const h = createHandler({ getSite: () => new Map([["logo.png", { type: "image/png", body: bytes }]]) });
    const res = fakeRes();
    h({ method: "GET", url: "/logo.png" }, res);
    assert.equal(res.status, 200);
    assert.equal(res.body, bytes);
    assert.equal(res.headers["Content-Length"], 4);
    assert.equal(res.headers["Content-Type"], "image/png");
  });
});

describe("createHandler: binary font bodies (research D12)", () => {
  // A view into a larger buffer: only its own bytes may be sent.
  const backing = new Uint8Array([0xaa, 0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0x80, 0xc3, 0xbb]);
  const font = backing.subarray(1, 9);
  const fontSite = new Map([["assets/fonts/geist-latin-wght-normal.woff2", { type: "font/woff2", body: font }]]);
  const h = createHandler({ getSite: () => fontSite });

  test("a Uint8Array body is sent byte-exact with its own length and the font type", () => {
    const res = fakeRes();
    h({ method: "GET", url: "/assets/fonts/geist-latin-wght-normal.woff2" }, res);
    assert.equal(res.status, 200);
    assert.equal(res.body, font);
    assert.deepEqual([...res.body], [0x77, 0x4f, 0x46, 0x32, 0x00, 0xff, 0x80, 0xc3]);
    assert.equal(res.headers["Content-Length"], 8);
    assert.equal(res.headers["Content-Type"], "font/woff2");
  });

  test("the CSP and the other 001 headers are unchanged on binary responses", () => {
    for (const method of ["GET", "HEAD"]) {
      const res = fakeRes();
      h({ method, url: "/assets/fonts/geist-latin-wght-normal.woff2" }, res);
      assert.equal(res.headers["Content-Security-Policy"], "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:");
      assert.equal(res.headers["Cache-Control"], "no-store");
      assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
      assert.equal(res.headers["Content-Length"], 8);
      if (method === "HEAD") assert.equal(res.body, undefined);
    }
  });
});

describe("createHandler: GET /__events (US2)", () => {
  function withEvents() {
    const added = [];
    const events = { add: (req, res) => added.push({ req, res }) };
    let siteReads = 0;
    const h = createHandler({
      getSite: () => {
        siteReads++;
        return SITE;
      },
      events,
    });
    return { h, added, siteReads: () => siteReads };
  }

  test("is routed to events.add without a site-map lookup", () => {
    const { h, added, siteReads } = withEvents();
    const req = { method: "GET", url: "/__events" };
    const res = fakeRes();
    h(req, res);
    assert.equal(added.length, 1);
    assert.equal(added[0].req, req);
    assert.equal(added[0].res, res);
    assert.equal(res.status, null, "the hub writes the response");
    assert.equal(siteReads(), 0);
  });

  test("query strings are allowed (EventSource reconnects)", () => {
    const { h, added } = withEvents();
    h({ method: "GET", url: "/__events?x=1" }, fakeRes());
    assert.equal(added.length, 1);
  });

  test("other methods get 405 with Allow: GET", () => {
    const { h, added } = withEvents();
    for (const method of ["HEAD", "POST"]) {
      const res = fakeRes();
      h({ method, url: "/__events" }, res);
      assert.equal(res.status, 405, method);
      assert.equal(res.headers.Allow, "GET");
    }
    assert.equal(added.length, 0);
  });

  test("without an events hub the path is a 404", () => {
    const res = request("/__events");
    assert.equal(res.status, 404);
  });

  test("near misses are ordinary site lookups (404)", () => {
    const { h, added } = withEvents();
    for (const url of ["/__events/", "/__events/x", "/%5F_events", "/assets/__events"]) {
      const res = fakeRes();
      h({ method: "GET", url }, res);
      assert.equal(res.status, 404, url);
    }
    assert.equal(added.length, 0);
  });
});

describe("createHandler: model version stamp (live updates)", () => {
  const site = new Map([
    ["index.html", { type: "text/html", body: '<!doctype html>\n<html><body data-mode="serve" data-page="overview"><main>x</main></body></html>' }],
    ["assets/app.js", { type: "text/javascript", body: 'document.body; "<body "' }],
  ]);

  test("stampVersion adds data-model-version to the first <body> only", () => {
    assert.equal(stampVersion('<body data-a="1"><p>&lt;body </p>', 3), '<body data-model-version="3" data-a="1"><p>&lt;body </p>');
    assert.equal(stampVersion("<p>no body</p>", 3), "<p>no body</p>");
  });

  test("HTML pages carry the version of the site they were served from", () => {
    let version = 0;
    const h = createHandler({ getSite: () => site, getVersion: () => version });
    let res = fakeRes();
    h({ method: "GET", url: "/" }, res);
    let body = text(res);
    assert.match(body, /<body data-model-version="0" data-mode="serve"/);
    assert.equal(res.headers["Content-Length"], Buffer.byteLength(body));

    version = 7;
    res = fakeRes();
    h({ method: "GET", url: "/index.html" }, res);
    assert.match(text(res), /<body data-model-version="7" /);
  });

  test("other types and handlers without getVersion are unchanged", () => {
    const h = createHandler({ getSite: () => site, getVersion: () => 5 });
    const res = fakeRes();
    h({ method: "GET", url: "/assets/app.js" }, res);
    assert.equal(text(res), 'document.body; "<body "');
    const plain = createHandler({ getSite: () => site });
    const res2 = fakeRes();
    plain({ method: "GET", url: "/" }, res2);
    assert.doesNotMatch(text(res2), /data-model-version/);
  });
});
