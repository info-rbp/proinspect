/** Source-of-truth for hosted acceptance operators and isolated CI traceability.
 * Check names and browser titles refer to existing tests; a passing CI check never
 * implies the corresponding production transaction has been observed. */
export const ROLE_ALIASES = Object.freeze({
  landlord: 'landlord-testing@proinspect.systems',
  property_manager: 'property-manager-testing@proinspect.systems',
  commercial: 'commercial-testing@proinspect.systems',
  strata_manager: 'strata-manager-testing@proinspect.systems',
  tenant: 'tenant-testing@proinspect.systems',
  building: 'building-resident-testing@proinspect.systems',
  council: 'building-council-testing@proinspect.systems',
  staff: 'staff-testing@proinspect.systems',
});

const ROLE_WORKSPACE_KIND = Object.freeze({property_manager:'property-manager',strata_manager:'strata-manager',council:'strata-council'});
const scenario = (id, actors, success, denial, cleanup, isolated, browser = []) =>
  Object.freeze({ id, actors, success, denial, cleanup, isolated, browser });
export const SCENARIOS = Object.freeze([
  scenario('AT-01', Object.keys(ROLE_ALIASES),
    'Each tester redeems a genuine email sign-in after Turnstile, sees the correct authorised workspace and signs out.',
    'Unrelated workspace and expired/replayed sign-in cannot be accessed.',
    'Sign out every test session; revoke privileged test Staff access after acceptance.',
    ['eight independent portal identities remain isolated across every unrelated workspace and scheme'],
    ['new Landlord signup auto-includes services, books, and hands work to Staff with report delivery']),
  scenario('AT-02', ['tenant', 'landlord', 'staff'],
    'Tenant maintenance request reaches the correct Landlord and Staff Work Order exactly once.',
    'Unrelated owner and tenant cannot read request or internal Staff notes.',
    'Close the synthetic work order and delete the test content under the approved retention policy.',
    ['resident inside-lot maintenance routes to tenancy while common-property issue routes to the scheme'],
    ['tenant evidence, reviewed PCR and cost approval connect to the self-managing landlord']),
  scenario('AT-03', ['landlord', 'property_manager', 'staff'],
    'Approved included booking creates one Work Order; reviewed report is issued only to authorised recipients.',
    'Outsider cannot download the PDF; retries do not duplicate bookings or Work Orders.',
    'Cancel test slot where permissible and revoke synthetic report grants.',
    ['all customer portals book their own unpriced subscription services with Staff-visible Work Orders'],
    ['new Landlord signup auto-includes services, books, and hands work to Staff with report delivery']),
  scenario('AT-04', ['property_manager', 'staff'],
    'Reviewed management authority and team property assignments show the correct scoped portfolio.',
    'An unrelated agency and ended membership cannot read managed properties.',
    'Revoke temporary agency/team membership.',
    ['agency staff see only assigned properties and an ended membership loses workspace access'],
    ['professional portfolio import, recurring plan and commercial workspace are usable']),
  scenario('AT-05', ['property_manager', 'landlord', 'staff'],
    'The verified owner makes a recorded cost escalation decision and Staff receives the result.',
    'An agency user cannot impersonate the owner or bypass approval.',
    'Close/reverse only the synthetic approval; never post a real charge.',
    ['agency approval escalation reaches only the verified owner and returns the decision to the work order']),
  scenario('AT-06', ['building', 'strata_manager', 'staff'],
    'Resident raises a common-property request that reaches the correct Strata Manager and Staff.',
    'Other schemes, private-lot tenancy data and another resident’s request remain inaccessible.',
    'Close the synthetic issue; preserve audit evidence.',
    ['resident inside-lot maintenance routes to tenancy while common-property issue routes to the scheme'],
    ['resident report reaches strata operations and council sees only its decision workflow']),
  scenario('AT-07', ['strata_manager', 'council', 'staff'],
    'Council gives advice and an authorised manager records the permitted operational outcome.',
    'Council recommendation alone cannot override statutory/contractual decision authority.',
    'Archive or close the synthetic proposal.',
    ['scheme authority escalation collects council advice but requires an authorised recorded outcome'],
    ['resident report reaches strata operations and council sees only its decision workflow']),
  scenario('AT-08', ['tenant', 'building', 'council'],
    'One legitimately authorised multi-role user switches scopes; expiry of council term preserves other roles.',
    'Ended council scope is denied while tenant/resident notices stay independently scoped.',
    'Restore only approved synthetic grants, never reinstate expired real memberships.',
    ['one tenant resident and council member sees independent notices and loses only expired council access']),
  scenario('AT-09', ['staff', 'tenant', 'landlord'],
    'Draft/quarantine evidence stays private; reviewed issued PDF is downloadable by the exact recipient.',
    'An outsider and a revoked recipient cannot access the private file.',
    'Revoke temporary document grants and remove synthetic documents under retention policy.',
    ['document revisions preserve old files and reject unrelated client recipients'],
    ['tenant evidence, reviewed PCR and cost approval connect to the self-managing landlord']),
  scenario('AT-10', ['strata_manager', 'building', 'council'],
    'Targeted building and council notices deliver only to eligible recipients.',
    'Revoked/withdrawn recipients and unrelated audience cannot read or receive the notice.',
    'Withdraw synthetic notices and verify pending notifications are suppressed.',
    ['building notices are filtered by audience and lot and do not leak council-only content'],
    ['scheduled building notice is visible to its manager, hidden from residents, and withdrawable']),
  scenario('AT-11', ['staff'],
    'Public enquiry passes genuine Turnstile and reaches authorised Staff triage.',
    'Forged-origin submissions and unauthorised account creation/Staff view are denied.',
    'Close the synthetic enquiry and apply privacy retention controls.',
    ['signed marketing enquiry persists encrypted contact data without granting an account'],
    ['public enquiry reaches authorised Staff triage and a recorded email reply']),
  scenario('AT-12', ['commercial', 'staff'],
    'Commercial client books an included service and Staff sees the correctly scoped Work Order.',
    'Unrelated residential and agency users cannot read the commercial client or record.',
    'Cancel test booking and resolve synthetic Work Order without a payment.',
    ['commercial property operations remain separate from residential self-management'],
    ['commercial Landlord signup selects its type and books an included commercial inspection']),
]);

