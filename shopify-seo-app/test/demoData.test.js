import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { scoreResource } from "../src/lib/seoScorer.js";
import {
  listDemoResources,
  getDemoResource,
  updateDemoSeo,
  updateDemoHandle,
  fixDemoProductAlt,
  getDemoDashboardSummary,
  checkDemoResourceLinks,
  getDemoSitemapCheck,
  resetDemoStore,
} from "../src/lib/demoData.js";

beforeEach(() => {
  resetDemoStore();
});

describe("listDemoResources", () => {
  test("returns a non-trivial, pre-scored dataset for every resource type", () => {
    for (const type of ["product", "collection", "page", "article"]) {
      const { items } = listDemoResources(type);
      assert.ok(items.length >= 3, `expected several sample ${type}s, got ${items.length}`);
      for (const item of items) {
        assert.ok(item.seo, `expected ${type} to include a computed seo score`);
        assert.ok(item.suggestions, `expected ${type} to include suggestions`);
      }
    }
  });

  test("includes a realistic spread of scores, not all identical", () => {
    const { items } = listDemoResources("product");
    const scores = new Set(items.map((i) => i.seo.score));
    assert.ok(scores.size > 1, "expected varied scores across sample products");
  });

  test("includes at least one unpublished/draft item to exercise the visibility check", () => {
    const { items } = listDemoResources("product");
    assert.ok(items.some((i) => i.seo.checks.some((c) => c.id === "visibility" && c.status === "critical")));
  });
});

describe("getDemoResource", () => {
  test("fetches a single item by id", () => {
    const { items } = listDemoResources("product");
    const item = getDemoResource("product", items[0].id);
    assert.equal(item.id, items[0].id);
  });

  test("returns null for an unknown id", () => {
    assert.equal(getDemoResource("product", "gid://shopify/Product/does-not-exist"), null);
  });

  test("returns null for an unknown resource type", () => {
    assert.equal(getDemoResource("not-a-type", "anything"), null);
  });
});

describe("updateDemoSeo / updateDemoHandle", () => {
  test("edits persist across subsequent reads (in-memory store)", () => {
    const { items } = listDemoResources("collection");
    const id = items[0].id;

    updateDemoSeo("collection", id, { title: "A Brand New SEO Title", description: "A brand new description." });
    const afterSeoUpdate = getDemoResource("collection", id);
    assert.equal(afterSeoUpdate.seoTitle, "A Brand New SEO Title");
    assert.equal(afterSeoUpdate.seoDescription, "A brand new description.");

    updateDemoHandle("collection", id, "a-brand-new-handle");
    const afterHandleUpdate = getDemoResource("collection", id);
    assert.equal(afterHandleUpdate.handle, "a-brand-new-handle");
  });

  test("resetDemoStore() reverts edits back to the original seed data", () => {
    const { items } = listDemoResources("page");
    const id = items[0].id;
    const originalTitle = items[0].seoTitle;

    updateDemoSeo("page", id, { title: "Temporary edit" });
    assert.equal(getDemoResource("page", id).seoTitle, "Temporary edit");

    resetDemoStore();
    assert.equal(getDemoResource("page", id).seoTitle, originalTitle);
  });
});

describe("fixDemoProductAlt", () => {
  test("fills in missing alt text and leaves existing alt text untouched", () => {
    const { items } = listDemoResources("product");
    const productWithMissingAlt = items.find((p) => p.images.some((img) => !img.alt));
    assert.ok(productWithMissingAlt, "expected at least one sample product with missing alt text");

    const before = getDemoResource("product", productWithMissingAlt.id);
    const missingCountBefore = before.images.filter((img) => !img.alt).length;

    const result = fixDemoProductAlt(productWithMissingAlt.id);
    assert.equal(result.updated, missingCountBefore);

    const after = getDemoResource("product", productWithMissingAlt.id);
    assert.ok(after.images.every((img) => img.alt && img.alt.trim().length > 0));
  });

  test("returns null for an unknown product id", () => {
    assert.equal(fixDemoProductAlt("gid://shopify/Product/does-not-exist"), null);
  });
});

describe("demo dataset quality (regression guard)", () => {
  test("clicking 'use suggested copy' never makes an item's score worse than its current one", () => {
    // Regression test for a real UX bug caught during manual review: a demo
    // product with a short body had a generated suggestion (derived from
    // body copy) shorter than its existing hand-written description, so
    // "improving" it with one click actually lowered the score. Every demo
    // item's suggested title/description should score at least as well as
    // what's already there, so the "improve this" demo flow is honest.
    for (const type of ["product", "collection", "page", "article"]) {
      const { items } = listDemoResources(type);
      for (const item of items) {
        const before = item.seo.score;
        const withSuggestions = { ...item, seoTitle: item.suggestions.title, seoDescription: item.suggestions.description };
        const after = scoreResource(withSuggestions).score;
        assert.ok(
          after >= before,
          `${type} "${item.title}": suggested copy dropped the score from ${before} to ${after}`
        );
      }
    }
  });
});

describe("getDemoDashboardSummary", () => {
  test("returns a summary for every resource type with realistic counts", () => {
    const summary = getDemoDashboardSummary();
    for (const type of ["product", "collection", "page", "article"]) {
      assert.ok(summary[type].count > 0);
      assert.ok(typeof summary[type].averageScore === "number");
      assert.ok(Array.isArray(summary[type].worst));
    }
  });
});

describe("checkDemoResourceLinks", () => {
  test("runs the real link checker against a sample product with real links (live network call)", async () => {
    const { items } = listDemoResources("product");
    const productWithLinks = items.find((p) => /<a\s+href/i.test(p.bodyHtml));
    assert.ok(productWithLinks, "expected at least one sample product with links in its body copy");

    const result = await checkDemoResourceLinks("product", productWithLinks.id);
    assert.ok(result.checked >= 1);
    assert.ok(result.broken >= 1, "expected the seeded broken demo link to actually be reported broken");
  });

  test("returns null for an unknown id", async () => {
    assert.equal(await checkDemoResourceLinks("product", "gid://shopify/Product/does-not-exist"), null);
  });
});

describe("getDemoSitemapCheck", () => {
  test("returns a fully-passing, clearly-labeled canned result", () => {
    const result = getDemoSitemapCheck();
    assert.equal(result.demo, true);
    assert.equal(result.passed, result.total);
    assert.ok(result.checks.length > 0);
  });
});
