import { SEO_METAFIELDS_FRAGMENT, extractSeoFields } from "./shared.js";

export const LIST_PRODUCTS_QUERY = `
  query ListProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, sortKey: TITLE) {
      edges {
        cursor
        node {
          id
          title
          handle
          descriptionHtml
          status
          media(first: 20) {
            edges { node { id alt mediaContentType } }
          }
          ${SEO_METAFIELDS_FRAGMENT}
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const GET_PRODUCT_QUERY = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      title
      handle
      descriptionHtml
      status
      media(first: 100) {
        edges { node { id alt mediaContentType } }
      }
      ${SEO_METAFIELDS_FRAGMENT}
    }
  }
`;

export const UPDATE_PRODUCT_HANDLE_MUTATION = `
  mutation UpdateProductHandle($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id handle }
      userErrors { field message }
    }
  }
`;

/**
 * Updates alt text on one or more of a product's existing media images.
 * NOTE: `productUpdateMedia` / `UpdateMediaInput` / `mediaUserErrors` are the
 * mutation and type names for the Shopify Media API as of recent stable API
 * versions. If your target API version has renamed these, adjust this one
 * query — nothing else in the app needs to change.
 */
export const UPDATE_PRODUCT_IMAGE_ALT_MUTATION = `
  mutation UpdateProductImageAlt($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media {
        id
        ... on MediaImage { alt }
      }
      mediaUserErrors { field message }
    }
  }
`;

export function normalizeProduct(node) {
  return {
    id: node.id,
    title: node.title,
    handle: node.handle,
    status: node.status,
    bodyHtml: node.descriptionHtml,
    images: (node.media?.edges ?? [])
      .filter((e) => e.node.mediaContentType === "IMAGE")
      .map((e) => ({ id: e.node.id, alt: e.node.alt })),
    visibility: {
      visible: node.status === "ACTIVE",
      reason: node.status === "ACTIVE" ? "Active" : `Status is ${node.status}`,
    },
    ...extractSeoFields(node),
  };
}
