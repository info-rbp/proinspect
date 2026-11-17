# Sign-in, sign-up and onboarding review

This change builds on merged main `e2bca352a7d7a5896684f2f487fa7fa86af3285c`. It updates account entry and setup while retaining the existing authentication protocol, CSS, customer records and billing release gates.

## Draft reconciliation

GitHub's open draft inventory was checked on 17 November 2026. PR #89 (`feature/stage2-nine-portal-design-20261108`, head `4cea5b82e8d8a3bfe208a102e3c3dfc6e6784f8d`) is the remaining open draft. Its base is the older nine-workspace presentation; it is not the source of current onboarding. Its relevant portal layout, navigation and responsive work was compared with the current implementation. Current main retains the shared shell and role-specific workspaces, with the later four-family resolver and account relationships. Merging the old draft wholesale would require reconciling those subsequent changes and is outside this update. The draft is left intact.

PRs #107, #109 and #110 were already integrated through #112. This update uses their modular onboarding registry, approved organisation route, narrow Resident relationships, experience preferences and registered booking flow. It does not recreate a second property database or introduce public Staff registration.

## Account journeys

| Visitor                                                                             | After email verification                                                                                                                 |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Existing customer with one active workspace                                         | Open that authorised workspace, respecting its valid landing preference.                                                                 |
| Existing customer with several active workspaces                                    | Open My ProInspect with the existing four customer families and internal Operations group.                                               |
| New residential owner                                                               | Free residential owner setup, ownership/self-management confirmation, then property setup.                                               |
| New commercial owner                                                                | Free commercial owner setup, confirmation, then commercial property setup.                                                               |
| Residential, commercial or strata professional                                      | Organisation application; authority and assignments remain subject to Staff review.                                                      |
| Invited tenant, commercial occupant, building resident, lot owner or council member | Preserve the original invitation through authentication; otherwise provide invitation help. No membership is created by choosing a role. |
| Invited building/facilities manager                                                 | Open an existing active assignment or explain how to obtain approved access. Existing building activation gates remain enforced.         |
| Staff                                                                               | Use existing provisioned identity and active role. No public Staff sign-up choice.                                                       |

`/signin` and `/signup` share the existing passwordless email/Turnstile mechanism. `/signup` offers role choices grouped under Residential, Commercial, Strata and Resident. Explicit invitation and service-booking deep links take priority over general setup. `/auth/complete` still requires confirmation by the recipient; invalid links now show a recovery instruction.

`/start` reads only the current server-authorised session. Its role choices are presentation hints, not permissions. Existing organisation approval and invitation acceptance remain authoritative. Commercial professional routing uses a presentation hint derived from the active entitlement's existing `approved_by`, rather than assuming the account type distinguishes an owner from an approved portfolio. API authority is still independently checked against D1.

## Services and continuity

Entry copy reflects inspections, property reports, leasing and maintenance, with Residential co-living/student accommodation and verified Commercial/Strata operations. Construction/project support directs clients to a scope discussion. No additional service allowance, delegated authority, legal acceptance or entitlement is inferred from that copy.

Validated service slugs survive owner/organisation setup links, professional category switches, account selection and existing workspace entry. Bookable workspaces continue to the chosen service. Resident and Staff destinations retain their own authorised landing pages. A professional application page preserves service context in its URL; it does not claim that a new booking or separately persisted service preference was created before approval.

Professional application submission now uses the existing server API through a normal POST action and works without JavaScript. Success says the request awaits review. Initial registration does not collect financial details, create a subscription or initiate checkout.

## Safety and verification

- No CSS, imagery, deployment bindings, production feature flags or SQL migrations are changed.
- No production deployment or production database write is part of this PR.
- Unapproved subscription, checkout, invoicing, refund, Connect and legal activation gates remain disabled.
- Existing email-bound single-use invitations, property scope, session expiry, Turnstile, rate limits and origin checks remain in place.
- Authentication, setup and invitation pages remain private/non-indexed; invalid external or authentication-loop return destinations are rejected.
- The existing staging-only preview allowlist includes this branch. Its guards still reject production D1/R2/queues, enabled billing, external mail and scheduled execution.
- Domain tests cover every role family, mismatched choices, multiple memberships, commercial authority hints, service intent, invitation continuity and invalid return destinations.
- Browser journeys cover free registration, pending professional applications without JavaScript, invitation acceptance/isolation, Resident help, correct existing Commercial routing, multi-account service continuity and mobile overflow. Existing golden paths remain required.
- Hosted staging checks inspect sign-in/sign-up layout and deep-link continuity without submitting forms, sending mail or accepting real invitations. Hosted authenticated acceptance is not represented by those read-only checks.

Release evidence is recorded against the final PR head in GitHub CI. Merge and production deployment remain separate steps.
