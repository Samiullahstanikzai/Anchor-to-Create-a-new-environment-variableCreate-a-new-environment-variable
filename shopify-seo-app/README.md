# SEO Auditor for Shopify

An embedded Shopify admin app that audits and fixes on-page SEO for
**products, collections, pages, and blog articles**:

- SEO title / meta description length and presence
- URL handle quality
- Image alt-text coverage (products)
- **Visibility** — is this product actually published (`status`), is this
  page/article actually published (`publishedAt`)? An unpublished resource
  fails this check regardless of how good its other SEO fields are, since
  none of them matter if customers and search engines can't see it at all.
- **Broken links** — scans a resource's body copy for `<a href>` links and
  checks whether each one still resolves, on demand from its detail page
- A public sitemap.xml / robots.txt checker for the whole storefront

It is a **complete, working Node.js implementation** of the pieces every
real Shopify app needs: OAuth install flow, HMAC-verified webhooks
(including the mandatory GDPR compliance topics), App Bridge session-token
authentication, and Admin GraphQL API reads/writes. There is nothing to
"finish" architecturally — you provide real Shopify API credentials and a
public HTTPS URL, and it runs.

## Why zero npm dependencies

This app is intentionally built with **only Node.js built-ins** (`node:http`,
`node:crypto`, `fetch`, `node:test`, …) — no Express, no Prisma, no
`@shopify/shopify-app-*` packages. That's not a style preference: it means
`npm install` is never required, so the app can be cloned, run, and its full
test suite executed anywhere Node.js runs, with no dependency on npm
registry access. If you'd rather use the official `@shopify/shopify-app-remix`
stack, this codebase is small enough to be a clear reference for wiring the
same OAuth/webhook/session-token flows yourself.

## Deploying it so you get a real, clickable URL

Everything above runs locally with `npm start`, but a browser needs a real
public URL to open — `localhost` only means something on the machine it's
running on. This repo includes a ready-to-go Vercel deployment (`vercel.json`,
`api/index.js`) that wraps the exact same request logic as a serverless
function, with `public/*.html|js|css` served directly by Vercel.

**Honest caveat:** this configuration has not been exercised against a real
Vercel deployment — doing so requires a connected Vercel account, which
wasn't available while building this. What *is* verified locally
(`test/vercelHandler.test.js`, part of the 95-test suite) is that the
serverless entry point wraps the same app logic correctly when run behind a
plain HTTP server. The Vercel-specific pieces — static-file-vs-rewrite
routing precedence and `includeFiles` bundling — should be treated as a
first, reasonable attempt rather than a guarantee, and may need one small
follow-up fix once actually deployed (which is fast to do, since deploy
logs make the exact problem obvious).

To deploy:
1. Connect this repo to Vercel (via the Vercel dashboard, or `vercel` CLI from this directory).
2. Set `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SCOPES`, and `ADMIN_PASSWORD` as Vercel environment variables (`HOST` is derived automatically from `VERCEL_URL`).
3. Deploy. Note that on serverless hosting, session storage (`sessionDbPath`, which points at `/tmp` automatically when `VERCEL` is set) is not persistent across cold starts or multiple instances — fine for exploring the admin dashboard and OAuth flow, but swap `src/lib/sessionStore.js` for a real database (see "Extending" below) before relying on this for real merchant installs.

## Admin (operator) dashboard

Merchants get the embedded SEO dashboard inside their Shopify admin. But
*you*, the person running this app, also get a separate dashboard for
handling the app itself — at `/admin` — where you can:

- See app configuration status (which required env vars are set, host, API
  version, requested scopes).
- See every shop that has installed the app, when, and with what scope.
- Revoke a shop's locally-stored session (e.g. to force a clean
  reinstall), without needing direct file/database access.

Enable it by setting `ADMIN_PASSWORD` in `.env` and restarting the app,
then visit `${HOST}/admin` and log in. It's disabled by default (`/admin`
returns a clear "set ADMIN_PASSWORD" message) so a fresh clone never ships
an unauthenticated management page. Login uses a signed, expiring
(12-hour) cookie — see `src/lib/adminAuth.js`.

## How it stores SEO data

SEO title/description are read and written as the classic
`global.title_tag` / `global.description_tag` metafields — the same pair
the Shopify admin's own "Edit website SEO" panel uses. That's a stable
mechanism across API versions for products, collections, pages, and blog
articles (see `src/queries/shared.js`).

## Project layout

