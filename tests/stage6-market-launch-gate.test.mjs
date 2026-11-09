import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {verifyStage6Bundle} from '../scripts/stage6-market-launch-gate.mjs';
const gates=['source_freeze','deployment','database','customer_journeys',
 'nine_portals','commercial_approval','operational_readiness','final_activation'];
const sha='a'.repeat(40);
function fixture(){
 const cwd=mkdtempSync(join(tmpdir(),'stage6-acceptance-model-'));
 mkdirSync(join(cwd,'artifacts/stage6'),{recursive:true});
 const time=new Date(Date.now()-15000).toISOString();
 const reviews={};
 for(const gate of gates){
  const payload=JSON.stringify({gate,sourceSha:sha,environment:'production',
   outcome:'approved-independent-review',reviewerRef:'auditor_prod',
   executionComplete:true,observedAt:time});
  const ref='artifacts/stage6/'+gate+'.json';
  writeFileSync(join(cwd,ref),payload);
  reviews[gate]={status:'approved',sourceSha:sha,reviewedAt:time,
   ownerRef:'release_owner',reviewerRef:'auditor_prod',evidenceRef:ref,
   evidenceDigest:createHash('sha256').update(payload).digest('hex')};
 }
 const b={schema:1,environment:'production',dataMode:'approved-real-hosted',sourceSha:sha,
  observedAt:time,reviews,defects:[],
  hostedPortalAcceptance:{acceptedForProduction:true,sourceSha:sha,
   identitiesPassed:9,identitiesTotal:9,casesPassed:12,criteriaPassed:12,
   observedAt:time,protectedReviewRun:'https://github.com/info-rbp/proinspect/actions/runs/123456'}};
 return {cwd,b};
}
function withFixture(fn){const f=fixture();try{return fn(f)}finally{rmSync(f.cwd,{recursive:true,force:true})}}
test('complete model validates format only when protected review is explicitly declared',()=>withFixture(({cwd,b})=>{
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd}),/protected/);
 const r=verifyStage6Bundle(b,sha,{cwd,protectedReview:true});
 assert.equal(r.decision,'GO');assert.equal(r.reviewedGates,8);assert.equal(r.hostedIdentities,9);
}));
test('rejects missing independent reviewer, source mismatch and missing gate',()=>withFixture(({cwd,b})=>{
 b.reviews.database.reviewerRef='release_owner';
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd,protectedReview:true}),/independent/);
 b.reviews.database.reviewerRef='auditor_prod';
 delete b.reviews.commercial_approval;
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd,protectedReview:true}),/independent/);
 assert.throws(()=>verifyStage6Bundle(b,'b'.repeat(40),{cwd,protectedReview:true}),/source/);
}));
test('no GO with eight roles, unreviewed defects or tampered artifact',()=>withFixture(({cwd,b})=>{
 b.hostedPortalAcceptance.identitiesPassed=8;
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd,protectedReview:true}),/nine-portal/);
 b.hostedPortalAcceptance.identitiesPassed=9;
 b.defects.push({severity:'high',status:'open'});
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd,protectedReview:true}),/defect/);
 b.defects=[];
 writeFileSync(join(cwd,b.reviews.database.evidenceRef),'{}');
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd,protectedReview:true}),/tampered/);
}));
test('rejects secret-shaped evidence even when someone recomputes its digest',()=>withFixture(({cwd,b})=>{
 const ref=b.reviews.operational_readiness.evidenceRef;
 const p=join(cwd,ref);
 const data=JSON.parse(readFileSync(p,'utf8'));
 data.credentials='whsec_aaaaaaaaaaaaaaaaaaaaaaaa';
 const s=JSON.stringify(data);writeFileSync(p,s);
 b.reviews.operational_readiness.evidenceDigest=createHash('sha256').update(s).digest('hex');
 assert.throws(()=>verifyStage6Bundle(b,sha,{cwd,protectedReview:true}),/sensitive/);
}));
