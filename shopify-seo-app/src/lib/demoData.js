/**
 * A realistic, self-contained sample dataset for "Demo Mode" — a
 * no-login, no-Shopify-account way to see exactly what the real dashboard
 * looks like with real data flowing through the real scoring engine.
 *
 * Nothing here talks to Shopify. Every item below is deliberately written
 * with a specific, real SEO problem (or none at all) so the dashboard
 * shows a realistic spread of scores instead of one uniform state. Edits
 * made while in demo mode are kept in memory for the life of the server
 * process (see `getStore`) so "Save" actually does something you can see,
 * but reset on restart — there's no real backing store to persist to.
 */
import { scoreResource, suggestSeoTitle, suggestSeoDescription } from "./seoScorer.js";
import { checkBrokenLinks } from "./linkChecker.js";

export const DEMO_SHOP_NAME = "Northwind Outfitters";
export const DEMO_SHOP_DOMAIN = "https://northwind-outfitters-demo.myshopify.com";

function gid(type, id) {
  return `gid://shopify/${type}/${id}`;
}

function seedProducts() {
  return [
    {
      id: gid("Product", 1),
      title: "Heritage Waxed Canvas Jacket",
      handle: "heritage-waxed-canvas-jacket",
      status: "ACTIVE",
      bodyHtml:
        "<p>A rugged, weatherproof jacket built from 12oz waxed canvas with a soft flannel lining. Made to last for decades, not seasons.</p>",
      seoTitle: "Heritage Waxed Canvas Jacket | Weatherproof & Built to Last",
      seoDescription:
        "Shop the Heritage Waxed Canvas Jacket — rugged 12oz waxed canvas, flannel lining, and a lifetime of wear. Free shipping over $75.",
      images: [
        { id: gid("MediaImage", 101), alt: "Front view of the waxed canvas jacket" },
        { id: gid("MediaImage", 102), alt: "Back view showing the flannel lining" },
      ],
    },
    {
      id: gid("Product", 2),
      title: "Trailblazer Wool Beanie",
      handle: "trailblazer-wool-beanie",
      status: "ACTIVE",
      bodyHtml:
        "<p>A classic ribbed beanie knit from 100% merino wool, warm enough for freezing trailheads but breathable enough for the hike up. One size fits most.</p>",
      seoTitle: "Trailblazer Wool Beanie",
      seoDescription: "", // Missing meta description — flagged as critical.
      images: [{ id: gid("MediaImage", 103), alt: "Grey merino wool beanie" }],
    },
    {
      id: gid("Product", 3),
      title: "Organic Cotton Crew Socks (3-Pack)",
      handle: "organic-cotton-crew-socks-3-pack",
      status: "ACTIVE",
      bodyHtml: "<p>Breathable organic cotton crew socks, reinforced heel and toe. Sold in packs of three.</p>",
      seoTitle: "", // Missing SEO title entirely — falls back to resource title.
      seoDescription: "", // And missing description too.
      images: [
        { id: gid("MediaImage", 104), alt: "" },
        { id: gid("MediaImage", 105), alt: "" },
      ],
    },
    {
      id: gid("Product", 4),
      title: "Summit Insulated Vest",
      handle: "summit-insulated-vest",
      status: "DRAFT", // Not published — visibility check should fail hard.
      bodyHtml: "<p>A packable, synthetic-insulated vest for cold mornings on the trail. Launching next month.</p>",
      seoTitle: "Summit Insulated Vest | Packable Warmth for Cold Mornings",
      seoDescription:
        "The Summit Insulated Vest packs down to fit in a jacket pocket, with synthetic fill that stays warm even when wet.",
      images: [{ id: gid("MediaImage", 106), alt: "Navy insulated vest, packed into its own pocket" }],
    },
    {
      id: gid("Product", 5),
      title: "River Guide Fishing Hat",
      handle: "River_Guide_Fishing_Hat", // Bad handle formatting — uppercase + underscores.
      status: "ACTIVE",
      bodyHtml:
        "<p>A quick-dry fishing hat with a wide brim, adjustable chin strap, and mesh side panels that keep you cool on long days guiding the river.</p>",
      seoTitle: "River Guide Fishing Hat | Quick-Dry, Wide Brim, UPF 50+",
      seoDescription:
        "The River Guide Fishing Hat is built for long days on the water: quick-dry fabric, wide brim, and UPF 50+ sun protection.",
      images: [{ id: gid("MediaImage", 107), alt: "Khaki fishing hat with chin strap" }],
    },
    {
      id: gid("Product", 6),
      title: "Basecamp Enamel Mug",
      handle: "basecamp-enamel-mug",
      status: "ACTIVE",
      bodyHtml: "<p>A classic 12oz enamel camp mug. Dishwasher safe, campfire proof.</p>",
      seoTitle:
        "Basecamp Enamel Mug | 12oz Classic Camp Mug for Coffee, Tea, and Cocoa Around the Fire on Every Trip",
      seoDescription:
        "The Basecamp Enamel Mug holds 12oz, survives campfires and dishwashers alike, and comes in five colors.",
      images: [{ id: gid("MediaImage", 108), alt: "Blue enamel camp mug on a picnic table" }],
    },
    {
      id: gid("Product", 7),
      title: "Northwind GPS Trail Watch",
      handle: "northwind-gps-trail-watch",
      status: "ACTIVE",
      bodyHtml:
        `<p>Track every mile with 20-day battery life. See the <a href="https://github.com/">companion app</a> or read the
        <a href="https://github.com/northwind-outfitters-demo/product-manual-that-does-not-exist">full manual</a> before your first trip.</p>`,
      seoTitle: "Northwind GPS Trail Watch | 20-Day Battery, Offline Maps",
      seoDescription:
        "The Northwind GPS Trail Watch offers 20-day battery life, offline topo maps, and real-time weather alerts for serious trail time.",
      images: [
        { id: gid("MediaImage", 109), alt: "GPS trail watch on a wrist" },
        { id: gid("MediaImage", 110), alt: "Watch face showing a topo map" },
      ],
    },
    {
      id: gid("Product", 8),
      title: "Alpine Base Layer Top",
      handle: "alpine-base-layer-top",
      status: "ARCHIVED", // Archived — also a visibility failure, different reason text.
      bodyHtml: "<p>Merino-blend base layer, discontinued in favor of the updated Alpine Base Layer Top V2.</p>",
      seoTitle: "Alpine Base Layer Top",
      seoDescription: "This product has been discontinued and replaced by the Alpine Base Layer Top V2.",
      images: [{ id: gid("MediaImage", 111), alt: "Grey merino base layer top" }],
    },
  ].map(addProductVisibility);
}

