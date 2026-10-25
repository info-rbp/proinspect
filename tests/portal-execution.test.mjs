import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, ROLE_ALIASES, evaluateIdentityReadiness, requireProductionOrigin,
  validateSessionObservation } from '../scripts/portal-testing/acceptance-manifest.mjs';
import { identityObservation, UNRELATED_API } from '../scripts/portal-testing/hosted-auth-exercise.mjs';
import { auditIsolatedCoverage } from '../scripts/portal-testing/isolated-scenario-coverage.mjs';
const sha = 'a'.repeat(40);
test('exactly eight distinct legitimate roles and twelve fully specified cases',()=>{
 assert.equal(new Set(Object.values(ROLE_ALIASES)).size,8);
 assert.deepEqual(SCENARIOS.map(x=>x.id),Array.from({length:12},(_,i)=>`AT-${String(i+1).padStart(2,'0')}`));
 for(const entry of SCENARIOS){
  assert.ok(entry.actors.length>0&&entry.actors.every(r=>r in ROLE_ALIASES));
  assert.ok(entry.success.length>25&&entry.denial.length>25&&entry.cleanup.length>10);
  assert.ok(entry.isolated.length>0);
 }
 assert.deepEqual(Object.keys(UNRELATED_API).sort(),Object.keys(ROLE_ALIASES).sort());
});
test('no email verification and no active sessions remain blocked',()=>{
 const rows=Object.keys(ROLE_ALIASES).map((role,i)=>({role,active:1,verified:i===0?1:0,live_sessions:0}));
 const result=evaluateIdentityReadiness(rows);
 assert.equal(result.registered,8);assert.equal(result.verified,1);assert.equal(result.activeSessionsByRole,0);
 assert.equal(result.blockers.length,7);assert.equal(result.observedOnly,true);
 assert.equal(result.authenticatedAcceptance,'not_executed');
});
test('duplicate, missing and inactive role records cannot be counted as ready',()=>{
 const rows=[{role:'staff',active:1,verified:1,live_sessions:1},{role:'staff',active:1,verified:1,live_sessions:1}];
 const result=evaluateIdentityReadiness(rows);
 assert.equal(result.registered,0);assert.equal(result.verified,0);
 assert.equal(result.roles.staff.readyForHumanReview,false);
});
test('session belongs to expected alias AND scoped workspace',()=>{
 assert.equal(validateSessionObservation('tenant',ROLE_ALIASES.tenant,[{kind:'tenant'}],200).confirmed,true);
 assert.equal(validateSessionObservation('tenant',ROLE_ALIASES.landlord,[{kind:'tenant'}],200).confirmed,false);
 assert.equal(validateSessionObservation('tenant',ROLE_ALIASES.tenant,[{kind:'landlord'}],200).confirmed,false);
 assert.equal(validateSessionObservation('staff',ROLE_ALIASES.staff,[{kind:'staff'}],401).confirmed,false);
});
test('auth runner requires genuine in-browser sign-in, independent denied scope and logout',()=>{
 const sample={role:'tenant',sourceSha:sha,session:{user:{email:ROLE_ALIASES.tenant},workspaces:[{kind:'tenant'}],status:200},
 negativeStatus:403,beforeStatus:401,afterStatus:401,humanConfirmed:true,observedAt:new Date().toISOString()};
 const ready=identityObservation(sample);
 assert.equal(ready.sessionJourneyObserved,true);assert.equal(ready.hostedAcceptable,false);
 assert.equal(ready.accessRevocationChecked,false);
 assert.equal(JSON.stringify(ready).includes('tenant-testing@'),false);
 assert.equal(identityObservation({...sample,negativeStatus:200}).sessionJourneyObserved,false);
 assert.equal(identityObservation({...sample,humanConfirmed:false}).sessionJourneyObserved,false);
 assert.equal(identityObservation({...sample,afterStatus:200}).sessionJourneyObserved,false);
});
test('production runner rejects rogue, mixed-origin, query and staging URLs',()=>{
 assert.equal(requireProductionOrigin('https://proinspect.systems/'),'https://proinspect.systems');
 for (const uri of ['https://attacker.example/','https://proinspect.systems.attacker.example/',
  'http://proinspect.systems/','https://proinspect.systems/?token=abc','https://proinspect.systems/api/health'])
  assert.throws(()=>requireProductionOrigin(uri));
});
test('source-bound isolated 12-case manifest cannot impersonate hosted acceptance',()=>{
 const connected={checks:SCENARIOS.flatMap(x=>x.isolated)};
 const communication={checks:[]};
 const suites=[{specs:[...new Set(SCENARIOS.flatMap(x=>x.browser))].map(title=>({title,tests:[{results:[{status:'passed'}]}]}))}];
 const r=auditIsolatedCoverage(connected,communication,{suites},sha);
 assert.equal(r.covered,12);assert.equal(r.total,12);
 assert.equal(r.acceptedForProduction,false);assert.equal(r.environment,'isolated-local-ci');
 assert.ok(Object.values(r.cases).every(x=>x.productionAcceptance==='not_executed'));
});
test('local coverage identifies absent failed browser and Worker assertions',()=>{
 const s=SCENARIOS[0], suites=[{specs:[{title:s.browser[0],tests:[{results:[{status:'failed'}]}]}]}];
 const r=auditIsolatedCoverage({checks:[]},{checks:[]},{suites},sha);
 assert.equal(r.covered,0);assert.equal(r.cases['AT-01'].isolatedCoverage,'missing');
 assert.ok(r.cases['AT-01'].missingBrowserTests.includes(s.browser[0]));
 assert.ok(r.cases['AT-01'].missingChecks.includes(s.isolated[0]));
});
test('isolated coverage cannot accept arbitrary source identities',()=>{
 assert.throws(()=>auditIsolatedCoverage({checks:[]},{checks:[]},{suites:[]},'bad'));
});
