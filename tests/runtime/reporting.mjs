import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';
mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/report-worker.mjs',bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
const mf=new Miniflare({modules:true,scriptPath:'artifacts/report-worker.mjs',compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'reports'},r2Buckets:{DOCUMENTS:'documents',RESTRICTED_DOCUMENTS:'restricted'},durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EMAIL_PROVIDER:'local'}});
const db=await mf.getD1Database('DB'),run=(s,...v)=>db.prepare(s).bind(...v).run(),first=(s,...v)=>db.prepare(s).bind(...v).first(),checks=[];
async function check(label,fn){await fn();checks.push(label);console.log('PASS '+label)}
async function api(path,who,body){
 const headers={Origin:'http://localhost',...(who?{Cookie:who.cookie}:{})};
 let payload;
 if(body instanceof FormData){
   const multipart=new Request('http://localhost'+path,{method:'POST',body});
   headers['Content-Type']=multipart.headers.get('Content-Type');
   payload=new Uint8Array(await multipart.arrayBuffer());
   headers['Content-Length']=String(payload.length);
 } else if(body!==undefined){
   headers['Content-Type']='application/json';payload=JSON.stringify(body);
 }
 const res=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers,body:payload});
 return {status:res.status,response:res,data:res.headers.get('Content-Type')?.includes('json')?await res.json():await res.arrayBuffer()};
}
async function ok(path,who,body,status=200){const r=await api(path,who,body);assert.equal(r.status,status,path+': '+JSON.stringify(r.data));return r.data}
async function login(email){const a=await ok('/api/auth/start',null,{email});const token=new URL(a.localSignInUrl).searchParams.get('token');const e=await api('/api/auth/complete',null,{email,token});assert.equal(e.status,200);return {cookie:e.response.headers.get('Set-Cookie').split(';')[0],id:(await first('SELECT id FROM users WHERE email=?',email)).id,email};}
const staffBase='/api/w/staff/operations';
try{
 for(const q of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await db.prepare(q).run();
 for(const q of catalogueSql().split('\n'))await db.prepare(q).run();
 const ops=await login('reports-ops@example.test'),inspector=await login('reports-inspector@example.test'),reviewer=await login('reports-reviewer@example.test'),owner=await login('reports-owner@example.test'),outsider=await login('reports-outsider@example.test');
 await run("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",ops.id);
 for(const p of [inspector,reviewer])await run("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'inspector',1)",p.id);
 const on=await ok('/api/onboarding',owner,{displayName:'Synthetic Owner',clientName:'Synthetic self-managed'},201),clientId=on.clientId;
 await run("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('report_property','5 Inspection Street','Perth','6000',?,'residential',?)",randomUUID(),new Date().toISOString());
 await run("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('report_owner',?,'report_property','owner',?)",clientId,'2026-01-01');
 await run("INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES('report_management','report_property',?,'self_managed',?)",clientId,'2026-01-01');
 await run("INSERT INTO schedule_resources(id,name,active) VALUES('report_schedule','Reporting fixture',1)");
 const start=new Date(Date.now()+86400000).toISOString(),end=new Date(Date.now()+86460000).toISOString();
 await run("INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,snapshot_json,request_key,fingerprint,created_at) VALUES('booking_report','B-REPORT',?,?,'report_property','property-meeting','report_schedule',?,?,?,?, '{}',?,?,?)",clientId,owner.id,start,end,start,end,'report-request','synthetic-hash',new Date().toISOString());
 await run("INSERT INTO work_orders(id,reference,booking_id,client_id,property_id,title,status,assigned_staff_id,created_at,updated_at) VALUES('work_report','WO-REPORT','booking_report',?,'report_property','Property meeting','assigned',?,?,?)",clientId,inspector.id,new Date().toISOString(),new Date().toISOString());
 await check('only assigned staff can create the Work Order report',async()=>{
  assert.equal((await api(staffBase+'/reports/create',null,{workOrderId:'work_report'})).status,401);
  assert.equal((await api('/api/w/landlord/'+clientId+'/reports/create',owner,{workOrderId:'work_report'})).status,403);
  assert.equal((await api(staffBase+'/reports/create',reviewer,{workOrderId:'work_report'})).status,404);
 });
 const created=await ok(staffBase+'/reports/create',inspector,{workOrderId:'work_report'}),reportId=created.id,base=staffBase+'/reports/'+reportId;
 await check('creation is idempotent and stores only one canonical report per Work Order',async()=>{
  assert.equal((await ok(staffBase+'/reports/create',inspector,{workOrderId:'work_report'})).id,reportId);
  assert.equal((await first("SELECT COUNT(*) AS c FROM inspection_reports WHERE work_order_id='work_report'")).c,1);
  assert.equal((await ok(staffBase+'/reports',inspector)).reports.length,1);
 });
 await check('drafts and unpublished evidence are isolated from customer accounts',async()=>{
  assert.equal((await ok('/api/w/landlord/'+clientId+'/reports',owner)).reports.length,0);
  assert.equal((await api('/api/w/landlord/'+clientId+'/reports/'+reportId,owner)).status,404);
  assert.equal((await api(staffBase+'/reports/'+reportId,reviewer)).status,404);
  assert.equal((await api('/api/w/landlord/'+clientId+'/reports/'+reportId+'/save',owner,{revision:1,content:{}})).status,404);
 });
 let draft=(await ok(base,inspector)).draft.content;
 await check('QC blocks missing attendance summary and draft can be saved with optimistic revision',async()=>{
  const u=await ok(base+'/reviewer',ops,{reviewerId:reviewer.id});assert.equal(u.reviewerId,reviewer.id);
  assert.equal((await api(base+'/submit',inspector,{revision:2})).status,409);
  draft.summary='Attended property and recorded visible findings.';
  draft.areas[0].components[0].conditionCategory='intact';
  draft.areas[0].components[0].cleanlinessCategory='clean';
  draft.areas[0].components[0].maintenanceRequired=true;
  draft.areas[0].components[0].commentary='Visible ageing to entry latch; recommend further contractor review.';
  const saved=await ok(base+'/sync',inspector,{revision:2,content:draft,operationId:'syncreport0001'});
  assert.equal(saved.revision,3);
  assert.equal((await ok(base+'/sync',inspector,{revision:2,content:draft,operationId:'syncreport0001'})).replayed,true);
  assert.equal((await api(base+'/save',inspector,{revision:2,content:draft})).status,409);
  assert.equal((await first('SELECT COUNT(*) AS c FROM report_sync_receipts WHERE report_id=?',reportId)).c,1);
 });
 await check('exception evidence requires an independently reviewed JPEG, not a file name alone',async()=>{
  assert.equal((await api(base+'/submit',inspector,{revision:3})).status,409);
  const upload=new FormData();
  upload.set('areaId','area_general');
  upload.set('componentId','component_general');
  upload.set('file',new File([readFileSync('tests/fixtures/report-photo.jpg')],'synthetic.jpg',{type:'image/jpeg'}));
  const createdEvidence=await ok(base+'/evidence',inspector,upload);
  assert.equal(createdEvidence.status,'pending');
  assert.equal((await api(base+'/submit',inspector,{revision:4})).status,409);
  assert.equal((await api(base+'/evidence/'+createdEvidence.id+'/review',inspector,{decision:'accepted'})).status,403);
  assert.equal((await api('/api/w/landlord/'+clientId+'/reports/'+reportId+'/evidence/'+createdEvidence.id+'/download',owner)).status,404);
  assert.equal((await ok(base+'/evidence/'+createdEvidence.id+'/review',reviewer,{decision:'accepted'})).status,'accepted');
  const refreshed=await ok(base,inspector);
  assert.deepEqual(refreshed.draft.content.areas[0].components[0].photoIds,[createdEvidence.id]);
 });
 let version;
 await check('approved template and QC create immutable report version',async()=>{
  const submitted=await ok(base+'/submit',inspector,{revision:4});version=submitted.versionId;
  assert.equal(submitted.status,'submitted');
  assert.equal((await api(base+'/submit',inspector,{revision:4})).status,403);
  await assert.rejects(run('UPDATE report_versions SET content_json=? WHERE id=?','{}',version),/REPORT_VERSION_IMMUTABLE/);
 });
 await check('reviewer is independent of inspector, and cannot act before assignment',async()=>{
  assert.equal((await api(base+'/review',inspector,{decision:'approved',comment:'Self',revision:5})).status,403);
  assert.equal((await api(base+'/review',ops,{decision:'approved',comment:'Operations cannot bypass assignment',revision:5})).status,403);
  const reviewed=await ok(base+'/review',reviewer,{decision:'approved',comment:'Evidence and recorded findings reviewed independently',revision:5});
  assert.equal(reviewed.status,'approved');
 });
 let doc;
 await check('render makes a hash-bound private PDF that is not issued automatically',async()=>{
  const result=await ok(base+'/render',ops,{});doc=result.documentId;
  assert.equal((await ok(base+'/render',ops,{})).documentId,doc);
  const obj=await first('SELECT object_key,sha256,status FROM documents WHERE id=?',doc);
  assert.equal(obj.status,'review');
  const bytes=new Uint8Array(await (await (await mf.getR2Bucket('DOCUMENTS')).get(obj.object_key)).arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.slice(0,8)),'%PDF-1.4');
  assert.equal((await api('/api/w/landlord/'+clientId+'/documents/'+doc+'/download',owner)).status,404);
  const pending=await first('SELECT version FROM work_orders WHERE id=?','work_report');
  await ok(staffBase+'/work-orders/work_report',ops,{status:'in_progress',version:pending.version});
  const inProgress=await first('SELECT version FROM work_orders WHERE id=?','work_report');
  assert.equal((await api(staffBase+'/work-orders/work_report',ops,{status:'completed',version:inProgress.version})).status,409,
    'Rendering without recipient issuance cannot complete an operational Work Order.');
 });
 await check('issue uses existing explicit grant and only authorised client can download',async()=>{
  const issued=await ok(base+'/issue',ops,{audience:'client',recipientId:clientId,reviewReference:'Reviewed attendance delivery'});
  assert.equal(issued.status,'issued');assert.equal((await ok('/api/w/landlord/'+clientId+'/reports',owner)).reports.length,1);
  assert.equal((await api('/api/w/landlord/'+clientId+'/documents/'+doc+'/download',owner)).status,200);
  assert.equal((await api(staffBase+'/reports/'+reportId+'/save',inspector,{revision:5,content:draft})).status,403);
  const outsiderHome=await ok('/api/onboarding',outsider,{displayName:'Outsider',clientName:'Unrelated landlord'},201);
  assert.equal((await api('/api/w/landlord/'+outsiderHome.clientId+'/reports/'+reportId,outsider)).status,404);
  assert.equal((await api('/api/w/landlord/'+outsiderHome.clientId+'/documents/'+doc+'/download',outsider)).status,404);
 });
 await check('reviewed maintenance findings create candidates, not unapproved work orders',async()=>{
  const result=await ok(base+'/maintenance/candidates',ops,{});
  assert.equal(result.reviewedCandidates,1);assert.equal(result.workOrdersCreated,0);
  await ok(base+'/maintenance/candidates',ops,{});
  assert.equal((await first('SELECT COUNT(*) AS c FROM report_maintenance_candidates WHERE report_version_id=?',version)).c,1);
  const item=await first('SELECT id FROM report_maintenance_candidates WHERE report_version_id=?',version);
  assert.equal((await api(base+'/maintenance/'+item.id+'/create-request',inspector,{})).status,403);
  const triage=await ok(base+'/maintenance/'+item.id+'/create-request',ops,{});
  assert.equal(triage.status,'submitted');
  assert.equal((await ok(base+'/maintenance/'+item.id+'/create-request',ops,{})).replayed,true);
  assert.equal((await first('SELECT status FROM requests WHERE id=?',triage.requestId)).status,'submitted');
 });
 await check('native approval and the exact issued render manifest guard Work Order completion',async()=>{
  const o=await first('SELECT version FROM work_orders WHERE id=?','work_report');
  const completed=await ok(staffBase+'/work-orders/work_report',ops,{status:'completed',version:o.version});
  assert.equal(completed.status,'completed');
  assert.equal((await first('SELECT status FROM bookings WHERE id=?','booking_report')).status,'completed');
 });
 writeFileSync('artifacts/reporting-results.json',JSON.stringify({checks:checks.length,passed:checks,deployed:false},null,2));
 console.log(checks.length+' native reporting Worker acceptance checks passed.');
}finally{await mf.dispose();}
