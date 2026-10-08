> Updated configuration inventory: use GITHUB_CONFIGURATION.md. Dormant apply helpers require REPOSITORY_ACCEPTED_SHA matching SOURCE_SHA and offline validation. The workflow remains locked; this review authorises no deployment.

# Deployment is locked pending repository acceptance

## Current boundary

The owner has explicitly deferred all Cloudflare deployment until repository review is complete. `.github/workflows/deploy-staging.yml` is an inert manual-only workflow: no automatic trigger, secrets, remote migration, provisioning or deployment. Verification does not need or inspect Cloudflare credentials. The configuration below is future release preparation only.

Two new deployables: marketing and platform Workers. A successful build or Wrangler dry-run is not a hosted deployment. Legacy applications, domains and data are not touched by staging automation.

Initial GitHub verification found neither CLOUDFLARE_API_TOKEN nor CLOUDFLARE_ACCOUNT_ID configured. An authorised account connection is required before deployment. Never put credential values in source, issues, commits or chat.

## Local development

Use Node 22.22+ in the Node 22 line and the pinned pnpm version.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm local:init
pnpm dev
# Another terminal:
pnpm dev:marketing
```

Local init only targets Wrangler's local database. It creates a random gitignored .dev.vars encryption key and safe catalogue seeds. Unset prices mean request mode, not free services. `pnpm local:init --test-fixtures` is synthetic: test staff and a test inspection price. It cannot run remotely.

## Hosted staging

Configure the repository's GitHub staging environment:

| Secret                | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| CLOUDFLARE_ACCOUNT_ID | Intended Cloudflare account                                   |
| CLOUDFLARE_API_TOKEN  | Account-scoped Worker deployment, D1, R2 and Queue management |
| DATA_ENCRYPTION_KEY   | Stable backed-up 32-byte key encoded in base64                |
| RESEND_API_KEY        | Outbound email credential                                     |
| TURNSTILE_SECRET_KEY  | Server verification secret                                    |

The first two enable deployment. Remaining inputs enable real authentication and encrypted transactions. Set variables EMAIL_FROM (verified sender), EMAIL_SINK (controlled tester mailbox), and TURNSTILE_SITE_KEY (restricted to the staging hostname).

The account needs an existing Workers subdomain and service entitlements for Workers, D1, R2, Queues and SQLite Durable Objects. No DNS changes are included.

Authentication stays unavailable without provider/security configuration. There is no hosted development-login shortcut. Staging authentication is restricted to the controlled mailbox; never redirect another person's sign-in credential into a sink.

A reviewed deployment workflow must be deliberately reintroduced after explicit acceptance. Preserve exact-source verification, environment separation, additive migration order and hosted smoke checks. Do not restore an automatic deployment trigger simply because tests are green.

Existing encryption secrets are preserved rather than silently rotated. Missing inputs are configuration-required. A working skeleton without sign-in is not an accepted customer application. The receipt supplies actual URLs only after account resources are known.

## First hosted staff identity

Staff cannot self-register. After the designated operator signs in through the real provider, an authorised database operator provisions a staff profile for that verified user's ID. Use operations_manager for the initial operator and record the provisioning. No first-user administrator endpoint exists. After that bootstrap, an authorised administrator can manage verified-user Staff roles in the application; an ordinary account cannot elevate itself.

## Production is separate

Before production activation: independent resources and keys; approved terms/privacy; verified sender and Turnstile; confirmed prices, durations, hours and capacity; real user and private-file acceptance; backup/restore rehearsal; accepted SHA and prior deployment record.

Apply additive migrations before dependent code. Worker rollback does not revert D1 or R2. Domain activation, legacy booking redirects and imports require a separate accepted release. No importer may infer ownership or permissions from matching email/address text.

## Optional connected-workflow configuration

See INTEGRATIONS.md for Report Tool, Stripe and Apps Script secrets and receiving contracts. Keep RESTRICTED_WORKFLOWS_ENABLED unset/false until confidential-intake operating procedures, retention and legal/security release review are approved. None of these settings is required to run synthetic local acceptance.
