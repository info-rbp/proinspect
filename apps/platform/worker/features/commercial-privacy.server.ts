import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { seal } from '../../../../packages/auth/crypto';
import { guard, clearGuard } from '../../../../packages/operations/core';
import {
  commercialAccess,
  commercialPermission,
  commercialEvent,
  commercialLimit,
  type AppRow,
} from './commercial-intake.server';
export async function requestCommercialPrivacy(env: Env, session: string, input: unknown) {
  const a = await commercialAccess(env, session),
    d = z
      .object({
        kind: z.enum(['access', 'correction', 'erasure']),
        note: z.string().trim().max(1200).default(''),
      })
      .parse(input);
  await commercialLimit(env, 'privacy:' + a.person.id, 6);
  const id = uid('capr');
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO commercial_application_privacy_requests(id,application_id,person_id,kind,envelope,created_at) VALUES(?,?,?,?,?,?)',
      id,
      a.app.id,
      a.person.id,
      d.kind,
      await seal(env.DATA_ENCRYPTION_KEY, 'commercial-privacy:' + id, { note: d.note }),
      now(),
    ),
    await commercialEvent(
      env,
      a.app.id,
      a.flow.id,
      'privacy_requested',
      { requestId: id, kind: d.kind },
      a.person.id,
    ),
  ]);
  return { requested: true };
}
export async function resolveCommercialPrivacy(
  env: Env,
  user: Principal,
  applicationId: string,
  requestId: string,
  input: unknown,
) {
  await commercialPermission(env, user, 'review');
  const d = z
    .object({
      status: z.enum(['resolved', 'denied']),
      note: z.string().trim().min(15).max(1500),
      reference: z.string().min(8).max(240),
    })
    .parse(input);
  const request = await statement(
    env.DB,
    "SELECT id FROM commercial_application_privacy_requests WHERE id=? AND application_id=? AND status='pending'",
    requestId,
    applicationId,
  ).first();
  assert(request, 404, 'COMMERCIAL_PRIVACY_REQUEST', 'Request unavailable.');
  const app = await statement(
    env.DB,
    'SELECT flow_id FROM commercial_applications WHERE id=?',
    applicationId,
  ).first<{ flow_id: string }>();
  assert(app, 404, 'COMMERCIAL_APPLICATION_UNAVAILABLE', 'Application unavailable.');
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE commercial_application_privacy_requests SET status=?,resolution_envelope=?,resolved_by=?,resolved_at=? WHERE id=? AND status='pending'",
      d.status,
      await seal(env.DATA_ENCRYPTION_KEY, 'commercial-privacy-resolution:' + requestId, {
        note: d.note,
        reference: d.reference,
      }),
      user.id,
      now(),
      requestId,
    ),
    guard(env),
    await commercialEvent(
      env,
      applicationId,
      app.flow_id,
      'privacy_resolved',
      { requestId, status: d.status, reference: d.reference },
      undefined,
      user.id,
    ),
    clearGuard(env),
  ]);
  return { resolved: true };
}
/** Deliberate whole-file erasure after policy expiry and downstream verification, never a cron default. */
export async function purgeCommercialApplication(
  env: Env,
  user: Principal,
  applicationId: string,
  input: unknown,
) {
  await commercialPermission(env, user, 'review');
  assert(
    user.staffRole === 'administrator',
    403,
    'COMMERCIAL_PURGE_ADMIN',
    'An administrator verifies erasure.',
  );
  const d = z
    .object({
      version: z.number().int().positive(),
      reference: z.string().min(12).max(240),
      downstreamCopiesVerified: z.literal(true),
      backupsAndLegalHoldReviewed: z.literal(true),
    })
    .parse(input);
  const app = await statement(
    env.DB,
    'SELECT * FROM commercial_applications WHERE id=?',
    applicationId,
  ).first<AppRow>();
  assert(
    app &&
      ['closed', 'withdrawn', 'expired', 'decision_recorded', 'blocked'].includes(app.status) &&
      app.retained_until <= now() &&
      (!app.privacy_hold_until || app.privacy_hold_until <= now()) &&
      !app.purged_at,
    409,
    'COMMERCIAL_RETENTION_HOLD',
    'Erasure requires policy expiry, closed processing and no active hold.',
  );
  assert(
    !(await statement(
      env.DB,
      "SELECT id FROM commercial_application_referrals WHERE application_id=? AND status IN('sending','uncertain')",
      app.id,
    ).first()),
    409,
    'COMMERCIAL_DELIVERY_RECONCILIATION',
    'Reconcile outstanding provider copies first.',
  );
  // Reserve the exact closed revision before any irreversible R2 deletion.
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE commercial_applications SET status='blocked',version=version+1,updated_at=? WHERE id=? AND version=? AND retained_until<=? AND (privacy_hold_until IS NULL OR privacy_hold_until<=?)",
      now(),
      app.id,
      d.version,
      now(),
      now(),
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO commercial_application_purge_permits(application_id,approved_by,approved_at,verification_reference) VALUES(?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET approved_by=excluded.approved_by,approved_at=excluded.approved_at,verification_reference=excluded.verification_reference',
      app.id,
      user.id,
      now(),
      d.reference,
    ),
    clearGuard(env),
  ]);
  const docs = (
    await statement(
      env.DB,
      'SELECT id,object_key FROM commercial_application_evidence WHERE application_id=?',
      app.id,
    ).all<{ id: string; object_key: string }>()
  ).results;
  // A retained tombstone audit is written only after deletion of every private object is verified.
  for (const doc of docs) {
    await env.RESTRICTED_DOCUMENTS.delete(doc.object_key);
    assert(
      !(await env.RESTRICTED_DOCUMENTS.head(doc.object_key)),
      503,
      'COMMERCIAL_ERASURE_VERIFY',
      'A private object still exists. Retry verification before recording completion.',
    );
  }
  const empty = await seal(env.DATA_ENCRYPTION_KEY, 'commercial-purged:' + app.id, {
    purged: true,
    at: now(),
  });
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE commercial_applications SET status='closed',version=version+1,shared_envelope=?,updated_at=?,purged_at=? WHERE id=? AND version=? AND (privacy_hold_until IS NULL OR privacy_hold_until<=?)",
      empty,
      now(),
      now(),
      app.id,
      d.version + 1,
      now(),
    ),
    guard(env),
    statement(
      env.DB,
      'DELETE FROM commercial_application_links WHERE person_id IN(SELECT id FROM commercial_application_people WHERE application_id=?)',
      app.id,
    ),
    statement(
      env.DB,
      'DELETE FROM commercial_application_sessions WHERE person_id IN(SELECT id FROM commercial_application_people WHERE application_id=?)',
      app.id,
    ),
    statement(
      env.DB,
      'DELETE FROM commercial_referral_grants WHERE referral_id IN(SELECT id FROM commercial_application_referrals WHERE application_id=?)',
      app.id,
    ),
    statement(
      env.DB,
      'DELETE FROM commercial_application_scan_receipts WHERE document_id IN(SELECT id FROM commercial_application_evidence WHERE application_id=?)',
      app.id,
    ),
    statement(env.DB, 'DELETE FROM commercial_application_evidence WHERE application_id=?', app.id),
    statement(env.DB, 'DELETE FROM commercial_people_roles WHERE application_id=?', app.id),
    statement(
      env.DB,
      'UPDATE commercial_applicant_entities SET envelope=? WHERE application_id=?',
      empty,
      app.id,
    ),
    statement(
      env.DB,
      "UPDATE commercial_application_people SET profile_envelope=?,email_hash=id,state='removed',declared_scope_sha256=NULL,declared_notice_sha256=NULL,declared_at=NULL WHERE application_id=?",
      empty,
      app.id,
    ),
    statement(
      env.DB,
      'UPDATE commercial_application_submissions SET snapshot_envelope=? WHERE application_id=?',
      empty,
      app.id,
    ),
    statement(
      env.DB,
      'UPDATE commercial_application_offers SET envelope=? WHERE application_id=?',
      empty,
      app.id,
    ),
    statement(
      env.DB,
      'UPDATE commercial_application_events SET envelope=? WHERE application_id=?',
      empty,
      app.id,
    ),
    statement(
      env.DB,
      "UPDATE commercial_application_privacy_requests SET envelope=?,resolution_envelope=?,status='resolved',resolved_by=?,resolved_at=? WHERE application_id=?",
      empty,
      empty,
      user.id,
      now(),
      app.id,
    ),
    statement(
      env.DB,
      'UPDATE commercial_application_referrals SET receipt_envelope=? WHERE application_id=?',
      empty,
      app.id,
    ),
    statement(
      env.DB,
      'DELETE FROM commercial_application_purge_permits WHERE application_id=?',
      app.id,
    ),
    await commercialEvent(
      env,
      app.id,
      app.flow_id,
      'erasure_verified',
      {
        documents: docs.length,
        reference: d.reference,
        downstreamVerified: true,
        backupsReviewed: true,
      },
      undefined,
      user.id,
    ),
    clearGuard(env),
  ]);
  return { purged: true, privateObjectsDeleted: docs.length };
}