function addProductVisibility(p) {
  return {
    ...p,
    visibility: {
      visible: p.status === "ACTIVE",
      reason: p.status === "ACTIVE" ? "Active" : `Status is ${p.status}`,
    },
  };
}

function seedCollections() {
  return [
    {
      id: gid("Collection", 1),
      title: "Fall Trail Essentials",
      handle: "fall-trail-essentials",
      bodyHtml: "<p>Everything you need for cooler trail days: layers, hats, and warm drinks.</p>",
      seoTitle: "Fall Trail Essentials | Northwind Outfitters",
      seoDescription:
        "Shop Fall Trail Essentials: waxed canvas jackets, wool beanies, and insulated vests built for cooler trail days.",
    },
    {
      id: gid("Collection", 2),
      title: "Best Sellers",
      handle: "best-sellers",
      bodyHtml: "<p>Our most-loved gear, chosen by thousands of hikers.</p>",
      seoTitle: "Best Sellers",
      seoDescription: "", // Missing description.
    },
    {
      id: gid("Collection", 3),
      title: "New Arrivals",
      handle: "new_arrivals!!", // Bad handle.
      bodyHtml: "<p>Fresh off the truck.</p>",
      seoTitle: "",
      seoDescription: "",
    },
  ];
}

function seedPages() {
  return [
    {
      id: gid("Page", 1),
      title: "About Northwind Outfitters",
      handle: "about",
      bodyHtml:
        "<p>Northwind Outfitters has been outfitting hikers and campers since 2012, from a single storefront in Bend, Oregon.</p>",
      seoTitle: "About Northwind Outfitters | Our Story Since 2012",
      seoDescription:
        "Learn how Northwind Outfitters grew from a single storefront in Bend, Oregon into a trusted name in trail gear.",
      publishedAt: "2024-03-01T00:00:00Z",
    },
    {
      id: gid("Page", 2),
      title: "Shipping & Returns",
      handle: "shipping-returns",
      bodyHtml: "<p>Draft copy — legal is still reviewing the return window language.</p>",
      seoTitle: "Shipping & Returns",
      seoDescription: "Free shipping over $75. Returns accepted within 30 days of delivery.",
      publishedAt: null, // Unpublished — visibility check fails.
    },
    {
      id: gid("Page", 3),
      title: "Frequently Asked Questions",
      handle: "faq",
      bodyHtml: "<p>Answers to the questions we hear most from new customers.</p>",
      seoTitle: "",
      seoDescription: "",
      publishedAt: "2024-05-14T00:00:00Z",
    },
  ].map(addPublishedVisibility);
}

