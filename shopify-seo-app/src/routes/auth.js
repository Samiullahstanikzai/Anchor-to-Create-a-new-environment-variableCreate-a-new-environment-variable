import { config } from "../config.js";
import { isValidShopDomain } from "../lib/crypto.js";
import { buildAuthorizationUrl, completeInstall, createStateNonce, verifyCallbackRequest } from "../lib/shopifyAuth.js";
import { parseCookies, serializeCookie } from "../lib/cookies.js";

const STATE_COOKIE = "shopify_oauth_state";

export function registerAuthRoutes(router) {
  router.get("/auth", (req, res, { url }) => {
    const shop = url.searchParams.get("shop");
    if (!isValidShopDomain(shop)) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Missing or invalid `shop` parameter. Expected e.g. ?shop=my-store.myshopify.com");
      return;
    }

    const nonce = createStateNonce();
    res.setHeader("Set-Cookie", serializeCookie(STATE_COOKIE, nonce, { maxAgeSeconds: 300, secure: true }));
    res.writeHead(302, { Location: buildAuthorizationUrl(shop, nonce) });
    res.end();
  });

  router.get("/auth/callback", async (req, res, { url, headers }) => {
    const cookies = parseCookies(headers.cookie);
    const result = verifyCallbackRequest(url, cookies);

    if (!result.ok) {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end(`OAuth verification failed: ${result.error}`);
      return;
    }

    try {
      await completeInstall(result.shop, result.code);
    } catch (err) {
      res.writeHead(502, { "Content-Type": "text/plain" });
      res.end(`Failed to complete installation: ${err.message}`);
      return;
    }

    res.setHeader("Set-Cookie", serializeCookie(STATE_COOKIE, "", { maxAgeSeconds: 0 }));
    res.writeHead(302, { Location: `https://${result.shop}/admin/apps/${config.apiKey}` });
    res.end();
  });
}
