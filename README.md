# ProInspect

A clean Cloudflare-native rebuild: one identity, one relationship-aware property graph, one operational engine and purpose-built workspaces.

The repository now contains the original booking-to-report workflow plus connected Landlord, Tenant, Property Manager, Commercial, Strata Manager, Building, Council and Staff operations. Access follows approved relationships, not a public role selector. See [BUILD_STATUS.md](docs/BUILD_STATUS.md) for implemented behaviour and explicit remaining limits.

**Cloudflare Workers Builds deploys `apps/platform` directly from `main` to the existing `proinspect-platform` Worker.** GitHub Actions remains verification-only. The first live deployment provisions new resources but does not migrate historical data or attach DNS.

## Applications

- apps/marketing: canonical public service content and route modules, reused by the deployed platform SSR router (not a separate deployed website).
- apps/platform: the single deployed Worker, public marketing homepage, sign-in, all workspaces and operational API.
- packages: shared domain, authorization, encryption, catalogue and design system.
- database/migrations: numbered relational D1 migrations.

Target domain: proinspect.systems for both marketing and all customer accounts. The existing Worker.dev alias is usable until that custom hostname is attached.

## Start locally

Use Node 22.22+ within the Node 22 line and the pinned package manager.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm local:init
pnpm dev
# Another terminal:
pnpm dev:marketing
```

`pnpm local:init --test-fixtures` creates synthetic test data only. It cannot be applied remotely and is not approved pricing or real staff provisioning. Local secrets are generated into ignored .dev.vars files.

## Verify

```sh
pnpm check
pnpm test:integration
pnpm exec playwright install --with-deps chromium
pnpm local:init --test-fixtures
pnpm test:browser
```

CI builds both Workers, tests local D1/R2/Durable Object workflows, checks upload dry-runs and exercises the browser journey. Reports and screenshots are retained in verification artifacts.

## Deploy

Use Cloudflare's existing Git connection to `main`, not a GitHub Actions connection workflow. The platform build is `CLOUDFLARE_ENV=connected pnpm --dir apps/platform build`; deploy is `pnpm --dir apps/platform exec wrangler deploy`. The connected environment is **production**, with automatic D1/R2/Queue provisioning. [Deployment instructions](docs/DEPLOYMENT.md) cover initial database migrations and runtime secrets.

## Authoritative contracts

- [Architecture](docs/ARCHITECTURE.md)
- [Domain model](docs/DOMAIN_MODEL.md)
- [Authorization](docs/AUTHORIZATION.md)
- [Portal definitions](docs/PORTALS.md)
- [Launch sequence](docs/LAUNCH_SCOPE.md)
- [Implemented and outstanding capabilities](docs/BUILD_STATUS.md)

The old repositories are references only. No Firebase/Firestore, Express, Google Calendar or GCP deployment runtime was brought into this rebuild. Historical import and hosted release remain separate approval steps. [Connected workflows](docs/CONNECTED_WORKFLOWS.md) and [integration contracts](docs/INTEGRATIONS.md) explain the new cross-portal behaviour.

## Scope review and environment configuration

Read [the scope review](docs/SCOPE_REVIEW.md) for implemented workflows and deliberate remaining gaps. [GitHub configuration](docs/GITHUB_CONFIGURATION.md) lists the exact core and optional secrets, public settings, Worker targets and external integration properties. `pnpm config:list` is safe offline; `pnpm config:check` validates supplied process variables without printing values or contacting providers. Runtime secrets must be configured on the Cloudflare Worker; GitHub-only secrets are not passed to Cloudflare Builds.
## Google Admin portal testing aliases

Eight owner-created `@proinspect.systems` email aliases can be prepared as isolated test Landlord, Property Manager, Strata Manager, Tenant, Resident, Council, Commercial and Staff accounts using the explicit one-time SQL and verification instructions in [Portal testing](docs/PORTAL_TESTING.md). This source addition does **not** auto-provision live D1 or bypass verified email sign-in. There is no Cloudflare Actions connection workflow.
