import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {judgeLaunch, verifyFiles} from '../scripts/portal-testing/verify-launch-evidence.mjs';
import {CASES,ROLES,REQUIRED_CASES} from '../scripts/portal-testing/acceptance-gate.mjs';
const sha='a'.repeat(40),time=new Date(Date.now()-30000).toISOString();
function modelFixture(){
 const cwd=mkdtempSync(join(tmpdir(),'proinspect-release-model-'));
 const dir=join(cwd,'artifacts/portal-acceptance');mkdirSync(dir,{recursive:true});
 const e={schema:2,sourceSha:sha,environment:'production',dataMode:'approved-synthetic',observedAt:time,
  identities:{},cases:{},criteria:{},defects:[],deployment:{workerSha:sha,recoveryVerified:true,observedAt:time},
  releaseReview:{decision:'approved',reviewerRef:'independent-release-reviewer',observedAt:time},evidenceDigests:{}};
 function proof(relative,body){
  const location=join(cwd,relative);mkdirSync(join(location,'..'),{recursive:true});
  const text=JSON.stringify(body);writeFileSync(location,text);
  e.evidenceDigests[relative]=createHash('sha256').update(text).digest('hex');return relative;
 }
 for(const role of ROLES){
  const path=`artifacts/portal-acceptance/identity-${role}.json`;
  const evidenceRef=proof(path,{role,sourceSha:sha,initialAnonymous:true,authenticated:true,
   unrelatedWorkspaceDenied:true,signoutRevokedSession:true,humanTurnstileAndEmailLinkConfirmed:true,sessionJourneyObserved:true});
  e.identities[role]={identityRef:`test-${role}-identity`,sourceSha:sha,observedAt:time,evidenceRef,
   authenticated:true,emailLinkRedeemed:true,turnstileChecked:true,authorisedScope:true,accessRevocationChecked:true};
 }
 for(const id of CASES){
  const evidenceRef=proof(`artifacts/portal-acceptance/case-${id}.json`,{caseId:id,sourceSha:sha,
   environment:'production',dataMode:'approved-synthetic',positiveAccessChecked:true,
   negativeAccessChecked:true,cleanupConfirmed:true,executionComplete:true,reviewStatus:'approved-independent-review'});
  e.cases[id]={status:'pass',sourceSha:sha,observedAt:time,evidenceRef,positiveAccessChecked:true,negativeAccessChecked:true};
 }
 const shared=proof('artifacts/portal-acceptance/review.json',{sourceSha:sha,observedAt:time,kind:'test-only-fixture'});
 for(const [id,caseIds] of Object.entries(REQUIRED_CASES))e.criteria[id]={status:'pass',sourceSha:sha,observedAt:time,evidenceRef:shared,caseIds};
 e.deployment.evidenceRef=shared;e.releaseReview.evidenceRef=shared;
 return {e,cwd,proof};
}
function withFixture(fn){const f=modelFixture();try{return fn(f)}finally{rmSync(f.cwd,{recursive:true,force:true})}}
test('model complete proof is structurally valid but only behind protected independent review',()=>withFixture(({e,cwd})=>{
 assert.equal(judgeLaunch(e,sha,{cwd,protectedReview:true}).acceptedForProduction,true);
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:false}),/protected/);
}));
test('physically missing and tampered evidence cannot clear release gate',()=>withFixture(({e,cwd})=>{
 const p=join(cwd,e.cases['AT-03'].evidenceRef);writeFileSync(p,'{}');
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:true}),/digest mismatch/);
}));
test('one case cannot reuse another case proof',()=>withFixture(({e,cwd})=>{
 e.cases['AT-08'].evidenceRef=e.cases['AT-09'].evidenceRef;
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:true}),/Distinct redacted case/);
}));
test('real login observation with no negative-denial proof cannot pass',()=>withFixture(({e,cwd})=>{
 const p=join(cwd,e.identities.staff.evidenceRef);const data=JSON.parse(readFileSync(p,'utf8'));
 data.unrelatedWorkspaceDenied=false;writeFileSync(p,JSON.stringify(data));
 e.evidenceDigests[e.identities.staff.evidenceRef]=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:true}),/Incomplete real hosted sign-in/);
}));
test('scenario self-attestation without independent review cannot pass',()=>withFixture(({e,cwd})=>{
 const p=join(cwd,e.cases['AT-12'].evidenceRef);const data=JSON.parse(readFileSync(p,'utf8'));
 data.reviewStatus='pending-independent-review';writeFileSync(p,JSON.stringify(data));
 e.evidenceDigests[e.cases['AT-12'].evidenceRef]=createHash('sha256').update(JSON.stringify(data)).digest('hex');
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:true}),/Incomplete or unapproved/);
}));
test('test identity cannot independently approve its own production release',()=>withFixture(({e,cwd})=>{
 e.releaseReview.reviewerRef=e.identities.council.identityRef;
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:true}),/independent/);
}));
test('NO GO without required scenario evidence even with a reviewer',()=>withFixture(({e,cwd})=>{
 e.cases['AT-07'].negativeAccessChecked=false;
 assert.throws(()=>judgeLaunch(e,sha,{cwd,protectedReview:true}),/NO GO/);
}));
