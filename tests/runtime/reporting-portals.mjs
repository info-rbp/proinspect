import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/report-portals-worker.mjs',
 bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers']});
const key=randomBytes(32).toString('base64');
const mf=new Miniflare({modules:true,scriptPath:'artifacts/report-portals-worker.mjs',compatibilityDate:'2026-07-01',
 compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'report-portals'},
 r2Buckets:{DOCUMENTS:'report-portals-docs',RESTRICTED_DOCUMENTS:'report-portals-restricted'},
 durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',DATA_ENCRYPTION_KEY:key,EMAIL_PROVIDER:'local'}});
const db=await mf.getD1Database('DB'),run=(sql,...v)=>db.prepare(sql).bind(...v).run(),first=(sql,...v)=>db.prepare(sql).bind(...v).first(),checks=[];
async function check(label,fn){await fn();checks.push(label);console.log('PASS '+label);}
async function api(path,who,body){
 const headers={Origin:'http://localhost',...(who?{Cookie:who.cookie}:{})};let payload;
 if(body instanceof FormData){
  const req=new Request('http://localhost'+path,{method:'POST',body});
  headers['Content-Type']=req.headers.get('Content-Type');
  payload=new Uint8Array(await req.arrayBuffer());headers['Content-Length']=String(payload.byteLength);
 } else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
 const resp=await mf.dispatchFetch('http://localhost'+path,{method:body===undefined?'GET':'POST',headers,body:payload});
 return {status:resp.status,data:resp.headers.get('Content-Type')?.includes('json')?await resp.json():await resp.arrayBuffer()};
}
async function ok(path,who,body,expected=200){const r=await api(path,who,body);assert.equal(r.status,expected,path+': '+JSON.stringify(r.data));return r.data;}
async function login(email){
 const a=await ok('/api/auth/start',null,{email}),r=await mf.dispatchFetch('http://localhost/api/auth/complete',{
  method:'POST',headers:{Origin:'http://localhost','Content-Type':'application/json'},
  body:JSON.stringify({email,token:new URL(a.localSignInUrl).searchParams.get('token')})
 });
 assert.equal(r.status,200);
 return {email,cookie:r.headers.get('Set-Cookie').split(';')[0],id:(await first('SELECT id FROM users WHERE email=?',email)).id};
}
const staffBase='/api/w/staff/operations';
try{
 for(const q of JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'})))await db.prepare(q).run();
 for(const q of catalogueSql().split('\n'))await db.prepare(q).run();
 const operator=await login('portal-ops@example.test'),inspector=await login('portal-inspector@example.test'),
 reviewer=await login('portal-reviewer@example.test'),landlord=await login('portal-landlord@example.test'),
 tenant=await login('portal-tenant@example.test'),resident=await login('portal-council@example.test'),
 commercial=await login('portal-commercial@example.test'),strata=await login('portal-strata@example.test');
 await run("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",operator.id);
 for(const p of [inspector,reviewer])await run("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'inspector',1)",p.id);
 const at='2026-01-01T00:00:00.000Z';
 const home=await ok('/api/onboarding',landlord,{displayName:'Synthetic owner',clientName:'Synthetic residential'},201);
 const landlordId=home.clientId;
 await run("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p_pcr','11 Example Street','Perth','6000',?,'residential',?)",randomUUID(),at);
 await run("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('l_pcr',?,'p_pcr','owner',?)",landlordId,at);
 await run("INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES('m_pcr','p_pcr',?,'self_managed',?)",landlordId,at);
 await run("INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('tenancy_pcr','p_pcr','active',?)",at);
 await run("INSERT INTO tenancy_memberships(id,tenancy_id,user_id,starts_at) VALUES('tm_pcr','tenancy_pcr',?,?)",tenant.id,at);
 await run("INSERT INTO schedule_resources(id,name,active) VALUES('r_pcr','Synthetic fixture resource',1)");
 const start=new Date(Date.now()+24*3600000).toISOString(),end=new Date(Date.now()+25*3600000).toISOString();
 await run("INSERT INTO bookings(id,reference,client_id,user_id,property_id,service_id,resource_id,starts_at,ends_at,reserved_start,reserved_end,snapshot_json,request_key,fingerprint,created_at) VALUES('b_pcr','B-PCR',?,?,'p_pcr','property-condition-report','r_pcr',?,?,?,?, '{}',?,?,?)",landlordId,landlord.id,start,end,start,end,'unique-pcr-book','fixture-hash',at);
 await run("INSERT INTO work_orders(id,reference,booking_id,client_id,property_id,title,status,assigned_staff_id,created_at,updated_at) VALUES('wo_pcr','WO-PCR','b_pcr',?,'p_pcr','Entry PCR','assigned',?,?,?)",landlordId,inspector.id,at,at);
 // Approved commercial relationship, independently separated from residential tenancy.
 await run("INSERT INTO clients(id,name,client_type,created_at) VALUES('cli_comm','Synthetic Commercial','asset_manager',?)",at);
 await run("INSERT INTO client_entitlements(client_id,workspace_kind,created_at) VALUES('cli_comm','commercial',?)",at);
 await run("INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES('cm_comm','cli_comm',?,'owner',?)",commercial.id,at);
 await run("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p_comm','50 Commercial Street','Perth','6000',?,'commercial',?)",randomUUID(),at);
 await run("INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES('link_comm','cli_comm','p_comm','asset_manager',?)",at);
 await run("INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES('mgr_comm','p_comm','cli_comm','commercial_managed',?)",at);
 await run("INSERT INTO work_orders(id,reference,client_id,property_id,title,status,assigned_staff_id,created_at,updated_at) VALUES('wo_comm','WO-COMM','cli_comm','p_comm','Commercial condition','assigned',?,?,?)",inspector.id,at,at);
 // Scheme-only inspection. The same real identity has both resident and council membership.
 await run("INSERT INTO clients(id,name,client_type,created_at) VALUES('cli_strata','Synthetic Scheme Management','strata_company',?)",at);
 await run("INSERT INTO client_entitlements(client_id,workspace_kind,created_at) VALUES('cli_strata','strata-manager',?)",at);
 await run("INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES('cm_strata','cli_strata',?,'owner',?)",strata.id,at);
 await run("INSERT INTO strata_schemes(id,name,scheme_number,created_at) VALUES('s_shared','Synthetic Shared Building','SP-REVIEW',?)",at);
 await run("INSERT INTO scheme_client_links(id,scheme_id,client_id,role,starts_at) VALUES('scm_strata','s_shared','cli_strata','strata_manager',?)",at);
 for(const [i,role] of ['resident','council_member'].entries())await run("INSERT INTO scheme_memberships(id,user_id,scheme_id,role,starts_at,approved_by) VALUES(?,?,?,?,?,?)",'membership'+i,resident.id,'s_shared',role,at,operator.id);
 await run("INSERT INTO work_orders(id,reference,client_id,scheme_id,title,status,assigned_staff_id,created_at,updated_at) VALUES('wo_scheme','WO-SCHEME','cli_strata','s_shared','Common property inspection','assigned',?,?,?)",inspector.id,at,at);
 async function approvedReport(workOrderId,recipientKind,recipientId,extra={}){
   const created=await ok(staffBase+'/reports/create',inspector,{workOrderId,reportType:workOrderId==='wo_pcr'?'entry':'routine',...extra});
   const id=created.id,p=staffBase+'/reports/'+id;
   const initial=await ok(p,inspector);
   await ok(p+'/reviewer',operator,{reviewerId:reviewer.id});
   const draft=initial.draft.content;
   draft.summary='Inspected accessible areas and documented observed condition.';
   draft.areas[0].components[0].conditionCategory='intact';
   draft.areas[0].components[0].cleanlinessCategory='clean';
   draft.areas[0].components[0].commentary='Accessible component appears intact and clean on visual inspection.';
   await ok(p+'/save',inspector,{revision:2,content:draft});
   const form=new FormData();form.set('areaId','area_general');
   form.set('file',new File([readFileSync('tests/fixtures/report-photo.jpg')],'synthetic.jpg',{type:'image/jpeg'}));
   const photo=await ok(p+'/evidence',inspector,form);
   assert.equal((await api(p+'/submit',inspector,{revision:4})).status,409,'Unreviewed evidence must block issue');
   await ok(p+'/evidence/'+photo.id+'/review',reviewer,{decision:'accepted'});
   const submitted=await ok(p+'/submit',inspector,{revision:4});assert.equal(submitted.status,'submitted');
   await ok(p+'/review',reviewer,{revision:5,decision:'approved',comment:'Reviewed report and evidence.'});
   const rendered=await ok(p+'/render',operator,{});
   assert.ok(rendered.documentId);
   const issued=await ok(p+'/issue',operator,{audience:recipientKind,recipientId,reviewReference:'Synthetic independent review'});
   return {id,documentId:rendered.documentId,versionId:submitted.versionId,issued};
 }
 let pcr;
 await check('Entry PCR starts against the canonical tenancy and becomes tenant-visible only after issue',async()=>{
   assert.equal((await ok('/api/w/tenant/tenancy_pcr/reports',tenant)).reports.length,0);
   pcr=await approvedReport('wo_pcr','tenancy','tenancy_pcr',{tenancyId:'tenancy_pcr'});
   assert.equal((await ok('/api/w/tenant/tenancy_pcr/reports',tenant)).reports.length,1);
   assert.equal((await api('/api/w/tenant/tenancy_pcr/documents/'+pcr.documentId+'/download',tenant)).status,200);
   assert.equal((await api('/api/w/landlord/'+landlordId+'/reports/'+pcr.id,landlord)).status,404);
 });
 await check('Tenant submits component-linked response without mutating approved report version',async()=>{
   const original=await first('SELECT content_sha256 FROM report_versions WHERE id=?',pcr.versionId);
   const body={generalNote:'The entry wall description differs from the observed appearance.',
      entries:[{areaId:'area_general',componentId:'component_general',comment:'The wall colour appears different.'}]};
   const response=await ok('/api/w/tenant/tenancy_pcr/reports/'+pcr.id+'/response',tenant,body);
   assert.equal(response.status,'submitted');
   assert.equal((await ok('/api/w/tenant/tenancy_pcr/reports/'+pcr.id+'/response',tenant,body)).replayed,true);
   assert.equal((await first('SELECT content_sha256 FROM report_versions WHERE id=?',pcr.versionId)).content_sha256,original.content_sha256);
   assert.equal((await api('/api/w/commercial/cli_comm/reports/'+pcr.id,commercial)).status,404);
   const envelope=await first('SELECT response_envelope FROM report_responses WHERE id=?',response.id);
   assert.ok(!envelope.response_envelope.includes('wall colour'));
 });
 let scheme;
 await check('Scheme-only Work Order supports report approval and council-only issuance',async()=>{
   scheme=await approvedReport('wo_scheme','scheme_council','s_shared');
   assert.equal((await ok('/api/w/council/s_shared/reports',resident)).reports.length,1);
   assert.equal((await ok('/api/w/building/s_shared/reports',resident)).reports.length,0);
   assert.equal((await api('/api/w/council/s_shared/documents/'+scheme.documentId+'/download',resident)).status,200);
   assert.equal((await api('/api/w/building/s_shared/documents/'+scheme.documentId+'/download',resident)).status,404);
 });
 await check('separate resident grant authorises the Building workspace without privilege union',async()=>{
   await ok(staffBase+'/reports/'+scheme.id+'/issue',operator,{audience:'scheme_resident',recipientId:'s_shared',reviewReference:'Reviewed resident issue'});
   assert.equal((await ok('/api/w/building/s_shared/reports',resident)).reports.length,1);
   assert.equal((await api('/api/w/building/s_shared/documents/'+scheme.documentId+'/download',resident)).status,200);
 });
 await check('Commercial client receives only its independently issued portfolio report',async()=>{
   const c=await approvedReport('wo_comm','client','cli_comm');
   assert.equal((await ok('/api/w/commercial/cli_comm/reports',commercial)).reports.length,1);
   assert.equal((await api('/api/w/commercial/cli_comm/documents/'+c.documentId+'/download',commercial)).status,200);
   assert.equal((await api('/api/w/landlord/'+landlordId+'/reports/'+c.id,landlord)).status,404);
   assert.equal((await api('/api/w/commercial/cli_comm/reports/'+pcr.id,commercial)).status,404);
 });
 writeFileSync('artifacts/reporting-portals-results.json',JSON.stringify({checks:checks.length,passed:checks,deployed:false},null,2));
 console.log(checks.length+' cross-portal report acceptance checks passed.');
}finally{await mf.dispose();}
