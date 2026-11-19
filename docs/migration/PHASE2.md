# PostgreSQL and Google Cloud adapters

The full schema is available for fresh dev and staging databases. Both hosted databases are off in `proinspect-property-services`. The Cloud Run services use their own Google resources in Sydney. Database-backed business routes stay closed and all four scheduled jobs are paused. No customer data was used.

## Deployment

GitHub verified and deployed source `d0122958552302a67677144239180b5f51017bc3` from `migration/google-cloud-foundation`. Both services pin the same tested image index, `sha256:f3068e9ac245c77645c639ae3b0950f20de466f242f4e12e1d5c2b527faec615`. Cloud Run resolved its Linux AMD64 image to `sha256:6b55b675a2df591411fbcd8ae099641e3de766ff67bddfe911b636c3b26a7ef1` in both revisions. The protected main reference is `15382bea37d05b0a9533b040e6d79591a7883442`. [GitHub Actions run](https://github.com/info-rbp/proinspect/actions/runs/44536442061)

| Environment | Ready revision | Hosted results |
|---|---|---|
| Dev | `proinspect-migration-dev-00007-5x7` | 11 checks passed, including anonymous rejection, both storage buckets, multipart upload, the mounted key and task submission. The queue delivered its synthetic event with HTTP 204. |
| Staging | `proinspect-migration-staging-00006-jtq` | The same 11 checks passed. Its own queue also delivered the synthetic event with HTTP 204. |

The application pins each browser origin to its environment's project-number Cloud Run hostname. Both authenticated health and adapter checks use the same deployed service. [Dev](https://proinspect-migration-dev-101236528395.australia-southeast1.run.app) · [Staging](https://proinspect-migration-staging-101236528395.australia-southeast1.run.app)

## Schema and transaction evidence

Replaying all 62 checked-in D1 migrations against an empty SQLite database produces 318 tables, 2,985 original columns, 852 foreign keys, 202 named indexes, 471 application triggers and 871 built-in rows. The PostgreSQL baseline includes those objects and rows. The catalog records the SHA-256 of each source migration and maps each trigger to its PostgreSQL name. The runner applies versioned SQL under a transaction and advisory lock, checks recorded checksums on replay and refuses an untracked database with existing public tables. [Source catalog](../../database/postgres/source-catalog.json) · [PostgreSQL baseline](../../database/postgres/migrations/0001_platform.sql) · [Migration runner](../../apps/platform/node/google/migrations.mjs)

The port preserves integer cents, original timestamp strings, signed JSON text, case-insensitive email uniqueness and deferred references. An extra identity column retains approval ordering where SQLite used `rowid`. PostgreSQL statement triggers serialize nonproduction writers, and the booking adapter locks before reading availability. This favors correctness for the two-connection pool. Production throughput and recovery require separate measurement. [Schema generator](../../scripts/migration/postgres-schema.py) · [PostgreSQL adapter](../../apps/platform/node/google/postgres.mjs)

| Verification | Observed result |
|---|---|
| Schema and seed comparison | All source tables and columns, foreign key columns/actions/deferral, primary and unique keys, NOT NULL columns, CHECK counts, named index uniqueness/partial status, trigger mappings and built-in row values matched. Deployment-time seed timestamps were normalized. Every translated trigger expression resolved against PostgreSQL. |
| Application SQL | PostgreSQL prepared 1,719 distinct, complete SQL statements extracted from the application. Dynamically assembled branches have coverage only where exercised by a fixture. |
| Domain behavior | 58 existing SQLite scenarios replayed 825 synthetic operations in PostgreSQL, comparing returned rows and expected failures. |
| Booking and payment | Six concurrent registered-owner booking requests produced one booking and one AUD 132.00 obligation. Six signed synthetic settlement deliveries produced one paid event. A different account was denied and invalid signatures and amounts were rejected. The original D1 journey also passed locally. |
| Encryption | The existing AES-256-GCM v1 envelope decrypted with its original context. A wrong key, wrong context and altered ciphertext were rejected. |
| Infrastructure | Three Terraform tests cover the default cost controls, zero hosted databases by default, and the optional private instance limits. |

PostgreSQL 17 runs as a disposable GitHub Actions service. A separate disposable PostgreSQL 18.3 cluster passed the full local suite. The repository checks also passed 365 Node tests, 86 Python tests, type checking and both existing Cloudflare builds. These checks use synthetic fixtures and require no live Stripe or Google Calendar account. [Parity and workflow tests](../../tests/migration/phase2.test.mjs) · [CI workflow](../../.github/workflows/google-cloud-foundation.yml)

## Hosted infrastructure

| Binding | Dev and staging behavior |
|---|---|
| Node and React Router | Each private Cloud Run service renders the three proof pages, accepts its IAM-authenticated adapter check and exposes its source revision on authenticated health. The same Node entry point can invoke the existing application API, React Router, scheduled and queue handlers with a database. |
| Documents | Each runtime has object access only to its own normal and restricted buckets. The adapter supports metadata, generation-pinned reads, writes, deletes, and sequential multipart uploads used by the report bridge. The hosted check writes fixed bytes under a random `migration-checks/` name and removes the live object. Bucket versioning preserves noncurrent generations. Check objects become eligible for lifecycle deletion after one day. The buckets also have seven-day soft delete. Real-document erasure and retention still require acceptance before importing records. |
| Tasks and Scheduler | Each runtime enqueues IDs on its own throttled queue. The queue pins dispatch to its own service and uses its own invoker identity. Acknowledged work returns 204, retryable work returns 503. Each Scheduler target calls the original outbox or daily handler. Database-dependent schedules stay paused. |
| Secrets and flags | Each service reads version 1 of its own independently generated 32-byte synthetic key. Terraform holds the references. The Node build copies the 41 boolean gates from the checked-in staging configuration into both Google environments. All 41 are false at this revision. Provider account IDs, production keys and live releases were excluded. |
| Private scanner | The transport supports the signed health and scan protocols, preserves nonce and content, obtains a Google identity token for the fixed environment-specific endpoint, and blocks redirects. Local tests covered both requests. The scanner engine and its signing identity have not been deployed on Google. |
| Logging and IAM | Logs identify the service, revision, outcome and fixed diagnostic operation. The runtime's data grants apply to its own buckets, secret, queue and task identity. GitHub uses separate workload identities for each deployment. |

Terraform now manages 74 resources across its two states. This phase added six API registrations to state and ten environment-scoped IAM grants, updated twelve existing resources, and destroyed zero. Both final plans reported no changes. The final synthetic storage check found zero live probe objects across all four buckets. The [delivery evidence](phase2-delivery.json) lists resource IDs, revisions, task delivery times and scoped grants. The protected Cloudflare deployment still served its original main revision at the final read-only comparison. Its 70 binding names/types, 35 boolean flag values, compatibility settings, schedules and traffic matched the original inventory. The migration made no changes to DNS, active payments, production keys or customer records.

## API activation and budget

The bootstrap configuration now manages 19 Google API registrations. This phase enabled Cloud SQL Admin, Compute Engine, Service Networking, Cloud Billing and Google Calendar, and brought the already-enabled Cloud Storage API under Terraform management. Cloud Run, Tasks, Scheduler, Secret Manager, IAM, federation, logging, monitoring, build and registry APIs are enabled. The project inventory counted 45 enabled APIs including existing registrations and dependencies. Compute Engine initialized the project's default auto-mode network. The migration uses no virtual machines, dedicated SQL network or Cloud SQL instances. Enabling Calendar did not connect a calendar. [API configuration](../../infra/gcp/bootstrap/main.tf)

Each Cloud Run service has a minimum of zero instances and a configured maximum of one, with one vCPU, 512 MiB of memory and concurrency eight. Tasks are limited to one dispatch per second, one concurrent dispatch and three attempts. The existing AUD 40 project budget warns at 50%, 90% and 100%. Charges can exceed the alert. Cloud SQL contributes AUD 0 in instance, disk and backup charges with the current configuration.

Google's Sydney catalog returned AUD 0.020176070 per instance-hour for zonal PostgreSQL shared-core micro (SKU `C8A3-6946-1357`), AUD 0.326085075 per GiB-month of SSD (`DDA2-F693-0417`), and AUD 0.153451800 per GiB-month of backups (`B33D-D12C-4CAA`). At 730 hours, 10 GiB SSD and 10 GiB backups, the estimate is AUD 19.52 for one instance or AUD 39.05 for two before tax, network traffic and the rest of the project. The earlier low-traffic, non-SQL planning allowance was about USD 1–8 per month. The two new active secret versions add up to about USD 0.12 per month before the shared billing-account free allowance and access operations. Actual billing depends on usage, retained images and regional rates. [Google Cloud SQL pricing](https://cloud.google.com/sql/pricing) · [Secret Manager pricing](https://cloud.google.com/secret-manager/pricing)

## Reproduce the verification

With Node 22.23.2, pnpm 10.17.1, Python 3 and local PostgreSQL 17 or 18 binaries with the citext extension installed, run these commands from the repository root.

```sh
pnpm install --frozen-lockfile
python3 scripts/migration/postgres-local.py --full
node --experimental-strip-types --test tests/migration/node-proof.test.mjs tests/migration/encryption.test.ts
```

For future schema changes, retain the checksum of any applied baseline and add a numbered PostgreSQL migration with updated parity checks.

The helper checks the generated baseline, builds the Node application and creates a fresh UTF-8, C-locale PostgreSQL cluster on loopback. It runs the transaction spike and full schema suite, then stops and discards the cluster. The checked-in workflow runs the equivalent tests on PostgreSQL 17, builds the container once and promotes the tested digest into each environment.

The applied Terraform inputs are `adapters_enabled=true`, `sql_environments=[]`, `sql_serving=[]` and `sql_allowance_aud=0`. Bootstrap and foundation use their existing private state. A fresh deployment needs its own synthetic key versions before enabling the adapters. The initializer writes directly to Secret Manager and verifies the pinned version by metadata. The application image embeds its exact source SHA. CI changes the image only. [Terraform foundation](../../infra/gcp/foundation) · [Key initializer](../../scripts/migration/initialize-google-keys.py)

For a repeat hosted verification, use an identity with Cloud Run invoker access and the exact deployed source SHA. These checks write disposable synthetic objects and enqueue one synthetic task per environment.

```sh
python3 scripts/migration/hosted-smoke.py dev "$DEPLOYED_SHA"
python3 scripts/migration/hosted-smoke.py staging "$DEPLOYED_SHA"
```

Cloud SQL IAM login, private connectivity, backup restore, load behavior, customer-data transfer and a production cutover remain unverified. The optional Cloud SQL design uses private IP and IAM login, a single-zone PostgreSQL 17 shared-core instance, a 10 GiB SSD with growth capped at 20 GiB, seven retained backups and a two-connection application pool. Terraform gates both provisioning and application access. [Cloud SQL configuration](../../infra/gcp/foundation/postgres.tf)

The live business routes, email, payment, scanner and calendar integrations have not been activated on Google.
