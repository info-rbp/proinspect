# Final sprint continuation - payment and acceptance safeguards

Baseline: merged PR #55 at `25ed21b8c768b75dcba7a182f758ad4404abd752` (tree `37773eb60a41b9ba603b020c0cd7f78a8cdc914f`). Its full CI 40435811499 and isolated staging 40436302128 passed; 47 browser cases passed without failures, flakes or skips. Production BUILD_SHA was independently observed at the merged source.

## Changes

- One anchored, bounded test-credential policy accepts restricted (`rk_test_`) and ordinary (`sk_test_`) sandbox keys, rejects live/publishable/empty/trailing-input values, and validates webhook-secret shape. A syntactically valid key is not evidence of account access or successful provider execution.
- Self-managing landlord sandbox onboarding now requires the pinned sandbox account, verifies the actual provider account before writes, and uses bounded requests and the existing pinned API version. It still cannot collect rent or move funds. Existing account configuration is unchanged.
- Billing self-service requires `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`. Before creating a session, the server verifies the account and fetches this exact configuration. It permits only invoice history and payment-method updates, requires a disabled public login page, and rejects subscription/identity edits or any newly enabled capability. A default Stripe configuration is never selected implicitly.
- Readiness shows the configuration identifier's name, not its value or any credential. All customer activation and release approvals remain separate.
- Hosted council acceptance now uses the deployed `strata-council` workspace kind and a real council denial route, rather than the nonexistent `/council` namespace. It cannot certify genuine human authentication from a local fixture.

## Verified Stripe configuration (read-only)

The existing sandbox configuration is `bpc_1UUzPZEv62nbUZokIB3IDWfq`, named **ProInspect isolated staging billing**. Its return URL is the isolated staging origin plus `/workspaces`. Invoice history and payment-method updates are enabled; customer updates, subscription updates/cancellation/pause and public login are disabled. Select this non-secret identifier in staging only after the new source is deployed. Do not create a duplicate configuration.

The sandbox Tax settings still report `pending` with missing `head_office`. No tax registration was made, no GST readiness flag enabled and no payments initiated. Neither hosted Worker had Stripe API or webhook secrets in the observed configuration. Use a least-privilege sandbox restricted API key and endpoint-specific signing secret via the platform secret store; never commit credentials.

## Verification and remaining work

New pure policy and acceptance regressions pass locally. Worker tests exercise unrelated-client denial, remote configuration drift rejection and exact customer/configuration binding. Full exact-source CI and staging remain mandatory before merging. This change does not modify the 44 applied migrations, rates, entitlements, legal approvals or production activation flags.

PCR campaign #56, hosted provider tests, approved commercial and legal terms, nine-role human acceptance, reporting parity, financial accounting and the recovery rehearsal remain separately tracked by #54. A merged repair must not be described as full application launch acceptance.
