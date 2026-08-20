/**
 * Fetches and sanity-checks a storefront's public `robots.txt` and
 * `sitemap.xml`. This talks to the shop's live public domain (not the
 * Admin API), so it requires outbound internet access from wherever this
 * app is hosted.
 */
export async function checkSitemap(storeUrl) {
  const base = storeUrl.replace(/\/+$/, "");
  const [robots, sitemap] = await Promise.all([
    fetchText(`${base}/robots.txt`),
    fetchText(`${base}/sitemap.xml`),
  ]);

  const checks = [];

  checks.push(
    robots.ok
      ? pass("robots_txt", "robots.txt is reachable.")
      : fail("robots_txt", `robots.txt returned ${robots.status ?? "an error"}.`)
  );

  const sitemapReferenced = robots.ok && /sitemap\s*:\s*\S+sitemap\.xml/i.test(robots.body || "");
  checks.push(
    sitemapReferenced
      ? pass("robots_references_sitemap", "robots.txt references the sitemap.")
      : fail("robots_references_sitemap", "robots.txt does not reference sitemap.xml.")
  );

  checks.push(
    sitemap.ok
      ? pass("sitemap_xml", "sitemap.xml is reachable.")
      : fail("sitemap_xml", `sitemap.xml returned ${sitemap.status ?? "an error"}.`)
  );

  let sitemapEntryCount = 0;
  if (sitemap.ok && sitemap.body) {
    sitemapEntryCount = (sitemap.body.match(/<loc>/gi) || []).length;
    checks.push(
      sitemapEntryCount > 0
        ? pass("sitemap_has_entries", `sitemap.xml (or its index) references ${sitemapEntryCount} URL(s)/sub-sitemap(s).`)
        : fail("sitemap_has_entries", "sitemap.xml has no <loc> entries.")
    );
  }

  return {
    storeUrl: base,
    checks,
    passed: checks.filter((c) => c.status === "good").length,
    total: checks.length,
  };
}

function pass(id, message) {
  return { id, status: "good", message };
}

function fail(id, message) {
  return { id, status: "critical", message };
}

async function fetchText(url) {
  try {
    const response = await fetch(url, { redirect: "follow" });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    return { ok: false, status: null, error: err.message };
  }
}
