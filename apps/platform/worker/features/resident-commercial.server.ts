import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, clientMembership, propertyAccess } from '../../../../packages/authorization/server';
import { email } from '../../../../packages/validation/index';
import { recordId, shortText, reference, isoDate, activity, guard, clearGuard } from '../../../../packages/operations/core';
import { randomToken, digest } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';

const invitationInput = z.object({
  propertyId: recordId,
  email,
  premisesLabel: shortText,
  relationshipKind: z.enum(['tenant_contact','employee','contractor','other_occupant']),
  authorityReference: reference,
  endsAt: isoDate.optional(),
});
type OccupancyRow = {
  id: string; property_id: string; client_id: string; address: string; premises_label: string;
  relationship_kind: string; starts_at: string; ends_at: string | null;
};
/** Property managers must be account admins AND have an active commercial property relationship. */
async function managerAccess(env: Env, user: Principal, w: Workspace, propertyId?: string) {
  assert(['commercial','property-manager'].includes(w.kind), 403, 'COMMERCIAL_MANAGER_REQUIRED',
    'Use the authorised commercial management account.');
  await clientAdmin(env, user, w);
  if (propertyId) {
    const p = await propertyAccess(env, user, w, propertyId, true);
    assert(p.sector === 'commercial', 422, 'COMMERCIAL_ONLY', 'Select commercial premises.');
  }
}
export async function inviteCommercialOccupant(env: Env, user: Principal, w: Workspace, input: unknown) {
  const d = invitationInput.parse(input);
  await managerAccess(env, user, w, d.propertyId);
  const time = now();
  if (d.endsAt) assert(d.endsAt > time, 422, 'OCCUPANCY_TERM', 'Choose a future end date.');
  const prior = await statement(env.DB, `
    SELECT i.token_hash FROM commercial_occupant_invitations i
    JOIN commercial_occupancies o ON o.id=i.occupancy_id
    WHERE o.property_id=? AND o.client_id=? AND i.email=? AND o.status='active'
      AND i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?
    LIMIT 1`, d.propertyId, w.scopeId, d.email, time).first();
  assert(!prior, 409, 'INVITATION_ALREADY_PENDING', 'An invitation is already pending for this property and email.');
  const id = uid('occ'), token = randomToken(),
    url = `${env.APP_ORIGIN}/invitations/accept?token=${token}`;
  await env.DB.batch([
    statement(env.DB, `INSERT INTO commercial_occupancies
      (id,property_id,client_id,premises_label,relationship_kind,authority_reference,starts_at,ends_at,created_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?)`,
      id, d.propertyId, w.scopeId, d.premisesLabel, d.relationshipKind, d.authorityReference,
      time, d.endsAt ?? null, user.id, time),
    statement(env.DB, `INSERT INTO commercial_occupant_invitations
      (token_hash,occupancy_id,email,created_by,expires_at,created_at) VALUES(?,?,?,?,?,?)`,
      await digest(token), id, d.email, user.id,
      new Date(Date.now()+14*86400000).toISOString(), time),
    await mailEvent(env, 'commercial.occupant_invited', {
      to:d.email, subject:'Your ProInspect commercial premises invitation',
      heading:'You have been invited to your premises',
      body:'Verify the invited email and accept your specific commercial premises relationship. This is not a residential tenancy or owner-management account.',
      href:url, sensitive:true,
    }),
    activity(env,user,'commercial.occupant_invited','commercial_occupancy',id,d.propertyId,null,
      {flowId:'ONB-INV-COM',version:'1.1.0',relationshipKind:d.relationshipKind}),
  ]);
  return {invited:true, occupancyId:id, ...(env.APP_ENV==='local'?{localInvitationUrl:url}:{})};
}
export async function commercialOccupancyAccess(env: Env, user: Principal, occupancyId: string): Promise<OccupancyRow> {
  const result = await statement(env.DB,`
    SELECT o.id,o.property_id,o.client_id,p.address,o.premises_label,o.relationship_kind,o.starts_at,o.ends_at
    FROM commercial_occupancies o
    JOIN commercial_occupant_memberships m ON m.occupancy_id=o.id
    JOIN clients c ON c.id=o.client_id AND c.status='active'
    JOIN client_entitlements e ON e.client_id=o.client_id AND e.workspace_kind='commercial' AND e.active=1
    JOIN properties p ON p.id=o.property_id AND p.sector='commercial' AND p.archived_at IS NULL
    JOIN property_management_relationships pm ON pm.property_id=o.property_id
      AND pm.manager_client_id=o.client_id AND pm.starts_at<=? AND (pm.ends_at IS NULL OR pm.ends_at>?)
    WHERE o.id=? AND m.user_id=? AND o.status='active'
      AND o.starts_at<=? AND (o.ends_at IS NULL OR o.ends_at>?)
      AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)`,
    now(),now(),occupancyId,user.id,now(),now(),now(),now()
  ).first<OccupancyRow>();
  assert(result,403,'OCCUPANCY_FORBIDDEN','This commercial occupancy relationship is unavailable.');
  return result;
}
export async function previewCommercialInvitation(env: Env, user: Principal, token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  return await statement(env.DB,`
    SELECT 'ONB-INV-COM' AS flow_id,'1.1.0' AS version,
      'Commercial premises occupant' AS role_label,
      p.address || ' / ' || o.premises_label AS property_label, i.expires_at
    FROM commercial_occupant_invitations i
    JOIN commercial_occupancies o ON o.id=i.occupancy_id
    JOIN properties p ON p.id=o.property_id AND p.sector='commercial' AND p.archived_at IS NULL
    WHERE i.token_hash=? AND i.email=? AND i.consumed_at IS NULL
      AND i.revoked_at IS NULL AND i.expires_at>? AND o.status='active'
      AND o.starts_at<=? AND (o.ends_at IS NULL OR o.ends_at>?)`,
    await digest(token),user.email,now(),now(),now()
  ).first<Record<string,unknown>>();
}
export async function acceptCommercialInvitation(env: Env,user:Principal,token:unknown) {
  if(typeof token!=='string'|| !/^[a-f0-9]{64}$/.test(token)) return null;
  const hash=await digest(token), time=now();
  const i=await statement(env.DB,`
    SELECT i.*,o.client_id,o.property_id,o.status,o.starts_at,o.ends_at
    FROM commercial_occupant_invitations i
    JOIN commercial_occupancies o ON o.id=i.occupancy_id
    WHERE i.token_hash=? AND i.email=? AND i.consumed_at IS NULL
      AND i.revoked_at IS NULL AND i.expires_at>? AND o.status='active'
      AND o.starts_at<=? AND (o.ends_at IS NULL OR o.ends_at>?)`,
    hash,user.email,time,time,time).first<Record<string,any>>();
  if(!i)return null;
  const inviter=await statement(env.DB,`
    SELECT u.id,u.email,u.display_name FROM users u WHERE u.id=? AND u.active=1
  `,i.created_by).first<Principal>();
  assert(inviter,403,'INVITATION_REVOKED','The inviting account is no longer authorised.');
  const m=await clientMembership(env,inviter,i.client_id,true);
  assert(['owner','admin'].includes(m.role),403,'INVITATION_REVOKED','The inviting authority has changed.');
  assert(await statement(env.DB,`SELECT client_id FROM client_entitlements
    WHERE client_id=? AND workspace_kind='commercial' AND active=1`,
    i.client_id).first(),403,'INVITATION_REVOKED','The commercial organisation access has been revoked.');

  const w:Workspace={kind:'commercial',scopeId:i.client_id,name:'Commercial',role:m.role,href:`/w/commercial/${i.client_id}`};
  await propertyAccess(env,inviter,w,i.property_id,true);
  const membershipId=uid('ocm');
  await env.DB.batch([
    statement(env.DB,'UPDATE commercial_occupant_invitations SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>?',time,hash,time),
    guard(env),
    statement(env.DB,`INSERT INTO commercial_occupant_memberships
      (id,occupancy_id,user_id,starts_at,ends_at,granted_by,created_at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(occupancy_id,user_id) DO NOTHING`,
      membershipId,i.occupancy_id,user.id,time,i.ends_at,i.created_by,time),
    activity(env,user,'commercial.occupancy_accepted','commercial_occupancy',i.occupancy_id,i.property_id,null,
      {flowId:'ONB-INV-COM',version:'1.1.0'}),
    clearGuard(env),
  ]);
  return {accepted:true,returnTo:`/w/commercial-occupant/${i.occupancy_id}`,occupancyId:i.occupancy_id};
}
export async function listCommercialOccupants(env:Env,user:Principal,w:Workspace) {
  await managerAccess(env,user,w);
  const occupants=(await statement(env.DB,`
    SELECT o.id,o.property_id,o.premises_label,o.relationship_kind,o.status,
      o.starts_at,o.ends_at,p.address,
      i.email AS invited_email,i.consumed_at,i.expires_at,i.revoked_at
    FROM commercial_occupancies o
    JOIN properties p ON p.id=o.property_id
    LEFT JOIN commercial_occupant_invitations i ON i.occupancy_id=o.id
    WHERE o.client_id=? ORDER BY o.created_at DESC LIMIT 150`,
    w.scopeId).all()).results;
  const requests=(await statement(env.DB,`
    SELECT r.id,r.occupancy_id,r.title,r.status,r.manager_response,r.created_at,
      o.premises_label,p.address
    FROM commercial_occupant_requests r JOIN commercial_occupancies o ON o.id=r.occupancy_id
    JOIN properties p ON p.id=o.property_id WHERE o.client_id=?
    ORDER BY r.created_at DESC LIMIT 150`,w.scopeId).all()).results;
  return {occupants,requests};
}
export async function endCommercialOccupancy(env:Env,user:Principal,w:Workspace,id:string) {
  await managerAccess(env,user,w);
  const o=await statement(env.DB,'SELECT property_id FROM commercial_occupancies WHERE id=? AND client_id=? AND status=\'active\'',id,w.scopeId).first<{property_id:string}>();
  assert(o,404,'OCCUPANCY_NOT_FOUND','Active occupancy not found.');
  await propertyAccess(env,user,w,o.property_id,true);
  const time=now();
  await env.DB.batch([
    statement(env.DB,"UPDATE commercial_occupancies SET status='ended',ends_at=? WHERE id=? AND client_id=? AND status='active'",time,id,w.scopeId),
    guard(env),
    statement(env.DB,'UPDATE commercial_occupant_invitations SET revoked_at=? WHERE occupancy_id=? AND consumed_at IS NULL AND revoked_at IS NULL',time,id),
    statement(env.DB,'UPDATE commercial_occupant_memberships SET ends_at=? WHERE occupancy_id=? AND (ends_at IS NULL OR ends_at>?)',time,id,time),
    activity(env,user,'commercial.occupancy_ended','commercial_occupancy',id,o.property_id),
    clearGuard(env),
  ]);
  return {ended:true};
}
export async function occupantWorkspaceData(env:Env,user:Principal,w:Workspace) {
  assert(w.kind==='commercial-occupant',403,'OCCUPANT_WORKSPACE_REQUIRED','Use the invited commercial occupant workspace.');
  const o=await commercialOccupancyAccess(env,user,w.scopeId);
  const requests=(await statement(env.DB,`
    SELECT id,title,status,created_at,updated_at,manager_response FROM commercial_occupant_requests
    WHERE occupancy_id=? AND created_by=? ORDER BY created_at DESC LIMIT 100`,
    o.id,user.id).all()).results;
  return {
    user,workspace:w,occupancy:{...o},properties:[],schemes:[],bookings:[],workOrders:[],
    requests,tenancies:[],inspections:[],notifications:[],staff:[],contractors:[],
    documents:[],services:[],subscriptionBookingServices:{},professionalPortfolioApproved:false,
    approvals:[],payments:[],plans:[],documentRequests:[],restrictedEnabled:false,
  };
}
export async function createOccupantRequest(env:Env,user:Principal,w:Workspace,input:unknown) {
  assert(w.kind==='commercial-occupant',403,'OCCUPANT_WORKSPACE_REQUIRED','Use your premises workspace.');
  const o=await commercialOccupancyAccess(env,user,w.scopeId);
  const d=z.object({title:z.string().trim().min(4).max(180),details:z.string().trim().min(10).max(5000)}).parse(input);
  const id=uid('ocr'),time=now();
  await env.DB.batch([
    statement(env.DB,`INSERT INTO commercial_occupant_requests
      (id,occupancy_id,created_by,title,details,created_at,updated_at) VALUES(?,?,?,?,?,?,?)`,
      id,o.id,user.id,d.title,d.details,time,time),
    activity(env,user,'commercial.occupant_request','commercial_occupancy',o.id,o.property_id),
  ]);
  return {id,status:'submitted'};
}
export async function updateOccupantRequest(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
  await managerAccess(env,user,w);
  const d=z.object({status:z.enum(['under_review','closed']),managerResponse:z.string().trim().min(4).max(1000)}).parse(input);
  const r=await statement(env.DB,`
    SELECT r.occupancy_id,o.property_id FROM commercial_occupant_requests r
    JOIN commercial_occupancies o ON o.id=r.occupancy_id WHERE r.id=? AND o.client_id=?`,
    id,w.scopeId).first<{occupancy_id:string;property_id:string}>();
  assert(r,404,'REQUEST_NOT_FOUND','Request not found in this commercial account.');
  await propertyAccess(env,user,w,r.property_id,true);
  await env.DB.batch([
    statement(env.DB,`UPDATE commercial_occupant_requests SET status=?,manager_response=?,updated_at=? WHERE id=? AND status!='closed'`,
      d.status,d.managerResponse,now(),id),
    guard(env),
    activity(env,user,'commercial.occupant_request_reviewed','commercial_occupancy',r.occupancy_id,r.property_id),
    clearGuard(env),
  ]);
  return {ok:true};
}
