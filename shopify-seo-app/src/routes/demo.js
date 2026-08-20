import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "../config.js";
import { assertValidResourceType } from "../lib/resourceService.js";
import {
  listDemoResources,
  getDemoResource,
  updateDemoSeo,
  updateDemoHandle,
  fixDemoProductAlt,
  getDemoDashboardSummary,
  checkDemoResourceLinks,
  getDemoSitemapCheck,
  resetDemoStore,
} from "../lib/demoData.js";

const publicDir = join(config.rootDir, "public");

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

/**
 * Demo Mode: a no-login, no-Shopify-account way to see the real dashboard
 * working against realistic sample data. These routes are intentionally
 * unauthenticated — there is no real store data behind them, only the
 * in-memory sample dataset in `src/lib/demoData.js` — so anyone can open
 * `/demo` and click around immediately. Registered before the generic
 * `/api/:type` routes in server.js so `/api/demo/*` isn't shadowed by them
 * (same path-segment-shadowing hazard documented in routes/admin.js).
 */
export function registerDemoRoutes(router) {
  router.get("/demo", async (req, res) => {
    const html = await readFile(join(publicDir, "demo.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  router.post("/api/demo/reset", (req, res) => {
    resetDemoStore();
    sendJson(res, 200, { ok: true });
  });

  router.get("/api/demo/dashboard", (req, res) => {
    sendJson(res, 200, { summary: getDemoDashboardSummary() });
  });

  router.get("/api/demo/sitemap-check", (req, res) => {
    sendJson(res, 200, getDemoSitemapCheck());
  });

  router.get("/api/demo/:type", (req, res, { params }) => {
    try {
      assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    sendJson(res, 200, listDemoResources(params.type));
  });

  router.get("/api/demo/:type/:id", (req, res, { params }) => {
    try {
      assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const item = getDemoResource(params.type, params.id);
    if (!item) return sendJson(res, 404, { error: "Not found" });
    sendJson(res, 200, item);
  });

  router.put("/api/demo/:type/:id/seo", (req, res, { params, body }) => {
    try {
      assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const item = updateDemoSeo(params.type, params.id, { title: body?.title, description: body?.description });
    if (!item) return sendJson(res, 404, { error: "Not found" });
    sendJson(res, 200, { ok: true });
  });

  router.put("/api/demo/:type/:id/handle", (req, res, { params, body }) => {
    if (!body?.handle) return sendJson(res, 400, { error: "Missing `handle` in request body" });
    try {
      assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const item = updateDemoHandle(params.type, params.id, body.handle);
    if (!item) return sendJson(res, 404, { error: "Not found" });
    sendJson(res, 200, { ok: true });
  });

  router.get("/api/demo/:type/:id/links", async (req, res, { params }) => {
    try {
      assertValidResourceType(params.type);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const result = await checkDemoResourceLinks(params.type, params.id);
    if (!result) return sendJson(res, 404, { error: "Not found" });
    sendJson(res, 200, result);
  });

  router.post("/api/demo/product/:id/images/fix-alt", (req, res, { params }) => {
    const result = fixDemoProductAlt(params.id);
    if (!result) return sendJson(res, 404, { error: "Not found" });
    sendJson(res, 200, { ok: true, updated: result.updated });
  });
}
