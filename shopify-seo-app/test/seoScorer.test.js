import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  scoreSeoTitle,
  scoreSeoDescription,
  scoreHandle,
  scoreImageAlt,
  scoreResource,
  suggestSeoTitle,
  suggestSeoDescription,
  stripHtml,
} from "../src/lib/seoScorer.js";

describe("stripHtml", () => {
  test("removes tags and decodes entities", () => {
    assert.equal(stripHtml("<p>Hello&nbsp;&amp;<b>World</b></p>"), "Hello & World");
  });

  test("handles empty input", () => {
    assert.equal(stripHtml(""), "");
    assert.equal(stripHtml(null), "");
  });
});

describe("scoreSeoTitle", () => {
  test("flags missing title as critical", () => {
    const result = scoreSeoTitle("", "");
    assert.equal(result.status, "critical");
  });

  test("flags fallback-to-resource-title as a warning", () => {
    const result = scoreSeoTitle("", "Some Product Title That Exists");
    assert.equal(result.status, "warning");
  });

  test("flags too-short title as a warning", () => {
    const result = scoreSeoTitle("Too short", "fallback");
    assert.equal(result.status, "warning");
  });

  test("flags too-long title as a warning", () => {
    const longTitle = "A".repeat(80);
    const result = scoreSeoTitle(longTitle, "fallback");
    assert.equal(result.status, "warning");
  });

  test("accepts a well-sized title", () => {
    const goodTitle = "A".repeat(45);
    const result = scoreSeoTitle(goodTitle, "fallback");
    assert.equal(result.status, "good");
  });
});

describe("scoreSeoDescription", () => {
  test("flags missing description as critical", () => {
    assert.equal(scoreSeoDescription("").status, "critical");
    assert.equal(scoreSeoDescription(undefined).status, "critical");
  });

  test("flags too-short description as a warning", () => {
    assert.equal(scoreSeoDescription("Short.").status, "warning");
  });

  test("flags too-long description as a warning", () => {
    assert.equal(scoreSeoDescription("A".repeat(200)).status, "warning");
  });

  test("accepts a well-sized description", () => {
    assert.equal(scoreSeoDescription("A".repeat(120)).status, "good");
  });
});

describe("scoreHandle", () => {
  test("flags missing handle as critical", () => {
    assert.equal(scoreHandle("").status, "critical");
  });

  test("flags uppercase/underscore handles as a warning", () => {
    assert.equal(scoreHandle("My_Product-Handle").status, "warning");
  });

  test("flags overly long handles as a warning", () => {
    assert.equal(scoreHandle("a".repeat(90)).status, "warning");
  });

  test("flags handles with too many words as a warning", () => {
    const handle = Array.from({ length: 10 }, (_, i) => `word${i}`).join("-");
    assert.equal(scoreHandle(handle).status, "warning");
  });

  test("accepts a clean handle", () => {
    assert.equal(scoreHandle("classic-leather-jacket").status, "good");
  });
});

describe("scoreImageAlt", () => {
  test("warns when there are no images", () => {
    const result = scoreImageAlt([]);
    assert.equal(result.status, "warning");
    assert.equal(result.total, 0);
  });

  test("flags critical when no images have alt text", () => {
    const result = scoreImageAlt([{ alt: "" }, { alt: null }]);
    assert.equal(result.status, "critical");
  });

  test("flags warning when some images are missing alt text", () => {
    const result = scoreImageAlt([{ alt: "a jacket" }, { alt: "" }]);
    assert.equal(result.status, "warning");
    assert.equal(result.withAlt, 1);
  });

  test("passes when all images have alt text", () => {
    const result = scoreImageAlt([{ alt: "front view" }, { altText: "back view" }]);
    assert.equal(result.status, "good");
  });
});

describe("scoreResource", () => {
  test("computes a low score for a resource with every field missing", () => {
    const result = scoreResource({ title: "", seoTitle: "", seoDescription: "", handle: "", images: [] });
    assert.ok(result.score < 40, `expected a low score, got ${result.score}`);
    assert.equal(result.grade, "F");
    assert.equal(result.issueCount, result.checks.length);
  });

  test("computes a high score for a well-optimized resource", () => {
    const result = scoreResource({
      title: "Classic Leather Jacket",
      seoTitle: "Classic Leather Jacket | Handmade in Italy | Acme Co",
      seoDescription:
        "Shop the Classic Leather Jacket, handcrafted in Italy from full-grain leather. Ships worldwide with free returns.",
      handle: "classic-leather-jacket",
      images: [{ alt: "front" }, { alt: "back" }],
    });
    assert.equal(result.grade, "A");
    assert.equal(result.issueCount, 0);
  });

  test("omits the image check entirely when `images` is not provided", () => {
    const result = scoreResource({
      title: "About us",
      seoTitle: "About us | Acme Co",
      seoDescription: "A".repeat(120),
      handle: "about-us",
    });
    assert.ok(!result.checks.some((c) => c.id === "images"));
  });
});

describe("suggestSeoTitle", () => {
  test("returns empty string for empty input", () => {
    assert.equal(suggestSeoTitle("", "Acme"), "");
  });

  test("appends the shop name when it fits", () => {
    assert.equal(suggestSeoTitle("Leather Jacket", "Acme Co"), "Leather Jacket | Acme Co");
  });

  test("truncates a very long title instead of overflowing the limit", () => {
    const longTitle = "A".repeat(100);
    const suggestion = suggestSeoTitle(longTitle, "Acme Co");
    assert.ok(suggestion.length <= 61, `expected <=61 chars, got ${suggestion.length}`);
  });
});

describe("suggestSeoDescription", () => {
  test("returns empty string when there is no source text", () => {
    assert.equal(suggestSeoDescription("", ""), "");
  });

  test("falls back to the title when body is empty", () => {
    assert.equal(suggestSeoDescription("", "Leather Jacket"), "Leather Jacket");
  });

  test("truncates long body copy at a word boundary with an ellipsis", () => {
    const body = `<p>${"word ".repeat(60)}</p>`;
    const suggestion = suggestSeoDescription(body, "fallback");
    assert.ok(suggestion.endsWith("…"));
    assert.ok(suggestion.length <= 161, `expected <=161 chars, got ${suggestion.length}`);
  });
});
