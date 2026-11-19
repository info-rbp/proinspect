# Google Cloud foundation — 19 November 2026

Target: `proinspect-property-services` (project number `101236528395`), Sydney `australia-southeast1`.
Source: protected main `15382bea37d05b0a9533b040e6d79591a7883442`; migration branch only. PR #113 is already merged, superseding the prior plan's baseline. This foundation is an isolated proof, not an operational migration or a production release.

## Verified source and production baseline

`source-inventory.json` is generated from the exact Git commit by `node scripts/migration/inventory.mjs`. It includes every application/package manifest, 62 migration names, file SHA-256 hashes, and file/line references for D1, SQL dialect, storage, scheduling, crypto, and flags. `--check` verifies reproducibility. It finds 111 D1-dependent files (2,174 matching lines), 78 files with batches (346 matching lines), and 85 files with SQLite-specific patterns (980 matching lines). These are static pattern counts, not distinct SQL statements or a completeness proof for runtime behavior.

`cloudflare-baseline.json` records the read-only live inspection: 70 binding names/types, boolean flag values, deployment IDs/traffic and schedules. Secret values and nonboolean configuration values were not retrieved into this record. Deployment `ca709ef1-c0ac-4aa2-a693-cdc8b9078de3` sends 100% to Worker version `0df4d2f8-b582-4abf-98ae-73ae6ad7c3e6`. Existing D1, R2, Durable Object, scanner, payment settings and DNS remain untouched. No customer queries, object listing, database export, or secret access was needed.

Google access was renewed interactively. The project is active, billing enabled, billing currency AUD. Initial metadata inventory found no SQL instances, buckets, service accounts, or workload identity pools; several required APIs were disabled. After enabling foundation APIs, Run services, registries, secrets and Sydney Tasks/Scheduler lists were empty. A subsequent cross-project-type Cloud Asset inventory returned only service registrations, project/billing metadata, and the new foundation resources (including a Google-created default Compute service account with no project role). The asset index can lag and covers supported asset types; it is not proof that every external dependency is absent. No existing resource is imported or replaced.

## Implemented architecture

Terraform has separate bootstrap and foundation states. Bootstrap owns required APIs, a private versioned state bucket, a seven-day build-source bucket, two Artifact Registry repositories, and a narrowly scoped image builder. Foundation owns two Cloud Run services, six environment-specific service accounts, four private document buckets, two empty secret containers, two bounded queues, four paused cron jobs, GitHub federation, an error alert policy and an AUD 40/month project budget alert. Consult `delivery-status.json` for what was actually applied and deployed, including any failures.

| Boundary | Dev/staging foundation |
|---|---|
| Runtime | Existing React Router 8.4 routes compiled for Node 22.23.2; IAM required; zero minimum / one configured maximum instance; 1 CPU, 512 MiB; 8 request concurrency; 30s timeout |
| Routes | `/health`, three existing informational pages and their assets; `/` redirects to `/about`; `/internal/proof` is an authenticated no-op |
| Disabled operations | Authentication, booking, payments, customer APIs, forms and background application processing return 503/405 before dispatch |
| Storage | Separate ordinary/restricted buckets per environment; uniform access, enforced public-access prevention, versioning, no force destroy |
| Secrets | Empty per-environment encryption secret containers; no versions, application credentials or secret-access grants |
| Background | Separate queues: one concurrent dispatch, one dispatch/second, three attempts with bounded backoff; schedules retain UTC `*/2 * * * *` and `0 1 * * *`, paused, targeting only no-op proof |
| Identity | Runtime accounts have no project roles; deploy accounts can update/invoke only their existing service, act as only their runtime account and write only their image repository |
| CI trust | GitHub OIDC, immutable repository/owner IDs, exact migration branch, exact workflow and push events; environment subject binds dev/staging independently; no stored Google key |
| Logs | Structured event/status/duration only; no path, query, payload or credentials. Google-managed request logs remain platform metadata; use synthetic requests only |
| Cost controls | Scale to zero, small instance limits, paused schedules, image cleanup for old untagged images, expiring build source, budget thresholds 50/90/100% |

A configured maximum instance count is a capacity control, not a hard spending ceiling; transient excess and multiple revisions can occur. Budget notifications also do not stop billing. The alert policy is visible in Monitoring; no notification channel is configured. Default Cloud Logging retention applies. Tagged releases are retained intentionally for rollback and must be pruned after review.

