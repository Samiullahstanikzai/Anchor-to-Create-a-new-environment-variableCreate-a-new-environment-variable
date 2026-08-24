import { SEO_METAFIELDS_FRAGMENT, extractSeoFields } from "./shared.js";

export const LIST_COLLECTIONS_QUERY = `
  query ListCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after, sortKey: TITLE) {
      edges {
        cursor
        node {
          id
          title
          handle
          descriptionHtml
          ${SEO_METAFIELDS_FRAGMENT}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_COLLECTION_QUERY = `
  query GetCollection($id: ID!) {
    collection(id: $id) {
      id
      title
      handle
      descriptionHtml
      ${SEO_METAFIELDS_FRAGMENT}
    }
  }
`;

export const UPDATE_COLLECTION_HANDLE_MUTATION = `
  mutation UpdateCollectionHandle($input: CollectionInput!) {
    collectionUpdate(input: $input) {
      collection { id handle }
      userErrors { field message }
    }
  }
`;

export function normalizeCollection(node) {
  return {
    // Collections don't have a simple draft/published boolean field like
    // Product.status or Page/Article.publishedAt — visibility per sales
    // channel is tracked separately via publications, which is out of
    // scope here. `visibility` is intentionally omitted so scoreResource()
    // skips that check for collections rather than guessing.
    id: node.id,
    title: node.title,
    handle: node.handle,
    bodyHtml: node.descriptionHtml,
    ...extractSeoFields(node),
  };
}
