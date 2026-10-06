# Integration contracts

No live integrations are deployed by repository verification. Secrets are runtime configuration, never source constants. Test credentials in tests are explicitly synthetic.

## Report Tool

A writable Staff workspace can request `POST /api/w/staff/operations/work-orders/:id/report-handoff`. Assignment scope is checked. Configure `REPORT_TOOL_ORIGIN` as an approved HTTPS origin and `REPORT_TOOL_SECRET` as a shared signing secret. The response has a URL ending `/proinspect/handoff?payload=...&signature=...` and an expiry.

`payload` is base64url JSON with handoff ID/token, work-order ID, property/scheme context, expiry and callback URL. The outbound signature is hex HMAC-SHA256 over the encoded payload string. The receiving Report Tool must verify the signature, expiry and expected callback origin before using the context. No access codes or confidential tenancy evidence are in the handoff.

Return the PDF to `POST /api/integrations/report-tool/callback` as multipart fields `handoffId`, `token`, `title`, `file`. Sign the exact multipart bytes, including their boundary. Headers:

- `x-proinspect-timestamp`: current Unix seconds, accepted within five minutes.
- `x-proinspect-signature`: hex HMAC-SHA256(secret, timestamp + '.' + hex SHA256(raw request bytes)).

The platform checks the signature, current Staff authority, token and unexpired handoff before recording the PDF in private R2 and issuing its document grant. Consumption is coupled to document issuance. A replay with the same content hash returns the same document; a different report on the consumed handoff is rejected. The counterpart Report Tool must implement this contract; no changes to its separate repository are included here. Manual Staff upload remains functional without integration configuration.

## Sheets / Apps Script projection

D1 is authoritative. `integration_deliveries` contains an allowlisted projection with identifiers, references and operational statuses only. No names, email addresses, access instructions, request detail, forms or restricted evidence enter this delivery stream. Configure `SHEETS_WEBHOOK_URL` to an approved Apps Script execution URL and `SHEETS_WEBHOOK_SECRET` to the shared secret.

The scheduled dispatcher leases bounded batches and posts version, event ID, kind, entity ID, timestamp, payload and signature. The canonical signature input is `[timestamp,eventId,kind,entityId,JSON.stringify(payload)].join('.')`; signature is hex HMAC-SHA256. The receiver must reply `{ok:true,eventId:<same id>}`. Failures retry with bounded backoff, then require an authorised Staff retry. The application transaction does not depend on Sheets availability.

`integrations/apps-script/Code.gs` is the receiving source. Script Properties are `PROINSPECT_WEBHOOK_SECRET` and `PROINSPECT_SPREADSHEET_ID`. The receiver locks the script, validates freshness/signature/allowlist, deduplicates event IDs, rejects changed replay and appends to a `ProInspect Events` sheet. This is a new projection contract; it does not silently overwrite the earlier operational workbook or send emails itself. Map the projection into approved workbook tabs only after separate workbook acceptance. Receiver unit tests use Google-service doubles, not the live account.

## Payments

Optional configuration: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Non-production code rejects live Stripe keys. Checkout is initiated by an authorised customer through its payment record, using stored integer-cent AUD amounts. The returned URL is restricted to Stripe Checkout. Register the `POST /api/webhooks/stripe` endpoint with the required checkout payment events in a future hosted release.

The callback verifies Stripe's raw-body timestamped signature, test/live mode, stored session, payment/client references, currency and amount. Event receipts are deduplicated. Redirecting to a success page cannot set payment status. Manual ledger reconciliation is a separate Staff function, not an API for moving or refunding funds. Production settlement, refunds and broader asynchronous payment-method acceptance remain release work.

## Email

The existing encrypted mail outbox, Queue consumer and provider adapter remain in use. Outbox failure never rolls back completed operational work. Staging must use its controlled mailbox; production never uses local sign-in links. Provider delivery and real recipient behaviour require hosted acceptance.
