import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { digest, randomToken, seal, unseal } from '../../../../packages/auth/crypto';
import { guard, clearGuard } from '../../../../packages/operations/core';
import { mailEvent } from '../../../../packages/notifications/server';
import {
  commercialOffer,
  type CommercialShared,
} from '../../../../packages/marketing/commercial-application';
import {
  commercialPermission,
  commercialFlowInput,
  commercialFlow,
  flowConfig,
  commercialEvent,
  commercialEditable,
  commercialEmailHash,
  type AppRow,
  type PersonRow,
  type Profile,
} from './commercial-intake.server';
import { currentLegalDocument } from './legal-acceptance.server';

export async function commercialOverview(env: Env, user: Principal) {
  assert(
    ['administrator', 'operations_manager'].includes(user.staffRole ?? ''),
    403,
    'COMMERCIAL_PERMISSION_REQUIRED',
    'Use an authorised staff workspace.',
  );
  const schema = await statement(
    env.DB,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='commercial_applications'",
  ).first();
  if (!schema)
    return {
      schemaReady: false,
      enabled: false,
      canConfigure: user.staffRole === 'administrator',
      canReview: false,
      flows: [],
      applications: [],
      listings: [],
    };
  const permission = await statement(
    env.DB,
    'SELECT can_configure,can_review FROM commercial_application_permissions WHERE user_id=? AND active=1',
    user.id,
  ).first<{ can_configure: number; can_review: number }>();
  const configure = user.staffRole === 'administrator' || permission?.can_configure === 1,
    review = permission?.can_review === 1;
  assert(
    configure || review,
    403,
    'COMMERCIAL_PERMISSION_REQUIRED',
    'Commercial permissions are separate from rental application access.',
  );
  return {
    schemaReady: true,
    enabled: env.COMMERCIAL_APPLICATIONS_ENABLED === 'true',
    canConfigure: configure,
    canReview: review,
    flows: configure
      ? await Promise.all(
          (
            await statement(
              env.DB,
              'SELECT f.id,f.listing_id,f.version,f.status,f.config_sha256,f.config_envelope,f.recipient_verified_at,l.title FROM commercial_application_flows f JOIN leasing_listings l ON l.id=f.listing_id ORDER BY f.created_at DESC LIMIT 100',
            ).all<{
              id: string;
              listing_id: string;
              version: number;
              status: string;
              config_sha256: string;
              config_envelope: string;
              recipient_verified_at: string | null;
              title: string;
            }>()
          ).results.map(async (f) => ({
            id: f.id,
            listing_id: f.listing_id,
            version: f.version,
            status: f.status,
            config_sha256: f.config_sha256,
            recipient_verified_at: f.recipient_verified_at,
            title: f.title,
            config: await unseal<unknown>(
              env.DATA_ENCRYPTION_KEY,
              'commercial-flow:' + f.id,
              f.config_envelope,
            ),
          })),
        )
      : [],
    staff:
      user.staffRole === 'administrator'
        ? (
            await statement(
              env.DB,
              "SELECT u.id,u.email,u.display_name FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager') ORDER BY u.display_name,u.email",
            ).all()
          ).results
        : [],
    applications: review
      ? (
          await statement(
            env.DB,
            'SELECT a.id,a.reference,a.status,a.version,a.submitted_at,l.title FROM commercial_applications a JOIN commercial_application_flows f ON f.id=a.flow_id JOIN leasing_listings l ON l.id=f.listing_id ORDER BY a.updated_at DESC LIMIT 100',
          ).all()
        ).results
      : [],
    listings: configure
      ? (
          await statement(
            env.DB,
            "SELECT id,title FROM leasing_listings WHERE kind='commercial' ORDER BY title",
          ).all()
        ).results
      : [],
  };
}
export async function draftCommercialFlow(env: Env, user: Principal, input: unknown) {
  await commercialPermission(env, user, 'configure');
  const d = commercialFlowInput.parse(input);
  const listing = await statement(
    env.DB,
    "SELECT id,application_url,property_id,instructed_by_client_id,agent_name,agent_role FROM leasing_listings WHERE id=? AND kind='commercial'",
    d.listingId,
  ).first<{
    id: string;
    application_url: string | null;
    property_id: string;
    instructed_by_client_id: string;
    agent_name: string;
    agent_role: string;
  }>();
  assert(
    listing && !listing.application_url,
    409,
    'COMMERCIAL_EXTERNAL_PRECEDENCE',
    'Use a commercial listing without an external application URL.',
  );
  const prior = await statement(
    env.DB,
    'SELECT COALESCE(MAX(version),0) AS n FROM commercial_application_flows WHERE listing_id=?',
    d.listingId,
  ).first<{ n: number }>();
  const config = {
    ...d,
    listingSnapshot: {
      propertyId: listing.property_id,
      clientId: listing.instructed_by_client_id,
      agentName: listing.agent_name,
      agentRole: listing.agent_role,
    },
  };
  const id = uid('caf'),
    token = randomToken(),
    hash = await digest(JSON.stringify(config));
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO commercial_application_flows(id,listing_id,version,mode,config_envelope,config_sha256,recipient_hash,created_by,created_at) VALUES(?,?,?,'proinspect_commercial',?,?,?,?,?)",
      id,
      d.listingId,
      (prior?.n ?? 0) + 1,
      await seal(env.DATA_ENCRYPTION_KEY, 'commercial-flow:' + id, config),
      hash,
      await commercialEmailHash(env, d.recipient),
      user.id,
      now(),
    ),
    statement(
      env.DB,
      'INSERT INTO commercial_flow_recipient_challenges(token_hash,flow_id,expires_at) VALUES(?,?,?)',
      await digest(token),
      id,
      new Date(Date.now() + 86400000).toISOString(),
    ),
    await commercialEvent(env, null, id, 'flow_drafted', { configHash: hash }, undefined, user.id),
    await mailEvent(env, 'commercial.recipient.verify', {
      to: d.recipient,
      subject: 'Verify commercial application recipient',
      heading: 'Confirm your application-handling mailbox',
      body: 'Confirm this mailbox only if you are authorised to receive commercial applications for the identified property. Verification does not activate intake.',
      href: env.APP_ORIGIN + '/commercial-application/recipient/' + token,
      sensitive: true,
    }),
  ]);
  return { id, configHash: hash, status: 'draft', activated: false };
}
export async function verifyCommercialRecipient(env: Env, token: string) {
  assert(
    /^[a-f0-9]{64}$/.test(token),
    404,
    'COMMERCIAL_RECIPIENT_LINK',
    'Verification link unavailable.',
  );
  const hash = await digest(token),
    row = await statement(
      env.DB,
      "SELECT c.flow_id FROM commercial_flow_recipient_challenges c JOIN commercial_application_flows f ON f.id=c.flow_id WHERE c.token_hash=? AND c.used_at IS NULL AND c.expires_at>? AND f.status='draft'",
      hash,
      now(),
    ).first<{ flow_id: string }>();
  assert(row, 404, 'COMMERCIAL_RECIPIENT_LINK', 'Verification link unavailable.');
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE commercial_flow_recipient_challenges SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?',
      now(),
      hash,
      now(),
    ),
    guard(env),
    statement(
      env.DB,
      'UPDATE commercial_application_flows SET recipient_verified_at=? WHERE id=?',
      now(),
      row.flow_id,
    ),
    await commercialEvent(env, null, row.flow_id, 'recipient_verified', {}),
    clearGuard(env),
  ]);
  return { verified: true, activated: false };
}
export async function approveCommercialFlow(
  env: Env,
  user: Principal,
  flowId: string,
  input: unknown,
) {
  await commercialPermission(env, user, 'configure');
  const d = z
    .object({
      configHash: z.string().regex(/^[a-f0-9]{64}$/),
      reference: z.string().trim().min(8).max(240),
      authorityVerified: z.literal(true),
      privacyAndRetentionApproved: z.literal(true),
      providerProcessingApproved: z.literal(true),
    })
    .parse(input);
  const flow = await commercialFlow(env, flowId, false),
    config = await flowConfig(env, flow),
    policy = await currentLegalDocument(env, 'privacy');
  assert(
    flow.status === 'draft' &&
      flow.created_by !== user.id &&
      flow.recipient_verified_at &&
      flow.config_sha256 === d.configHash,
    409,
    'COMMERCIAL_FLOW_APPROVAL',
    'A different authorised reviewer must approve the exact verified flow.',
  );
  assert(
    config.listingSnapshot.propertyId === flow.property_id &&
      config.listingSnapshot.clientId === flow.instructed_by_client_id &&
      config.listingSnapshot.agentName === flow.agent_name &&
      config.listingSnapshot.agentRole === flow.agent_role,
    409,
    'COMMERCIAL_AUTHORITY_CHANGED',
    'The listing authority changed. Draft a new flow.',
  );
  assert(
    env.APP_ENV === 'local' || policy?.version_label === config.privacyVersion,
    409,
    'COMMERCIAL_PRIVACY_APPROVAL',
    'The collection notice must refer to the current approved privacy version.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE commercial_application_flows SET status='approved',approved_by=?,approved_at=?,approval_reference=? WHERE id=? AND status='draft' AND config_sha256=?",
      user.id,
      now(),
      d.reference,
      flow.id,
      d.configHash,
    ),
    guard(env),
    await commercialEvent(
      env,
      null,
      flow.id,
      'flow_approved',
      { configHash: d.configHash, reference: d.reference },
      undefined,
      user.id,
    ),
    clearGuard(env),
  ]);
  return { approved: true, activated: false };
}
export async function commercialStaffDetail(env: Env, user: Principal, applicationId: string) {
  await commercialPermission(env, user, 'review');
  const app = await statement(
    env.DB,
    'SELECT * FROM commercial_applications WHERE id=?',
    applicationId,
  ).first<AppRow>();
  assert(app, 404, 'COMMERCIAL_APPLICATION_UNAVAILABLE', 'Application unavailable.');
  if (app.purged_at)
    return {
      application: {
        id: app.id,
        reference: app.reference,
        status: app.status,
        version: app.version,
        submittedAt: app.submitted_at,
        retainedUntil: app.retained_until,
        privacyHoldUntil: app.privacy_hold_until,
        purgedAt: app.purged_at,
      },
      property: { title: 'Retained application audit', address: '' },
      documents: [],
      submissions: [],
      requests: [],
      people: [],
      referrals: [],
      privacyRequests: [],
    };
  const flow = await commercialFlow(env, app.flow_id, false),
    docs = (
      await statement(
        env.DB,
        'SELECT id,person_id,entity_id,category,period_label,scan_status,review_status FROM commercial_application_evidence WHERE application_id=?',
        app.id,
      ).all()
    ).results;
  const submissions = (
    await statement(
      env.DB,
      'SELECT id,sha256,snapshot_envelope,created_at FROM commercial_application_submissions WHERE application_id=? ORDER BY created_at DESC',
      app.id,
    ).all<{ id: string; sha256: string; snapshot_envelope: string; created_at: string }>()
  ).results;
  const snapshots = await Promise.all(
    submissions.map(async (s) => ({
      id: s.id,
      sha256: s.sha256,
      createdAt: s.created_at,
      snapshot: await unseal<unknown>(
        env.DATA_ENCRYPTION_KEY,
        'commercial-submission:' + s.id,
        s.snapshot_envelope,
      ),
    })),
  );
  const requests = (
    await statement(
      env.DB,
      "SELECT id,actor_person_id,kind,envelope,created_at FROM commercial_application_events WHERE application_id=? AND kind IN('privacy_requested','information_requested','decision_recorded') ORDER BY created_at DESC",
      app.id,
    ).all<{
      id: string;
      actor_person_id: string | null;
      kind: string;
      envelope: string;
      created_at: string;
    }>()
  ).results;
  const requestDetails = await Promise.all(
    requests.map(async (e) => ({
      id: e.id,
      personId: e.actor_person_id,
      kind: e.kind,
      at: e.created_at,
      detail: await unseal<unknown>(
        env.DATA_ENCRYPTION_KEY,
        'commercial-event:' + e.id,
        e.envelope,
      ),
    })),
  );
  await statement(
    env.DB,
    'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
    uid('aud'),
    user.id,
    'commercial_application.viewed',
    'commercial_application',
    app.id,
    '{}',
    now(),
  ).run();
  return {
    application: {
      id: app.id,
      reference: app.reference,
      status: app.status,
      version: app.version,
      submittedAt: app.submitted_at,
      retainedUntil: app.retained_until,
      privacyHoldUntil: app.privacy_hold_until,
    },
    property: { title: flow.title, address: flow.display_address },
    documents: docs,
    submissions: snapshots,
    requests: requestDetails,
    people: (
      await statement(
        env.DB,
        "SELECT id,state,lead FROM commercial_application_people WHERE application_id=? AND state!='removed'",
        app.id,
      ).all()
    ).results,
    referrals: (
      await statement(
        env.DB,
        'SELECT id,status,idempotency_key,prepared_at FROM commercial_application_referrals WHERE application_id=? ORDER BY prepared_at DESC',
        app.id,
      ).all()
    ).results,
    privacyRequests: await Promise.all(
      (
        await statement(
          env.DB,
          'SELECT id,kind,status,envelope,created_at FROM commercial_application_privacy_requests WHERE application_id=? ORDER BY created_at DESC',
          app.id,
        ).all<{ id: string; kind: string; status: string; envelope: string; created_at: string }>()
      ).results.map(async (r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        createdAt: r.created_at,
        detail: await unseal<unknown>(
          env.DATA_ENCRYPTION_KEY,
          'commercial-privacy:' + r.id,
          r.envelope,
        ),
      })),
    ),
  };
}
export async function attachCommercialOffer(
  env: Env,
  user: Principal,
  applicationId: string,
  input: unknown,
  version: number,
) {
  await commercialPermission(env, user, 'review');
  await commercialPermission(env, user, 'configure');
  const offer = commercialOffer.parse(input);
  assert(
    offer.expiresAt > now(),
    422,
    'COMMERCIAL_OFFER_EXPIRY',
    'Provide a current authorised offer with explicit amount periods and tax treatment.',
  );
  const app = await statement(
    env.DB,
    'SELECT * FROM commercial_applications WHERE id=?',
    applicationId,
  ).first<AppRow>();
  assert(
    app && commercialEditable(app.status),
    409,
    'COMMERCIAL_APPLICATION_LOCKED',
    'Offer revisions require an editable application.',
  );
  const people = (
    await statement(
      env.DB,
      "SELECT id,lead FROM commercial_application_people WHERE application_id=? AND state!='removed'",
      app.id,
    ).all<{ id: string; lead: number }>()
  ).results;
  assert(
    offer.permittedPersonIds.every((p) => people.some((x) => x.id === p)) &&
      people.some((p) => p.lead === 1 && offer.permittedPersonIds.includes(p.id)),
    422,
    'COMMERCIAL_OFFER_RECIPIENTS',
    'Authorise the lead and only known participants to see this offer.',
  );
  const id = uid('cao'),
    hash = await digest(JSON.stringify(offer)),
    shared = await unseal<CommercialShared>(
      env.DATA_ENCRYPTION_KEY,
      'commercial-shared:' + app.id,
      app.shared_envelope,
    ),
    flow = await commercialFlow(env, app.flow_id, false);
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE commercial_applications SET version=version+1,scope_sha256=?,updated_at=? WHERE id=? AND version=?',
      await digest(JSON.stringify([flow.config_sha256, shared, hash])),
      now(),
      app.id,
      version,
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO commercial_application_offers(id,application_id,version,envelope,sha256,expires_at,authorised_by,authorised_at) VALUES(?,?,?,?,?,?,?,?)',
      id,
      app.id,
      offer.version,
      await seal(env.DATA_ENCRYPTION_KEY, 'commercial-offer:' + id, offer),
      hash,
      offer.expiresAt,
      user.id,
      now(),
    ),
    statement(
      env.DB,
      "UPDATE commercial_application_people SET state='in_progress',declared_at=NULL,declared_scope_sha256=NULL,version=version+1 WHERE application_id=? AND state!='removed'",
      app.id,
    ),
    await commercialEvent(
      env,
      app.id,
      flow.id,
      'offer_authorised',
      { offerId: id, hash, authorityReference: offer.authorisationReference },
      undefined,
      user.id,
    ),
    clearGuard(env),
  ]);
  return { attached: true };
}
export async function commercialStaffCommand(
  env: Env,
  user: Principal,
  applicationId: string,
  command: string,
  input: unknown,
) {
  if (command === 'permission') {
    assert(
      user.staffRole === 'administrator',
      403,
      'ADMIN_REQUIRED',
      'An administrator grants commercial permissions.',
    );
    const d = z
      .object({
        userId: z.string().min(3).max(100),
        configure: z.boolean(),
        review: z.boolean(),
        reference: z.string().min(8).max(240),
      })
      .parse(input);
    const target = await statement(
      env.DB,
      "SELECT u.id FROM users u JOIN staff_profiles s ON s.user_id=u.id WHERE u.id=? AND u.active=1 AND u.verified_at IS NOT NULL AND s.active=1 AND s.role IN('administrator','operations_manager')",
      d.userId,
    ).first();
    assert(target, 422, 'COMMERCIAL_STAFF_REQUIRED', 'Grant only to active verified staff.');
    await statement(
      env.DB,
      'INSERT INTO commercial_application_permissions(user_id,can_configure,can_review,granted_by,granted_at,reference) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET can_configure=excluded.can_configure,can_review=excluded.can_review,active=1,granted_by=excluded.granted_by,granted_at=excluded.granted_at,reference=excluded.reference',
      d.userId,
      Number(d.configure),
      Number(d.review),
      user.id,
      now(),
      d.reference,
    ).run();
    return { granted: true };
  }
  await commercialPermission(env, user, 'review');
  const d = z
    .object({
      version: z.number().int().positive(),
      note: z.string().trim().min(10).max(1200),
      personId: z.string().max(100).optional(),
      until: z.string().optional(),
      outcome: z.enum(['accepted', 'declined', 'no_decision']).optional(),
      authorityReference: z.string().trim().min(8).max(240).optional(),
    })
    .parse(input);
  const app = await statement(
    env.DB,
    'SELECT * FROM commercial_applications WHERE id=?',
    applicationId,
  ).first<AppRow>();
  assert(app, 404, 'COMMERCIAL_APPLICATION_UNAVAILABLE', 'Application unavailable.');
  if (command === 'privacy-hold') {
    const until = d.until ? z.iso.datetime().parse(d.until) : null;
    await env.DB.batch([
      statement(
        env.DB,
        'UPDATE commercial_applications SET privacy_hold_until=?,version=version+1,updated_at=? WHERE id=? AND version=?',
        until,
        now(),
        app.id,
        d.version,
      ),
      guard(env),
      await commercialEvent(
        env,
        app.id,
        app.flow_id,
        'privacy_hold',
        { until, note: d.note },
        undefined,
        user.id,
      ),
      clearGuard(env),
    ]);
    return { held: Boolean(until) };
  }
  if (command === 'request-information') {
    assert(
      ['submitted', 'scanning_validation', 'needs_information'].includes(app.status),
      409,
      'COMMERCIAL_REVIEW_STATE',
      'Request information on a submitted application.',
    );
    if (d.personId)
      assert(
        await statement(
          env.DB,
          "SELECT id FROM commercial_application_people WHERE id=? AND application_id=? AND state!='removed'",
          d.personId,
          app.id,
        ).first(),
        422,
        'COMMERCIAL_PERSON_UNAVAILABLE',
        'Choose a current participant.',
      );
    await env.DB.batch([
      statement(
        env.DB,
        "UPDATE commercial_applications SET status='needs_information',version=version+1,updated_at=? WHERE id=? AND version=?",
        now(),
        app.id,
        d.version,
      ),
      guard(env),
      statement(
        env.DB,
        "UPDATE commercial_application_people SET state='in_progress',declared_at=NULL,version=version+1 WHERE application_id=? AND state!='removed' AND (? IS NULL OR id=?)",
        app.id,
        d.personId ?? null,
        d.personId ?? null,
      ),
      await commercialEvent(
        env,
        app.id,
        app.flow_id,
        'information_requested',
        { instructions: d.note },
        d.personId,
        user.id,
      ),
      clearGuard(env),
    ]);
    return { requested: true };
  }
  assert(
    command === 'decision' || command === 'close',
    404,
    'COMMERCIAL_REVIEW_COMMAND',
    'Choose a review action.',
  );
  assert(
    !app.privacy_hold_until || app.privacy_hold_until <= now(),
    409,
    'COMMERCIAL_PRIVACY_HOLD',
    'Resolve the privacy hold first.',
  );
  assert(
    app.status === 'referred' && d.authorityReference && d.outcome,
    409,
    'COMMERCIAL_DECISION_AUTHORITY',
    'Record only a written decision from the responsible lessor after verified referral.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE commercial_applications SET status=?,version=version+1,updated_at=? WHERE id=? AND version=?',
      command === 'close' ? 'closed' : 'decision_recorded',
      now(),
      app.id,
      d.version,
    ),
    guard(env),
    await commercialEvent(
      env,
      app.id,
      app.flow_id,
      'decision_recorded',
      {
        outcome: d.outcome,
        authorityReference: d.authorityReference,
        note: d.note,
        leaseCreated: false,
      },
      undefined,
      user.id,
    ),
    clearGuard(env),
  ]);
  return { recorded: true, leaseCreated: false };
}
