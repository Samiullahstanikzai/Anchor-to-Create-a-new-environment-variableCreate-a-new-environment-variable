/**
 * Finds `<a href>` links inside a resource's body HTML and checks whether
 * each one actually resolves — the "broken link checker" a merchant would
 * otherwise have to click through every product/page/article to do by
 * hand. Pure link-extraction is unit tested without a network call; the
 * actual HTTP checks require real internet access from wherever this app
 * is hosted (see README).
 */

const SKIPPED_SCHEMES = /^(mailto:|tel:|javascript:|#)/i;
const MAX_LINKS_PER_CHECK = 25;
const REQUEST_TIMEOUT_MS = 8000;

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
