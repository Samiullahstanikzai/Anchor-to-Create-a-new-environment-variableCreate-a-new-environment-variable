import { config } from "../config.js";

export class ShopifyApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * Executes a query/mutation against a shop's Admin GraphQL API, with basic
 * retry-on-throttle handling (Shopify's GraphQL API returns HTTP 200 with a
 * THROTTLED error, or occasionally HTTP 429, when a call exceeds the
 * available query-cost bucket).
 */
export async function shopifyGraphql(shop, accessToken, query, variables = {}, { retries = 3 } = {}) {
  const url = `https://${shop}/admin/api/${config.apiVersion}/graphql.json`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (response.status === 429) {
      await backoff(attempt);
      continue;
    }

    const json = await response.json().catch(() => null);

    if (!response.ok) {
      throw new ShopifyApiError(`Admin API request failed with status ${response.status}`, {
        status: response.status,
        body: json,
      });
    }

    const throttled = json?.errors?.some((e) => e.extensions?.code === "THROTTLED");
    if (throttled && attempt < retries) {
      const available = json?.extensions?.cost?.throttleStatus?.currentlyAvailable ?? 0;
      const restoreRate = json?.extensions?.cost?.throttleStatus?.restoreRate ?? 50;
      const requestedCost = json?.extensions?.cost?.requestedQueryCost ?? 0;
      const waitMs = Math.max(250, ((requestedCost - available) / restoreRate) * 1000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (json?.errors?.length) {
      throw new ShopifyApiError(json.errors.map((e) => e.message).join("; "), { body: json });
    }

    if (json?.data && hasUserErrors(json.data)) {
      const messages = collectUserErrors(json.data);
      throw new ShopifyApiError(messages.join("; "), { body: json });
    }

    return json.data;
  }

  throw new ShopifyApiError("Admin API request was throttled after multiple retries");
}

function backoff(attempt) {
  return new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
}

// Different mutations name their error field differently — most use
// `userErrors`, but Media API mutations (e.g. `productUpdateMedia`) use
// `mediaUserErrors` instead. Treat any array field whose name ends in
// "UserErrors" as a source of failures so none of them get missed.
function userErrorFields(value) {
  return Object.keys(value).filter((key) => key.endsWith("UserErrors") && Array.isArray(value[key]));
}

function hasUserErrors(data) {
  return Object.values(data).some(
    (value) => value && typeof value === "object" && userErrorFields(value).some((key) => value[key].length > 0)
  );
}

function collectUserErrors(data) {
  const messages = [];
  for (const value of Object.values(data)) {
    if (value && typeof value === "object") {
      for (const key of userErrorFields(value)) {
        for (const err of value[key]) messages.push(err.message);
      }
    }
  }
  return messages;
}
