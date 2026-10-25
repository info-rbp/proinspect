import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, ROLES, CASES, REQUIRED_CASES } from '../scripts/portal-testing/acceptance-gate.mjs';
const sha = 'a'.repeat(40);
const time = new Date(Date.now() - 60000).toISOString();
const ref = 'artifacts/portal-acceptance/review.json';
function fixture() {
  const e = {
    schema: 2, sourceSha: sha, environment: 'production', dataMode: 'approved-synthetic',
    observedAt: time, identities: {}, cases: {}, criteria: {}, defects: [],
    deployment: { workerSha: sha, recoveryVerified: true, observedAt: time, evidenceRef: ref },
    releaseReview: { decision: 'approved', reviewerRef: 'release-reviewer', observedAt: time, evidenceRef: ref },
  };
  for (const id of CASES) e.cases[id] = {
    status: 'pass', sourceSha: sha, observedAt: time, evidenceRef: ref,
    positiveAccessChecked: true, negativeAccessChecked: true,
  };
  for (const [id, caseIds] of Object.entries(REQUIRED_CASES)) e.criteria[id] = {
    status: 'pass', sourceSha: sha, observedAt: time, evidenceRef: ref, caseIds: [...caseIds],
  };
  for (const role of ROLES) e.identities[role] = {
    authenticated: true, authorisedScope: true, accessRevocationChecked: true,
    emailLinkRedeemed: true, turnstileChecked: true, identityRef: `${role}_test_identity`,
    sourceSha: sha, observedAt: time, evidenceRef: ref,
  };
  return e;
}
test('complete structured evidence is accepted after independent validation', () => {
  const r = assess(fixture(), sha); assert.equal(r.acceptedForProduction, true);
  assert.equal(r.counts.criteriaPassed, 12); assert.equal(r.counts.casesPassed, 12);
});
test('any missing portal identity blocks acceptance', () => {const e = fixture(); delete e.identities.staff; assert.equal(assess(e, sha).acceptedForProduction, false)});
test('duplicate identities cannot count as eight independent roles', () => {const e = fixture(); e.identities.council.identityRef = e.identities.tenant.identityRef; assert.equal(assess(e, sha).counts.identitiesPassed, 0)});
test('local-only authentication cannot replace genuine email redemption', () => {const e = fixture(); e.identities.staff.emailLinkRedeemed = false; assert.equal(assess(e, sha).acceptedForProduction, false)});
test('a missing hosted scenario blocks every dependent criterion', () => {const e = fixture(); delete e.cases['AT-09']; const result=assess(e, sha); assert.equal(result.acceptedForProduction, false); assert.equal(result.criteria.private_documents.status, 'blocked')});
test('a scenario without a negative access check cannot pass', () => {const e=fixture();e.cases['AT-08'].negativeAccessChecked=false;assert.equal(assess(e,sha).cases['AT-08'],'blocked')});
test('criteria cannot reuse AT-01 as proof of unrelated workflows', () => {const e=fixture();e.criteria.connected_handoffs.caseIds=['AT-01'];assert.equal(assess(e,sha).criteria.connected_handoffs.status,'blocked')});
test('wrong case SHA cannot count as evidence', () => {const e=fixture();e.cases['AT-04'].sourceSha='b'.repeat(40);assert.equal(assess(e,sha).cases['AT-04'],'blocked')});
test('stale individual observation cannot count as fresh acceptance', () => {const e=fixture();e.cases['AT-02'].observedAt='2026-01-01T00:00:00Z';assert.equal(assess(e,sha).cases['AT-02'],'blocked')});
test('future-dated observations cannot count as evidence', () => {const e=fixture();e.identities.tenant.observedAt='2030-01-01T00:00:00Z';assert.equal(assess(e,sha).acceptedForProduction,false)});
test('all critical and high defects must be resolved', () => {const e=fixture();e.defects=[{severity:'high',status:'open'}];assert.equal(assess(e,sha).criteria.defect_review.status,'blocked')});
test('missing human release approval blocks acceptance', () => {const e=fixture();delete e.releaseReview;assert.equal(assess(e,sha).acceptedForProduction,false)});
test('deployment source and recovery must match approved release', () => {const e=fixture();e.deployment.recoveryVerified=false;assert.equal(assess(e,sha).criteria.deployment_recovery.status,'blocked')});
test('rejects stale root evidence', () => {const e=fixture();e.observedAt='2026-01-01T00:00:00Z';assert.throws(()=>assess(e,sha),/Stale/) });
test('rejects source mismatch', () => assert.throws(()=>assess(fixture(),'b'.repeat(40)),/Source mismatch/));
test('rejects secret leakage in any evidence field', () => {const e=fixture();e.private='https://proinspect.systems/auth/complete?token=abc';assert.throws(()=>assess(e,sha),/credentials/) });
test('rejects traversal artifacts and arbitrary urls', () => {const e=fixture();e.criteria.isolation.evidenceRef='artifacts/../../private.txt';assert.equal(assess(e,sha).criteria.isolation.status,'blocked')});
test('rejects local-only test environment',()=>{const e=fixture();e.environment='local';assert.throws(()=>assess(e,sha),/environment/) });
