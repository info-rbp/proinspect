# Deploy ProInspect directly with Cloudflare Workers Builds

## One deployment path

`info-rbp/proinspect` -> **`main`** -> Cloudflare Workers Builds -> existing **`proinspect-platform`** Worker.

This does **not** use a GitHub Actions deployment workflow, a manual connect operation, a separate release branch, or a staging environment. GitHub Actions only runs source verification. The original marketing source remains available, but the public marketing pages now ship in the **same deployed Platform Worker**. See [Unified site](UNIFIED_SITE.md).

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

- `DB`: `proinspect-platform-data` D1, created during the initial deployment attempts, **not** an earlier application database.
- `DOCUMENTS`: the ordinary private R2 binding inherited by the existing Worker; verify its bucket identity before storing customer files.
- `RESTRICTED_DOCUMENTS`: reuse the **existing** private R2 bucket `proinspect-platform-restricted-documents` by explicitly setting `bucket_name` in `env.connected`.
- `EVENTS`: `proinspect-platform-events` Queue and `proinspect-platform-events-dlq` dead-letter Queue.
- `SCHEDULER`: SQLite-backed `BookingScheduler` Durable Object.

The first Cloudflare deployment log reported `DOCUMENTS (inherited)` for the ordinary R2 binding; verify its bucket identity in Cloudflare before issuing reports, because an inherited bucket is not guaranteed to be newly created. This configuration does not overwrite or erase that bucket.

### R2 retry fix (Cloudflare error 10004)

The failed 11 October deployment created `proinspect-platform-restricted-documents` but did not complete the Worker deployment. A later build attempted to **create the same bucket again**, returning `The bucket you tried to create already exists, and you own it` (10004). The source now explicitly binds `RESTRICTED_DOCUMENTS` to that existing bucket using `bucket_name`, preventing repeat provisioning. Do not delete/recreate the bucket to bypass the error; it may contain objects. The direct-build preflight and regression tests prevent accidentally removing this binding or reusing that bucket for ordinary documents. `DOCUMENTS` remains inherited and must be checked separately in Cloudflare.

The new database does not inherit any historic tenant or client records. **Do not point this application at a legacy database.** Cloudflare displays generated IDs and bucket names in its dashboard; they are not committed into source by Workers Builds. The expected first-deploy log should say `proinspect-platform` and `APP_ENV=production`, with no `local` database or localhost URL bindings.

Deploying to the **existing** Worker replaces its code. The existing `proinspect-platform` Worker already applied `cf-v1` to the SQLite-backed `BookingCoordinator` Durable Object class. The `connected` configuration now retains that exact historical migration and adds `BookingScheduler` with a subsequent, separate `v1` migration. Both classes are exported, so Cloudflare need not delete or rename old Durable Object storage. The legacy class is retained as a read-only compatibility export: legacy booking requests return HTTP 503 rather than executing against the new D1 schema. There is no automatic migration of old booking data, pending work or stored objects; review historical records before future retirement. Existing legacy data will not become available in the new application simply because the Worker name was retained. Do not enable real users until the database schema and required providers are configured.

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

The default app origin is the confirmed `https://proinspect-platform.delicate-dream-e4c9.workers.dev` Worker URL until `proinspect.systems` is attached to this same Worker. After attaching `proinspect.systems` to the Worker, set `PROINSPECT_APP_ORIGIN=https://proinspect.systems` as a **Cloudflare build variable** and redeploy so origin checks, the public enquiry form and sign-in work on the canonical single-domain website. Its value is applied to the generated configuration during Workers Builds; production authentication redirects require the correct public origin. Do not confuse a build variable with a runtime secret.

Real authentication requires at least the `DATA_ENCRYPTION_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, and an approved sender; privileged user administration remains controlled. Optional Stripe, Report Tool and Sheets integrations require their own real-provider acceptance. No secrets or credentials are written to GitHub source.

## Verify deployment

Inspect the Cloudflare deployment log: Worker `proinspect-platform`, `APP_ENV=production`, real D1/R2/Queue bindings and no references to `local`. After schema initialization, confirm `/api/health` shows all bindings and `/api/catalogue` returns the configured services. Then verify sign-in and an actual authorised booking/document workflow on the selected public URL. A successful build does not by itself establish correct runtime configuration, database schema or user acceptance.

Sources: https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ ; https://developers.cloudflare.com/workers/wrangler/configuration/ ; https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/ ; https://developers.cloudflare.com/d1/reference/migrations/ .
## Unified public website

The established Cloudflare build/deploy commands above now ship both the complete marketing site and all private account/workspace routes in one Worker. `/` is the marketing homepage, `/services` is the 23-service catalogue, `/contact` uses the existing encrypted/signed Staff enquiry workflow in-process, and `/signin`, `/book`, `/w/...` remain on the same origin. Public SEO is indexable on `https://proinspect.systems` only; the Workers.dev alias and private routes are not indexed. The original marketing application is still built in repository verification but is not deployed separately. See [UNIFIED_SITE.md](UNIFIED_SITE.md). Runtime Marketing Turnstile settings are required on the **Platform Worker** for live public submissions.

## Google Admin test portal access

See [Portal testing](PORTAL_TESTING.md) for the eight owner-created email aliases, test-only relationship seed, verification query and privileged Staff revocation procedure. These scripts are deliberately **not** deployment hooks or numbered migrations; they are applied only once, explicitly, against the confirmed live `DB` D1 binding, after schema migration. Email authentication, sender and Turnstile secrets must be configured directly on the Worker.
