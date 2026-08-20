import { config } from "../config.js";
import { verifyWebhookHmac } from "../lib/crypto.js";
import { sessionStore } from "../lib/sessionStore.js";

function verifyOrReject(req, res, rawBody) {
  const hmac = req.headers["x-shopify-hmac-sha256"];
  if (!verifyWebhookHmac(rawBody, hmac, config.apiSecret)) {
    res.writeHead(401, { "Content-Type": "text/plain" });
    res.end("Invalid webhook signature");
    return false;
  }
  return true;
}

export function registerWebhookRoutes(router) {
  // Fired when a merchant uninstalls the app — clean up their access token.
  router.post("/webhooks/app/uninstalled", async (req, res, { rawBody }) => {
    if (!verifyOrReject(req, res, rawBody)) return;
    const shop = req.headers["x-shopify-shop-domain"];
    if (shop) await sessionStore.deleteSession(shop);
    res.writeHead(200);
    res.end();
  });

  // Fired if the merchant approves a change in the app's granted scopes.
  router.post("/webhooks/app/scopes_update", async (req, res, { rawBody }) => {
    if (!verifyOrReject(req, res, rawBody)) return;
    const shop = req.headers["x-shopify-shop-domain"];
    try {
      const payload = JSON.parse(rawBody);
      if (shop) await sessionStore.storeSession(shop, { scope: payload.current?.join(",") });
    } catch {
      // Ignore malformed payloads; the webhook still gets acknowledged.
    }
    res.writeHead(200);
    res.end();
  });

  // Mandatory GDPR compliance webhooks required by the Shopify App Store.
  // This app never stores customer PII (only shop-level access tokens), so
  // these are acknowledgements rather than real data operations.
  for (const topic of ["customers/data_request", "customers/redact"]) {
    router.post(`/webhooks/${topic}`, async (req, res, { rawBody }) => {
      if (!verifyOrReject(req, res, rawBody)) return;
      res.writeHead(200);
      res.end();
    });
  }

  router.post("/webhooks/shop/redact", async (req, res, { rawBody }) => {
    if (!verifyOrReject(req, res, rawBody)) return;
    try {
      const payload = JSON.parse(rawBody);
      if (payload.shop_domain) await sessionStore.deleteSession(payload.shop_domain);
    } catch {
      // Ignore malformed payloads; the webhook still gets acknowledged.
    }
    res.writeHead(200);
    res.end();
  });
}
