import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, schemeAccess, operationsWrite } from '../../../../packages/authorization/server';
import { activity, guard, clearGuard, reference, isoDate, recordId } from '../../../../packages/operations/core';
import { email } from '../../../../packages/validation/index';
import { randomToken, digest } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';

/** Council access is proposed by an authorised manager, not self-issued. */
export async function proposeCouncilAppointment(env:Env,user:Principal,w:Workspace,input:unknown) {
  const d=z.object({
    email,schemeId:recordId,lotId:recordId.optional(),
    endsAt:isoDate,startsAt:isoDate.optional(),appointmentReference:reference,
  }).parse(input);
  if(w.kind==='staff')operationsWrite(user);
  else {
    assert(w.kind==='strata-manager',403,'COUNCIL_SCHEME_MANAGER_REQUIRED','Use an authorised strata management account.');
    await clientAdmin(env,user,w);
  }
  await schemeAccess(env,user,w,d.schemeId,true);
  if(d.lotId)assert(await statement(env.DB,
    'SELECT id FROM strata_lots WHERE scheme_id=? AND id=?',d.schemeId,d.lotId).first(),
    422,'COUNCIL_LOT_MISMATCH','Choose a lot in the relevant scheme.');
  const start=d.startsAt??now();
  assert(d.endsAt>now() && d.endsAt>start,422,'COUNCIL_TERM_INVALID','Council appointment must have an active future end and valid start.');
  const pending=await statement(env.DB,`
    SELECT id FROM council_appointment_reviews WHERE scheme_id=? AND email=?
    AND status='pending' AND ends_at>? LIMIT 1`,d.schemeId,d.email,now()).first();
  assert(!pending,409,'COUNCIL_REVIEW_PENDING','A council appointment review is already pending.');
  const id=uid('car');
  await env.DB.batch([
    statement(env.DB,`INSERT INTO council_appointment_reviews
      (id,scheme_id,lot_id,email,starts_at,ends_at,appointment_reference,requested_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`,
      id,d.schemeId,d.lotId??null,d.email,start,d.endsAt,d.appointmentReference,user.id,now()),
    activity(env,user,'council.appointment_review_requested','council_appointment',id,null,d.schemeId,
      {flowId:'ONB-INV-COUNCIL',version:'1.1.0'}),
  ]);
  return {pendingReview:true,reviewId:id,status:'pending'};
}
export async function councilReviews(env:Env,user:Principal,w:Workspace) {
  let rows: Record<string,unknown>[];
  if(w.kind==='staff'){
    operationsWrite(user);
    rows=(await statement(env.DB,`
      SELECT r.id,r.scheme_id,r.lot_id,r.email,r.starts_at,r.ends_at,
        r.appointment_reference,r.status,r.review_reference,r.created_at,
        s.name AS scheme_name
      FROM council_appointment_reviews r JOIN strata_schemes s ON s.id=r.scheme_id
      ORDER BY r.created_at DESC LIMIT 150`).all()).results;
  } else {
    assert(w.kind==='strata-manager',403,'STRATA_MANAGER_REQUIRED','Use your strata management account.');
    await clientAdmin(env,user,w);
    rows=(await statement(env.DB,`
      SELECT r.id,r.scheme_id,r.lot_id,r.email,r.starts_at,r.ends_at,
        r.appointment_reference,r.status,r.review_reference,r.created_at,
        s.name AS scheme_name
      FROM council_appointment_reviews r
      JOIN strata_schemes s ON s.id=r.scheme_id
      JOIN scheme_client_links l ON l.scheme_id=r.scheme_id
      WHERE l.client_id=? AND l.role='strata_manager' AND l.starts_at<=?
        AND (l.ends_at IS NULL OR l.ends_at>?)
      ORDER BY r.created_at DESC LIMIT 150`,w.scopeId,now(),now()).all()).results;
  }
  return {reviews:rows};
}
/** Staff independently checks appointment evidence; no invite or grant until approved. */
export async function reviewCouncilAppointment(env:Env,user:Principal,id:string,input:unknown) {
  operationsWrite(user);
  const d=z.object({
    decision:z.enum(['approved','declined']),
    reviewReference:z.string().trim().min(8).max(500),
  }).parse(input);
  const r=await statement(env.DB,
    'SELECT * FROM council_appointment_reviews WHERE id=?',id).first<Record<string,any>>();
  assert(r,404,'COUNCIL_REVIEW_NOT_FOUND','Appointment review not found.');
  assert(r.status==='pending',409,'COUNCIL_ALREADY_REVIEWED','This appointment has already been reviewed.');
  assert(r.requested_by!==user.id,403,'COUNCIL_INDEPENDENT_REVIEW','Another authorised reviewer must verify this appointment.');
  assert(r.ends_at>now(),422,'COUNCIL_TERM_ENDED','The proposed appointment has expired.');
  const inviter=await statement(env.DB,`
    SELECT u.id,u.email,u.display_name,sp.role AS staffRole
    FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1
    WHERE u.id=? AND u.active=1`,r.requested_by).first<Principal>();
  assert(inviter,403,'COUNCIL_INVITER_INACTIVE','The initiating account is no longer authorised.');
  if(inviter.staffRole)operationsWrite(inviter);
  else{
    const authorized=await statement(env.DB,`
      SELECT l.client_id FROM scheme_client_links l
      JOIN clients c ON c.id=l.client_id AND c.status='active'
      JOIN client_memberships m ON m.client_id=l.client_id AND m.user_id=? AND m.active=1
      WHERE l.scheme_id=? AND l.role='strata_manager'
        AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?)
        AND m.role IN('owner','admin') LIMIT 1`,
      inviter.id,r.scheme_id,now(),now()).first();
    assert(authorized,403,'COUNCIL_INVITER_INACTIVE','The original scheme appointment authority has ended.');
  }
  const time=now(),token=randomToken();
  const statements=[
    statement(env.DB,`UPDATE council_appointment_reviews
      SET status=?,reviewed_by=?,review_reference=?,reviewed_at=?
      WHERE id=? AND status='pending'`,d.decision,user.id,d.reviewReference,time,id),
    guard(env),
  ];
  if(d.decision==='approved'){
    statements.push(
      statement(env.DB,`INSERT INTO portal_invitations
        (token_hash,email,client_id,scheme_id,lot_id,role,starts_at,ends_at,
          expires_at,created_by,created_at,council_review_id)
        VALUES(?,?,NULL,?,?,'council_member',?,?,?,?,?,?)`,
        await digest(token),r.email,r.scheme_id,r.lot_id,r.starts_at,r.ends_at,
        new Date(Date.now()+14*86400000).toISOString(),r.requested_by,time,id),
      await mailEvent(env,'council.appointment_invited',{
        to:r.email,subject:'Your verified ProInspect council invitation',
        heading:'Council appointment verified',
        body:'An independent reviewer has verified the appointment reference and term. Sign in with this email to accept the specific council membership.',
        href:`${env.APP_ORIGIN}/invitations/accept?token=${token}`,sensitive:true,
      }),
    );
  }
  statements.push(activity(env,user,'council.appointment_reviewed','council_appointment',id,null,r.scheme_id,
    {decision:d.decision,flowId:'ONB-INV-COUNCIL',version:'1.1.0'}),clearGuard(env));
  await env.DB.batch(statements);
  return {status:d.decision,reviewId:id,
    ...(d.decision==='approved'&&env.APP_ENV==='local'
      ?{localInvitationUrl:`${env.APP_ORIGIN}/invitations/accept?token=${token}`}:{})};
}
/** Verify both the independent appointment decision and reviewer at invitation acceptance. */
export async function assertCouncilInvitationVerified(env:Env,i:Record<string,any>,recipient:Principal) {
  assert(i.council_review_id,403,'COUNCIL_REVIEW_REQUIRED',
    'Council appointments require independent verification. Request a renewed invitation.');
  const review=await statement(env.DB,`
    SELECT r.id,r.requested_by,r.ends_at
    FROM council_appointment_reviews r
    JOIN staff_profiles sp ON sp.user_id=r.reviewed_by AND sp.active=1
      AND sp.role IN('administrator','operations_manager')
    WHERE r.id=? AND r.status='approved' AND r.scheme_id=? AND r.email=?
      AND r.requested_by=? AND r.ends_at>? AND r.starts_at=? AND r.ends_at=?
      AND r.lot_id IS ? AND r.reviewed_by!=r.requested_by`,
    i.council_review_id,i.scheme_id,recipient.email,i.created_by,now(),
    i.starts_at,i.ends_at,i.lot_id
  ).first();
  assert(review,403,'COUNCIL_REVIEW_REQUIRED','Council appointment verification is not active.');
}
