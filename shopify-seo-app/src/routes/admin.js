import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config, assertConfigured } from "../config.js";
import { parseCookies, serializeCookie } from "../lib/cookies.js";
import { isAdminEnabled, checkAdminPassword, createAdminSessionToken, verifyAdminSessionToken } from "../lib/adminAuth.js";
import { sessionStore } from "../lib/sessionStore.js";

const ADMIN_COOKIE = "seo_app_admin_session";
const publicDir = join(config.rootDir, "public");

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function isAuthenticated(headers) {
  const cookies = parseCookies(headers.cookie);
  return verifyAdminSessionToken(cookies.get(ADMIN_COOKIE));
}

function requireDisabledNotice(res) {
  res.writeHead(503, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:640px;margin:60px auto;line-height:1.5">
      <h1>Admin dashboard is disabled</h1>
      <p>Set <code>ADMIN_PASSWORD</code> in your environment (see <code>.env.example</code>) and restart the app to enable it.</p>
    </body></html>`
  );
}

export function registerAdminRoutes(router) {
  router.get("/admin/login", async (req, res) => {
    if (!isAdminEnabled()) return requireDisabledNotice(res);
    const html = await readFile(join(publicDir, "admin-login.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  router.post("/admin/login", async (req, res, { body }) => {
    if (!isAdminEnabled()) return sendJson(res, 503, { error: "Admin dashboard is disabled. Set ADMIN_PASSWORD." });
    if (!checkAdminPassword(body?.password)) {
      return sendJson(res, 401, { error: "Incorrect password" });
    }
    const token = createAdminSessionToken();
    res.setHeader("Set-Cookie", serializeCookie(ADMIN_COOKIE, token, { maxAgeSeconds: 60 * 60 * 12 }));
    sendJson(res, 200, { ok: true });
  });

  router.get("/admin/logout", async (req, res) => {
    res.setHeader("Set-Cookie", serializeCookie(ADMIN_COOKIE, "", { maxAgeSeconds: 0 }));
    res.writeHead(302, { Location: "/admin/login" });
    res.end();
  });

  router.get("/admin", async (req, res) => {
    if (!isAdminEnabled()) return requireDisabledNotice(res);
    if (!isAuthenticated(req.headers)) {
      res.writeHead(302, { Location: "/admin/login" });
      res.end();
      return;
    }
    const html = await readFile(join(publicDir, "admin.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  router.get("/api/admin/status", async (req, res) => {
    if (!isAdminEnabled() || !isAuthenticated(req.headers)) return sendJson(res, 401, { error: "Not authenticated" });
    const missing = assertConfigured();
    const shops = await sessionStore.listSessions();
    sendJson(res, 200, {
      configured: missing.length === 0,
      missingEnv: missing,
      host: config.host,
      scopes: config.scopes.split(","),
      apiVersion: config.apiVersion,
      installedShopCount: shops.length,
    });
  });

  router.get("/api/admin/shops", async (req, res) => {
    if (!isAdminEnabled() || !isAuthenticated(req.headers)) return sendJson(res, 401, { error: "Not authenticated" });
    const shops = await sessionStore.listSessions();
    sendJson(
      res,
      200,
      shops.map((s) => ({
        shop: s.shop,
        scope: s.scope,
        installedAt: s.installedAt,
        updatedAt: s.updatedAt,
        hasAccessToken: Boolean(s.accessToken),
      }))
    );
  });

  router.post("/api/admin/shops/:shop/revoke", async (req, res, { params }) => {
    if (!isAdminEnabled() || !isAuthenticated(req.headers)) return sendJson(res, 401, { error: "Not authenticated" });
    await sessionStore.deleteSession(params.shop);
    sendJson(res, 200, { ok: true });
  });
}
