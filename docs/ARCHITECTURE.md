# Architecture v1

Decision date: 6 October 2026. Approved conversation requirements govern this rebuild.

One Cloudflare Worker (`proinspect-platform`) serves the complete customer-facing website: the original server-rendered marketing routes plus authenticated workspaces and operational APIs in a single React Router route tree, a single session origin and a single GitHub `main` deployment. The marketing route source remains in `apps/marketing` to preserve content, SEO and optional independent source-build checks, but **no separate marketing Worker is deployed**. Public browser code never imports database, auth-secret or storage modules; the unified Worker handles contact submissions server-side and retains signed validation, Turnstile and authorisation.

Target domain: proinspect.systems for both public marketing and all account/portal routes; the existing Workers.dev origin is usable until the custom hostname is activated. Domain routing remains an explicit Cloudflare action. Cloudflare D1, private R2, restricted R2, SQLite Durable Objects, Queues, Turnstile and Worker secrets are the runtime. No Firebase, Express or Google Calendar dependencies.

One identity has independently verified, time-bounded relationships. Separate Landlord, Property Manager, Strata Manager, Tenant, Building, Council, Commercial and Staff UX does not create separate databases. Landlord means residential owner AND active self-manager. Owner, manager, tenant, resident and council member are not interchangeable.

Staff is added with every vertical slice. First acceptance: marketing service -> authentication -> self-management account -> property -> capacity-checked booking -> work order -> staff delivery -> private issued report -> recipient portal -> notification and audit.

No distributed transaction is assumed across D1, R2 or Queues. Use D1 atomic batches, database-level reservation exclusion, idempotency keys, recoverable file states and a transactional outbox.

Schemas evolve only through numbered forward migrations, not repeated rewrites. Changes to these core decisions require a short ADR. Legacy repositories remain untouched and are never fallback runtime stores.

Implementation details and release safeguards: [UNIFIED_SITE.md](UNIFIED_SITE.md).