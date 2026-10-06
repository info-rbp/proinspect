# Authorization contract v1

Every protected loader, action, API handler and file download resolves identity server-side. Browser-provided user IDs, client types, workspace names or resource IDs are selectors, never authority.

## Decision order

1. Verify unexpired, unrevoked, hashed session and active user.
2. Resolve active membership for the requested workspace and scope.
3. Check the action permission.
4. Check the specific property, management, tenancy, scheme or assignment relationship and effective dates.
5. For documents, check an explicit recipient grant and lifecycle state.
6. Apply field-level redaction before returning data.

Deny by default. Lists are queried within an authorised scope. Caches must include scope and user identity, and authenticated responses are private/no-store. Workspace switching rechecks authority; it cannot union privileges from several workspaces.

## Workspace rules

- Landlord: active landlord Client membership plus ownership and active residential self-management. Owning an agency-managed property does not enable management controls.
- Property manager: active agency membership and active management relationship. Portfolio assignment limits apply to members; owner/admin roles administer the firm's account.
- Commercial: explicit commercial/asset workspace and management relationship, not residential tenancy assumptions.
- Strata manager: Client membership plus active scheme-management link and delegated authority. Not synonymous with strata company.
- Tenant: approved tenancy membership. New requests require current tenancy and membership. Historical issued document rights are evaluated separately.
- Building: approved dated scheme/lot membership. Common-property requests do not reveal private tenancy records. A tenant and resident may be the same person but hold separate grants.
- Council: active council membership and term; limited to authorised scheme oversight. No resident directory or sensitive tenancy access by default.
- Staff: active separately provisioned role. Administrator/operations_manager have operational scope; inspector is assignment-scoped; read_only cannot mutate. Restricted-case access requires an additional case grant even for ordinary administrators.

## Security boundaries

Email verification proves control of a mailbox, not ownership, management appointment or council authority. Self-registration creates a new landlord Client only. Professional organisations require a verified invitation or Staff activation. No first-user administrator or public admin bootstrap endpoint exists. Existing-address claims are quarantined for review rather than auto-linking.

Mutation requests require a same-origin POST and server validation. Login tokens are cryptographically random, hashed, single-use and expiring. GET never consumes a magic link; email scanners cannot log in by fetching it. Sessions use HttpOnly cookies, Secure in hosted environments, SameSite=Lax, explicit expiry and server revocation. Redirect destinations are restricted to local application paths. Production requires Turnstile and real email configuration; development shortcuts are loopback-only.

Sensitive access values and outbox payloads use AES-GCM with per-value random IVs and context-specific additional authenticated data. Secrets never enter browser bundles, logs or repository configuration. Cloudflare resource bindings are not browser credentials.

Tests must cover cross-client property access, stale management relationships, viewer writes, expired tenancy, ended council terms, inspector assignment, document grants, login replay, unsafe redirects and duplicate booking submissions.

## Connected workflow checks

Professional entitlement requires an approved organisation application; the applicant cannot review it. Property Manager and Commercial members require per-property assignment. Former team membership and council terms are checked on every request. Ownership contacts are not ownership grants. Direct owner decisions recheck a verified ownership relationship. Financial proposals check current delegation and the database prevents approval bypass. Draft files are available only to the uploading account with scope, or authorised operational Staff; issued audiences are explicit. Confidential cases require an individual case grant even for an administrator and never appear in the ordinary search/audit/export surfaces.
