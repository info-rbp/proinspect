# GitHub secrets and variables

This inventory is derived from executable code and config/environment.json. It does not assert that any value is installed. Adding these values does not deploy the application: the Cloudflare workflow remains locked.

## Storage location

Create separate GitHub environments `staging` and `production` under repository Settings > Environments. Put credentials in Environment secrets and public settings in Environment variables. A later reviewed workflow must select the environment and explicitly pass values to the deployment helpers. Verification uses synthetic fixtures and needs none of the real credentials.

## Core secrets

| Name                           | Consumer                                      | Purpose                                                                                                                                             |
| ------------------------------ | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLOUDFLARE_API_TOKEN           | Future GitHub deployment job only             | Account-scoped deployment/provisioning token. Never send it to either Worker.                                                                       |
| DATA_ENCRYPTION_KEY            | Platform                                      | Exactly 32 random bytes encoded as standard base64. Used for private record/access/outbox encryption. Securely back it up before storing real data. |
| RESEND_API_KEY                 | Platform                                      | Credential for the implemented Resend email adapter; this build does not use a Cloudflare Email Service sending binding.                            |
| TURNSTILE_SECRET_KEY           | Platform                                      | Server verification for the application sign-in widget.                                                                                             |
| MARKETING_TURNSTILE_SECRET_KEY | Platform                                      | Server verification for the marketing enquiry widget. The marketing form submits through the platform security boundary.                            |
| ENQUIRY_GATEWAY_SECRET         | Both Workers, identical within an environment | Independent random HMAC secret for the marketing-to-platform enquiry transport. At least 32 characters.                                             |

The marketing Worker must not receive DATA_ENCRYPTION_KEY, payment/email-provider credentials or the Cloudflare token. Use separate staging and production encryption/signing keys.

## Optional integration secrets

| Name                  | Consumer                          | Required together with                                                                          |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| STRIPE_SECRET_KEY     | Platform                          | STRIPE_WEBHOOK_SECRET. Staging must use an `sk_test_...` key.                                   |
| STRIPE_WEBHOOK_SECRET | Platform                          | Signing secret, normally `whsec_...`, for `/api/webhooks/stripe`; it is not the Stripe API key. |
| REPORT_TOOL_SECRET    | Platform and external Report Tool | REPORT_TOOL_ORIGIN and a counterpart implementing the handoff/callback contract.                |
| SHEETS_WEBHOOK_SECRET | Platform and external Apps Script | SHEETS_WEBHOOK_URL and the corresponding Apps Script properties below.                          |

Use independent random signing values of at least 32 characters. Do not reuse the encryption key for HMAC. Manual PDF upload and recorded manual payment outcomes remain available without these optional integrations. Configuring keys is not acceptance of actual external delivery or payment settlement.

## Variables to enter

| Name                         | Staging                                                           | Production / meaning                                                                             |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CLOUDFLARE_ACCOUNT_ID        | Intended account's 32-character hexadecimal ID                    | Non-sensitive account identifier; classify consistently as a variable.                           |
| EMAIL_FROM                   | Verified sender, e.g. `ProInspect <noreply@your-verified-domain>` | Verified production sender. Do not use an unverified invented address.                           |
| OPERATIONS_EMAIL             | Controlled operations/test mailbox                                | Actual monitored ProInspect operations mailbox.                                                  |
| EMAIL_SINK                   | Required controlled test mailbox                                  | Leave unset/empty in production.                                                                 |
| TURNSTILE_SITE_KEY           | Public application widget key with staging hostname permitted     | Public application widget key with the accepted application domain permitted.                    |
| MARKETING_TURNSTILE_SITE_KEY | Public marketing widget key with staging hostname permitted       | Public marketing widget key for the website; the enquiry action is `enquiry`.                    |
| REPORT_TOOL_ORIGIN           | Optional test Report Tool HTTPS origin                            | Optional accepted production origin, no path/query/credentials; pair with REPORT_TOOL_SECRET.    |
| SHEETS_WEBHOOK_URL           | Optional deployed test Apps Script URL                            | Optional `https://script.google.com/macros/s/.../exec` URL; pair with SHEETS_WEBHOOK_SECRET.     |
| RESTRICTED_WORKFLOWS_ENABLED | `false`                                                           | Keep `false` pending full restricted-case, safe-contact, statutory and retention release review. |

