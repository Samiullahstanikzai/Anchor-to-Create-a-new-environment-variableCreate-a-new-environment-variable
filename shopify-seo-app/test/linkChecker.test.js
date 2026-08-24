import { test, describe, before, after, mock } from "node:test";
import assert from "node:assert/strict";
import { extractLinks, checkBrokenLinks } from "../src/lib/linkChecker.js";

describe("extractLinks", () => {
  test("extracts and resolves relative and absolute links", () => {
    const html = `<p>See our <a href="/pages/about">about page</a> and
      <a href='https://example.com/other'>this</a>.</p>`;
    const links = extractLinks(html, "https://my-shop.myshopify.com");
    assert.deepEqual(links, ["https://my-shop.myshopify.com/pages/about", "https://example.com/other"]);
  });

  test("skips mailto:, tel:, javascript:, and bare anchor links", () => {
    const html = `
      <a href="mailto:hi@example.com">email</a>
      <a href="tel:+15551234567">call</a>
      <a href="javascript:void(0)">js</a>
      <a href="#section-2">anchor</a>
    `;
    assert.deepEqual(extractLinks(html, "https://my-shop.myshopify.com"), []);
  });

  test("de-duplicates repeated links", () => {
    const html = `<a href="/a">one</a><a href="/a">one again</a>`;
    assert.deepEqual(extractLinks(html, "https://my-shop.myshopify.com"), ["https://my-shop.myshopify.com/a"]);
  });

  test("ignores unparseable hrefs instead of throwing", () => {
    // An unterminated IPv6 host is one of the few inputs the WHATWG URL
    // parser refuses to resolve even against a base URL (most malformed
    // strings just get treated as a relative path instead of throwing).
    const html = `<a href="http://[::1">broken markup</a>`;
    assert.deepEqual(extractLinks(html, "https://my-shop.myshopify.com"), []);
  });

  test("returns an empty array for empty input", () => {
    assert.deepEqual(extractLinks("", "https://my-shop.myshopify.com"), []);
    assert.deepEqual(extractLinks(null, "https://my-shop.myshopify.com"), []);
  });

  test("caps the number of links returned", () => {
    const html = Array.from({ length: 40 }, (_, i) => `<a href="/page-${i}">p${i}</a>`).join("");
    const links = extractLinks(html, "https://my-shop.myshopify.com");
    assert.ok(links.length <= 25, `expected at most 25 links, got ${links.length}`);
  });
});

describe("checkBrokenLinks", () => {
  let originalFetch;

  before(() => {
    originalFetch = global.fetch;
  });

  after(() => {
    global.fetch = originalFetch;
  });

  test("classifies 200 responses as ok and 404s as broken", async () => {
    global.fetch = mock.fn(async (url) => {
      if (url.includes("missing")) return { ok: false, status: 404 };
      return { ok: true, status: 200 };
    });

    const html = `<a href="/products/exists">a</a><a href="/products/missing">b</a>`;
    const result = await checkBrokenLinks(html, "https://my-shop.myshopify.com");

    assert.equal(result.checked, 2);
    assert.equal(result.broken, 1);
    const broken = result.results.find((r) => r.url.includes("missing"));
    assert.equal(broken.broken, true);
    assert.equal(broken.status, 404);
  });

  test("retries with GET when HEAD isn't supported (405/501)", async () => {
    const calls = [];
    global.fetch = mock.fn(async (url, opts) => {
      calls.push(opts.method);
      if (opts.method === "HEAD") return { ok: false, status: 405 };
      return { ok: true, status: 200 };
    });

    const html = `<a href="/products/head-unsupported">a</a>`;
    const result = await checkBrokenLinks(html, "https://my-shop.myshopify.com");

    assert.deepEqual(calls, ["HEAD", "GET"]);
    assert.equal(result.broken, 0);
  });

  test("treats network errors (e.g. timeouts, DNS failures) as broken", async () => {
    global.fetch = mock.fn(async () => {
      throw new Error("fetch failed");
    });

    const html = `<a href="/unreachable">a</a>`;
    const result = await checkBrokenLinks(html, "https://my-shop.myshopify.com");

    assert.equal(result.broken, 1);
    assert.equal(result.results[0].error, "fetch failed");
  });

  test("returns zero checks when there are no links", async () => {
    const result = await checkBrokenLinks("<p>No links here.</p>", "https://my-shop.myshopify.com");
    assert.deepEqual(result, { checked: 0, broken: 0, results: [] });
  });
});
