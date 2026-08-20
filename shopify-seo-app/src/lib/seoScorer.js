/**
 * Pure, dependency-free SEO scoring logic shared by products, collections,
 * pages, and blog articles. Kept free of any Shopify API calls so it can be
 * unit tested in isolation (see test/seoScorer.test.js) and reused for any
 * resource shape that exposes: title, seoTitle, seoDescription, handle,
 * bodyHtml, and (optionally) images.
 */

export const LIMITS = {
  title: { min: 30, max: 60 },
  description: { min: 70, max: 160 },
  handle: { max: 75 },
};

/** Strips HTML tags and decodes a handful of common entities. */
export function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function check(id, label, status, message, extra = {}) {
  return { id, label, status, message, ...extra };
}

const STATUS_SCORE = { good: 100, warning: 55, critical: 0 };

export function scoreSeoTitle(seoTitle, fallbackTitle) {
  const effective = (seoTitle || "").trim();
  const usingFallback = !effective && !!fallbackTitle;
  const value = effective || fallbackTitle || "";
  const len = value.length;

  if (!value) {
    return check("title", "SEO title", "critical", "No title is set at all.");
  }
  if (usingFallback) {
    return check(
      "title",
      "SEO title",
      "warning",
      `No custom SEO title set — search engines will fall back to the ${len}-character resource title.`,
      { length: len }
    );
  }
  if (len < LIMITS.title.min) {
    return check(
      "title",
      "SEO title",
      "warning",
      `SEO title is ${len} characters, shorter than the recommended ${LIMITS.title.min}-${LIMITS.title.max}.`,
      { length: len }
    );
  }
  if (len > LIMITS.title.max) {
    return check(
      "title",
      "SEO title",
      "warning",
      `SEO title is ${len} characters and may be truncated in search results (recommended ${LIMITS.title.min}-${LIMITS.title.max}).`,
      { length: len }
    );
  }
  return check("title", "SEO title", "good", `SEO title length (${len} chars) is within the recommended range.`, {
    length: len,
  });
}

export function scoreSeoDescription(seoDescription) {
  const value = (seoDescription || "").trim();
  const len = value.length;

  if (!value) {
    return check("description", "Meta description", "critical", "No meta description is set.");
  }
  if (len < LIMITS.description.min) {
    return check(
      "description",
      "Meta description",
      "warning",
      `Meta description is ${len} characters, shorter than the recommended ${LIMITS.description.min}-${LIMITS.description.max}.`,
      { length: len }
    );
  }
  if (len > LIMITS.description.max) {
    return check(
      "description",
      "Meta description",
      "warning",
      `Meta description is ${len} characters and will likely be truncated (recommended ${LIMITS.description.min}-${LIMITS.description.max}).`,
      { length: len }
    );
  }
  return check(
    "description",
    "Meta description",
    "good",
    `Meta description length (${len} chars) is within the recommended range.`,
    { length: len }
  );
}

export function scoreHandle(handle) {
  const value = (handle || "").trim();
  if (!value) {
    return check("handle", "URL handle", "critical", "Resource has no URL handle.");
  }
  const isCleanFormat = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
  if (!isCleanFormat) {
    return check(
      "handle",
      "URL handle",
      "warning",
      `URL handle "${value}" contains characters other than lowercase letters, numbers, and hyphens.`
    );
  }
  if (value.length > LIMITS.handle.max) {
    return check(
      "handle",
      "URL handle",
      "warning",
      `URL handle is ${value.length} characters, longer than the recommended ${LIMITS.handle.max}.`
    );
  }
  const wordCount = value.split("-").filter(Boolean).length;
  if (wordCount > 8) {
    return check(
      "handle",
      "URL handle",
      "warning",
      `URL handle has ${wordCount} words; consider shortening it to the most important keywords.`
    );
  }
  return check("handle", "URL handle", "good", "URL handle is clean and reasonably short.");
}

