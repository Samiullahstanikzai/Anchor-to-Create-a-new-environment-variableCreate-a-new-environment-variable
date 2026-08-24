import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  generateNonce,
  isValidShopDomain,
  verifyOAuthHmac,
  verifyWebhookHmac,
  verifySessionToken,
} from "../src/lib/crypto.js";

const SECRET = "shhh-its-a-secret";

describe("generateNonce", () => {
  test("returns hex strings of the requested byte length and is not constant", () => {
    const a = generateNonce(16);
    const b = generateNonce(16);
    assert.equal(a.length, 32);
    assert.match(a, /^[0-9a-f]+$/);
    assert.notEqual(a, b);
  });
});

describe("isValidShopDomain", () => {
  test("accepts a well-formed myshopify.com domain", () => {
    assert.equal(isValidShopDomain("my-cool-store.myshopify.com"), true);
  });

  test("rejects non-myshopify domains and junk input", () => {
    assert.equal(isValidShopDomain("example.com"), false);
    assert.equal(isValidShopDomain("javascript:alert(1)"), false);
    assert.equal(isValidShopDomain(""), false);
    assert.equal(isValidShopDomain(undefined), false);
  });
});

describe("verifyOAuthHmac", () => {
  function sign(params) {
    const message = [...params.entries()]
      .filter(([k]) => k !== "hmac" && k !== "signature")
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return createHmac("sha256", SECRET).update(message).digest("hex");
  }

  test("accepts a correctly signed callback", () => {
    const params = new URLSearchParams({ shop: "store.myshopify.com", code: "abc123", state: "nonce1", timestamp: "1700000000" });
    params.set("hmac", sign(params));
    assert.equal(verifyOAuthHmac(params, SECRET), true);
  });

  test("rejects a tampered parameter", () => {
    const params = new URLSearchParams({ shop: "store.myshopify.com", code: "abc123", state: "nonce1", timestamp: "1700000000" });
    params.set("hmac", sign(params));
    params.set("shop", "attacker.myshopify.com");
    assert.equal(verifyOAuthHmac(params, SECRET), false);
  });

  test("rejects when hmac is missing", () => {
    const params = new URLSearchParams({ shop: "store.myshopify.com" });
    assert.equal(verifyOAuthHmac(params, SECRET), false);
  });
});

describe("verifyWebhookHmac", () => {
  test("accepts a correctly signed body", () => {
    const body = JSON.stringify({ id: 123, domain: "store.myshopify.com" });
    const digest = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
    assert.equal(verifyWebhookHmac(body, digest, SECRET), true);
  });

  test("rejects a tampered body", () => {
    const body = JSON.stringify({ id: 123 });
    const digest = createHmac("sha256", SECRET).update(body, "utf8").digest("base64");
    assert.equal(verifyWebhookHmac(JSON.stringify({ id: 456 }), digest, SECRET), false);
  });

  test("rejects when header is missing", () => {
    assert.equal(verifyWebhookHmac("{}", undefined, SECRET), false);
  });
});

function base64Url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeSessionToken({ apiKey = "test-api-key", shop = "store.myshopify.com", secret = SECRET, exp, nbf } = {}) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: `https://${shop}/admin`,
    dest: `https://${shop}`,
    aud: apiKey,
    sub: "1",
    exp: exp ?? now + 60,
    nbf: nbf ?? now - 60,
    iat: now - 60,
    jti: "abc",
    sid: "def",
  };
  const headerB64 = base64Url(Buffer.from(JSON.stringify(header)));
  const payloadB64 = base64Url(Buffer.from(JSON.stringify(payload)));
  const signature = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
  return `${headerB64}.${payloadB64}.${base64Url(signature)}`;
}

describe("verifySessionToken", () => {
  test("verifies a correctly signed, current token and extracts the shop", () => {
    const token = makeSessionToken({});
    const { shop } = verifySessionToken(token, { apiKey: "test-api-key", apiSecret: SECRET });
    assert.equal(shop, "store.myshopify.com");
  });

  test("rejects a token signed with the wrong secret", () => {
    const token = makeSessionToken({ secret: "wrong-secret" });
    assert.throws(() => verifySessionToken(token, { apiKey: "test-api-key", apiSecret: SECRET }));
  });

  test("rejects an expired token", () => {
    const token = makeSessionToken({ exp: Math.floor(Date.now() / 1000) - 10 });
    assert.throws(() => verifySessionToken(token, { apiKey: "test-api-key", apiSecret: SECRET }));
  });

  test("rejects a token issued for a different app (audience mismatch)", () => {
    const token = makeSessionToken({ apiKey: "someone-elses-app" });
    assert.throws(() => verifySessionToken(token, { apiKey: "test-api-key", apiSecret: SECRET }));
  });

  test("rejects a malformed token", () => {
    assert.throws(() => verifySessionToken("not-a-jwt", { apiKey: "test-api-key", apiSecret: SECRET }));
  });
});
