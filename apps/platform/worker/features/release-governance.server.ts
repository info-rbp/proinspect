import { z } from 'zod';
import {providerReadiness} from '../../../../packages/operations/provider-readiness';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { administrator } from '../../../../packages/authorization/server';
import { recordId, isoDate, reference, activity, guard, clearGuard } from '../../../../packages/operations/core';

export const RELEASE_FEATURES = {
  v4: 'V4_SERVICE_REQUESTS_ENABLED', contractor: 'CONTRACTOR_PAYMENTS_ENABLED', contractor_collection: 'STRIPE_CONNECT_COLLECTION_ENABLED', contractor_transfer: 'STRIPE_CONNECT_TRANSFERS_ENABLED',
  guest: 'GUEST_BOOKINGS_ENABLED', calendar: 'GOOGLE_CALENDAR_BOOKINGS_ENABLED',
  rental: 'RENTAL_APPLICATIONS_ENABLED', rental_scanner: 'RENTAL_SCANNER_ENABLED',
  rental_script: 'RENTAL_APPS_SCRIPT_ENABLED', open_home: 'OPEN_HOME_REPORTS_ENABLED',
  bonds: 'WA_BONDS_ENABLED', restricted: 'RESTRICTED_WORKFLOWS_ENABLED',
  agreement_signing: 'WA_AGREEMENT_ESIGN_ENABLED', rent: 'RENT_PAYMENT_PLANNING_ENABLED',
  stripe_payments: 'STRIPE_PAYMENTS_ENABLED', stripe_billing: 'STRIPE_BILLING_ENABLED', stripe_guest: 'STRIPE_GUEST_CHECKOUT_ENABLED',
  invoices: 'STRIPE_INVOICING_ENABLED', refunds: 'STRIPE_REFUNDS_ENABLED',
  billing_portal: 'STRIPE_CUSTOMER_PORTAL_ENABLED', building: 'BUILDING_OPERATIONS_ENABLED',
  council: 'COUNCIL_GOVERNANCE_ENABLED', notices: 'NOTICE_LIFECYCLE_ENABLED',
  commercial: 'COMMERCIAL_OPERATIONS_ENABLED', owner_invites: 'AGENCY_OWNER_INVITATIONS_ENABLED',
  legal: 'LEGAL_ACCEPTANCE_ENABLED', sale_variants: 'SERVICE_SALE_VARIANTS_ENABLED',
} as const;
export type ReleaseFeature = keyof typeof RELEASE_FEATURES;
function configured(env: Env, feature: ReleaseFeature) {
  return (env as unknown as Record<string, unknown>)[RELEASE_FEATURES[feature]] === 'true';
}
async function activeApproval(env: Env, feature: ReleaseFeature) {
  if (!env.BUILD_SHA || !/^[a-f0-9]{40}$/.test(env.BUILD_SHA)) return null;
  return statement(env.DB, `SELECT a.id FROM feature_release_approvals a
    JOIN users u ON u.id=a.reviewed_by AND u.active=1 AND u.verified_at IS NOT NULL
    JOIN staff_profiles s ON s.user_id=u.id AND s.active=1 AND s.role='administrator'
    WHERE a.feature=? AND a.environment=? AND a.source_sha=? AND a.status='approved'
    AND a.expires_at>? AND a.reviewed_by!=a.requested_by ORDER BY a.reviewed_at DESC LIMIT 1`,
    feature, env.APP_ENV, env.BUILD_SHA, now()).first<{ id: string }>();
}
export async function requireReleaseApproval(env: Env, feature: ReleaseFeature) {
  assert(configured(env, feature), 503, 'FEATURE_DISABLED', 'This capability is not activated.');
  // Local synthetic tests are not production acceptance. Hosted staging uses the real gate.
  if (env.APP_ENV === 'local') return;
  assert(await activeApproval(env, feature), 503, 'RELEASE_ACCEPTANCE_REQUIRED',
    'Source-specific operational acceptance is required before this capability can be used.');
}
export async function releaseReadiness(env: Env, user: Principal) {
  administrator(user);
  const features = await Promise.all((Object.keys(RELEASE_FEATURES) as ReleaseFeature[]).map(async name =>
    ({ name, configured: configured(env, name), approval: env.APP_ENV === 'local' ? null : await activeApproval(env, name) })));
  const records = (await statement(env.DB, 'SELECT * FROM feature_release_approvals ORDER BY requested_at DESC LIMIT 200').all()).results;
  return { environment: env.APP_ENV, source: env.BUILD_SHA ?? null, features, records, providers: providerReadiness(env as unknown as Record<string,unknown>),
    notice: 'This record does not switch flags, validate legal advice or replace the separately protected hosted-acceptance evidence bundle.' };
}
export async function releaseCommand(env: Env, user: Principal, command: string, input: unknown) {
  administrator(user);
  if (command === 'request') {
    const d = z.object({ feature: z.enum(Object.keys(RELEASE_FEATURES) as [ReleaseFeature, ...ReleaseFeature[]]),
      environment: z.enum(['staging', 'production']), sourceSha: z.string().regex(/^[a-f0-9]{40}$/),
      evidenceReference: reference.refine(v => v.length >= 8), expiresAt: isoDate }).parse(input);
    assert(d.environment === env.APP_ENV && d.sourceSha === env.BUILD_SHA, 409, 'RELEASE_SOURCE_MISMATCH', 'Review the exact deployed source in this environment.');
    assert(d.expiresAt > now() && Date.parse(d.expiresAt) <= Date.now() + 31 * 86400000, 422, 'RELEASE_EXPIRY', 'Approval must expire within 31 days.');
    const id = uid('rel');
    await env.DB.batch([statement(env.DB, 'INSERT INTO feature_release_approvals(id,feature,environment,source_sha,evidence_reference,expires_at,requested_by,requested_at) VALUES(?,?,?,?,?,?,?,?)',
      id, d.feature, d.environment, d.sourceSha, d.evidenceReference, d.expiresAt, user.id, now()),
      activity(env, user, 'release.review_requested', 'feature_release', id)]);
    return { id, status: 'requested' };
  }
  const d = z.object({ approvalId: recordId, reference: reference.refine(v => v.length >= 8),
    providerEvidenceVerified: z.boolean().optional(), authorityVerified: z.boolean().optional(), recoveryOwnerConfirmed: z.boolean().optional() }).parse(input);
  const record = await statement(env.DB, 'SELECT * FROM feature_release_approvals WHERE id=?', d.approvalId).first<Record<string, any>>();
  assert(record, 404, 'RELEASE_NOT_FOUND', 'Review record not found.');
  assert(['approve', 'reject', 'revoke'].includes(command), 404, 'RELEASE_ACTION', 'Unknown review action.');
  if (command === 'revoke') assert(record.status === 'approved', 409, 'RELEASE_STATE', 'Only an approved record can be revoked.');
  else {
    assert(record.status === 'requested' && record.requested_by !== user.id, 403, 'INDEPENDENT_REVIEW', 'A different administrator must decide this review.');
    if (command === 'approve') {
      assert(record.environment === env.APP_ENV && record.source_sha === env.BUILD_SHA && record.expires_at > now(), 409, 'RELEASE_STALE', 'The source or review validity has changed.');
      assert(d.providerEvidenceVerified && d.authorityVerified && d.recoveryOwnerConfirmed, 422, 'RELEASE_EVIDENCE_REQUIRED', 'Record the independent evidence, authority and recovery review.');
    }
  }
  const status = command === 'approve' ? 'approved' : command === 'reject' ? 'rejected' : 'revoked';
  await env.DB.batch([statement(env.DB, 'UPDATE feature_release_approvals SET status=?,reviewed_by=?,reviewed_at=?,review_reference=? WHERE id=? AND status=?',
    status, user.id, now(), d.reference, record.id, record.status), guard(env), activity(env, user, 'release.' + status, 'feature_release', record.id), clearGuard(env)]);
  return { id: record.id, status, flagChanged: false };
}
