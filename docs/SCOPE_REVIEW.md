# Final scope review

This is source and regression review, not a certificate that every discussed ambition or production gate is complete. Baseline: ad7baa66517699664af7900a70657074b31d7861. Use Verify ProInspect on the final merged commit for authoritative acceptance. Deployment stays locked.

## Coverage

| Area                          | Executable coverage                                                                                                                                                | Remaining boundary                                                                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Marketing                     | Catalogue, 23 services, sectors, signed enquiries, category/engagement/guide pages, sitemap and mobile navigation                                                  | Approved pricing/legal content, analytics, original evidence/media and final visual approval.                                                         |
| Identity and workspaces       | One verified identity; distinct Landlord, Property Manager, Commercial, Tenant, Strata Manager, Building, Council and Staff contexts; account and session controls | Role names never substitute for a real approved relationship.                                                                                         |
| Landlord                      | Self-managed residential onboarding, property, tenancy, service booking, work requests, approvals and report delivery                                              | Not rent/trust accounting or an unrestricted replacement for professional management.                                                                 |
| Property Manager / Commercial | Reviewed organisation/team scope, imports, bounded bulk bookings, recurring plans, work and finance                                                                | 20-property import/bulk limit; branches, multi-resource scheduling and consolidated invoices remain.                                                  |
| Tenant                        | Invitations, scoped requests/evidence, published inspections, issued PDFs and PCR responses                                                                        | Full reviewed statutory catalogue, legal service/lodgement and retention remain.                                                                      |
| Strata / Building / Council   | Schemes, lots, common areas, dated memberships, issues, delegated work, targeted scheduled notices, recommendations and recorded outcomes                          | Recommendations are not statutory voting; levies/accounting/AGM are non-goals. Facility reservations and parcel/social functions are not implemented. |
| Core operations               | Guarded Booking + Work Order, assignment, change/cancellation, reports, approval gates and audit                                                                   | One capacity resource; no travel optimiser.                                                                                                           |
| Documents                     | Private storage, explicit recipient grants, revisions and scoped downloads; manual quarantine                                                                      | Quarantine and signature checks are not antivirus; scanning, advanced retention and restore/rotation procedures remain.                               |
| Staff                         | Organisation review, relationships, operational search, delivery, document review, enquiry follow-up and integration recovery                                      | Not an independent complete security assessment.                                                                                                      |
| Finance/integrations          | Integer-cent records, signed Stripe adapter, signed Report Tool callback, allowlisted Apps Script projection and provider tests                                    | Real settlement/refund/email/counterparty acceptance remains; D1 is authoritative.                                                                    |
| Shared UI/UX                  | Responsive shells, guarded forms, contextual record browsing/reporting, accounts and mobile marketing menu                                                         | Final owner design approval, comprehensive accessibility and production performance measurement remain.                                               |

## Repairs in this pass

- Professional booking/request screens retained a Landlord-only UI gate despite working APIs. They now support authorised professional workspaces; strata bookings require a current unambiguous scheme context.
- Building/Council document lists previously combined the same person's roles. Scoped lists/download endpoints now require the selected workspace's specific grant. A dual-role user cannot retrieve a council-only document through the Building endpoint. Legacy identity-scoped links remain separately authorised; legitimate identity roles are not revoked by switching workspace.
- Property details depended on the dashboard's limited array. Independent scoped record endpoints now support direct lookup. The searchable record browser paginates full properties, bookings, requests, work orders, documents and schemes with scope checked before count and pagination.
- Operational reports now count all scoped records rather than samples. Recorded service-payment totals are not rent/levies or complete accounting.
- Profile/report-email preferences and other/all-session revocation are implemented without exposing tokens or changing identity/authority. Mandatory transactional communications remain enabled.
- Operations staff can find inactive services for reconfiguration without publishing them to customers.
- Encryption encoding handles large envelopes in bounded chunks rather than exceeding JavaScript argument limits.
- Missing category/engagement/resource routes and mobile marketing navigation are implemented; editorial content remains for review and includes no invented prices/testimonials.
- Runtime configuration is inventoried in config/environment.json. Offline validation covers formats, pairs, secret targets and safe release defaults. Dormant staging helpers map current inputs, preserve existing secrets and require an accepted SHA before any apply action.

## Acceptance

The suite retains all prior tests and adds five helper/configuration tests, ten runtime checks and three browser journeys. Totals: 19 helper/security tests, 10 SQL tests, 76 local Worker/D1/R2/DO checks, 11 browser journeys, both production builds and upload dry-runs. Only a passing run for the exact source proves acceptance. Provider requests use controlled doubles, not live service credentials. Local browsers may be policy-restricted; GitHub browser evidence is authoritative.

## Conclusion

The agreed portal family and principal connected service workflows are represented in source. It remains inaccurate to call the whole originally discussed product complete: statutory/retention, scanning, multi-resource scheduling/branches/consolidation, analytics, business-approved content and final design are substantive remaining work, not missing secrets. The capability ledger preserves those boundaries. No deployment is authorised by this review.
