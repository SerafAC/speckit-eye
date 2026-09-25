import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHandler, routeKey, contentTypeFor, CSP } from "../../src/serve/handler.js";

const SITE = new Map([
  ["index.html", { type: "text/html", body: "<!doctype html><p>hi ✓</p>" }],
  ["assets/styles.css", { type: "text/css", body: "body{}" }],
  ["assets/overview.js", { type: "text/javascript", body: "export {};" }],
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
    assert.equal(contentTypeFor("assets/overview.js"), "text/javascript; charset=utf-8");
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

    res = request("/assets/overview.js");
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