export function scoreImageAlt(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return check("images", "Image alt text", "warning", "Resource has no images to evaluate.", {
      total: 0,
      withAlt: 0,
    });
  }
  const withAlt = images.filter((img) => (img.alt || img.altText || "").trim().length > 0).length;
  const total = images.length;
  const pct = Math.round((withAlt / total) * 100);

  if (withAlt === total) {
    return check("images", "Image alt text", "good", `All ${total} image(s) have alt text.`, { total, withAlt });
  }
  if (withAlt === 0) {
    return check("images", "Image alt text", "critical", `None of the ${total} image(s) have alt text.`, {
      total,
      withAlt,
    });
  }
  return check(
    "images",
    "Image alt text",
    "warning",
    `${withAlt} of ${total} image(s) (${pct}%) have alt text.`,
    { total, withAlt }
  );
}

/**
 * Checks whether a resource is actually visible to customers/search
 * engines at all — the best-optimized SEO title in the world doesn't
 * matter if the page is unpublished. `visibility` is `{ visible, reason }`,
 * normalized per resource type in `src/queries/*.js` since the underlying
 * Shopify field differs (Product uses `status`, Page/Article use
 * `publishedAt`). Pass `undefined` for resource types where this isn't
 * applicable (e.g. collections), same convention as `images`.
 */
export function scoreVisibility(visibility) {
  if (!visibility) {
    return check("visibility", "Visibility", "critical", "Could not determine whether this is published.");
  }
  if (visibility.visible) {
    return check("visibility", "Visibility", "good", visibility.reason || "Published and visible to customers.");
  }
  return check(
    "visibility",
    "Visibility",
    "critical",
    `Not visible to customers or search engines: ${visibility.reason || "unpublished"}. None of the other SEO checks matter until this is fixed.`
  );
}

/**
 * Computes an overall 0-100 score and grade for a normalized resource.
 * `resource.images` and `resource.visibility` are optional — omit them for
 * resource types where they don't apply (see `scoreImageAlt` and
 * `scoreVisibility` docs above).
 */
export function scoreResource(resource) {
  const checks = [
    scoreSeoTitle(resource.seoTitle, resource.title),
    scoreSeoDescription(resource.seoDescription),
    scoreHandle(resource.handle),
  ];
  if (resource.images !== undefined) {
    checks.push(scoreImageAlt(resource.images));
  }
  if (resource.visibility !== undefined) {
    checks.push(scoreVisibility(resource.visibility));
  }

  const score = Math.round(checks.reduce((sum, c) => sum + STATUS_SCORE[c.status], 0) / checks.length);
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const issueCount = checks.filter((c) => c.status !== "good").length;

  return { score, grade, issueCount, checks };
}

/** Generates a search-engine-friendly SEO title suggestion. */
export function suggestSeoTitle(title, shopName) {
  const base = (title || "").trim();
  if (!base) return "";
  if (!shopName) {
    return base.length <= LIMITS.title.max ? base : `${base.slice(0, LIMITS.title.max - 1).trim()}…`;
  }
  const withBrand = `${base} | ${shopName}`;
  if (withBrand.length <= LIMITS.title.max) return withBrand;
  const budget = LIMITS.title.max - shopName.length - 3; // " | "
  if (budget < 10) {
    return base.length <= LIMITS.title.max ? base : `${base.slice(0, LIMITS.title.max - 1).trim()}…`;
  }
  return `${base.slice(0, budget).trim()} | ${shopName}`;
}

/** Generates a meta-description suggestion from a resource's body copy. */
export function suggestSeoDescription(bodyHtml, title) {
  const plain = stripHtml(bodyHtml);
  const source = plain || title || "";
  if (!source) return "";
  if (source.length <= LIMITS.description.max) return source;

  const truncated = source.slice(0, LIMITS.description.max);
  const lastSpace = truncated.lastIndexOf(" ");
  const clean = lastSpace > LIMITS.description.min ? truncated.slice(0, lastSpace) : truncated;
  return `${clean.trim()}…`;
}