function seedArticles() {
  return [
    {
      id: gid("Article", 1),
      title: "5 Layering Mistakes First-Time Hikers Make",
      handle: "5-layering-mistakes-first-time-hikers-make",
      bodyHtml:
        "<p>Cotton kills. Here's what experienced hikers wear instead when the weather turns, from base layer fabric to when to add a wind shell.</p>",
      seoTitle: "5 Layering Mistakes First-Time Hikers Make | Northwind Blog",
      seoDescription:
        "Avoid these 5 common layering mistakes on your next hike, from cotton base layers to skipping a wind shell.",
      publishedAt: "2024-09-10T00:00:00Z",
      blogId: gid("Blog", 1),
      blogTitle: "Trail Notes",
    },
    {
      id: gid("Article", 2),
      title: "Behind the Seams: How We Source Our Wool",
      handle: "behind-the-seams-how-we-source-our-wool",
      bodyHtml: "<p>A look at the small New Zealand farms behind our merino wool line.</p>",
      seoTitle: "",
      seoDescription: "",
      publishedAt: "2024-07-22T00:00:00Z",
      blogId: gid("Blog", 1),
      blogTitle: "Trail Notes",
    },
    {
      id: gid("Article", 3),
      title: "Winter 2025 Gear Preview",
      handle: "winter-2025-gear-preview",
      bodyHtml:
        "<p>An early look at what's coming next season — embargoed until launch, but here's a preview of the jackets and layers we're most excited about.</p>",
      seoTitle: "Winter 2025 Gear Preview | Northwind Outfitters",
      seoDescription: "A first look at Northwind Outfitters' Winter 2025 lineup, coming soon.",
      publishedAt: null, // Unpublished draft post.
      blogId: gid("Blog", 1),
      blogTitle: "Trail Notes",
    },
  ].map(addPublishedVisibility);
}

function addPublishedVisibility(item) {
  return {
    ...item,
    visibility: {
      visible: Boolean(item.publishedAt),
      reason: item.publishedAt ? `Published ${item.publishedAt}` : "Not published (still a draft)",
    },
  };
}

function seedStore() {
  return {
    product: seedProducts(),
    collection: seedCollections(),
    page: seedPages(),
    article: seedArticles(),
  };
}

let store = null;

function getStore() {
  if (!store) store = seedStore();
  return store;
}

/** Resets the in-memory demo store back to its original seed data. */
export function resetDemoStore() {
  store = seedStore();
}

function findItem(type, id) {
  const list = getStore()[type];
  if (!list) return null;
  return list.find((item) => item.id === id) ?? null;
}

function withScoreAndSuggestions(item) {
  return {
    ...item,
    seo: scoreResource(item),
    suggestions: {
      title: suggestSeoTitle(item.title, DEMO_SHOP_NAME),
      description: suggestSeoDescription(item.bodyHtml, item.title),
    },
  };
}

export function listDemoResources(type) {
  const list = getStore()[type] ?? [];
  return { items: list.map(withScoreAndSuggestions), pageInfo: { hasNextPage: false, endCursor: null } };
}

export function getDemoResource(type, id) {
  const item = findItem(type, id);
  return item ? withScoreAndSuggestions(item) : null;
}

export function updateDemoSeo(type, id, { title, description }) {
  const item = findItem(type, id);
  if (!item) return null;
  if (title !== undefined) item.seoTitle = title;
  if (description !== undefined) item.seoDescription = description;
  return withScoreAndSuggestions(item);
}

export function updateDemoHandle(type, id, handle) {
  const item = findItem(type, id);
  if (!item) return null;
  item.handle = handle;
  return withScoreAndSuggestions(item);
}

export function fixDemoProductAlt(id) {
  const item = findItem("product", id);
  if (!item) return null;
  let updated = 0;
  item.images = item.images.map((img, i) => {
    if (img.alt && img.alt.trim()) return img;
    updated += 1;
    return { ...img, alt: `${item.title} — image ${i + 1}` };
  });
  return { updated, item: withScoreAndSuggestions(item) };
}

export function getDemoDashboardSummary() {
  const labels = { product: "Product", collection: "Collection", page: "Page", article: "Blog post" };
  const summary = {};
  for (const type of Object.keys(getStore())) {
    const items = getStore()[type].map(withScoreAndSuggestions);
    const scores = items.map((i) => i.seo.score);
    summary[type] = {
      label: labels[type],
      count: items.length,
      averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      issues: items.reduce((sum, i) => sum + i.seo.issueCount, 0),
      worst: [...items]
        .sort((a, b) => a.seo.score - b.seo.score)
        .slice(0, 5)
        .map((i) => ({ id: i.id, title: i.title, score: i.seo.score })),
    };
  }
  return summary;
}

/**
 * Runs the real broken-link checker against a demo item's body copy. This
 * is not faked — the product with real `github.com` links in its
 * description (see seedProducts) will show one real, live "OK" result and
 * one real, live "broken" (404) result, over an actual network call.
 */
export async function checkDemoResourceLinks(type, id) {
  const item = findItem(type, id);
  if (!item) return null;
  return checkBrokenLinks(item.bodyHtml, DEMO_SHOP_DOMAIN);
}

/** A realistic, fixed sitemap/robots.txt result — no real domain to check in demo mode. */
export function getDemoSitemapCheck() {
  return {
    storeUrl: DEMO_SHOP_DOMAIN,
    checks: [
      { id: "robots_txt", status: "good", message: "robots.txt is reachable." },
      { id: "robots_references_sitemap", status: "good", message: "robots.txt references the sitemap." },
      { id: "sitemap_xml", status: "good", message: "sitemap.xml is reachable." },
      {
        id: "sitemap_has_entries",
        status: "good",
        message: "sitemap.xml (or its index) references 42 URL(s)/sub-sitemap(s).",
      },
    ],
    passed: 4,
    total: 4,
    demo: true,
  };
}
