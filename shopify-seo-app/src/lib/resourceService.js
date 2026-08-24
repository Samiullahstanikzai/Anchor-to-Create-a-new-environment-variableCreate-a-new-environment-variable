import { shopifyGraphql } from "./shopifyGraphql.js";
import { scoreResource, suggestSeoTitle, suggestSeoDescription } from "./seoScorer.js";
import { SET_SEO_METAFIELDS_MUTATION, buildSeoMetafieldsInput } from "../queries/shared.js";
import {
  LIST_PRODUCTS_QUERY,
  GET_PRODUCT_QUERY,
  UPDATE_PRODUCT_HANDLE_MUTATION,
  UPDATE_PRODUCT_IMAGE_ALT_MUTATION,
  normalizeProduct,
} from "../queries/products.js";
import {
  LIST_COLLECTIONS_QUERY,
  GET_COLLECTION_QUERY,
  UPDATE_COLLECTION_HANDLE_MUTATION,
  normalizeCollection,
} from "../queries/collections.js";
import { LIST_PAGES_QUERY, GET_PAGE_QUERY, UPDATE_PAGE_HANDLE_MUTATION, normalizePage } from "../queries/pages.js";
import {
  LIST_BLOGS_QUERY,
  LIST_ARTICLES_FOR_BLOG_QUERY,
  GET_ARTICLE_QUERY,
  UPDATE_ARTICLE_HANDLE_MUTATION,
  normalizeArticle,
} from "../queries/articles.js";

function withScore(item) {
  return { ...item, seo: scoreResource(item) };
}

async function listProducts(shop, accessToken, { first = 25, after = null } = {}) {
  const data = await shopifyGraphql(shop, accessToken, LIST_PRODUCTS_QUERY, { first, after });
  return {
    items: data.products.edges.map((e) => withScore(normalizeProduct(e.node))),
    pageInfo: data.products.pageInfo,
  };
}

async function getProduct(shop, accessToken, id) {
  const data = await shopifyGraphql(shop, accessToken, GET_PRODUCT_QUERY, { id });
  if (!data.product) return null;
  return withScore(normalizeProduct(data.product));
}

async function updateProductImageAlt(shop, accessToken, productId, media) {
  return shopifyGraphql(shop, accessToken, UPDATE_PRODUCT_IMAGE_ALT_MUTATION, { productId, media });
}

async function listCollections(shop, accessToken, { first = 25, after = null } = {}) {
  const data = await shopifyGraphql(shop, accessToken, LIST_COLLECTIONS_QUERY, { first, after });
  return {
    items: data.collections.edges.map((e) => withScore(normalizeCollection(e.node))),
    pageInfo: data.collections.pageInfo,
  };
}

async function getCollection(shop, accessToken, id) {
  const data = await shopifyGraphql(shop, accessToken, GET_COLLECTION_QUERY, { id });
  if (!data.collection) return null;
  return withScore(normalizeCollection(data.collection));
}

async function listPages(shop, accessToken, { first = 25, after = null } = {}) {
  const data = await shopifyGraphql(shop, accessToken, LIST_PAGES_QUERY, { first, after });
  return {
    items: data.pages.edges.map((e) => withScore(normalizePage(e.node))),
    pageInfo: data.pages.pageInfo,
  };
}

async function getPage(shop, accessToken, id) {
  const data = await shopifyGraphql(shop, accessToken, GET_PAGE_QUERY, { id });
  if (!data.page) return null;
  return withScore(normalizePage(data.page));
}

/**
 * Articles are nested under blogs in the Admin API, so "listing articles"
 * means paging through blogs first. To keep this a single, predictable API
 * call from the frontend's perspective, we cap how many blogs/articles we
 * walk per request rather than exposing multi-level pagination.
 */
async function listArticles(shop, accessToken, { first = 25, maxBlogs = 10 } = {}) {
  const blogsData = await shopifyGraphql(shop, accessToken, LIST_BLOGS_QUERY, { first: maxBlogs, after: null });
  const blogs = blogsData.blogs.edges.map((e) => e.node);

  const items = [];
  let hasMore = blogsData.blogs.pageInfo.hasNextPage;

  for (const blog of blogs) {
    const data = await shopifyGraphql(shop, accessToken, LIST_ARTICLES_FOR_BLOG_QUERY, {
      blogId: blog.id,
      first,
      after: null,
    });
    const articleEdges = data.blog?.articles?.edges ?? [];
    for (const edge of articleEdges) {
      items.push(withScore(normalizeArticle(edge.node, blog)));
    }
    if (data.blog?.articles?.pageInfo?.hasNextPage) hasMore = true;
  }

  return { items, pageInfo: { hasNextPage: hasMore, endCursor: null } };
}

async function getArticle(shop, accessToken, id) {
  const data = await shopifyGraphql(shop, accessToken, GET_ARTICLE_QUERY, { id });
  if (!data.article) return null;
  return withScore(normalizeArticle(data.article, data.article.blog));
}

export const RESOURCE_TYPES = {
  product: {
    label: "Product",
    list: listProducts,
    get: getProduct,
    handleMutation: UPDATE_PRODUCT_HANDLE_MUTATION,
    buildHandleVariables: (id, handle) => ({ input: { id, handle } }),
  },
  collection: {
    label: "Collection",
    list: listCollections,
    get: getCollection,
    handleMutation: UPDATE_COLLECTION_HANDLE_MUTATION,
    buildHandleVariables: (id, handle) => ({ input: { id, handle } }),
  },
  page: {
    label: "Page",
    list: listPages,
    get: getPage,
    handleMutation: UPDATE_PAGE_HANDLE_MUTATION,
    buildHandleVariables: (id, handle) => ({ id, page: { handle } }),
  },
  article: {
    label: "Blog post",
    list: listArticles,
    get: getArticle,
    handleMutation: UPDATE_ARTICLE_HANDLE_MUTATION,
    buildHandleVariables: (id, handle) => ({ id, article: { handle } }),
  },
};

export function assertValidResourceType(type) {
  if (!RESOURCE_TYPES[type]) {
    throw new Error(`Unknown resource type "${type}". Expected one of: ${Object.keys(RESOURCE_TYPES).join(", ")}`);
  }
  return RESOURCE_TYPES[type];
}

export async function updateResourceSeo(shop, accessToken, type, id, { title, description }) {
  const metafields = buildSeoMetafieldsInput(id, { title, description });
  if (metafields.length === 0) return null;
  return shopifyGraphql(shop, accessToken, SET_SEO_METAFIELDS_MUTATION, { metafields });
}

export async function updateResourceHandle(shop, accessToken, type, id, handle) {
  const resource = assertValidResourceType(type);
  const variables = resource.buildHandleVariables(id, handle);
  return shopifyGraphql(shop, accessToken, resource.handleMutation, variables);
}

export { updateProductImageAlt, suggestSeoTitle, suggestSeoDescription };
