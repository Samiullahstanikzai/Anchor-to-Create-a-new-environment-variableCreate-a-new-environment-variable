import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** Generates a URL-safe random nonce used as OAuth `state`. */
export function generateNonce(bytes = 16) {
  return randomBytes(bytes).toString("hex");
}

function safeCompare(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the `hmac` query parameter Shopify appends to OAuth redirects
 * (both the initial `/auth/callback` and any authenticated proxy request).
 * https://shopify.dev/docs/apps/build/authentication-authorization/get-access-tokens/authorization-code-grant#step-5-verify-the-installation-request
 */
export function verifyOAuthHmac(searchParams, apiSecret) {
  const params = new URLSearchParams(searchParams);
  const receivedHmac = params.get("hmac");
  if (!receivedHmac) return false;
  params.delete("hmac");
  params.delete("signature");

  const message = [...params.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  const digest = createHmac("sha256", apiSecret).update(message).digest("hex");
  try {
    return safeCompare(digest, receivedHmac);
  } catch {
    return false;
  }
}

/**
 * Verifies the `X-Shopify-Hmac-Sha256` header sent with every webhook
 * delivery, computed over the *raw* request body.
 * https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-3-validate-the-webhook
 */
export function verifyWebhookHmac(rawBody, hmacHeader, apiSecret) {
  if (!hmacHeader) return false;
  const digest = createHmac("sha256", apiSecret).update(rawBody, "utf8").digest("base64");
  try {
    return safeCompare(digest, hmacHeader);
  } catch {
    return false;
  }
}

/** Validates that a `shop` query param looks like a real *.myshopify.com domain. */
export function isValidShopDomain(shop) {
  return typeof shop === "string" && /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
}

function base64UrlDecode(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

/**
 * Verifies and decodes the App Bridge session token (a JWT) sent by the
 * embedded frontend as `Authorization: Bearer <token>` on every API call.
 * https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens/get-session-tokens
 */
export function verifySessionToken(token, { apiKey, apiSecret }) {
  if (typeof token !== "string" || token.split(".").length !== 3) {
    throw new Error("Malformed session token");
  }
  const [headerB64, payloadB64, signatureB64] = token.split(".");

  const expectedSig = createHmac("sha256", apiSecret)
    .update(`${headerB64}.${payloadB64}`)
    .digest();
  const actualSig = base64UrlDecode(signatureB64);
  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    throw new Error("Session token signature verification failed");
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8"));

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && payload.exp < nowSeconds) {
    throw new Error("Session token is expired");
  }
  if (typeof payload.nbf === "number" && payload.nbf > nowSeconds) {
    throw new Error("Session token is not yet valid");
  }
  if (payload.aud !== apiKey) {
    throw new Error("Session token audience does not match app API key");
  }

  const dest = String(payload.dest || payload.iss || "");
  const shopMatch = dest.match(/https?:\/\/([a-zA-Z0-9-]+\.myshopify\.com)/);
  if (!shopMatch) {
    throw new Error("Session token is missing a valid shop destination");
  }

  return { shop: shopMatch[1], payload };
}
