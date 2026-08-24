import "./testEnv.js";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  isAdminEnabled,
  checkAdminPassword,
  createAdminSessionToken,
  verifyAdminSessionToken,
} from "../src/lib/adminAuth.js";

describe("isAdminEnabled", () => {
  test("is true when ADMIN_PASSWORD is set (via testEnv.js)", () => {
    assert.equal(isAdminEnabled(), true);
  });
});

describe("checkAdminPassword", () => {
  test("accepts the configured password", () => {
    assert.equal(checkAdminPassword(process.env.ADMIN_PASSWORD), true);
  });

  test("rejects an incorrect password", () => {
    assert.equal(checkAdminPassword("definitely-wrong"), false);
  });

  test("rejects non-string input without throwing", () => {
    assert.equal(checkAdminPassword(undefined), false);
    assert.equal(checkAdminPassword(12345), false);
  });
});

describe("admin session tokens", () => {
  test("a freshly created token verifies successfully", () => {
    const token = createAdminSessionToken();
    assert.equal(verifyAdminSessionToken(token), true);
  });

  test("rejects a tampered token", () => {
    const token = createAdminSessionToken();
    const tampered = token.slice(0, -2) + "00";
    assert.equal(verifyAdminSessionToken(tampered), false);
  });

  test("rejects a malformed token", () => {
    assert.equal(verifyAdminSessionToken("not-a-token"), false);
    assert.equal(verifyAdminSessionToken(undefined), false);
  });

  test("rejects an expired token", () => {
    const expiredPayload = `admin:${Math.floor(Date.now() / 1000) - 10}`;
    // Re-derive the signature the same way the module does, but for a
    // timestamp already in the past.
    const secret = process.env.ADMIN_SESSION_SECRET || process.env.SHOPIFY_API_SECRET;
    const signature = createHmac("sha256", secret).update(expiredPayload).digest("hex");
    assert.equal(verifyAdminSessionToken(`${expiredPayload}:${signature}`), false);
  });
});
