# ProInspect

A clean Cloudflare-native rebuild: one identity, one relationship-aware property graph, one operational engine and purpose-built workspaces.

The first slice implements **marketing -> sign-in -> self-managing landlord -> property -> booking -> work order -> Staff -> private PDF report -> landlord**. It also implements invited-tenant maintenance requests. Professional, strata, building, council and commercial experiences remain tracked in the capability ledger, not enabled placeholders.

## Applications

- apps/marketing: public service discovery, server-rendered content and booking handoff.
- apps/platform: authenticated workspaces and business API.
- packages: shared domain, authorization, encryption, catalogue and design system.
- database/migrations: numbered relational D1 migrations.

Target domains: proinspect.systems and app.proinspect.systems. This source does not automatically change either live domain.

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

See [DEPLOYMENT.md](docs/DEPLOYMENT.md). Staging automation only provisions new proinspect-v2-staging-* resources. Real Cloudflare credentials and application provider configuration are required. There is no hosted login bypass and no automatic production cutover.

## Authoritative contracts

- [Architecture](docs/ARCHITECTURE.md)
- [Domain model](docs/DOMAIN_MODEL.md)
- [Authorization](docs/AUTHORIZATION.md)
- [Portal definitions](docs/PORTALS.md)
- [Launch sequence](docs/LAUNCH_SCOPE.md)
- [Implemented and outstanding capabilities](docs/BUILD_STATUS.md)

The old repositories are references only. No Firebase/Firestore, Express, Google Calendar or GCP deployment runtime was brought into this rebuild. Historical import, Report Tool automation and optional Sheets projection are separate later slices.
