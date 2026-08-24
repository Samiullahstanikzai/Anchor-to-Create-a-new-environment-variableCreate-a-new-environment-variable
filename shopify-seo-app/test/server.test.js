import "./testEnv.js";
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createHttpServer } from "../src/server.js";
import { sessionStore } from "../src/lib/sessionStore.js";

let server;
let baseUrl;

before(async () => {
  server = createHttpServer();
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe("static routes", () => {
  test("GET / serves the embedded app shell with the API key injected", async () => {
    const res = await fetch(`${baseUrl}/`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /shopify-api-key/);
    assert.match(text, /test-api-key/);
    assert.doesNotMatch(text, /__SHOPIFY_API_KEY__/);
  });

  test("GET /healthz reports ok", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.ok, true);
  });

  test("GET /app.js serves the frontend script", async () => {
    const res = await fetch(`${baseUrl}/app.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /javascript/);
  });

  test("unknown routes 404", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist-anywhere`);
    assert.equal(res.status, 404);
  });
});

describe("auth flow", () => {
  test("GET /auth without a shop param is rejected", async () => {
    const res = await fetch(`${baseUrl}/auth`, { redirect: "manual" });
    assert.equal(res.status, 400);
  });

  test("GET /auth with a valid shop redirects to Shopify's OAuth screen and sets a state cookie", async () => {
    const res = await fetch(`${baseUrl}/auth?shop=my-test-store.myshopify.com`, { redirect: "manual" });
    assert.equal(res.status, 302);
    const location = res.headers.get("location");
    assert.match(location, /^https:\/\/my-test-store\.myshopify\.com\/admin\/oauth\/authorize\?/);
    assert.match(location, /client_id=test-api-key/);
    assert.match(location, /redirect_uri=http/);
    const setCookie = res.headers.get("set-cookie");
    assert.match(setCookie, /shopify_oauth_state=/);
  });

  test("GET /auth/callback rejects an invalid shop domain", async () => {
    const res = await fetch(`${baseUrl}/auth/callback?shop=not-a-shop&code=x&state=y&hmac=z`);
    assert.equal(res.status, 400);
  });

  test("GET /auth/callback rejects a forged HMAC", async () => {
    const res = await fetch(
      `${baseUrl}/auth/callback?shop=my-test-store.myshopify.com&code=abc&state=fake-state&hmac=deadbeef`,
      { headers: { cookie: "shopify_oauth_state=fake-state" } }
    );
    assert.equal(res.status, 400);
  });
});

