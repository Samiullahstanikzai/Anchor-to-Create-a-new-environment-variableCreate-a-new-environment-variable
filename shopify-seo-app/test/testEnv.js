// Imported first by any test that touches src/config.js, so environment
// variables are in place before config.js reads process.env at import time.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || "test-api-key";
process.env.SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || "test-api-secret";
process.env.HOST = process.env.HOST || "http://localhost:3000";
process.env.SCOPES = process.env.SCOPES || "read_products,write_products,read_content,write_content";

const tmpDir = mkdtempSync(join(tmpdir(), "shopify-seo-app-test-"));
process.env.SESSION_DB_PATH = join(tmpDir, "sessions.json");

export const TEST_API_KEY = process.env.SHOPIFY_API_KEY;
export const TEST_API_SECRET = process.env.SHOPIFY_API_SECRET;
