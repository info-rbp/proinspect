# Property application routing

Configure each property in the staff leasing register before accepting applications.

- **ProInspect-managed residential property:** choose the secure ProInspect application method, confirm direct management, record the signed management instruction and authorised recipient, and configure the tenancy-database notice. An administrator must verify the recipient and record the management approval against the current listing version.
- **ProInspect-managed commercial property:** prepare the commercial application flow with direct management confirmed and the property's authority, recipient, collection notice, provider disclosure and retention settings.
- **Property managed by another party:** select the external application method and save the approved HTTPS application URL. This link takes precedence over native intake.
- **No approved method:** retain the expression-of-interest option.

Management approval is scoped to the property and instructing client. A previous approval without direct-management confirmation does not enable native intake. Changing application settings is recorded in the staff audit trail; a stale edit cannot overwrite newer settings.

Native intake also requires the existing approved privacy notice, retention settings, provider configuration and release controls. Configuring an application method does not invent these approvals or enable missing services.

Public listing cards, property details and open-home session responses omit landlord and representative identities. Private staff records and application collection notices retain the information needed for authorised handling and informed consent. The public inspection disclaimer remains:

> ProInspect conducts the advertised open inspection on this representative's behalf. All rental terms and applications are managed by the responsible party.

## Migration 0055

`0055_commercial_applications.sql` adds the commercial application schema without modifying existing records. It seeds no permissions, management authority, recipients, applications or activation flags.

The release rehearsal uses an isolated local D1 database and recovery copy. Hosted deployment uses the existing staging and production databases, with a recovery bookmark captured before migration and schema, record-count and foreign-key checks afterwards. Recovery artifacts remain outside version control.

## Managed residential launch

The owner confirmed that Units 6 and 16 at 273 Fulham Street are directly managed by ProInspect, requested persistent backend tags, waived independent PR review, and authorised creation of the privacy and retention arrangements. This is recorded as owner instruction; it must not be represented as an independent staff review or verified third-party provider receipt.

Migration 0056 adds property-level management tags and immutable source-specific authorisations for **details-only residential intake**. A tag is shared by all listings for a property. Staff can select ProInspect, another party, or unconfirmed, with an instruction reference and an audited version check. Changing away from ProInspect closes native intake immediately.

The initial intake collects application answers, privately invites other adults and submits to the restricted staff queue. It blocks file uploads at the server and hides the upload form. External scanning, application-package forwarding and commercial intake are not activated by this authorisation. No application package is emailed to the landlord.

The public policy identifies ProInspect, Cloudflare hosting/security/storage, Resend transactional email, possible overseas handling, access/correction/withdrawal requests, complaints, incident handling and documented retention holds. The operational limits are 14 days for drafts, 90 days after submission and 30 days after withdrawal. These are business policy choices, not claimed statutory WA periods. Expired unheld submissions close before erasure, including after a listing is leased or its management changes. Linked tenancy records retain their separate review guard.

The deployed source must match a recorded owner authorisation and the exact published policy hash. The two existing Worker flags for rental intake and scheduled erasure are enabled; the three retention values are loaded from the source-bound policy within each request, without adding Worker bindings or changing shared environment objects. A subsequent release must be tested and explicitly recorded against its new source before this mode resumes.

Research basis: [WA Consumer Protection on rental data security](https://www.consumerprotection.wa.gov.au/publications/data-security-real-estate-industry-real-estate-industry-bulletin-260), [OAIC APP 3 data minimisation](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information), and [OAIC APP 11 security and deletion](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information).

Synthetic fixtures are isolated and must never be recorded as production authority or provider acceptance.
