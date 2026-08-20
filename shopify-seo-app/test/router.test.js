import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../src/lib/router.js";

describe("Router", () => {
  test("matches a static route", () => {
    const router = new Router();
    router.get("/healthz", () => {});
    const match = router.match("GET", "/healthz");
    assert.ok(match);
    assert.deepEqual(match.params, {});
  });

  test("extracts named params", () => {
    const router = new Router();
    router.get("/api/:type/:id", () => {});
    const match = router.match("GET", "/api/product/gid%3A%2F%2Fshopify%2FProduct%2F123");
    assert.ok(match);
    assert.equal(match.params.type, "product");
    assert.equal(match.params.id, "gid://shopify/Product/123");
  });

  test("does not match a route with the wrong method", () => {
    const router = new Router();
    router.post("/api/thing", () => {});
    assert.equal(router.match("GET", "/api/thing"), null);
  });

  test("does not match a route with a different segment count", () => {
    const router = new Router();
    router.get("/api/:type", () => {});
    assert.equal(router.match("GET", "/api/product/123"), null);
  });

  test("first registered matching route wins", () => {
    const router = new Router();
    router.get("/api/dashboard", () => "specific");
    router.get("/api/:type", () => "generic");
    const match = router.match("GET", "/api/dashboard");
    assert.equal(match.handler(), "specific");
  });
});