describe("webhooks", () => {
  test("rejects a webhook with an invalid signature", async () => {
    const body = JSON.stringify({ id: 1 });
    const res = await fetch(`${baseUrl}/webhooks/app/uninstalled`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-shopify-hmac-sha256": "bogus" },
      body,
    });
    assert.equal(res.status, 401);
  });

  test("accepts a correctly signed app/uninstalled webhook and clears the session", async () => {
    await sessionStore.storeSession("my-test-store.myshopify.com", { accessToken: "shpat_fake" });

    const body = JSON.stringify({ id: 1 });
    const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET).update(body, "utf8").digest("base64");
    const res = await fetch(`${baseUrl}/webhooks/app/uninstalled`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-shopify-hmac-sha256": hmac,
        "x-shopify-shop-domain": "my-test-store.myshopify.com",
      },
      body,
    });
    assert.equal(res.status, 200);

    const session = await sessionStore.loadSession("my-test-store.myshopify.com");
    assert.equal(session, null);
  });

  test("acknowledges mandatory GDPR webhooks when correctly signed", async () => {
    for (const topic of ["customers/data_request", "customers/redact", "shop/redact"]) {
      const body = JSON.stringify({ shop_domain: "my-test-store.myshopify.com" });
      const hmac = createHmac("sha256", process.env.SHOPIFY_API_SECRET).update(body, "utf8").digest("base64");
      const res = await fetch(`${baseUrl}/webhooks/${topic}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-shopify-hmac-sha256": hmac },
        body,
      });
      assert.equal(res.status, 200, `expected 200 for ${topic}`);
    }
  });
});

describe("admin dashboard", () => {
  function extractCookie(res) {
    const setCookie = res.headers.get("set-cookie") || "";
    return setCookie.split(";")[0];
  }

  test("GET /admin without a session redirects to the login page", async () => {
    const res = await fetch(`${baseUrl}/admin`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/admin/login");
  });

  test("GET /admin/login serves the login page", async () => {
    const res = await fetch(`${baseUrl}/admin/login`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Admin password/);
  });

  test("POST /admin/login rejects an incorrect password", async () => {
    const res = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "definitely-wrong" }),
    });
    assert.equal(res.status, 401);
  });

  test("unauthenticated admin API calls are rejected", async () => {
    const res = await fetch(`${baseUrl}/api/admin/status`);
    assert.equal(res.status, 401);
  });

  test("logging in grants access to /admin and the admin API", async () => {
    const loginRes = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }),
    });
    assert.equal(loginRes.status, 200);
    const cookie = extractCookie(loginRes);
    assert.match(cookie, /seo_app_admin_session=/);

    const dashboardRes = await fetch(`${baseUrl}/admin`, { headers: { cookie } });
    assert.equal(dashboardRes.status, 200);

    const statusRes = await fetch(`${baseUrl}/api/admin/status`, { headers: { cookie } });
    assert.equal(statusRes.status, 200);
    const status = await statusRes.json();
    assert.equal(typeof status.installedShopCount, "number");
    assert.deepEqual(status.scopes, process.env.SCOPES.split(","));

    await sessionStore.storeSession("admin-test-shop.myshopify.com", { accessToken: "shpat_fake" });

    const shopsRes = await fetch(`${baseUrl}/api/admin/shops`, { headers: { cookie } });
    assert.equal(shopsRes.status, 200);
    const shops = await shopsRes.json();
    assert.ok(shops.some((s) => s.shop === "admin-test-shop.myshopify.com" && s.hasAccessToken === true));

    const revokeRes = await fetch(`${baseUrl}/api/admin/shops/admin-test-shop.myshopify.com/revoke`, {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(revokeRes.status, 200);
    assert.equal(await sessionStore.loadSession("admin-test-shop.myshopify.com"), null);
  });

  test("/admin/logout clears the session cookie", async () => {
    const res = await fetch(`${baseUrl}/admin/logout`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(extractCookie(res), "seo_app_admin_session=");
  });
});

describe("demo mode", () => {
  test("GET /demo serves the demo shell without requiring auth", async () => {
    const res = await fetch(`${baseUrl}/demo`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /__DEMO_MODE__\s*=\s*true/);
  });

  test("GET /api/demo/dashboard works with no Authorization header at all", async () => {
    const res = await fetch(`${baseUrl}/api/demo/dashboard`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.summary.product.count > 0);
  });

  test("GET /api/demo/product lists sample products, unauthenticated", async () => {
    const res = await fetch(`${baseUrl}/api/demo/product`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.items.length > 0);
    assert.ok(data.items[0].seo);
  });

  test("full edit round-trip: get an item, change its SEO fields, see it reflected", async () => {
    const listRes = await fetch(`${baseUrl}/api/demo/collection`);
    const { items } = await listRes.json();
    const id = items[0].id;

    const putRes = await fetch(`${baseUrl}/api/demo/collection/${encodeURIComponent(id)}/seo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Integration Test Title", description: "Integration test description." }),
    });
    assert.equal(putRes.status, 200);

    const getRes = await fetch(`${baseUrl}/api/demo/collection/${encodeURIComponent(id)}`);
    const updated = await getRes.json();
    assert.equal(updated.seoTitle, "Integration Test Title");
  });

  test("GET /api/demo/:type/:id/links runs the real link checker (live network call)", async () => {
    const listRes = await fetch(`${baseUrl}/api/demo/product`);
    const { items } = await listRes.json();
    const productWithLinks = items.find((p) => /<a\s+href/i.test(p.bodyHtml));
    assert.ok(productWithLinks);

    const res = await fetch(`${baseUrl}/api/demo/product/${encodeURIComponent(productWithLinks.id)}/links`);
    assert.equal(res.status, 200);
    const result = await res.json();
    assert.ok(result.checked >= 1);
  });

  test("POST /api/demo/reset restores the original seed data", async () => {
    const listRes = await fetch(`${baseUrl}/api/demo/page`);
    const { items } = await listRes.json();
    const id = items[0].id;
    const originalTitle = items[0].seoTitle;

    await fetch(`${baseUrl}/api/demo/page/${encodeURIComponent(id)}/seo`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Temporary" }),
    });

    const resetRes = await fetch(`${baseUrl}/api/demo/reset`, { method: "POST" });
    assert.equal(resetRes.status, 200);

    const getRes = await fetch(`${baseUrl}/api/demo/page/${encodeURIComponent(id)}`);
    const afterReset = await getRes.json();
    assert.equal(afterReset.seoTitle, originalTitle);
  });

  test("/api/demo/* is not shadowed by the generic /api/:type routes", async () => {
    // Regression guard: /api/demo/dashboard has the same path shape as
    // /api/:type/:id, and /api/demo/:type has the same shape as
    // /api/:type/:id too. If registerDemoRoutes ever moved after
    // registerApiRoutes in server.js, these would start returning
    // "Unknown resource type" (400) or an auth error (401) instead.
    const dashboardRes = await fetch(`${baseUrl}/api/demo/dashboard`);
    assert.equal(dashboardRes.status, 200);
    const productsRes = await fetch(`${baseUrl}/api/demo/product`);
    assert.equal(productsRes.status, 200);
  });
});

describe("API auth boundary", () => {
  test("rejects requests with no session token", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(res.status, 401);
  });

  test("rejects requests with a garbage bearer token", async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`, { headers: { authorization: "Bearer not-a-real-jwt" } });
    assert.equal(res.status, 401);
  });

  test("rejects an unknown resource type even when unauthenticated (auth is checked first)", async () => {
    const res = await fetch(`${baseUrl}/api/not-a-real-type`);
    assert.equal(res.status, 401);
  });
});
