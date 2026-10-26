import {z} from 'zod';
import {assert,statement,uid,now,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {schemeAccess,operationsWrite} from '../../../../packages/authorization/server';
import {buildingAccess,buildingsFor} from '../../../../packages/authorization/building';
import {digest} from '../../../../packages/auth/crypto';
import {activity,guard,clearGuard,recordId,isoDate,shortText,version} from '../../../../packages/operations/core';
import {requireReleaseApproval} from './release-governance.server';
const noticeInput=z.object({title:shortText,body:z.string().trim().min(10).max(5000),audience:z.enum(['residents','owners','council','all_members']),startsAt:isoDate.optional(),expiresAt:isoDate.optional()});
export async function noticeDraftData(env:Env,user:Principal,w:Workspace){
 await requireReleaseApproval(env,'notices');assert(['staff','strata-manager','building-manager'].includes(w.kind),403,'NOTICE_PREPARATION_SCOPE','Use an authorised operational workspace.');
 const buildings=await buildingsFor(env,user,w),ids=buildings.map(b=>b.id);
 const drafts=ids.length?(await statement(env.DB,`SELECT * FROM building_notice_drafts WHERE building_id IN(${ids.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 100`,...ids).all()).results:[];
 return {buildings,drafts};
}
export async function noticeDraftCommand(env:Env,user:Principal,w:Workspace,command:string,input:unknown){
 await requireReleaseApproval(env,'notices');
 if(command==='create'){
  const d=noticeInput.extend({buildingId:recordId}).parse(input),b=await buildingAccess(env,user,w,d.buildingId,true),start=d.startsAt??now();assert(!d.expiresAt||d.expiresAt>start,422,'NOTICE_DATES','Expiry must follow publication.');
  const id=uid('bnd'),hash=await digest(JSON.stringify({buildingId:b.id,title:d.title,body:d.body,audience:d.audience,startsAt:start,expiresAt:d.expiresAt??null}));
  await env.DB.batch([statement(env.DB,'INSERT INTO building_notice_drafts(id,building_id,scheme_id,title,body,audience,content_sha256,starts_at,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,b.id,b.scheme_id,d.title,d.body,d.audience,hash,start,d.expiresAt??null,user.id,now()),activity(env,user,'building.notice_drafted','notice_draft',id,null,b.scheme_id)]);return {id,status:'submitted',contentSha256:hash};
 }
 assert(['publish','reject'].includes(command),404,'NOTICE_DRAFT_ACTION','Unknown notice action.');
 assert(['staff','strata-manager'].includes(w.kind),403,'MANAGING_REVIEW_REQUIRED','A separate managing representative must review publication.');if(w.kind==='staff')operationsWrite(user);
 const d=z.object({draftId:recordId,reference:z.string().trim().min(8).max(500)}).parse(input),draft=await statement(env.DB,'SELECT * FROM building_notice_drafts WHERE id=?',d.draftId).first<Record<string,any>>();
 assert(draft&&draft.status==='submitted',409,'NOTICE_DRAFT_CHANGED','The draft is no longer awaiting review.');await schemeAccess(env,user,w,draft.scheme_id,true);assert(draft.created_by!==user.id,403,'INDEPENDENT_NOTICE_REVIEW','Another authorised representative must review the exact draft.');
 assert(!draft.expires_at||draft.expires_at>now(),409,'NOTICE_EXPIRED','Prepare a new draft with current dates.');
 const id=command==='publish'?uid('notice'):null,steps:D1PreparedStatement[]=[];
 if(id)steps.push(statement(env.DB,'INSERT INTO building_notices(id,scheme_id,building_id,title,body,audience,starts_at,expires_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)',id,draft.scheme_id,draft.building_id,draft.title,draft.body,draft.audience,draft.starts_at,draft.expires_at,user.id),statement(env.DB,'INSERT INTO notice_dispatch_jobs(notice_id,available_at) VALUES(?,?)',id,draft.starts_at));
 steps.push(statement(env.DB,"UPDATE building_notice_drafts SET status=?,reviewed_by=?,review_reference=?,reviewed_at=?,notice_id=? WHERE id=? AND status='submitted'",id?'published':'rejected',user.id,d.reference,now(),id,draft.id),guard(env),activity(env,user,'building.notice_draft_'+command,'notice_draft',draft.id,null,draft.scheme_id,{reference:d.reference,contentSha256:draft.content_sha256}),clearGuard(env));
 await env.DB.batch(steps);return {id:draft.id,status:id?'published':'rejected',noticeId:id};
}
/** Revision is replacement, not an in-place rewrite: old queued delivery is suppressed by its withdrawal. */
export async function reviseNotice(env:Env,user:Principal,w:Workspace,schemeId:string,id:string,input:unknown){
 await requireReleaseApproval(env,'notices');await schemeAccess(env,user,w,schemeId,true);if(w.kind==='staff')operationsWrite(user);
 const d=noticeInput.extend({version,reference:z.string().trim().min(8).max(500)}).parse(input);
 const old=await statement(env.DB,'SELECT * FROM building_notices WHERE id=? AND scheme_id=?',id,schemeId).first<Record<string,any>>();assert(old&&old.version===d.version&&!old.withdrawn_at,409,'NOTICE_CHANGED','Reload the current notice before revising.');
 const start=d.startsAt??now();assert(!d.expiresAt||d.expiresAt>start,422,'NOTICE_DATES','Expiry must follow publication.');const next=uid('notice'),time=now();
 await env.DB.batch([
 statement(env.DB,'UPDATE building_notices SET withdrawn_at=?,version=version+1 WHERE id=? AND version=? AND withdrawn_at IS NULL',time,id,d.version),guard(env),
 statement(env.DB,"UPDATE notice_dispatch_jobs SET status='cancelled',lease_token=NULL,lease_until=NULL WHERE notice_id=?",id),
 statement(env.DB,'DELETE FROM notifications WHERE id IN(SELECT notification_id FROM notice_deliveries WHERE notice_id=?)',id),
 statement(env.DB,'INSERT INTO building_notices(id,scheme_id,title,body,audience,starts_at,expires_at,created_by,work_order_id,building_id,lot_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',next,schemeId,d.title,d.body,d.audience,start,d.expiresAt??null,user.id,old.work_order_id,old.building_id,old.lot_id),
 statement(env.DB,'INSERT INTO notice_dispatch_jobs(notice_id,available_at) VALUES(?,?)',next,start),
 statement(env.DB,'INSERT INTO notice_supersessions(old_notice_id,new_notice_id,actor_id,reference,created_at) VALUES(?,?,?,?,?)',id,next,user.id,d.reference,time),
 activity(env,user,'building.notice_revised','notice',next,null,schemeId,{supersedes:id,reference:d.reference}),clearGuard(env)]);
 return {id:next,supersedes:id,version:1};
}
export async function noticeHistory(env:Env,user:Principal,w:Workspace,schemeId:string,id:string){await schemeAccess(env,user,w,schemeId,true);assert(await statement(env.DB,'SELECT id FROM building_notices WHERE id=? AND scheme_id=?',id,schemeId).first(),404,'NOTICE_NOT_FOUND','Notice not found.');return {history:(await statement(env.DB,'SELECT * FROM notice_revision_history WHERE notice_id=? ORDER BY version',id).all()).results};}
