# ProInspect

A clean Cloudflare-native rebuild: one identity, one relationship-aware property graph, one operational engine and purpose-built workspaces.

The repository now contains the original booking-to-report workflow plus connected Landlord, Tenant, Property Manager, Commercial, Strata Manager, Building, Council and Staff operations. Access follows approved relationships, not a public role selector. See [BUILD_STATUS.md](docs/BUILD_STATUS.md) for implemented behaviour and explicit remaining limits.

**Cloudflare deployment is locked pending the owner's repository acceptance.** CI executes local runtime and browser tests only; no Cloudflare resources, customer data or public domains are changed.

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

The deployment workflow is an inert manual-only lock. It loads no credentials and cannot provision, migrate or deploy. [DEPLOYMENT.md](docs/DEPLOYMENT.md) records the future release requirements, not an instruction to deploy now.

## Authoritative contracts

- [Architecture](docs/ARCHITECTURE.md)
- [Domain model](docs/DOMAIN_MODEL.md)
- [Authorization](docs/AUTHORIZATION.md)
- [Portal definitions](docs/PORTALS.md)
- [Launch sequence](docs/LAUNCH_SCOPE.md)
- [Implemented and outstanding capabilities](docs/BUILD_STATUS.md)

The old repositories are references only. No Firebase/Firestore, Express, Google Calendar or GCP deployment runtime was brought into this rebuild. Historical import and hosted release remain separate approval steps. [Connected workflows](docs/CONNECTED_WORKFLOWS.md) and [integration contracts](docs/INTEGRATIONS.md) explain the new cross-portal behaviour.

## Scope review and environment configuration

Read [the scope review](docs/SCOPE_REVIEW.md) for implemented workflows and deliberate remaining gaps. [GitHub configuration](docs/GITHUB_CONFIGURATION.md) lists the exact core and optional secrets, public settings, Worker targets and external integration properties. `pnpm config:list` is safe offline; `pnpm config:check` validates supplied process variables without printing values or contacting providers. Adding secrets does not enable the locked deployment workflow.
