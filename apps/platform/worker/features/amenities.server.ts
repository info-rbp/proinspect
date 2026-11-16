import {z} from 'zod';
import {assert,statement,now,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {schemeAccess,schemesFor,operationsWrite} from '../../../../packages/authorization/server';

const id=z.string().min(4).max(100).regex(/^[a-zA-Z0-9_-]+$/);
const date=z.string().datetime({offset:true});
function enabled(env:Env){assert(env.STRATA_AMENITIES_ENABLED==='true',503,'AMENITIES_NOT_RELEASED',
  'Strata amenity reservations are not yet activated.');}
export async function amenityDirectory(env:Env,user:Principal,w:Workspace){
  enabled(env);
  assert(['strata-manager','building'].includes(w.kind),403,'AMENITY_SCOPE',
    'Only authorised strata managers and invited building residents can use amenity requests.');
  const schemes=await schemesFor(env,user,w);
  const all:Record<string,unknown>[]=[];
  for(const scheme of schemes.slice(0,100)){
    await schemeAccess(env,user,w,scheme.id);
    const amenities=(await statement(env.DB,
      'SELECT id,scheme_id,name,description,active FROM strata_amenities WHERE scheme_id=? AND active=1 ORDER BY name',
      scheme.id).all<Record<string,unknown>>()).results;
    all.push(...amenities);
  }
  const mine=(await statement(env.DB,
    `SELECT r.id,r.amenity_id,r.starts_at,r.ends_at,r.status,a.name
       FROM strata_amenity_requests r JOIN strata_amenities a ON a.id=r.amenity_id
       WHERE r.requester_id=? ORDER BY r.created_at DESC LIMIT 100`,user.id).all()).results;
  const manager=w.kind==='strata-manager'&&['owner','admin','member'].includes(w.role);
  const reviews:Record<string,unknown>[]=[];
  if(manager)for(const s of schemes.slice(0,100)){
    const rows=(await statement(env.DB,
      `SELECT r.id,r.amenity_id,r.starts_at,r.ends_at,r.status,a.name
       FROM strata_amenity_requests r JOIN strata_amenities a ON a.id=r.amenity_id
       WHERE a.scheme_id=? AND r.status='requested' ORDER BY r.starts_at LIMIT 100`,
      s.id).all<Record<string,unknown>>()).results;
    reviews.push(...rows);
  }
  // No renter identity or other resident's reservations are exposed.
  return {schemes,amenities:all,mine,reviews,manager};
}
export async function amenityCommand(env:Env,user:Principal,w:Workspace,input:unknown){
  enabled(env);
  const command=z.discriminatedUnion('action',[
    z.object({action:z.literal('create'),schemeId:id,name:z.string().trim().min(3).max(100),
      description:z.string().trim().max(400)}),
    z.object({action:z.literal('request'),amenityId:id,startsAt:date,endsAt:date}),
    z.object({action:z.literal('cancel'),requestId:id}),
    z.object({action:z.literal('review'),requestId:id,decision:z.enum(['approved','declined']),
      reference:z.string().trim().min(8).max(240)}),
  ]).parse(input);
  const timestamp=now();
  if(command.action==='create'){
    assert(w.kind==='strata-manager'&&['owner','admin'].includes(w.role),403,'MANAGER_REQUIRED',
      'An authorised strata management account administrator must configure facilities.');
    await schemeAccess(env,user,w,command.schemeId,true);
    const amenityId=uid('am');
    await statement(env.DB,
      `INSERT INTO strata_amenities(id,scheme_id,name,description,created_by,created_at)
       VALUES(?,?,?,?,?,?)`,amenityId,command.schemeId,command.name,command.description,user.id,timestamp).run();
    return {ok:true,id:amenityId};
  }
  if(command.action==='request'){
    assert(w.kind==='building',403,'RESIDENT_MEMBERSHIP_REQUIRED','Only an invited building resident can request a shared amenity.');
    const a=await statement(env.DB,
      'SELECT id,scheme_id FROM strata_amenities WHERE id=? AND active=1',command.amenityId)
      .first<{id:string;scheme_id:string}>();
    assert(a,404,'AMENITY_NOT_FOUND','The selected amenity is unavailable.');
    await schemeAccess(env,user,w,a.scheme_id);
    const start=Date.parse(command.startsAt),end=Date.parse(command.endsAt);
    assert(start>Date.now()&&end>start&&end-start<=12*3600000&&start<=Date.now()+180*86400000,
      422,'AMENITY_WINDOW','Choose a future period of at most twelve hours within six months.');
    const existing=await statement(env.DB,
      `SELECT id FROM strata_amenity_requests
       WHERE amenity_id=? AND requester_id=? AND starts_at=? AND ends_at=?
         AND status IN ('requested','approved')`,
      a.id,user.id,command.startsAt,command.endsAt).first<{id:string}>();
    if(existing)return {ok:true,id:existing.id,replayed:true};
    const reqId=uid('amr');
    await statement(env.DB,
      'INSERT INTO strata_amenity_requests(id,amenity_id,requester_id,starts_at,ends_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
      reqId,a.id,user.id,command.startsAt,command.endsAt,timestamp,timestamp).run();
    return {ok:true,id:reqId,status:'requested',message:'The request needs manager approval; this is not an automatic reservation.'};
  }
  const r=await statement(env.DB,
    `SELECT r.id,r.requester_id,r.status,r.amenity_id,r.starts_at,a.scheme_id
       FROM strata_amenity_requests r JOIN strata_amenities a ON a.id=r.amenity_id WHERE r.id=?`,
    command.requestId).first<{id:string;requester_id:string;status:string;amenity_id:string;starts_at:string;scheme_id:string}>();
  assert(r,404,'REQUEST_NOT_FOUND','Amenity request not found.');
  if(command.action==='cancel'){
    assert(r.requester_id===user.id&&w.kind==='building',403,'RESIDENT_REQUEST_ONLY','Only the original resident may cancel.');
    await schemeAccess(env,user,w,r.scheme_id);
    assert(r.status==='requested'&&r.starts_at>timestamp,409,'CANCELLATION_LOCKED','Contact your manager for approved reservation changes.');
    await statement(env.DB,"UPDATE strata_amenity_requests SET status='cancelled',updated_at=? WHERE id=? AND status='requested'",
      timestamp,r.id).run();
    return {ok:true,id:r.id,status:'cancelled'};
  }
  assert(w.kind==='strata-manager'&&['owner','admin'].includes(w.role),403,'MANAGER_REQUIRED','An authorised strata manager must review.');
  await schemeAccess(env,user,w,r.scheme_id,true);
  assert(r.status==='requested',409,'REVIEW_LOCKED','This request has already been decided.');
  try{
    await statement(env.DB,
      `UPDATE strata_amenity_requests SET status=?,reviewed_by=?,review_reference=?,updated_at=?
       WHERE id=? AND status='requested'`,
      command.decision,user.id,command.reference,timestamp,r.id).run();
  }catch(e){
    if(String(e).includes('AMENITY_SLOT_CONFLICT'))throw new Error('AMENITY_SLOT_CONFLICT: another approved reservation overlaps.');
    throw e;
  }
  return {ok:true,id:r.id,status:command.decision};
}
