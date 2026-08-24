import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 12; // 12 hours

function secret() {
  // Falls back to the app's Shopify client secret so a working admin
  // dashboard doesn't require yet another secret during local development,
  // but a dedicated ADMIN_SESSION_SECRET is recommended in production.
  return config.adminSessionSecret || config.apiSecret;
}

function sign(payload) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Whether the admin dashboard is enabled at all (requires ADMIN_PASSWORD). */
export function isAdminEnabled() {
  return Boolean(config.adminPassword);
}

export function checkAdminPassword(password) {
  if (!isAdminEnabled()) return false;
  return typeof password === "string" && safeEqual(password, config.adminPassword);
}

/** Creates a signed, expiring cookie value proving a successful admin login. */
export function createAdminSessionToken() {
  const expires = Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS;
  const payload = `admin:${expires}`;
  return `${payload}:${sign(payload)}`;
}

export function verifyAdminSessionToken(token) {
  if (typeof token !== "string") return false;
  const parts = token.split(":");
  if (parts.length !== 3 || parts[0] !== "admin") return false;
  const [, expiresStr, signature] = parts;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = sign(`admin:${expiresStr}`);
  try {
    return safeEqual(expected, signature);
  } catch {
    return false;
  }
}
