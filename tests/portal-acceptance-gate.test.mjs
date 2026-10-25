import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../scripts/portal-testing/acceptance-gate.mjs';
const sha='a'.repeat(40),stamp=new Date(Date.now()-60000).toISOString(),ref='artifacts/portal-acceptance/test-result.json';
function valid(){
 const e={schema:1,sourceSha:sha,environment:'production',dataMode:'approved-synthetic',observedAt:stamp,criteria:{},cases:{},identities:{},defects:[],deployment:{workerSha:sha,recoveryVerified:true}};
 for(const id of ['identities','onboarding','portal_journeys','connected_handoffs','isolation','revocation','private_documents','transaction_reliability','provider_delivery','accessibility','defect_review','deployment_recovery'])e.criteria[id]={status:'pass',observedAt:stamp,caseIds:['AT-01'],evidenceRef:ref};
 for(let i=1;i<=12;i++)e.cases['AT-'+String(i).padStart(2,'0')]={status:'pass',observedAt:stamp,evidenceRef:ref};
 for(const role of ['landlord','property_manager','commercial','strata_manager','tenant','building','council','staff'])e.identities[role]={authenticated:true,authorisedScope:true,accessRevocationChecked:true,identityRef:role+'-test',observedAt:stamp,evidenceRef:ref};
 return e;
}
test('complete structured evidence passes gate',()=>assert.equal(assess(valid(),sha).acceptedForProduction,true));
test('one missing authenticated identity blocks acceptance',()=>{const e=valid();delete e.identities.staff;assert.equal(assess(e,sha).acceptedForProduction,false)});
test('missing cross-portal case blocks acceptance',()=>{const e=valid();delete e.cases['AT-09'];assert.equal(assess(e,sha).acceptedForProduction,false)});
test('unresolved high defect blocks acceptance',()=>{const e=valid();e.defects.push({severity:'high',status:'open'});assert.equal(assess(e,sha).acceptedForProduction,false)});
test('unverified rollback blocks acceptance',()=>{const e=valid();e.deployment.recoveryVerified=false;assert.equal(assess(e,sha).acceptedForProduction,false)});
test('mismatched source cannot be accepted',()=>assert.throws(()=>assess(valid(),'b'.repeat(40)),/Source mismatch/));
test('stale evidence is rejected',()=>{const e=valid();e.observedAt='2026-01-01';assert.throws(()=>assess(e,sha),/Stale/)});
test('credentials and magic links cannot appear in reports',()=>{const e=valid();e.url='https://proinspect.systems/?token=sensitive';assert.throws(()=>assess(e,sha),/credentials/)});
test('missing audit artifact cannot be treated as passed',()=>{const e=valid();e.criteria.private_documents.evidenceRef='none';assert.equal(assess(e,sha).acceptedForProduction,false)});
test('local fixtures cannot be certified as hosted production',()=>{const e=valid();e.environment='local';assert.throws(()=>assess(e,sha),/environment/)});
