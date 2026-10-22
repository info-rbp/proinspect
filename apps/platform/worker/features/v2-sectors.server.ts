import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {operationsWrite,administrator} from '../../../../packages/authorization/server';
import {activity,guard,clearGuard,recordId,reference,shortText,isoDate} from '../../../../packages/operations/core';
import {validSectorFacts} from '../../../../packages/v2/sectors';
const packId=z.string().regex(/^[A-Z]{3}:pack:v[0-9]+$/);
const moduleId=z.string().regex(/^[A-Z]{3}-M[0-9]{2}$/);
const assetId=z.string().regex(/^[A-Za-z0-9:_-]+$/).max(180);
function staff(user:Principal,w:Workspace) {
 assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),403,
 'V2_SECTORS_STAFF_REQUIRED','Sector packs require authorised ProInspect operations.');
 operationsWrite(user);
}
function supervisor(user:Principal,w:Workspace){staff(user,w);administrator(user);}
async function tx(env:Env,user:Principal,sql:string,args:(string|number|null)[],event:string,entity:string,id:string){
 await env.DB.batch([statement(env.DB,sql,...args),guard(env),activity(env,user,event,entity,id),clearGuard(env)]);
}
export async function sectorData(env:Env,user:Principal,w:Workspace){
 staff(user,w);
 const sql=[
  'SELECT id,market_code,version,label,status,governance_boundary,approval_reference,approved_at FROM v2_sector_packs ORDER BY market_code,version DESC',
  'SELECT code,pack_id,name,classification,purpose,required_fields_json,status,review_reference FROM v2_sector_modules ORDER BY code',
  'SELECT pack_id,check_code,status,evidence_reference,verified_at FROM v2_sector_release_checks ORDER BY pack_id,check_code',
  'SELECT id,module_code,qualified_provider,credential_reference,valid_until,status FROM v2_sector_module_clearances ORDER BY created_at DESC LIMIT 150',
  'SELECT r.id,r.pack_id,r.engagement_id,r.status,r.authority_reference,r.pilot_started_at,r.live_started_at,e.reference AS engagement_reference,e.market_code FROM v2_sector_rollouts r JOIN v2_engagements e ON e.id=r.engagement_id ORDER BY r.created_at DESC LIMIT 150',
  'SELECT id,rollout_id,module_code,asset_id,source_key,status,created_at FROM v2_sector_records ORDER BY created_at DESC LIMIT 150',
  "SELECT id,reference,market_code,client_id,property_id,scheme_id FROM v2_engagements WHERE status='active' ORDER BY created_at DESC LIMIT 250",
  'SELECT code,name,enabled FROM v2_markets ORDER BY code'
 ];
 const names=['packs','modules','checks','clearances','rollouts','records','engagements','markets'];
 const rows=await Promise.all(sql.map(s=>statement(env.DB,s).all()));
 const result:Record<string,unknown>={draftOnly:true,deliveryBoundary:'Coordinated property operations; reserved statutory or clinical services remain with appointed and qualified providers.'};
 rows.forEach((r,i)=>result[names[i]]=r.results);
 return result;
}
export async function sectorCommand(env:Env,user:Principal,w:Workspace,path:string[],input:unknown){
 staff(user,w);
 const [area,rawId,operation]=path;
 let id=rawId;
 if(id){try{id=decodeURIComponent(id);}catch{assert(false,422,'V2_SECTOR_ID_INVALID','Invalid market pack identifier.');}}
 if(area==='modules'&&id&&operation==='review'){
  const d=z.object({status:z.enum(['approved','excluded']),reviewReference:reference}).parse(input);
  const m=await statement(env.DB,
   'SELECT m.status,p.status AS pack_status FROM v2_sector_modules m JOIN v2_sector_packs p ON p.id=m.pack_id WHERE m.code=?',id).first<{status:string;pack_status:string}>();
  assert(m&&m.status==='draft'&&m.pack_status!=='approved',409,'V2_MODULE_LOCKED','This module version has already been reviewed or approved.');
  await tx(env,user,"UPDATE v2_sector_modules SET status=?,review_reference=?,reviewed_by=?,reviewed_at=? WHERE code=? AND status='draft'",
   [d.status,d.reviewReference,user.id,now(),id],'v2.module_reviewed','sector-module',id);
  return {moduleCode:id,status:d.status};
 }
 if(area==='checks'&&!id){
  const d=z.object({packId,checkCode:z.enum(['governance','service_scope','pricing','insurance','credentials','privacy','workflow_acceptance']),
    status:z.enum(['verified','rejected']),evidenceReference:reference}).parse(input);
  await tx(env,user,'UPDATE v2_sector_release_checks SET status=?,evidence_reference=?,verified_by=?,verified_at=? WHERE pack_id=? AND check_code=?',
   [d.status,d.evidenceReference,user.id,now(),d.packId,d.checkCode],'v2.sector_release_check','sector-check',d.packId+':'+d.checkCode);
  return {packId:d.packId,checkCode:d.checkCode,status:d.status};
 }
 if(area==='clearances'&&!id){
  supervisor(user,w);
  const d=z.object({moduleCode:moduleId,qualifiedProvider:shortText,credentialReference:reference,
   independentCheckReference:reference,validUntil:isoDate}).parse(input);
  assert(d.validUntil>now(),422,'V2_CLEARANCE_EXPIRED','The external qualification must be current.');
  const m=await statement(env.DB,'SELECT classification FROM v2_sector_modules WHERE code=?',d.moduleCode).first<{classification:string}>();
  assert(m?.classification==='reserved_external',422,'V2_CLEARANCE_RESERVED_ONLY','These checks apply to reserved external functions.');
  const key=uid('v2clear');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_sector_module_clearances(id,module_code,qualified_provider,credential_reference,independent_check_reference,valid_until,verified_by,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
   key,d.moduleCode,d.qualifiedProvider,d.credentialReference,d.independentCheckReference,d.validUntil,user.id,now(),now()),
   activity(env,user,'v2.reserved_provider_clearance','sector-clearance',key)]);
  return {id:key};
 }
 if(area==='clearances'&&id&&operation==='revoke'){
  supervisor(user,w);
  await tx(env,user,"UPDATE v2_sector_module_clearances SET status='revoked' WHERE id=? AND status='verified'",
    [id],'v2.reserved_provider_revoked','sector-clearance',id);return {id,status:'revoked'};
 }
 if(area==='packs'&&id&&operation==='approve'){
  supervisor(user,w);
  const d=z.object({approvalReference:reference}).parse(input);
  await tx(env,user,"UPDATE v2_sector_packs SET status='approved',approval_reference=?,approved_by=?,approved_at=? WHERE id=? AND status IN('draft','review')",
    [d.approvalReference,user.id,now(),id],'v2.sector_pack_approved','sector-pack',id);
  return {id,status:'approved'};
 }
 if(area==='rollouts'&&!id){
  const d=z.object({packId,engagementId:recordId}).parse(input);
  const key=uid('v2roll');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_sector_rollouts(id,pack_id,engagement_id,created_by,created_at) VALUES(?,?,?,?,?)',
   key,d.packId,d.engagementId,user.id,now()),
   activity(env,user,'v2.sector_pilot_proposed','sector-rollout',key)]);
  return {id:key};
 }
 if(area==='rollouts'&&id&&operation==='state'){
  supervisor(user,w);
  const d=z.object({status:z.enum(['pilot','live','paused','ended']),authorityReference:reference}).parse(input);
  const current=await statement(env.DB,'SELECT status FROM v2_sector_rollouts WHERE id=?',id).first<{status:string}>();
  assert(current,404,'V2_ROLLOUT_NOT_FOUND','Sector rollout not found.');
  const allowed:Record<string,string[]>={draft:['pilot','ended'],pilot:['live','paused','ended'],live:['paused','ended'],paused:['pilot','ended']};
  assert(allowed[current.status]?.includes(d.status),409,'V2_ROLLOUT_TRANSITION','Invalid pilot lifecycle transition.');
  await tx(env,user,'UPDATE v2_sector_rollouts SET status=?,authority_reference=?,approved_by=?,approved_at=?,pilot_started_at=CASE WHEN ?=? THEN COALESCE(pilot_started_at,?) ELSE pilot_started_at END,live_started_at=CASE WHEN ?=? THEN COALESCE(live_started_at,?) ELSE live_started_at END WHERE id=? AND status=?',
   [d.status,d.authorityReference,user.id,now(),d.status,'pilot',now(),d.status,'live',now(),id,current.status],
   'v2.sector_rollout_state','sector-rollout',id);
  return {id,status:d.status};
 }
 if(area==='records'&&!id){
  const d=z.object({rolloutId:recordId,moduleCode:moduleId,assetId:assetId.optional(),sourceKey:reference,
   facts:z.record(z.string(),z.string())}).parse(input);
  const m=await statement(env.DB,
   'SELECT required_fields_json FROM v2_sector_modules WHERE code=?',d.moduleCode).first<{required_fields_json:string}>();
  assert(m,404,'V2_SECTOR_MODULE_NOT_FOUND','Choose an approved module.');
  const required=JSON.parse(m.required_fields_json) as string[];
  assert(validSectorFacts(required,d.facts),422,'V2_SECTOR_FIELDS_INVALID',
    'Only approved operational references and non-sensitive notes may be stored for this specialist module.');
  const key=uid('v2sectorrec');
  await env.DB.batch([statement(env.DB,
   'INSERT INTO v2_sector_records(id,rollout_id,module_code,asset_id,source_key,facts_json,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
   key,d.rolloutId,d.moduleCode,d.assetId??null,d.sourceKey,JSON.stringify(d.facts),user.id,now()),
   activity(env,user,'v2.sector_record_submitted','sector-record',key)]);
  return {id:key};
 }
 if(area==='records'&&id&&operation==='review'){
  const d=z.object({status:z.enum(['accepted','rejected']),reviewReference:reference}).parse(input);
  const r=await statement(env.DB,'SELECT recorded_by,status FROM v2_sector_records WHERE id=?',id).first<{recorded_by:string;status:string}>();
  assert(r&&r.status==='submitted',409,'V2_SECTOR_RECORD_LOCKED','Record already reviewed.');
  assert(r.recorded_by!==user.id,403,'V2_SECTOR_SELF_REVIEW','An independent reviewer is required.');
  await tx(env,user,"UPDATE v2_sector_records SET status=?,review_reference=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='submitted'",
    [d.status,d.reviewReference,user.id,now(),id],'v2.sector_record_reviewed','sector-record',id);
  return {id,status:d.status};
 }
 assert(false,404,'V2_SECTOR_COMMAND_UNKNOWN','Sector configuration operation not found.');
}
