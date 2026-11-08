import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {releaseReadiness} from '../scripts/handbook-release-readiness.mjs';
const register=JSON.parse(readFileSync('config/handbook-tasks.json','utf8'));
const traceability=JSON.parse(readFileSync('config/handbook-traceability.json','utf8'));
const sha='a'.repeat(40);
const copy=()=>structuredClone(register);
test('full-scope gate fails closed on missing external and independent acceptance',()=>{
 const v=releaseReadiness(register,traceability,sha);
 assert.equal(v.ready,false);assert.equal(v.totalTasks,110);assert.equal(v.acceptedTasks,0);assert.equal(v.outstandingTasks,110);
 assert.equal(v.workstreams.WS00.total,7);assert.equal(v.workstreams.WS09.total,13);
 assert.equal(v.outstandingPackages.length,20);
 assert.ok(v.workstreams.WS04.outstanding.some(x=>x.id==='R07'));
});
test('engineering verified and deferrals do not grant a full-scope release',()=>{
 const r=copy();r.tasks.find(x=>x.id==='B09').state='Engineering verified';
 r.tasks.find(x=>x.id==='M01').state='Deferred by decision';
 const v=releaseReadiness(r,traceability,sha);
 assert.equal(v.ready,false);assert.equal(v.acceptedTasks,0);
 assert.equal(v.workstreams.WS02.outstanding.find(x=>x.id==='B09').state,'Engineering verified');
 assert.ok(v.structuralErrors.some(s=>s.includes('Deferral requires an authorised dated decision M01')));
});
test('accepted task pinned to a different source SHA is explicitly rejected',()=>{
 const r=copy(),task=r.tasks.find(x=>x.id==='G01');task.state='Accepted';
 task.implementationOwner='Engineering';task.independentReviewer='QA';task.acceptanceOwner='Release';
 task.verification=[{test:'tests/handbook-release-readiness.test.mjs'}];
 task.acceptanceDecision={sourceSha:'b'.repeat(40),environment:'staging',acceptedAt:'2026-10-27T00:00:00Z',reference:'review-001'};
 task.externalEvidence=[{kind:'independent-acceptance',sourceSha:'b'.repeat(40),environment:'staging',reference:'review-001',synthetic:false}];
 const v=releaseReadiness(r,traceability,sha);
 assert.equal(v.ready,false);assert.deepEqual(v.incorrectSourceAcceptance,['G01']);
});
test('missing source identifier cannot make full-scope release ready',()=>{
 const v=releaseReadiness(register,traceability,'placeholder');
 assert.equal(v.ready,false);assert.equal(v.sourceSha,null);
});

test('full scope cannot be accepted without 20 independently reviewed F-packages',()=>{
 const r=copy(),f=structuredClone(traceability);
 for(const t of r.tasks){
  t.state='Accepted';t.implementationOwner='Engineering';t.independentReviewer='QA';t.acceptanceOwner='Release';
  t.implementationPaths=['config/handbook-tasks.json'];t.verification=[{test:'tests/handbook-release-readiness.test.mjs'}];
  t.acceptanceDecision={reference:'ACCEPTED-SYNTHETIC-TEST',sourceSha:sha,environment:'staging',acceptedAt:'2026-10-27T00:00:00Z'};
  t.externalEvidence=[{kind:'independent-acceptance',reference:'ACCEPTED-SYNTHETIC-TEST',sourceSha:sha,environment:'staging',synthetic:false}];
 }
 // This is a pure isolated fixture: no approval record is written to the real register.
 let v=releaseReadiness(r,f,sha);assert.equal(v.ready,false);assert.equal(v.outstandingPackages.length,20);
 for(const p of f.packages){p.state='Accepted';p.implementationOwner='Engineering';p.independentReviewer='QA';p.acceptanceOwner='Release';
  p.acceptanceDecision={sourceSha:sha,environment:'staging'};p.evidence=[{kind:'independent-acceptance',sourceSha:sha,environment:'staging',synthetic:false}];}
 v=releaseReadiness(r,f,sha);assert.equal(v.ready,true);assert.equal(v.outstandingPackages.length,0);
});
