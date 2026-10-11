# V2 WP5 — Capital delivery, enterprise portfolio controls and reporting

**Development only.** Migration `0010_v2_capital_enterprise.sql`, Staff `enterprise-intelligence` route and authenticated `v2-intelligence` APIs.

## Capital works

- Programme planning is tied to an active, verified commissioning service engagement, with a fixed **AUD cents** budget baseline. An independent administrator (not the drafting staff member) must record a legitimate funding/authority reference before approving.
- A programme can contain scoped projects linked to canonical assets and work orders. Projects require independent approval and track estimated cost, milestones, external commitments and immutable forecast revisions.
- Every capital commitment is a proposal until another authorised staff member records client approval. In one database transaction, the amount of all approved commitments in the programme may not exceed its approved baseline. Unverified contractors cannot receive approved commitments. Milestones must be verified or formally deferred before project completion.
- Approved commitment **does not create a payment, procurement order, trust transaction or legal permission** to spend. The existing approval, invoice and payment integrations remain distinct.

## Reporting and enterprise configuration

- Verified client-specific portfolio groups reference only property/scheme relationships valid for that client. They provide reporting organisation, not cross-client document or workflow access.
- Live Staff dashboards aggregate actual work-order pipeline, maintenance task statuses, approved labour and external costs, asset condition/estimated replacement exposure, scheduled capacity, preventive plans due, tracked compliance reviews/evidence gaps, asset risks, sector rollout states and capital baseline/commitments.
- Monthly trend views and configurable saved report definitions have a bounded lookback (1–366 days) and optional client, market or portfolio scope. Report snapshots are immutable with their source period, filters and generation timestamp. Management can export a guarded, audited, aggregated CSV with no user contact details, access credentials, rent/trust balances or private documents.
- KPIs are computed from observed operations; if no activity exists, they show zero or missing values, never fabricated trends. Reviewed external evidence in a compliance register is **not legal certification**, and budgets/commitments are **not cash flow**.

## Enterprise boundaries

The operational BI and capital-controls foundation is implemented, not a complete accounting, procurement, payroll, contractor payment or ERP suite. Route optimisation, machine-learning forecasting, automated contractual customer notices, external procurement systems, regulatory/clinical attestations and public launch remain separate integrations and acceptance milestones.

Security: Staff operations management only, with administrator-only capital approvals and CSV export audit. Other client workspaces continue using the already scoped basic operational reporting route. No staging/production deployment is performed by these source changes.
