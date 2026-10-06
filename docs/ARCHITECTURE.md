# Architecture v1

Decision date: 6 October 2026. Approved conversation requirements govern this rebuild.

Two independently deployable Workers live in one pnpm workspace. Marketing is public, server-rendered and has NO binding to operational D1, private R2 or application session secrets. It shares only public catalogue/types/UI. Platform owns authenticated workspaces and business operations. Browser code never imports database, auth-secret or storage modules.

Target domains: proinspect.systems (marketing), app.proinspect.systems (platform). Existing domains remain unchanged until explicit cutover. Cloudflare D1, private R2, restricted R2, SQLite Durable Objects, Queues, Turnstile and Worker secrets are the runtime. No Firebase, Express or Google Calendar dependencies.

One identity has independently verified, time-bounded relationships. Separate Landlord, Property Manager, Strata Manager, Tenant, Building, Council, Commercial and Staff UX does not create separate databases. Landlord means residential owner AND active self-manager. Owner, manager, tenant, resident and council member are not interchangeable.

Staff is added with every vertical slice. First acceptance: marketing service -> authentication -> self-management account -> property -> capacity-checked booking -> work order -> staff delivery -> private issued report -> recipient portal -> notification and audit.

No distributed transaction is assumed across D1, R2 or Queues. Use D1 atomic batches, database-level reservation exclusion, idempotency keys, recoverable file states and a transactional outbox.

Schemas evolve only through numbered forward migrations, not repeated rewrites. Changes to these core decisions require a short ADR. Legacy repositories remain untouched and are never fallback runtime stores.
