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

Application configuration must be supplied for the actual managed properties before public intake can be activated; synthetic test fixtures must never be used as production authority or provider acceptance.
