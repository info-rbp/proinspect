import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyPlatformDelta, evaluateEvidence, assertCompatible, singleActive, promoteAndVerify } from '../scripts/release/production-release.mjs';
const entry=(path,extra={})=>({path,mode:'100644',...extra});
test('routine public content qualifies but unknown or sensitive changes do not',()=>{
 for(const path of ['apps/marketing/app/routes/home.tsx','apps/marketing/app/components/commercial-landing.tsx','packages/ui/marketing-service-pages.css','apps/marketing/app/components/images/photo.webp','tests/browser/service-pages.spec.ts'])
  assert.equal(classifyPlatformDelta([entry(path)]).lane,'public-platform');
 for(const path of ['apps/platform/worker/api.ts','apps/platform/app/root.tsx','apps/platform/wrangler.jsonc','apps/marketing/app/routes/leasing-property.tsx','packages/auth/session.ts','packages/marketing/public-facts.ts','database/migrations/0068.sql','pnpm-lock.yaml','apps/private-document-scanner/container/drop-privileges.py','.github/workflows/verify.yml','scripts/release/production-release.mjs'])
  assert.equal(classifyPlatformDelta([entry('apps/marketing/app/routes/home.tsx'),entry(path)]).lane,'controlled',path);
 assert.equal(classifyPlatformDelta([entry('apps/marketing/app/routes/home.tsx',{mode:'120000'})]).lane,'controlled');
 assert.equal(classifyPlatformDelta([entry('apps/marketing/app/routes/home.tsx',{mode:null})]).lane,'controlled');
 assert.equal(classifyPlatformDelta([]).lane,'controlled');
});
test('reviewed initial exception is bounded and does not authorise later private scanner changes',()=>{
 const scanner=entry('apps/private-document-scanner/container/drop-privileges.py',{unchangedFromReviewed:true});
 assert.equal(classifyPlatformDelta([scanner],{bootstrap:true}).lane,'public-platform');
 assert.equal(classifyPlatformDelta([scanner]).lane,'controlled');
 assert.equal(classifyPlatformDelta([entry(scanner.path)],{bootstrap:true}).lane,'controlled');
});
const good={risk:'public-platform',regression:'success',publicPages:'success',scanner:'success',verify:'success',verifyComplete:true,publicComplete:true};
test('all applicable exact-source checks are mandatory; independent scanner failure never permits controlled release',()=>{
 assert.equal(evaluateEvidence(good).ready,true);
 assert.equal(evaluateEvidence({...good,scanner:'failure',verify:'failure'}).ready,true);
 for(const changes of [{risk:'controlled'},{regression:'failure'},{publicPages:'failure'},{publicPages:'skipped'},{scanner:'skipped'},{verify:'cancelled'},{verifyComplete:false},{publicComplete:false},{scanner:'failure',verify:'success'}])
  assert.equal(evaluateEvidence({...good,...changes}).ready,false,JSON.stringify(changes));
});
const version=sha=>({resources:{script_runtime:{compatibility_date:'2026-01-01'},bindings:[
 {name:'BUILD_SHA',type:'plain_text',text:sha},{name:'APP_ENV',type:'plain_text',text:'production'},{name:'APP_ORIGIN',type:'plain_text',text:'https://proinspect.systems'},
 ...['DB','DOCUMENTS','RESTRICTED_DOCUMENTS','SCHEDULER','EVENTS','PRIVATE_DOCUMENT_SCANNER','STRIPE_BILLING_ENABLED'].map(name=>({name,type:'plain_text',text:'unchanged'})),
 {name:'SECRET',type:'secret_text'},
]}});
test('production resource, feature flag and secret inventory drift is rejected before activation',()=>{
 const previous=version('old'),candidate=version('new');
 assert.equal(assertCompatible(previous,candidate,'new'),11);
 for(const key of ['APP_ENV','APP_ORIGIN','DB','DOCUMENTS','SCHEDULER','PRIVATE_DOCUMENT_SCANNER','STRIPE_BILLING_ENABLED','SECRET']){
  const changed=structuredClone(candidate);
  changed.resources.bindings.find(b=>b.name===key).text='changed';
  assert.throws(()=>assertCompatible(previous,changed,'new'),key);
 }
 const missing=structuredClone(candidate);missing.resources.bindings.pop();
 assert.throws(()=>assertCompatible(previous,missing,'new'));
 assert.throws(()=>assertCompatible(previous,candidate,'wrong'));
 assert.throws(()=>singleActive({versions:[{version_id:'a',percentage:50},{version_id:'b',percentage:50}]}));
});
const deployment=(id,version)=>({id,versions:[{version_id:version,percentage:100}]});
function fixture({failure=false,concurrent=false,stale=false}={}){
 let current=deployment('d0','v0');const calls=[];const report={};
 const args={head:'new',previous:{source:'old',versionId:'v0',deploymentId:'d0'},target:'v1',
  assertCurrentMain:async()=>{if(stale)throw Error('stale')},
  readDeployment:async()=>current,
  deploy:async(id)=>{calls.push(id);current=deployment('d'+calls.length,id);return current},
  verify:async()=>{if(concurrent)current=deployment('other','v2');if(failure||concurrent)throw Error('smoke failure');return {source:'new'}},
  verifyPrevious:async(source)=>{assert.equal(source,'old');assert.equal(singleActive(current),'v0')},
  report};
 return {args,calls,report};
}
test('promotion succeeds only after live verification',async()=>{
 const f=fixture();await promoteAndVerify(f.args);
 assert.deepEqual(f.calls,['v1']);assert.equal(f.report.status,'deployed');
});
test('failed live smoke restores prior version; stale main or concurrent deployment never overwritten',async()=>{
 const f=fixture({failure:true});await assert.rejects(()=>promoteAndVerify(f.args),/restored and verified/);
 assert.deepEqual(f.calls,['v1','v0']);assert.equal(f.report.rollback.status,'verified');
 const c=fixture({concurrent:true});await assert.rejects(()=>promoteAndVerify(c.args),/concurrently/);
 assert.deepEqual(c.calls,['v1']);assert.equal(c.report.rollback.status,'not-attempted-concurrent-deployment');
 const s=fixture({stale:true});await assert.rejects(()=>promoteAndVerify(s.args),/stale/);assert.deepEqual(s.calls,[]);
});
