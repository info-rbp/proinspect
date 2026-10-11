# Unified public marketing site and property platform

## One website, one Worker, one GitHub deployment

`info-rbp/proinspect` -> `main` -> Cloudflare Workers Builds -> existing `proinspect-platform` Worker.

There is **no second marketing deployment or marketing hostname**. The platform's React Router route table reuses the original, maintained marketing route modules in `apps/marketing/app/routes`, including every service page, category, sector, engagement, guide, contact page, legal/information page, `robots.txt` and `sitemap.xml`. The `apps/marketing` source tree can still be compiled independently for regression purposes; it is **not** published as another site. The public header and footer are presented by `apps/platform/app/routes/public-layout.tsx` inside the platform SSR root.

Public: `/`, `/services`, `/services/:slug`, `/services/category/:family`, `/sectors/:sector`, `/resources`, `/resources/:guide`, `/how-we-work/:model`, `/how-it-works`, `/contact`, `/about`, `/privacy`, `/terms`, `/why-proinspect`, `/areas-we-service`, `/sitemap.xml`, `/robots.txt`.

Authenticated: `/signin`, `/auth/complete`, `/onboarding`, `/book/:serviceId?`, `/workspaces`, `/account`, `/w/:kind/:scopeId/...` and `/api/...` remain unchanged and relationship-authorised. Sign-in, service booking, and workspace links are relative URLs on the **same browser origin**, so they do not require cross-domain cookies, iframe proxies or cross-Worker navigation.

## Production URL and Cloudflare Builds

One public address is planned: `https://proinspect.systems`. The established Worker remains named `proinspect-platform` and has the exact connected-resource bindings and historical Durable Object migrations currently deployed. Do not delete or recreate D1, the inherited `DOCUMENTS` bucket, `proinspect-platform-restricted-documents`, or the `cf-v1` class to achieve the site consolidation.

The existing Cloudflare Builds settings are unchanged:

- Repository/branch: `info-rbp/proinspect`, `main`
- Root: `/` (pnpm workspace root)
- Build: `CLOUDFLARE_ENV=connected pnpm --dir apps/platform build`
- Deploy: `pnpm --dir apps/platform exec wrangler deploy`
- Node.js: `22.23.2`

The `connected` label selects the existing Worker configuration, **not** another environment. No GitHub Actions deployment is necessary.

Until the custom domain is routed, the default `APP_ORIGIN` is the confirmed Cloudflare Worker URL `https://proinspect-platform.delicate-dream-e4c9.workers.dev`. This supports same-origin links, origin checks and signed-in cookies on that URL. `scripts/deploy/prepare-direct.mjs` automatically sets `MARKETING_ORIGIN` and `PLATFORM_ORIGIN` to **exactly the same** `APP_ORIGIN` during the Cloudflare build.

After the owner attaches `proinspect.systems` as the Worker custom domain in Cloudflare, set **Cloudflare Workers Builds build variable** `PROINSPECT_APP_ORIGIN=https://proinspect.systems` and redeploy from `main`. Check that Turnstile accepts the active hostname. The canonical marketing content already points at `proinspect.systems`; the Workers.dev alias and all customer workspace routes carry `noindex` headers to prevent duplicate public indexes or leaking private page metadata.

There is no need for `app.proinspect.systems` or a separate marketing Worker. Any legacy `app.` URL should only be redirected after checking old sign-in links and trusted origins; redirects are not automatically added by this repository.

## Fully functioning public enquiry workflow

`/contact` uses the same validated form and marketing Turnstile, consent, honeypot, rate limits, HMAC envelope, request idempotency, encrypted D1 records, and Staff enquiry triage as before. The unified route invokes the **existing validated `receiveEnquiry` server function in-process**, not through an HTTP call to another Worker. The public `/api/public/enquiries` endpoint continues to enforce its own signed-gateway authentication if accessed directly.

The **single deployed Platform Worker** needs the following runtime configuration to make the form usable in production (not merely render its UI):

- `DATA_ENCRYPTION_KEY` (stable, backed-up standard base64-encoded 32-byte key)
- `ENQUIRY_GATEWAY_SECRET` (independent random signing key of 32+ characters)
- `MARKETING_TURNSTILE_SECRET_KEY` and `MARKETING_TURNSTILE_SITE_KEY` valid for the **active** hostname and action `enquiry`
- The migrated D1 schema, seeded service catalogue, and initial authorised Staff identity to process submissions
- Optional `OPERATIONS_EMAIL` and real Resend settings for notifications and replies

These are Worker runtime secrets/variables in Cloudflare. GitHub secrets are not automatically inherited through native Cloudflare Builds. No provider secrets or domain/DNS changes are committed to the repository. An incorrectly configured form returns a guarded unavailable response; it never accepts unverified enquiries or stores sensitive information in a public CMS.

## Crawl, privacy and caching

The marketing homepage and public content have the original metadata, canonical links and sitemap. Marketing pages are eligible for indexing **only** when accessed at `https://proinspect.systems` in the production Worker; preview URLs and all account, booking, Staff and API pages remain `noindex`. `robots.txt` permits indexing only on the canonical production domain, otherwise it disallows all crawlers. The existing security headers and no-store policy remain in place for all SSR pages to avoid caching user sessions or reusable CSP nonces.

## Repository acceptance

CI builds both source applications (the standalone marketing build is a compatibility check), but only the unified Platform Worker is deployed. The browser suite exercises public service pages and category content, the contact form to Staff, and the original authorised account/booking/document journeys **on a single localhost origin**. Source-check tests verify the marketing route coverage, noindex boundary, shared origin and in-process signed enquiry dispatch.

GitHub verification of an exact commit is not proof of hosted D1 migration, Turnstile hostname acceptance, a live email sender, production operations, legal-content approval, or domain activation. Do not claim those are complete without checking them in Cloudflare.