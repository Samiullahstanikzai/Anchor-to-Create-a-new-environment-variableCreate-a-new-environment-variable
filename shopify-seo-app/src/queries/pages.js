import { SEO_METAFIELDS_FRAGMENT, extractSeoFields } from "./shared.js";

// NOTE: Online Store "Page" resources see far less API churn than Product,
// but double-check `body` / `PageUpdateInput` field names in the GraphiQL
// explorer for the API version you deploy against — Shopify has been known
// to rename fields on this resource across versions.
export const LIST_PAGES_QUERY = `
  query ListPages($first: Int!, $after: String) {
    pages(first: $first, after: $after) {
      edges {
        cursor
        node {
          id
          title
          handle
          body
          publishedAt
          ${SEO_METAFIELDS_FRAGMENT}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_PAGE_QUERY = `
  query GetPage($id: ID!) {
    page(id: $id) {
      id
      title
      handle
      body
      publishedAt
      ${SEO_METAFIELDS_FRAGMENT}
    }
  }
`;

export const UPDATE_PAGE_HANDLE_MUTATION = `
  mutation UpdatePageHandle($id: ID!, $page: PageUpdateInput!) {
    pageUpdate(id: $id, page: $page) {
      page { id handle }
      userErrors { field message }
    }
  }
`;

export function normalizePage(node) {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    bodyHtml: node.body,
    visibility: {
      visible: Boolean(node.publishedAt),
      reason: node.publishedAt ? `Published ${node.publishedAt}` : "Not published (still a draft)",
    },
    ...extractSeoFields(node),
  };
}