The current staging sign-in policy permits the controlled sink recipient only. It never redirects another person's authentication token to that sink. Multi-person hosted testing requires a separately reviewed recipient policy, not removing authentication checks.

`REPOSITORY_ACCEPTED_SHA` is a future release-control variable. Leave it unset now. Dormant apply helpers require it to equal SOURCE_SHA exactly. This guard does not replace environment approval or a passing verification run.

## Generated values: not new secrets

APP_ENV is selected by release (`staging` or `production`, never hosted `local`). EMAIL_PROVIDER is `resend` for hosted deployments. SOURCE_SHA and BUILD_SHA come from the accepted commit. APP_ORIGIN is the platform origin in its Worker and the marketing origin in its Worker. MARKETING_ORIGIN is the marketing origin; PLATFORM_ORIGIN is consumed by marketing for application links.

Staging origins are derived from the real account subdomain and separate Worker names. Production targets remain `https://proinspect.systems` and `https://app.proinspect.systems`; accepted production configuration/domain attachment remains a later action, not something done by this review.

## Bindings are not passwords

DB is the D1 binding. DOCUMENTS and RESTRICTED_DOCUMENTS are separate private R2 buckets. SCHEDULER is the BookingScheduler Durable Object. EVENTS is the queue, with a dead-letter queue configured separately. Resource names and IDs belong in per-environment Wrangler configuration, not password secrets.

The future token must cover the intended account operations: Worker creation/editing and account subdomain lookup; D1 creation/query/migrations; R2 bucket creation; queue creation/configuration. Restrict it to the intended account. Cloudflare distinguishes creating/editing Workers in its permission model; confirm the current scopes for the release operations. Isolated staging does not change DNS or custom domains and therefore does not need zone/DNS change rights.

No user-created GitHub PAT is required for normal Actions authentication. Do not add SESSION_SECRET/JWT_SECRET, Firebase/Google Calendar credentials, R2 S3 key pairs, D1 passwords or a Stripe publishable key: this code does not consume them. The Stripe implementation uses hosted Checkout, and sessions use opaque hashed tokens persisted in D1.

## Values outside GitHub

Apps Script Script Properties: PROINSPECT_WEBHOOK_SECRET (the same value as the environment's SHEETS_WEBHOOK_SECRET) and PROINSPECT_SPREADSHEET_ID (the target spreadsheet). These are consumed by integrations/apps-script/Code.gs, not the Workers. No Google service-account credential is used.

The Report Tool separately needs its matching secret and accepted callback implementation. Resend needs the sender domain verified; Turnstile needs allowed hostnames; Stripe needs the webhook configured. Merely saving a key in GitHub does not configure those services.

## Offline checks

```sh
pnpm config:list
# Supply values securely in the process environment, not command arguments:
pnpm config:check
node scripts/configuration.mjs --check --groups=core,deploy,payments,reports,sheets
node scripts/configuration.mjs --check --production --groups=core,deploy
```

The checker reports missing names and format failures, never values, and makes no network calls. It checks optional pairs, independent signing values, encryption encoding, URLs, staging Stripe mode and the restricted-workflow default. It does not validate real account ownership or provider permissions.

For each new application-controlled key, generate an independent value locally using `openssl rand -base64 32`. Store it securely. Back up DATA_ENCRYPTION_KEY; replacing an existing key without a rotation migration strands encrypted records. Bootstrap preserves existing secrets, including encryption. If the shared gateway is configured on only one Worker, the installer stops for explicit reconciliation. Existing secret values cannot be read back for comparison.

Official platform references: https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets ; https://developers.cloudflare.com/workers/configuration/secrets/ ; https://developers.cloudflare.com/workers/wrangler/environments/ . Application-specific names are defined by this repository.
