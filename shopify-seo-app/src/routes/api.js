import { config } from "../config.js";
import { verifySessionToken } from "../lib/crypto.js";
import { sessionStore } from "../lib/sessionStore.js";
import { shopifyGraphql } from "../lib/shopifyGraphql.js";
import { SHOP_QUERY } from "../queries/shared.js";
import {
  RESOURCE_TYPES,
  assertValidResourceType,
  updateResourceSeo,
  updateResourceHandle,
  updateProductImageAlt,
  suggestSeoTitle,
  suggestSeoDescription,
} from "../lib/resourceService.js";
import { checkSitemap } from "../lib/sitemapCheck.js";
import { checkBrokenLinks } from "../lib/linkChecker.js";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

/**
 * Authenticates an API request using the App Bridge session token and
 * returns `{ shop, accessToken }`, or `null` if the request should be
 * rejected (the caller is responsible for responding).
 */
async function authenticate(req, res) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    sendJson(res, 401, { error: "Missing session token" });
    return null;
  }

  let shop;
  try {
    ({ shop } = verifySessionToken(token, { apiKey: config.apiKey, apiSecret: config.apiSecret }));
  } catch (err) {
    sendJson(res, 401, { error: `Invalid session token: ${err.message}` });
    return null;
  }

  const session = await sessionStore.loadSession(shop);
  if (!session?.accessToken) {
    sendJson(res, 401, { error: "App is not installed for this shop", reauthUrl: `/auth?shop=${shop}` });
    return null;
  }

  return { shop, accessToken: session.accessToken };
}

async function readShopName(shop, accessToken) {
  if (config.storeDisplayName) return config.storeDisplayName;
  try {
    const data = await shopifyGraphql(shop, accessToken, SHOP_QUERY);
    return data.shop?.name ?? shop;
  } catch {
    return shop;
  }
}