export function evaluateIdentityReadiness(rows) {
  if (!Array.isArray(rows)) throw new Error('Expected D1 read-only identity rows');
  const expected = Object.keys(ROLE_ALIASES);
  const roles = {};
  for (const role of expected) {
    const matches = rows.filter(x => x.role === role);
    const r = matches.length === 1 ? matches[0] : null;
    const registered = Boolean(r && Number(r.active) === 1);
    const emailVerified = registered && Number(r.verified) === 1;
    const hasActiveSession = registered && Number(r.live_sessions) > 0;
    roles[role] = { registered, emailVerified, hasActiveSession,
      readyForHumanReview: emailVerified && hasActiveSession };
  }
  return { roles, registered: expected.filter(k => roles[k].registered).length,
    verified: expected.filter(k => roles[k].emailVerified).length,
    activeSessionsByRole: expected.filter(k => roles[k].hasActiveSession).length,
    observedOnly: true, authenticatedAcceptance: 'not_executed',
    blockers: expected.filter(k => !roles[k].emailVerified).map(role => ({ role, code: 'REAL_EMAIL_REDEMPTION_REQUIRED' })) };
}

export function requireProductionOrigin(url) {
  const origin = new URL(url);
  if (origin.origin !== 'https://proinspect.systems' || origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('Only the configured production origin is supported');
  return origin.origin;
}

export function validateSessionObservation(role, observedEmail, workspaces, requestStatus) {
  if (!Object.hasOwn(ROLE_ALIASES, role)) throw new Error('Unknown role');
  if (typeof observedEmail !== 'string' || observedEmail.toLowerCase() !== ROLE_ALIASES[role])
    return { role, confirmed: false, reason: 'Session does not belong to the expected alias' };
  if (!Array.isArray(workspaces) || !workspaces.some(x => x.kind === (ROLE_WORKSPACE_KIND[role] ?? role)))
    return { role, confirmed: false, reason: 'Expected scoped workspace missing' };
  if (requestStatus !== 200)
    return { role, confirmed: false, reason: 'Authenticated session endpoint did not return 200' };
  return { role, confirmed: true, reason: 'Session and workspace scoped; negative checks still required' };
}
