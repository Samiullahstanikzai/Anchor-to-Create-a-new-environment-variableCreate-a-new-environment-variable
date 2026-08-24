import { config } from "../config.js";
import { generateNonce, isValidShopDomain, verifyOAuthHmac } from "./crypto.js";
import { sessionStore } from "./sessionStore.js";

/** Builds the URL that starts the OAuth install flow for a shop. */
export function buildAuthorizationUrl(shop, nonce) {
  const params = new URLSearchParams({
    client_id: config.apiKey,
    scope: config.scopes,
    redirect_uri: `${config.host}/auth/callback`,
    state: nonce,
  });
  return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
}

/** Validates the callback request Shopify redirects to after merchant approval. */
export function verifyCallbackRequest(url, cookies) {
  const shop = url.searchParams.get("shop");
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!isValidShopDomain(shop)) {
    return { ok: false, error: "Invalid shop domain" };
  }
  if (!code) {
    return { ok: false, error: "Missing authorization code" };
  }
  if (!state || state !== cookies.get("shopify_oauth_state")) {
    return { ok: false, error: "Invalid OAuth state (possible CSRF)" };
  }
  if (!verifyOAuthHmac(url.searchParams, config.apiSecret)) {
    return { ok: false, error: "Invalid HMAC signature" };
  }
  return { ok: true, shop, code };
}

/** Exchanges the temporary authorization code for a permanent Admin API access token. */
export async function exchangeCodeForToken(shop, code) {
  const response = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.apiKey,
      client_secret: config.apiSecret,
      code,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Token exchange failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return { accessToken: data.access_token, scope: data.scope };
}

/** Full server-side flow: exchange code, persist session, return the stored record. */
export async function completeInstall(shop, code) {
  const { accessToken, scope } = await exchangeCodeForToken(shop, code);
  return sessionStore.storeSession(shop, { accessToken, scope, installedAt: new Date().toISOString() });
}

export function createStateNonce() {
  return generateNonce();
}
