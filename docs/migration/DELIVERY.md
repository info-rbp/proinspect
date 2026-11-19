# Foundation delivery — 19 November 2026

The isolated Google Cloud foundation is deployed and verified in `proinspect-property-services`, Sydney (`australia-southeast1`). It serves three existing informational pages through the Node React Router build. Customer, authentication, booking and payment routes remain unavailable.

## Repository and deployment

- Branch: [`migration/google-cloud-foundation`](https://github.com/info-rbp/proinspect/tree/migration/google-cloud-foundation), created from protected main `15382bea37d05b0a9533b040e6d79591a7883442`.
- Tested and deployed implementation: `a0d6ba05a3ff2365777c9e3e4d2fa5d284b6c9fd`. A documentation-only commit follows it; nothing was merged.
- [Successful CI run](https://github.com/info-rbp/proinspect/actions/runs/44521118781): verification, dev deployment and staging deployment passed. Both environments receive the same tested container artifact, promoted by digest.
- Image digest: `sha256:11d5d49eecfbd50de303a1801a6ab7aaecd96492937681d1abe39452727bab9c`.

| Environment | Cloud Run service | Ready revision |
|---|---|---|
| dev | `proinspect-migration-dev` | `proinspect-migration-dev-00003-2l8` |
| staging | `proinspect-migration-staging` | `proinspect-migration-staging-00003-hpx` |

The service endpoints require Google IAM authentication. Each service scales to zero, with a configured maximum of one 1-CPU / 512-MiB instance. All operational application routes are blocked before dispatch.

## Resources actually created

Terraform manages 58 resources, including API registrations and IAM grants. These comprise two Cloud Run services, two image repositories, six private buckets (four document buckets plus build and state buckets), seven scoped service accounts, two empty secret containers, two bounded Tasks queues, four paused Scheduler jobs, GitHub federation, a Monitoring error policy and an AUD 40 monthly budget alert. Google also created a default Compute service account; it has no project role.

No Cloud SQL instance, production secret version, DNS record, load balancer or production resource was created. SQL has a private-network, capacity and cost-guarded design awaiting a separate provisioning decision. The [complete resource register](provisioned-resources.json) contains every managed address and resource ID. [Delivery evidence](delivery-status.json) records service URLs, source/image refs, GitHub environment rules, checks, fixes and remaining work.

## Verification and cost

- Existing repository checks: 365 Node tests and 86 Python tests passed, along with typecheck and the existing Cloudflare builds.
- Final CI: exact-source inventory check, Node build, two route/encryption tests, ten PostgreSQL 17 transaction test groups, Terraform validation and guardrails, container startup and both deployments passed. Local PostgreSQL 18 also passed the ten synthetic transaction groups.
- Hosted checks: ten per environment passed, including anonymous rejection, page rendering, operational-route denial and a harmless background endpoint.
- Tasks and Scheduler each delivered one harmless request per environment with HTTP 204. All four schedules are paused.
- Both Terraform states report no changes. Six buckets have enforced public-access prevention; runtime identities have no project roles; the two secret containers have zero versions.
- Low-traffic planning allowance: roughly USD 1–8/month before tax and currency conversion, excluding SQL. The AUD 40 budget sends warnings; it does not cap spending. See the [cost assumptions and architecture](README.md).

## Migration boundary

The selected PostgreSQL booking and financial invariants pass. This is a feasibility result using simplified source-derived transactions; the full schema and real domain workflows still need to be ported and parity-tested. Storage, background processing, scanner and external-service adapters also remain future work. Monitoring has an error policy but no notification channel.

Cloudflare was rechecked at `2026-11-19T12:06:48.789Z`: the original main source, deployment traffic, all 70 binding names/types and boolean release flags match the baseline. This work made no changes to Cloudflare production, DNS, active payment settings, production keys, customer data or protected main. No production cutover occurred.
