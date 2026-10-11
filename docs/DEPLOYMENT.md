# Deploy ProInspect directly with Cloudflare Workers Builds

## One deployment path

`info-rbp/proinspect` -> **`main`** -> Cloudflare Workers Builds -> existing **`proinspect-platform`** Worker.

This does **not** use a GitHub Actions deployment workflow, a manual connect operation, a separate release branch, or a staging environment. GitHub Actions only runs source verification. The marketing application is a separate Worker and requires its own Git connection when ready.

Cloudflare dashboard -> Workers & Pages -> `proinspect-platform` -> Settings -> Build:

| Setting | Value |
| --- | --- |
| Repository | `info-rbp/proinspect` |
| Branch | `main` |
| Root directory | `/` |
| Build command | `CLOUDFLARE_ENV=connected pnpm --dir apps/platform build` |
| Deploy command | `pnpm --dir apps/platform exec wrangler deploy` |
| Node version | `22.23.2` (also pinned by `.node-version`) |

`connected` is solely the Wrangler configuration identifier for the already connected Worker. It is **not a staging Worker**. It explicitly sets `name=proinspect-platform` and `APP_ENV=production`. Cloudflare's Vite plugin selects it at build time and generates the deployment configuration consumed by Wrangler. Do **not** run `wrangler deploy --env connected` against a Vite-generated deployment: that flag is too late.

## First deployment automatically creates resources

Wrangler 4.147 supports automatic provisioning of D1, R2 and Queues when IDs or bucket names are omitted. The named `env.connected` bindings request these resources directly as part of `wrangler deploy`:

- `DB`: new `proinspect-platform-data` D1, **not** any earlier application database.
- `DOCUMENTS`: newly provisioned private R2 bucket.
- `RESTRICTED_DOCUMENTS`: separate newly provisioned private R2 bucket.
- `EVENTS`: `proinspect-platform-events` Queue and `proinspect-platform-events-dlq` dead-letter Queue.
- `SCHEDULER`: SQLite-backed `BookingScheduler` Durable Object.

The new database does not inherit any historic tenant or client records. **Do not point this application at a legacy database.** Cloudflare displays generated IDs and bucket names in its dashboard; they are not committed into source by Workers Builds. The expected first-deploy log should say `proinspect-platform` and `APP_ENV=production`, with no `local` database or localhost URL bindings.

Deploying to the **existing** Worker replaces its code. The old `cf-v1` Durable Object migration history is not copied or deleted automatically; a migration warning may require follow-up. Existing legacy data will not become available in the new application simply because the Worker name was retained. Do not enable real users until the database schema and required providers are configured.

## Database schema after initial resource creation

A newly auto-provisioned D1 database is empty. After Cloudflare has created the binding, apply the committed numbered SQL migrations and the shared service catalogue **before using the app**. With Wrangler authenticated to the correct Cloudflare account and the generated resource identity visible:

```sh
pnpm --dir apps/platform exec wrangler d1 migrations apply DB --env connected --remote
pnpm catalogue:sql
pnpm --dir apps/platform exec wrangler d1 execute DB --env connected --remote --file ../../artifacts/catalogue.sql
pnpm --dir apps/platform exec wrangler d1 execute DB --env connected --remote --command "INSERT INTO schedule_resources(id,name,active) VALUES('default','ProInspect booking capacity',1) ON CONFLICT(id) DO NOTHING;"
```

Because Workers Builds does not commit automatically generated D1 IDs to Git, the migration CLI may require you to supply the **actual DB UUID/name** from Cloudflare's D1 dashboard if the `DB` binding cannot be resolved from the source config. Do not invent a UUID, and verify the selected database before executing remote SQL. Catalogue inserts are idempotent and do not overwrite approved service configuration. Automatic provisioning is a deployment convenience, **not automatic schema migration**.

## Runtime configuration belongs to Cloudflare

GitHub secrets do **not** automatically appear in a Worker deployed through Cloudflare's native Git integration. Configure runtime credentials under Cloudflare Worker settings (Secrets and Variables), not GitHub Actions. See [GITHUB_CONFIGURATION.md](GITHUB_CONFIGURATION.md) for the required names.

The default app origin in this repository is `https://app.proinspect.systems`. If the custom hostname is not routed to this Worker yet, supply `PROINSPECT_APP_ORIGIN` as a **Cloudflare build variable** with the exact HTTPS origin of the deployed Worker. Its value is applied to the generated configuration during Workers Builds; production authentication redirects require the correct public origin. Do not confuse a build variable with a runtime secret.

Real authentication requires at least the `DATA_ENCRYPTION_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, and an approved sender; privileged user administration remains controlled. Optional Stripe, Report Tool and Sheets integrations require their own real-provider acceptance. No secrets or credentials are written to GitHub source.

## Verify deployment

Inspect the Cloudflare deployment log: Worker `proinspect-platform`, `APP_ENV=production`, real D1/R2/Queue bindings and no references to `local`. After schema initialization, confirm `/api/health` shows all bindings and `/api/catalogue` returns the configured services. Then verify sign-in and an actual authorised booking/document workflow on the selected public URL. A successful build does not by itself establish correct runtime configuration, database schema or user acceptance.

Sources: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ ; https://developers.cloudflare.com/workers/wrangler/configuration/ ; https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/ ; https://developers.cloudflare.com/d1/reference/migrations/ .