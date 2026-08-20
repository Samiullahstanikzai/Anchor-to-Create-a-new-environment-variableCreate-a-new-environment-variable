import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

/**
 * Minimal .env loader (no dependency on `dotenv`). Existing `process.env`
 * values always win, so real environment/secret configuration (e.g. the
 * secrets injected by a hosting platform) takes precedence over the file.
 */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const contents = readFileSync(path, "utf8");
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(join(rootDir, ".env"));

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  return value;
}

export const config = {
  rootDir,
  apiKey: required("SHOPIFY_API_KEY", ""),
  apiSecret: required("SHOPIFY_API_SECRET", ""),
  scopes: required("SCOPES", "read_products,write_products,read_content,write_content"),
  host: (required("HOST", "http://localhost:3000") || "").replace(/\/+$/, ""),
  port: Number(required("PORT", "3000")),
  apiVersion: required("SHOPIFY_API_VERSION", "2024-10"),
  sessionDbPath: required("SESSION_DB_PATH", join(rootDir, "data", "sessions.json")),
  storeDisplayName: required("STORE_DISPLAY_NAME", ""),
  adminPassword: required("ADMIN_PASSWORD", ""),
  adminSessionSecret: required("ADMIN_SESSION_SECRET", "") || undefined,
};

export function assertConfigured() {
  const missing = [];
  if (!config.apiKey) missing.push("SHOPIFY_API_KEY");
  if (!config.apiSecret) missing.push("SHOPIFY_API_SECRET");
  return missing;
}