External health checks use `/health`; internal container probes also accept `/healthz`. Google reserves some URL paths ending in `z`, which caused the first external health check to return its frontend 404; see [Cloud Run known issues](https://docs.cloud.google.com/run/docs/known-issues#reserved-url-paths).

No load balancer, CDN, Cloud Armor, DNS, VPC connector, NAT, KMS key or Cloud SQL instance is created in this proof. IAM protects the native Run endpoints. No durable business work may use Node fire-and-forget promises under request-based billing: future workers must acknowledge only after durable commit and use Tasks/outbox delivery.

## PostgreSQL feasibility decision

The focused spike uses actual PostgreSQL, synthetic data only, and explicit transactions. It is not a D1 compatibility shim, production schema or full port. `tests/migration/schema.sql` must only run in a new disposable `proinspect_spike*` database on loopback.

| Exact-source contract | Proof mechanism / acceptance |
|---|---|
| `worker/scheduler.ts` booking batch, `0001_core.sql` overlap triggers, `0003_connected_operations.sql` blocks | Resource row lock plus shared booking/block `tstzrange` exclusion constraint with `[)` boundaries; atomic booking/work-order/payment/audit/outbox; 20 competing requests produce one complete aggregate |
| Client/request key, actor/fingerprint replay | Transaction advisory lock plus unique key; identical concurrent retries replay; changed actor or payload fails |
| `packages/operations/core.ts` `changes()` mutation guard | Conditional `UPDATE` with exact `rowCount===1`; failure rolls back the whole transaction |
| `payment-lifecycle.server.ts` provider receipt/effect | Receipt uniqueness, payload hash and payment row lock; concurrent delivery once; injected late failure leaves no receipt or settlement |
| Payment amount/currency and refund monotonicity | Integer cents, constraints and `GREATEST`; bad currency/amount and excess refunds fail; out-of-order refund totals never decrease; late success cannot undo refunded state |
| `0062_finance_reviews_and_photo_annotations.sql` credit review | PL/pgSQL trigger preserves independent reviewer and immutable terminal-decision error contracts |
| `packages/auth/crypto.ts` | Unchanged v1 JSON envelope, 32-byte AES key, 12-byte IV and context AAD. Independent Node crypto fixture decrypts through existing WebCrypto code; wrong key/context/tampering fail |

Outcome: the selected invariants are reproducible in PostgreSQL; no fundamental incompatibility was observed. **Full migration remains NO GO** until all 62 migrations, triggers, authorization queries and real domain workflows have been ported and parity-tested. The spike models the source's invariants; it does not execute the full production booking/payment functions against PostgreSQL. Local PostgreSQL 18 and CI PostgreSQL 17 are recorded separately in delivery evidence.

Do not mechanically replace `?` with `$n`: SQLite `changes()`, scalar `MAX`, `strftime`, JSON validity/extraction, null-safe `IS`, `INSERT OR IGNORE/REPLACE`, integer booleans, trigger aborts and conflict targets need explicit decisions. Keep cents within JS safe integer limits; pg returns bigint as text. Use bounded connection pools, transaction deadlines and retries only for safe retryable SQLSTATEs. The spike intentionally lets reservation conflicts fail; it does not add broad automatic retries.

Remaining complex coverage includes recurring-plan version guards, entitlements, guest expiry/cancellation, concurrent authorization revocation, connected-account financial scopes, refund observation ordering, council approvals, double-entry constraints where applicable, and every immutable-history guard. A unified reservations relation is proposed to serialize booking/block conflicts; current domain identifiers and public errors must be retained by the eventual adapter.

## Cloud SQL plan and guardrails (not provisioned)

First synthetic instance: PostgreSQL 17 Enterprise, single zone Sydney, `db-f1-micro`, 10 GiB SSD, automated backups, seven-day retention, deletion protection, no public IP and no authorized public networks. This small shared-core tier has no SLA and is unsuitable for production or load acceptance. Plan a dedicated migration VPC/subnet and private service access; connect via Cloud Run Direct VPC egress and the Cloud SQL connector with IAM database authentication. Do not open database ports to the internet or use production credentials.

Before provisioning: verify Sydney quota/tier and current AUD SKU prices, review a saved Terraform plan, require an explicit SQL opt-in and approved monthly ceiling, set pool maximum 2 per service and database connection budget, cap disk growth at 20 GiB with disk alerts, and test restore. Separate instances/identities for dev and staging when both need a database; start with dev only. Synthetic key material must be independently generated and written directly to Secret Manager, never Terraform state. A production database needs a separate HA/backup/recovery design and measured sizing; no automatic promotion from the proof.

## Release flags and encryption continuity

The live flag register is preserved as evidence; the proof does not execute application feature gates. No enabled production feature is silently enabled on Google. No production secret is copied or rotated. Future migration must preserve the exact encryption envelope, key IDs/key ring, context AAD, signing algorithms, existing ciphertext bytes and token validation contracts. Retain old decryption keys until all records are validated. Separately audit `ACCESS_DATA_ENCRYPTION_KEY`, `ENCRYPTION_KEYS_JSON`, file/report signing and integration key aliases; a passing `DATA_ENCRYPTION_KEY` fixture is not proof for every contract.

## Costed design

Planning allowance in USD before tax, discounts, shared free tiers and currency conversion; billing is AUD and the actual Google AUD SKU price applies. Prices were checked against official pricing pages on 19 November 2026. These are explicit low-traffic assumptions, not a cost guarantee or observed bill.

| Component | Assumption | Monthly planning allowance USD |
|---|---|---:|
| Two Run proofs | 10k requests total, about 1s/response, 1 CPU/0.5 GiB, min 0 | $0–2 |
| Artifact Registry | 2–5 GiB retained images, about $0.10/GiB-month beyond shared free allocation | $0.20–0.50 |
| Storage | 5 GiB combined build/state/synthetic documents plus light operations | $0.20–1 |
| Scheduler | 4 paused jobs, $0.10/job-month before shared free allowance | $0–0.40 |
| Tasks | Empty queues, occasional synthetic deliveries | $0–0.10 |
| Secret Manager | Empty secret containers, no versions | $0 |
| Logging/Monitoring | Light synthetic traffic, no custom log payloads | $0–2 |
| Cloud Build | About 100 minutes/month; E2_MEDIUM list $0.003/min plus transfer | $0.30–2 |
| **Current proof total** | No SQL, load balancer or NAT | **roughly $1–8/month** |
| Future single tiny SQL | 730 instance-hours + 10 GiB + backups; Sydney quote required | **reserve $15–30/month extra** |

At continuous authorized traffic, two 1-vCPU services can cost hundreds of dollars/month despite the instance limit. Revisit the AUD 40 warning budget before load tests or adding SQL. No commitment or reservation is purchased.

Sources: [Cloud Run](https://cloud.google.com/run/pricing), [Cloud SQL](https://cloud.google.com/sql/pricing), [Storage](https://cloud.google.com/storage/pricing), [Scheduler](https://cloud.google.com/scheduler/pricing), [Tasks](https://cloud.google.com/tasks/pricing), [Secret Manager](https://cloud.google.com/secret-manager/pricing), [Artifact Registry](https://cloud.google.com/artifact-registry/pricing), [Cloud Build](https://cloud.google.com/build/pricing), [GitHub federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).

## Reproduce, deploy and roll back

1. Use Node 22.23.2 and pnpm 10.17.1; `pnpm install --frozen-lockfile` and `pnpm typecheck`.
2. `node scripts/migration/inventory.mjs --check`; `PROINSPECT_RUNTIME=node-proof pnpm --dir apps/platform exec react-router build`.
3. `node --experimental-strip-types --test tests/migration/node-proof.test.mjs tests/migration/encryption.test.ts`; `python3 scripts/migration/postgres-local.py` uses a disposable local cluster. CI uses PostgreSQL 17.
4. Authenticate with gcloud. `scripts/migration/terraform.py` passes a short-lived access token in memory. Initialize/plan bootstrap, inspect saved plan, apply. Bootstrap's state is migrated into its own bucket after first creation; see `infra/gcp/bootstrap/backend.tf`.
5. Build a clean exact commit with `python3 scripts/migration/build-proof.py <sha>`. It uploads only a Git archive. Resolve the resulting Artifact Registry digest.
6. Initialize foundation; pass `image`, `source_sha`, and `billing_account` via a local ignored tfvars file. Plan, inspect all changes, apply the saved plan. No production names or state are used.
7. GitHub workflow runs validation on branch pushes and relevant PRs. Deploy jobs require repository variable `GCP_FOUNDATION_READY=true` and environments `gcp-dev`/`gcp-staging`. Deploy is sequential, uses OIDC and exact image digests, and runs authenticated/anonymous checks. The infrastructure identity is not available to CI; CI cannot create SQL, grant IAM, read secrets or change buckets.
8. Run `python3 scripts/migration/hosted-smoke.py dev <sha>` and staging equivalent with authorized identity. Anonymous requests must fail. Never attach customer tokens/records.

For rollback, use `gcloud run services update proinspect-migration-dev --project=proinspect-property-services --region=australia-southeast1 --image=<previous verified digest> --update-env-vars=BUILD_SHA=<matching previous source>` (same process for staging), then rerun smoke. Pause deployment by setting `GCP_FOUNDATION_READY=false`. Do not destroy the state bucket or buckets with records. Terraform deliberately prevents accidental bucket/secret/Run deletion. Cloudflare is unaffected by any proof rollback. Any future production cutover requires a separate acceptance decision.
