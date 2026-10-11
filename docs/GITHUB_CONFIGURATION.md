# Cloudflare production configuration (direct Git deployment)

**No GitHub Actions deployment workflow is used.** GitHub `main` triggers Cloudflare Workers Builds for `proinspect-platform`. Existing GitHub API tokens may stay in GitHub, but Cloudflare's Git integration does not automatically load them as Worker secrets. The build uses Cloudflare's own connected build token.

## Cloudflare build settings

The build and deploy commands, branch, monorepo root and Node version are specified in [DEPLOYMENT.md](DEPLOYMENT.md). Optional Cloudflare Workers Builds variable `PROINSPECT_APP_ORIGIN` sets the exact public HTTPS application origin when it differs from `https://app.proinspect.systems`. `WORKERS_CI_COMMIT_SHA` is supplied automatically by Cloudflare and recorded as `BUILD_SHA`. No manual `REPOSITORY_ACCEPTED_SHA`, `CLOUDFLARE_ENV` GitHub environment or separate GitHub Actions connection step is needed.

## Cloudflare Worker runtime secrets

Set these on **`proinspect-platform` in Cloudflare**, not only in GitHub:

| Name | Purpose |
| --- | --- |
| `DATA_ENCRYPTION_KEY` | 32 random bytes encoded as standard base64; **back up securely** and never replace inadvertently once encrypted data exists. |
| `RESEND_API_KEY` | Real outbound email, including magic-link login and notices. |
| `TURNSTILE_SECRET_KEY` | Verify sign-in challenge requests. |
| `MARKETING_TURNSTILE_SECRET_KEY` | Verify marketing enquiry challenge requests when that workflow is enabled. |
| `ENQUIRY_GATEWAY_SECRET` | Independent HMAC signing key shared with the separate marketing Worker. |

Optional runtime secrets, once configured and accepted: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `REPORT_TOOL_SECRET`, `SHEETS_WEBHOOK_SECRET`. Keep secret values out of source, chat and plaintext GitHub variables. `RESEND_API_KEY` cannot be replaced with the previous app's Cloudflare `EMAIL` binding without implementing a different provider adapter.

## Cloudflare Worker runtime variables

| Name | Purpose |
| --- | --- |
| `EMAIL_FROM` | Verified sender identity in Resend. |
| `OPERATIONS_EMAIL` | Monitored operations mailbox. |
| `TURNSTILE_SITE_KEY` | Public application challenge site key permitted on the deployed hostname. |
| `MARKETING_TURNSTILE_SITE_KEY` | Public marketing enquiry site key. |
| `REPORT_TOOL_ORIGIN` | Optional, HTTPS Report Tool origin (pair with signing key). |
| `SHEETS_WEBHOOK_URL` | Optional, approved Apps Script endpoint (pair with signing key). |

The direct Wrangler environment already sets `APP_ENV=production`, `EMAIL_PROVIDER=resend` and `RESTRICTED_WORKFLOWS_ENABLED=false`. Do **not** set an `EMAIL_SINK` in production. The custom application domain must be attached separately if that hostname is intended. Do not rotate encryption/HMAC secrets through source changes.

## Resource bindings

`DB`, `DOCUMENTS`, `RESTRICTED_DOCUMENTS`, `SCHEDULER` and `EVENTS` are Cloudflare resources, **not passwords**. Wrangler now requests automatic provisioning of new production resources. The first deployment must be followed by database migrations and catalogue initialization. See [DEPLOYMENT.md](DEPLOYMENT.md).

The marketing Worker is a separate Cloudflare deployment and will require its own Git connection and the same `ENQUIRY_GATEWAY_SECRET` if marketing enquiries are used. The connected platform build does not silently deploy marketing or attach domains.

## Local development

Local `.dev.vars` and the original top-level Wrangler configuration remain separate from Cloudflare. `pnpm local:init --test-fixtures` is synthetic and never targets the remote database. GitHub Actions `Verify ProInspect` continues to run local integration and browser tests, but has no Cloudflare deployment step.