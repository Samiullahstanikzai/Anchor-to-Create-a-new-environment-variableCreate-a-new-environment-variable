import { createServer } from "node:http";
import { config, assertConfigured } from "./config.js";
import { isAdminEnabled } from "./lib/adminAuth.js";
import { Router } from "./lib/router.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerApiRoutes } from "./routes/api.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerStaticRoutes } from "./routes/static.js";

export function createApp() {
  const router = new Router();

  // Registration order matters: more specific routers first. In
  // particular, `/api/admin/*` must be registered before the generic
  // `/api/:type` and `/api/:type/:id` routes in registerApiRoutes, since
  // those wildcard patterns have the same segment count and would
  // otherwise shadow the admin API. The static file catch-all (`/:file`)
  // goes last so it never shadows a real route.
  registerAuthRoutes(router);
  registerWebhookRoutes(router);
  registerAdminRoutes(router);
  registerApiRoutes(router);
  registerStaticRoutes(router);

  return router;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function createHttpServer(router = createApp()) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
      const match = router.match(req.method, url.pathname);

      if (!match) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      let rawBody = "";
      let body = undefined;
      if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
        rawBody = await readRawBody(req);
        const contentType = req.headers["content-type"] || "";
        if (rawBody && contentType.includes("application/json")) {
          try {
            body = JSON.parse(rawBody);
          } catch {
            body = undefined;
          }
        }
      }

      await match.handler(req, res, { url, headers: req.headers, params: match.params, rawBody, body });
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
      console.error("Unhandled request error:", err);
    }
  });
}

function main() {
  const missing = assertConfigured();
  if (missing.length) {
    console.warn(
      `Warning: missing required environment variable(s): ${missing.join(", ")}. ` +
        "The app will start, but OAuth and Admin API calls will fail until these are set. " +
        "Copy .env.example to .env and fill them in from your Shopify Partner Dashboard."
    );
  }

  const server = createHttpServer();
  server.listen(config.port, () => {
    console.log(`Shopify SEO app listening on http://localhost:${config.port}`);
    console.log(`Configured public HOST: ${config.host}`);
    console.log(
      isAdminEnabled()
        ? `Admin dashboard: http://localhost:${config.port}/admin`
        : "Admin dashboard is disabled — set ADMIN_PASSWORD to enable it."
    );
  });
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main();
}
