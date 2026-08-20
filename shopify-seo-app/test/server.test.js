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
