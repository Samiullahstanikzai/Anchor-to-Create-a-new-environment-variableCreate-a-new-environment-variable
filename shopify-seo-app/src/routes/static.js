import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { existsSync } from "node:fs";
import { config } from "../config.js";

const publicDir = join(config.rootDir, "public");

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

async function serveFile(res, path) {
  const ext = extname(path);
  const body = await readFile(path);
  res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream" });
  res.end(body);
}

export function registerStaticRoutes(router) {
  router.get("/", async (req, res) => {
    let html = await readFile(join(publicDir, "index.html"), "utf8");
    html = html.replace(/__SHOPIFY_API_KEY__/g, config.apiKey);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });

  router.get("/healthz", (req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });

  // Catch-all for /app.js, /styles.css, etc. Registered last so it never
  // shadows a more specific API/auth route.
  router.get("/:file", async (req, res, { params }) => {
    const target = join(publicDir, params.file);
    if (!target.startsWith(publicDir) || !existsSync(target)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    await serveFile(res, target);
  });
}