```
shopify-seo-app/
  src/
    config.js              # env var loading (no .env is required at runtime)
    server.js               # http server + route registration
    lib/
      crypto.js             # OAuth HMAC, webhook HMAC, session-token (JWT) verification
      shopifyAuth.js         # OAuth begin/callback/token-exchange
      shopifyGraphql.js       # Admin GraphQL client with throttle-aware retries
      sessionStore.js         # JSON-file session storage (swap for a real DB in prod)
      seoScorer.js             # pure scoring + suggestion-generation logic
      resourceService.js       # ties GraphQL queries + scoring together per resource type
      sitemapCheck.js           # public sitemap.xml / robots.txt checks
      linkChecker.js             # extracts + checks <a href> links in body copy
      router.js                 # tiny `:param` path router
      cookies.js                 # cookie parse/serialize helpers
      adminAuth.js                # signed-cookie auth for the operator dashboard
    queries/                # GraphQL query/mutation strings per resource type
    routes/                 # auth.js, webhooks.js, api.js, admin.js, static.js
  public/                  # embedded app frontend (App Bridge + vanilla JS, no build step)
                            # + admin-login.html / admin.html / admin.js for the operator dashboard
  api/index.js             # Vercel serverless function entry point (wraps the same app logic)
  vercel.json              # Vercel routing config: rewrites dynamic paths to api/index.js
  test/                    # node:test unit + integration tests (95 tests, no deps needed)
  shopify.app.toml         # Shopify CLI app configuration (scopes, webhooks, URLs)
```

## Setup

1. **Create the app in your Shopify Partner Dashboard** (or run
   `shopify app config link` if you have the Shopify CLI) and note its
   Client ID / Client Secret.
2. **Get a public HTTPS URL** pointing at this server — a tunnel
   (Cloudflare Tunnel, ngrok, `shopify app dev`) while developing, or your
   real domain in production. Shopify requires HTTPS for OAuth redirect URLs.
3. Copy the env template and fill it in:

   ```bash
   cp .env.example .env
   # edit .env: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, HOST
   ```

4. In the Partner Dashboard (or `shopify.app.toml`), set:
   - App URL: `${HOST}`
   - Allowed redirection URL: `${HOST}/auth/callback`
   - Scopes: `read_products,write_products,read_content,write_content`
   - Webhooks (`api_version` should match `SHOPIFY_API_VERSION` in `.env`):
     `app/uninstalled`, `app/scopes_update`, `customers/data_request`,
     `customers/redact`, `shop/redact` — all pointing at
     `${HOST}/webhooks/<topic>`.
5. Run it:

   ```bash
   npm start        # or: npm run dev   (auto-restarts on file changes)
   ```

6. Install it on a development store by visiting:
   `${HOST}/auth?shop=your-dev-store.myshopify.com`

## Running the tests

```bash
npm test
```

95 tests cover HMAC/session-token verification (forged signatures, expired
tokens, audience mismatches), admin-dashboard login/session-cookie
verification, the SEO scoring engine including the visibility check (every
status threshold), the broken-link extractor and checker (including a real
network call against a reachable URL, not just mocks — see below), the
path router (including a regression test for a route-shadowing bug that
was caught and fixed while building the admin API), and a full HTTP
integration suite that boots the real server and drives it through
OAuth-begin, a rejected forged OAuth callback, HMAC-verified and rejected
webhook deliveries, the session-token auth boundary on the merchant API,
and a full admin-dashboard login → view shops → revoke a shop → logout
flow — no mocking of the app's own code, no external network calls in the
test suite itself (the link-checker's own tests mock `fetch`; it was
additionally exercised against real URLs manually while building it).

## What's genuinely verified vs. what needs a real store

Everything in `src/lib/crypto.js`, `src/lib/seoScorer.js`, `src/lib/router.js`,
the OAuth redirect construction, and the webhook HMAC verification is
exercised by the automated test suite and by manual `curl` smoke tests
against a running instance (see the PR description for the transcript).

The Admin GraphQL query/mutation field names in `src/queries/*.js` are
written against Shopify's long-stable, documented Admin API surface
(`metafield`/`metafieldsSet` for SEO fields, `productUpdateMedia` for image
alt text). This sandbox has no network access to a real Shopify store or to
shopify.dev, so those exact calls could not be executed against live data
here — running `/api/dashboard` against a fake shop domain does correctly
attempt the real HTTPS GraphQL request and fails gracefully with a network
error, proving the whole request pipeline (session-token verification →
session lookup → GraphQL client → per-resource error handling) works.
**Before relying on this in production, install it on a Shopify development
store and click through Products/Collections/Pages/Blog posts once** — if
any field name has drifted in the API version you target, it will only
affect the one query string in `src/queries/` that needs updating, not the
surrounding app.

## Frontend

The embedded UI (`public/`) is plain HTML/CSS/JS with no build step. It
loads Shopify's App Bridge directly from `cdn.shopify.com` (the officially
supported script-tag integration) and calls `window.shopify.idToken()` to
attach a session token to every API request — the same mechanism a
Polaris/React app would use under the hood, just without the React/Polaris
dependency.

## Extending

- **Swap session storage**: everything goes through `src/lib/sessionStore.js`;
  replace its four methods with calls to Postgres/Redis/etc. for
  multi-instance deployments.
- **Add AI-generated suggestions**: `suggestSeoTitle`/`suggestSeoDescription`
  in `src/lib/seoScorer.js` are template-based on purpose (so the app works
  with zero extra API keys). Swap their implementation for a call to your
  LLM provider of choice if you want smarter copy.
- **Add more resource types**: follow the pattern in `src/queries/products.js`
  + the `RESOURCE_TYPES` map in `src/lib/resourceService.js`.