export function registerApiRoutes(router) {
  router.get("/api/session", async (req, res) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    sendJson(res, 200, { shop: auth.shop });
  });

  router.get("/api/dashboard", async (req, res) => {
    const auth = await authenticate(req, res);
    if (!auth) return;

    const summary = {};
    const errors = {};
    for (const [type, resource] of Object.entries(RESOURCE_TYPES)) {
      try {
        const { items } = await resource.list(auth.shop, auth.accessToken, { first: 50 });
        const scores = items.map((i) => i.seo.score);
        summary[type] = {
          label: resource.label,
          count: items.length,
          averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
          issues: items.reduce((sum, i) => sum + i.seo.issueCount, 0),
          worst: [...items].sort((a, b) => a.seo.score - b.seo.score).slice(0, 5).map((i) => ({
            id: i.id,
            title: i.title,
            score: i.seo.score,
          })),
        };
      } catch (err) {
        errors[type] = err.message;
        summary[type] = { label: resource.label, count: 0, averageScore: null, issues: 0, worst: [] };
      }
    }

    sendJson(res, 200, { summary, errors: Object.keys(errors).length ? errors : undefined });
  });

  router.get("/api/sitemap-check", async (req, res) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    try {
      const data = await shopifyGraphql(auth.shop, auth.accessToken, SHOP_QUERY);
      const domain = data.shop?.primaryDomain?.url || `https://${auth.shop}`;
      const result = await checkSitemap(domain);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 502, { error: err.message });
    }
  });

  router.get("/api/:type", async (req, res, { url, params }) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    let resource;
    try {
      resource = assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    const first = Math.min(Number(url.searchParams.get("first")) || 25, 100);
    const after = url.searchParams.get("after") || null;
    const shopName = await readShopName(auth.shop, auth.accessToken);

    try {
      const { items, pageInfo } = await resource.list(auth.shop, auth.accessToken, { first, after });
      sendJson(res, 200, {
        items: items.map((item) => ({
          ...item,
          suggestions: {
            title: suggestSeoTitle(item.title, shopName),
            description: suggestSeoDescription(item.bodyHtml, item.title),
          },
        })),
        pageInfo,
      });
    } catch (err) {
      sendJson(res, 502, { error: err.message });
    }
  });

  router.get("/api/:type/:id", async (req, res, { params }) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    let resource;
    try {
      resource = assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    try {
      const item = await resource.get(auth.shop, auth.accessToken, decodeGid(params.id));
      if (!item) return sendJson(res, 404, { error: "Not found" });
      const shopName = await readShopName(auth.shop, auth.accessToken);
      sendJson(res, 200, {
        ...item,
        suggestions: {
          title: suggestSeoTitle(item.title, shopName),
          description: suggestSeoDescription(item.bodyHtml, item.title),
        },
      });
    } catch (err) {
      sendJson(res, 502, { error: err.message });
    }
  });

  router.put("/api/:type/:id/seo", async (req, res, { params, body }) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    try {
      assertValidResourceType(params.type);
      const result = await updateResourceSeo(auth.shop, auth.accessToken, params.type, decodeGid(params.id), {
        title: body?.title,
        description: body?.description,
      });
      sendJson(res, 200, { ok: true, result });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  router.put("/api/:type/:id/handle", async (req, res, { params, body }) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    if (!body?.handle) return sendJson(res, 400, { error: "Missing `handle` in request body" });
    try {
      assertValidResourceType(params.type);
      const result = await updateResourceHandle(auth.shop, auth.accessToken, params.type, decodeGid(params.id), body.handle);
      sendJson(res, 200, { ok: true, result });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });

  // Scans a resource's body copy for links and checks whether each one
  // actually resolves. Run on-demand (not as part of list/dashboard
  // scoring) since each link is a real, slow network round trip.
  router.get("/api/:type/:id/links", async (req, res, { params }) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    let resource;
    try {
      resource = assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }

    try {
      const item = await resource.get(auth.shop, auth.accessToken, decodeGid(params.id));
      if (!item) return sendJson(res, 404, { error: "Not found" });

      const shopData = await shopifyGraphql(auth.shop, auth.accessToken, SHOP_QUERY);
      const baseUrl = shopData.shop?.primaryDomain?.url || `https://${auth.shop}`;

      const result = await checkBrokenLinks(item.bodyHtml, baseUrl);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 502, { error: err.message });
    }
  });

  // Bulk-fills missing alt text on a product's images using an
  // auto-generated suggestion (`<product title> — image <n>`), so a
  // merchant can fix every product with one click from the dashboard.
  router.post("/api/product/:id/images/fix-alt", async (req, res, { params }) => {
    const auth = await authenticate(req, res);
    if (!auth) return;
    const productGid = decodeGid(params.id);
    try {
      const product = await RESOURCE_TYPES.product.get(auth.shop, auth.accessToken, productGid);
      if (!product) return sendJson(res, 404, { error: "Product not found" });

      const missing = product.images
        .map((img, i) => ({ img, position: i + 1 }))
        .filter(({ img }) => !img.alt || !img.alt.trim());
      if (missing.length === 0) return sendJson(res, 200, { ok: true, updated: 0 });

      const media = missing.map(({ img, position }) => ({ id: img.id, alt: `${product.title} — image ${position}` }));
      const result = await updateProductImageAlt(auth.shop, auth.accessToken, productGid, media);
      sendJson(res, 200, { ok: true, updated: media.length, result });
    } catch (err) {
      sendJson(res, 400, { error: err.message });
    }
  });
}

// GraphQL resource ids look like `gid://shopify/Product/123`. The router
// already runs `decodeURIComponent` on each path segment, so as long as the
// frontend sends `encodeURIComponent(id)` in the URL, `params.id` arrives
// here as the full, correct GID — no extra decoding needed. This helper
// exists purely as a single, obvious place to document that contract.
function decodeGid(id) {
  return id;
}
