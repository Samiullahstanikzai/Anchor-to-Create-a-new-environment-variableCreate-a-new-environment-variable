/**
 * SEO title/description are stored as the classic `global.title_tag` /
 * `global.description_tag` metafields — the same pair the Shopify admin's
 * "Edit website SEO" panel reads and writes for products, collections,
 * pages, and blog articles. This has been the stable mechanism across API
 * versions, which is why every resource query below reuses this fragment
 * and every mutation reuses `metafieldsSet`.
 */
export const SEO_METAFIELDS_FRAGMENT = `
    seoTitleField: metafield(namespace: "global", key: "title_tag") { value }
    seoDescriptionField: metafield(namespace: "global", key: "description_tag") { value }
`;

export const SET_SEO_METAFIELDS_MUTATION = `
  mutation SetSeoMetafields($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value }
      userErrors { field message }
    }
  }
`;

export const SHOP_QUERY = `
  query ShopInfo {
    shop {
      name
      primaryDomain { url }
    }
  }
`;

/** Builds the `metafields` input array for a single resource's SEO fields. */
export function buildSeoMetafieldsInput(ownerId, { title, description }) {
  const metafields = [];
  if (title !== undefined) {
    metafields.push({
      ownerId,
      namespace: "global",
      key: "title_tag",
      type: "single_line_text_field",
      value: title,
    });
  }
  if (description !== undefined) {
    metafields.push({
      ownerId,
      namespace: "global",
      key: "description_tag",
      type: "multi_line_text_field",
      value: description,
    });
  }
  return metafields;
}

export function extractSeoFields(node) {
  return {
    seoTitle: node.seoTitleField?.value ?? "",
    seoDescription: node.seoDescriptionField?.value ?? "",
  };
}
