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
    id: node.id,
    title: node.title,
    handle: node.handle,
    bodyHtml: node.descriptionHtml,
    ...extractSeoFields(node),
  };
}
