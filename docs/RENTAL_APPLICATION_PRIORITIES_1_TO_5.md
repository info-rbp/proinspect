# Rental application priorities 1-5 — implementation and activation contract

Branch: `feature/rental-applications-priorities-1-5-20261025`. All changes are isolated from production. This is an additive extension to the Version 3 rental implementation.

1. **Listing authority**: the instructing organisation's written instruction is referenced and explicitly attested by an authorised administrator; the designated recipient must separately prove possession of the configured email inbox. Changes to application settings revoke previous approval. Historical approval snapshots remain immutable.
2. **Private scanning**: uploads stay in restricted R2 and are scanned by a separately approved HTTPS scanning endpoint using a Worker-side credential. Results must match the uploaded document's digest. No vendor access is enabled by merging this branch.
3. **Agency handoff**: an immutable application revision is bound to an approved recipient, with replay protection, retries and an authenticated Apps Script email dispatch. An acceptance receipt means the mail send API accepted a message, **not proof of inbox delivery**. Documents are never sent as public R2 links or ordinary email attachments.
4. **Privacy**: retention policies and collection text require business/legal approval. Recovery for expired applicant links must not reveal whether an email address is present. Application withdrawal cancels pending undelivered handoffs. Purging has explicit administrative review.
5. **Outcomes**: a verified decision of the agency/landlord is recorded by authorised operations staff; ProInspect does not select tenants or make tenancy offers.

**Release gates**: production `RENTAL_APPLICATIONS_ENABLED=false`, and external scanning and handoff switches must remain disabled until the receiving organisation, legal/privacy disclosures, retention periods, scanner data processor, Google Workspace sender/recipient controls, and isolated live end-to-end evidence have been approved. Do not disclose real applicant information to test recipients.

Official reference: WA Consumer Protection Form 18 remains a *helpful, non-mandatory field guide*. The product is the **ProInspect Residential Rental Application**.
