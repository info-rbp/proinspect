# Marketing enquiries and scheduled notices

## Boundary

The marketing contact page is public. An enquiry is not a booking, account registration, property ownership claim or management delegation. It never grants a workspace. Staff may link an existing client after verification; that link is internal context only. Enquiry permission covers responding, not promotional subscriptions.

Contact details, messages, internal notes and reply bodies are encrypted in D1. Audit and generic Staff alerts contain references, not contact payloads. Only active operations managers and administrators can view the queue. Inspectors, ordinary users and unrelated portals are denied server-side.

## Request path

`marketing /contact -> signed platform /api/public/enquiries -> encrypted record + immutable history + Staff notification/outbox -> Staff queue -> triage or explicit reply`

A dedicated shared ENQUIRY_GATEWAY_SECRET signs the raw envelope and a short-lived timestamp. The platform checks expected marketing origin, payload limits, retry-key idempotency and bounded hashed-source/email rate limits. Hosted environments verify Turnstile success, hostname and enquiry action. Marketing requires MARKETING_TURNSTILE_SITE_KEY; the platform requires MARKETING_TURNSTILE_SECRET_KEY. Never share DATA_ENCRYPTION_KEY with marketing.

Local initialization generates synthetic development keys in ignored .dev.vars files and preserves existing keys. No keys are committed or installed remotely by repository workflows.

## Notice path

`authorised scheme operator -> notice + dispatch job -> due-time recipient batches -> portal alert + encrypted mail job -> delivery-time membership recheck -> provider adapter`

Recipients are checked against scheme, role, active membership dates, lot/building targeting and verified active user. Multiple roles produce one delivery per notice. Council content is available in the Council workspace, not inherited by the Building workspace through a second membership.

Dispatch runs after application writes and from the scheduled Worker handler. Future notices never notify early. Batches are bounded to five jobs and 25 users per job. A lease and transactional cursor permit interrupted-pass recovery. Membership is checked at batch time and before delivery; the portal remains authoritative for newly granted membership. These are operational notices, not a statutory legal-service mechanism.

Withdrawal removes portal visibility and alerts, cancels fan-out and suppresses pending delivery. Expiry and revocation suppress pending mail too. Already accepted email cannot be recalled. Emails contain no notice body; they link to authenticated workspace access.

Managers see dispatch and delivery counts. Retry targets failed work in bounded batches and never recreates sent/suppressed receipts. Historical notices are marked dispatched during migration to avoid unexpected old emails. Create a new notice for a materially revised announcement.

## Delivery and release boundaries

`sent` means accepted by the configured email adapter (or simulated locally), not read by a recipient or confirmed by a mailbox delivery webhook. No real provider or deployment is exercised in repository verification. Cron timing, domain keys, sender verification, retention/erasure and real delivery acceptance remain release tasks.

Enquiry history is immutable in the ordinary API. Retention/erasure tooling is a separate privacy design task; no indefinite retention claim or automatic deletion promise is made.
