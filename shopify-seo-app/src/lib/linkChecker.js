/**
 * Finds `<a href>` links inside a resource's body HTML and checks whether
 * each one actually resolves — the "broken link checker" a merchant would
 * otherwise have to click through every product/page/article to do by
 * hand. Pure link-extraction is unit tested without a network call; the
 * actual HTTP checks require real internet access from wherever this app
 * is hosted (see README).
 */
import { isIP } from "node:net";

const SKIPPED_SCHEMES = /^(mailto:|tel:|javascript:|#)/i;
const MAX_LINKS_PER_CHECK = 25;
const REQUEST_TIMEOUT_MS = 8000;
const BLOCKED_HOSTNAMES = new Set(["localhost"]);

function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // shared address space (CGNAT)
  return false;
}

function isPrivateIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // unique local fc00::/7
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Blocks loopback, private, link-local, and cloud-metadata addresses so the
 * link checker can't be abused to make the app server probe its own
 * internal network (SSRF) — including on the unauthenticated demo route.
 */
function isBlockedHost(hostname) {
  const host = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  const family = isIP(host);
  if (family === 4) return isPrivateIPv4(host);
  if (family === 6) return isPrivateIPv6(host);
  return false;
}

/** Extracts unique, checkable absolute URLs from a block of HTML. */
export function extractLinks(html, baseUrl) {
  if (!html) return [];
  const found = new Set();
  const regex = /<a\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const raw = match[1].trim();
    if (!raw || SKIPPED_SCHEMES.test(raw)) continue;
    try {
      const resolved = new URL(raw, baseUrl).toString();
      found.add(resolved);
    } catch {
      // Not a parseable URL even with a base — skip it rather than crash.
    }
  }
  return [...found].slice(0, MAX_LINKS_PER_CHECK);
}

async function checkOne(url) {
  const { hostname } = new URL(url);
  if (isBlockedHost(hostname)) {
    return { url, ok: false, status: null, broken: true, error: "Blocked: refuses to check internal/private network addresses" };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    // Some servers don't support HEAD (405/501) — retry with GET before
    // concluding anything about the link itself.
    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal });
    }
    return {
      url,
      ok: response.ok,
      status: response.status,
      broken: !response.ok,
    };
  } catch (err) {
    return { url, ok: false, status: null, broken: true, error: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts and checks every link in `html`. Runs checks concurrently
 * (bounded by `extractLinks`'s cap) since each is an independent, slow
 * network round trip.
 */
export async function checkBrokenLinks(html, baseUrl) {
  const links = extractLinks(html, baseUrl);
  const results = await Promise.all(links.map(checkOne));
  return {
    checked: results.length,
    broken: results.filter((r) => r.broken).length,
    results,
  };
}
