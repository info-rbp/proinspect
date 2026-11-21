import { requireResidentialSector } from './residential-policy.server';
import { z } from 'zod';
import { propertyManagementTag } from './managed-rental-intake.server';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { digest, randomToken, seal, unseal } from '../../../../packages/auth/crypto';
import { isLocal } from '../../../../packages/auth/server';
import { mailEvent } from '../../../../packages/notifications/server';
import { guard, clearGuard } from '../../../../packages/operations/core';
import { checkedHttpsEndpoint } from '../../../../packages/marketing/rental-governance';
import { releaseFeatureReady, requireReleaseApproval } from './release-governance.server';
import { currentLegalDocument } from './legal-acceptance.server';
import {
  COMMERCIAL_APPLICATION_VERSION,
  validateEntityGraph,
  sectionSchemas,
  personDetails,
  commercialReadiness,
  commercialOffer,
  commercialEditable,
  type CommercialShared,
  type Evidence,
} from '../../../../packages/marketing/commercial-application';
export const commercialPrivateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'Referrer-Policy': 'strict-origin',
};
const text = z.string().trim().max(5000);
export const commercialFlowInput = z.object({
  listingId: z.string().min(3).max(100),
  managedByProInspect: z.literal(true),
  authorityReference: text.min(8),
  recipient: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  privacyVersion: text.min(3),
  collectionNotice: text.min(100),
  providerDisclosure: text.min(30),
  guarantee: z.enum(['required', 'optional', 'none']),
  securityRequirements: text.min(5),
  requiredPersonalEvidence: z
    .array(z.enum(['identity', 'guarantee']))
    .max(2)
    .default([]),
  retention: z.object({
    draft: z.number().int().min(1).max(3650),
    submitted: z.number().int().min(1).max(3650),
    withdrawn: z.number().int().min(1).max(3650),
  }),
});
export type FlowConfig = z.infer<typeof commercialFlowInput> & {
  listingSnapshot: { propertyId: string; clientId: string; agentName: string; agentRole: string };
};
export type FlowRow = {
  id: string;
  listing_id: string;
  version: number;
  status: string;
  config_envelope: string;
  config_sha256: string;
  recipient_hash: string;
  recipient_verified_at: string | null;
  created_by: string;
  listing_status: string;
  kind: string;
  application_url: string | null;
  agent_name: string;
  agent_role: string;
  property_id: string;
  instructed_by_client_id: string;
  title: string;
  slug: string;
  display_address: string;
  postcode: string;
  suburb: string;
};
export type AppRow = {
  id: string;
  flow_id: string;
  reference: string;
  status: string;
  version: number;
  shared_envelope: string;
  scope_sha256: string;
  submitted_at: string | null;
  retained_until: string;
  privacy_hold_until: string | null;
  purged_at: string | null;
};
export type PersonRow = {
  id: string;
  application_id: string;
  lead: number;
  profile_envelope: string;
  state: string;
  version: number;
  declared_scope_sha256: string | null;
  declared_notice_sha256: string | null;
  declared_at: string | null;
};
export type Profile = {
  name: string;
  email: string;
  invitationName?: string;
  telephone?: string;
  address?: string;
  identityType?: string;
  identityReference?: string;
  authorityStatement?: string;
  consents?: {
    noticeHash: string;
    referencePermission: boolean;
    nonBinding: true;
    authority: true;
    at: string;
  };
};
export async function commercialEvent(
  env: Env,
  applicationId: string | null,
  flowId: string,
  kind: string,
  detail: unknown,
  person?: string,
  staff?: string,
) {
  const id = uid('cae');
  return statement(
    env.DB,
    'INSERT INTO commercial_application_events(id,application_id,flow_id,actor_person_id,actor_staff_id,kind,envelope,created_at) VALUES(?,?,?,?,?,?,?,?)',
    id,
    applicationId,
    flowId,
    person ?? null,
    staff ?? null,
    kind,
    await seal(env.DATA_ENCRYPTION_KEY, 'commercial-event:' + id, detail),
    now(),
  );
}
export async function commercialPermission(
  env: Env,
  user: Principal,
  kind: 'configure' | 'review',
) {
  assert(
    ['administrator', 'operations_manager'].includes(user.staffRole ?? ''),
    403,
    'COMMERCIAL_STAFF_REQUIRED',
    'Commercial application permission is required.',
  );
  if (kind === 'configure' && user.staffRole === 'administrator') return;
  const permission = await statement(
    env.DB,
    'SELECT can_configure,can_review FROM commercial_application_permissions WHERE user_id=? AND active=1',
    user.id,
  ).first<{ can_configure: number; can_review: number }>();
  assert(
    permission && (kind === 'configure' ? permission.can_configure : permission.can_review) === 1,
    403,
    'COMMERCIAL_PERMISSION_REQUIRED',
    'This permission is separate from residential application access.',
  );
}
export function commercialRetention(env: Env, stage: 'draft' | 'submitted' | 'withdrawn') {
  const value = Number(
    stage === 'draft'
      ? env.COMMERCIAL_RETENTION_DRAFT_DAYS
      : stage === 'submitted'
        ? env.COMMERCIAL_RETENTION_SUBMITTED_DAYS
        : env.COMMERCIAL_RETENTION_WITHDRAWN_DAYS,
  );
  return Number.isInteger(value) && value >= 1 && value <= 3650 ? value : null;
}
export async function commercialReady(env: Env) {
  if (
    env.COMMERCIAL_APPLICATIONS_ENABLED !== 'true' ||
    env.COMMERCIAL_APPLICATION_SCANNER_ENABLED !== 'true' ||
    env.COMMERCIAL_APPLICATION_HANDOFF_ENABLED !== 'true'
  )
    return false;
  if (
    !env.DATA_ENCRYPTION_KEY ||
    !env.RESTRICTED_DOCUMENTS ||
    !commercialRetention(env, 'draft') ||
    !commercialRetention(env, 'submitted') ||
    !commercialRetention(env, 'withdrawn')
  )
    return false;
  if (
    !checkedHttpsEndpoint(env.COMMERCIAL_SCANNER_ENDPOINT, env.COMMERCIAL_SCANNER_ALLOWED_HOST) ||
    !env.COMMERCIAL_SCANNER_ALLOWED_HOST ||
    !env.COMMERCIAL_SCANNER_TOKEN ||
    env.COMMERCIAL_SCANNER_TOKEN.length < 32 ||
    !env.COMMERCIAL_SCANNER_WEBHOOK_SECRET ||
    env.COMMERCIAL_SCANNER_WEBHOOK_SECRET.length < 32
  )
    return false;
  if (
    !checkedHttpsEndpoint(env.COMMERCIAL_HANDOFF_ENDPOINT, env.COMMERCIAL_HANDOFF_ALLOWED_HOST) ||
    !env.COMMERCIAL_HANDOFF_ALLOWED_HOST ||
    !env.COMMERCIAL_HANDOFF_SECRET ||
    env.COMMERCIAL_HANDOFF_SECRET.length < 32
  )
    return false;
  return (
    (await releaseFeatureReady(env, 'commercial_applications')) &&
    (await releaseFeatureReady(env, 'commercial_application_scanner')) &&
    (await releaseFeatureReady(env, 'commercial_application_handoff'))
  );
}
export async function commercialGate(env: Env) {
  assert(
    await commercialReady(env),
    503,
    'COMMERCIAL_APPLICATION_UNAVAILABLE',
    'Commercial applications are not available.',
  );
}
export async function flowConfig(env: Env, flow: FlowRow) {
  return unseal<FlowConfig>(
    env.DATA_ENCRYPTION_KEY,
    'commercial-flow:' + flow.id,
    flow.config_envelope,
  );
}
export async function commercialFlow(env: Env, id: string, available = true) {
  const row = await statement(
    env.DB,
    'SELECT f.*,l.status AS listing_status,l.kind,l.application_url,l.agent_name,l.agent_role,l.property_id,l.instructed_by_client_id,l.title,l.slug,l.display_address,l.postcode,l.suburb FROM commercial_application_flows f JOIN leasing_listings l ON l.id=f.listing_id WHERE f.id=?',
    id,
  ).first<FlowRow>();
  assert(row, 404, 'COMMERCIAL_APPLICATION_UNAVAILABLE', 'Commercial application unavailable.');
  if (available) {
    await commercialGate(env);
    assert((await propertyManagementTag(env,row.property_id))?.provider==='proinspect',404,'COMMERCIAL_MANAGEMENT_REQUIRED','Native applications require the ProInspect-managed property tag.');
    assert(
      row.kind === 'commercial' &&
        row.listing_status === 'published' &&
        row.status === 'approved' &&
        row.recipient_verified_at &&
        !row.application_url,
      404,
      'COMMERCIAL_APPLICATION_UNAVAILABLE',
      'Commercial application unavailable.',
    );
    const config = await flowConfig(env, row),
      policy = await currentLegalDocument(env, 'privacy');
    assert(config.managedByProInspect===true,503,'COMMERCIAL_MANAGEMENT_REQUIRED','Native intake is available only for properties directly managed by ProInspect.');
    assert(
      config.listingSnapshot.propertyId === row.property_id &&
        config.listingSnapshot.clientId === row.instructed_by_client_id &&
        config.listingSnapshot.agentName === row.agent_name &&
        config.listingSnapshot.agentRole === row.agent_role,
      503,
      'COMMERCIAL_AUTHORITY_CHANGED',
      'The listing authority requires new approval.',
    );
    assert(
      env.APP_ENV === 'local' || policy?.version_label === config.privacyVersion,
      503,
      'COMMERCIAL_NOTICE_UNAVAILABLE',
      'The approved collection notice requires review.',
    );
    assert(
      ['draft', 'submitted', 'withdrawn'].every(
        (stage) =>
          config.retention[stage as keyof FlowConfig['retention']] ===
          commercialRetention(env, stage as 'draft' | 'submitted' | 'withdrawn'),
      ),
      503,
      'COMMERCIAL_RETENTION_CHANGED',
      'The approved retention schedule requires review.',
    );
  }
  return row;
}
export async function commercialListingReady(env: Env, listingId: string) {
  if (!(await commercialReady(env))) return null;
  const row = await statement(
    env.DB,
    "SELECT id FROM commercial_application_flows WHERE listing_id=? AND status='approved'",
    listingId,
  ).first<{ id: string }>();
  if (!row) return null;
  try {
    return await commercialFlow(env, row.id);
  } catch {
    return null;
  }
}
export async function commercialLimit(env: Env, scope: string, max = 5) {
  const hash = await digest(env.DATA_ENCRYPTION_KEY + ':commercial:' + scope),
    stamp = now();
  const row = await statement(
    env.DB,
    'INSERT INTO auth_rate_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN expires_at<? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING attempts',
    hash,
    new Date(Date.now() + 900000).toISOString(),
    stamp,
    stamp,
  ).first<{ attempts: number }>();
  assert(
    row && row.attempts <= max,
    429,
    'COMMERCIAL_RATE_LIMIT',
    'Too many attempts. Try again later.',
  );
}
export async function commercialBotCheck(env: Env, request: Request, token?: string) {
  if (isLocal(request, env)) return;
  assert(
    env.MARKETING_TURNSTILE_SECRET_KEY && token,
    503,
    'COMMERCIAL_SECURITY_UNAVAILABLE',
    'Security verification unavailable.',
  );
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: env.MARKETING_TURNSTILE_SECRET_KEY, response: token }),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()) as {
    success?: boolean;
    hostname?: string;
    action?: string;
  };
  assert(
    response.ok &&
      result.success &&
      result.hostname === new URL(env.APP_ORIGIN).hostname &&
      result.action === 'commercial_application',
    403,
    'COMMERCIAL_SECURITY_CHECK',
    'Repeat the security check.',
  );
}
export const commercialEmailHash = (env: Env, email: string) =>
  digest(env.DATA_ENCRYPTION_KEY + ':commercial-email:' + email.trim().toLowerCase());
export async function privateCommercialLink(env: Env, personId: string, email: string) {
  const token = randomToken();
  return {
    token,
    statements: [
      statement(
        env.DB,
        'UPDATE commercial_application_links SET consumed_at=? WHERE person_id=? AND consumed_at IS NULL',
        now(),
        personId,
      ),
      statement(
        env.DB,
        'UPDATE commercial_application_sessions SET revoked_at=? WHERE person_id=? AND revoked_at IS NULL',
        now(),
        personId,
      ),
      statement(
        env.DB,
        'INSERT INTO commercial_application_links(token_hash,person_id,expires_at) VALUES(?,?,?)',
        await digest(token),
        personId,
        new Date(Date.now() + 30 * 60000).toISOString(),
      ),
      await mailEvent(env, 'commercial.application.private_link', {
        to: email,
        subject: 'Your private commercial application link',
        heading: 'Continue your commercial application',
        body: 'This link is single-use and expires in 30 minutes. Each participant completes their own private details. This is not a lease or an approval.',
        href: env.APP_ORIGIN + '/commercial-application/' + token,
        sensitive: true,
      }),
    ],
  };
}
export async function exchangeCommercialLink(env: Env, token: string) {
  await commercialGate(env);
  assert(
    /^[a-f0-9]{64}$/.test(token),
    404,
    'COMMERCIAL_LINK_UNAVAILABLE',
    'Private link unavailable.',
  );
  const hash = await digest(token),
    link = await statement(
      env.DB,
      'SELECT person_id FROM commercial_application_links WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?',
      hash,
      now(),
    ).first<{ person_id: string }>();
  assert(
    link,
    404,
    'COMMERCIAL_LINK_UNAVAILABLE',
    'Private link unavailable or already used. Recover access by email.',
  );
  const person = await statement(
    env.DB,
    "SELECT p.*,a.flow_id FROM commercial_application_people p JOIN commercial_applications a ON a.id=p.application_id WHERE p.id=? AND p.state!='removed'",
    link.person_id,
  ).first<PersonRow & { flow_id: string }>();
  assert(person, 404, 'COMMERCIAL_LINK_UNAVAILABLE', 'Private link unavailable.');
  await commercialFlow(env, person.flow_id);
  const session = randomToken();
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE commercial_application_links SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?',
      now(),
      hash,
      now(),
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO commercial_application_sessions(token_hash,person_id,expires_at) VALUES(?,?,?)',
      await digest(session),
      person.id,
      new Date(Date.now() + 8 * 3600000).toISOString(),
    ),
    clearGuard(env),
  ]);
  return session;
}
export async function commercialAccess(env: Env, session: string) {
  await commercialGate(env);
  assert(
    /^[a-f0-9]{64}$/.test(session),
    404,
    'COMMERCIAL_ACCESS_UNAVAILABLE',
    'Private application unavailable.',
  );
  const person = await statement(
    env.DB,
    "SELECT p.* FROM commercial_application_sessions s JOIN commercial_application_people p ON p.id=s.person_id WHERE s.token_hash=? AND s.expires_at>? AND s.revoked_at IS NULL AND p.state!='removed'",
    await digest(session),
    now(),
  ).first<PersonRow>();
  assert(
    person,
    404,
    'COMMERCIAL_ACCESS_UNAVAILABLE',
    'Private access expired. Recover a new link.',
  );
  const app = await statement(
    env.DB,
    'SELECT * FROM commercial_applications WHERE id=?',
    person.application_id,
  ).first<AppRow>();
  assert(app, 404, 'COMMERCIAL_ACCESS_UNAVAILABLE', 'Private application unavailable.');
  const flow = await commercialFlow(env, app.flow_id),
    config = await flowConfig(env, flow),
    shared = await unseal<CommercialShared>(
      env.DATA_ENCRYPTION_KEY,
      'commercial-shared:' + app.id,
      app.shared_envelope,
    ),
    profile = await unseal<Profile>(
      env.DATA_ENCRYPTION_KEY,
      'commercial-person:' + person.id,
      person.profile_envelope,
    );
  return { person, app, flow, config, shared, profile };
}
export async function beginCommercial(
  env: Env,
  request: Request,
  flowId: string,
  input: unknown,
  security?: string,
) {
  requireResidentialSector('commercial');
  const flow = await commercialFlow(env, flowId),
    config = await flowConfig(env, flow);
  const d = z
    .object({
      name: z.string().trim().min(2).max(120),
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase()),
      consent: z.literal(true),
    })
    .parse(input);
  await commercialLimit(
    env,
    'start-ip:' + String(request.headers.get('CF-Connecting-IP') ?? 'unknown'),
  );
  await commercialLimit(env, 'start-email:' + d.email, 4);
  await commercialBotCheck(env, request, security);
  const hash = await commercialEmailHash(env, d.email),
    existing = await statement(
      env.DB,
      "SELECT p.id FROM commercial_application_people p JOIN commercial_applications a ON a.id=p.application_id WHERE a.flow_id=? AND p.email_hash=? AND p.lead=1 AND a.status IN('draft','in_progress','needs_information') LIMIT 1",
      flow.id,
      hash,
    ).first<{ id: string }>();
  if (existing) {
    const link = await privateCommercialLink(env, existing.id, d.email);
    await env.DB.batch(link.statements);
    return { sent: true };
  }
  const appId = uid('capp'),
    personId = uid('cap'),
    scopeHash = await digest(JSON.stringify([flow.config_sha256, {}])),
    link = await privateCommercialLink(env, personId, d.email),
    stamp = now();
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO commercial_applications(id,flow_id,reference,shared_envelope,scope_sha256,created_at,updated_at,retained_until) VALUES(?,?,?,?,?,?,?,?)',
      appId,
      flow.id,
      'COM-' + crypto.randomUUID().slice(0, 12).toUpperCase(),
      await seal(env.DATA_ENCRYPTION_KEY, 'commercial-shared:' + appId, {}),
      scopeHash,
      stamp,
      stamp,
      new Date(Date.now() + config.retention.draft * 86400000).toISOString(),
    ),
    statement(
      env.DB,
      "INSERT INTO commercial_application_people(id,application_id,email_hash,lead,profile_envelope,state) VALUES(?,?,?,1,?,'in_progress')",
      personId,
      appId,
      hash,
      await seal(env.DATA_ENCRYPTION_KEY, 'commercial-person:' + personId, {
        name: d.name,
        email: d.email,
      }),
    ),
    ...link.statements,
    await commercialEvent(
      env,
      appId,
      flow.id,
      'started',
      {
        schemaVersion: COMMERCIAL_APPLICATION_VERSION,
        noticeHash: await digest(config.collectionNotice),
      },
      personId,
    ),
  ]);
  return { sent: true };
}
export async function commercialRecover(
  env: Env,
  request: Request,
  input: unknown,
  security?: string,
) {
  await commercialGate(env);
  const d = z
    .object({
      reference: z.string().trim().min(7).max(100),
      email: z
        .email()
        .max(254)
        .transform((s) => s.toLowerCase()),
    })
    .parse(input);
  await commercialLimit(
    env,
    'recover-ip:' + String(request.headers.get('CF-Connecting-IP') ?? 'unknown'),
  );
  await commercialLimit(env, 'recover-email:' + d.email, 4);
  await commercialBotCheck(env, request, security);
  const person = await statement(
    env.DB,
    "SELECT p.id,a.flow_id FROM commercial_application_people p JOIN commercial_applications a ON a.id=p.application_id WHERE a.reference=? AND p.email_hash=? AND p.state!='removed'",
    d.reference,
    await commercialEmailHash(env, d.email),
  ).first<{ id: string; flow_id: string }>();
  if (person) {
    try {
      await commercialFlow(env, person.flow_id);
      const link = await privateCommercialLink(env, person.id, d.email);
      await env.DB.batch(link.statements);
    } catch {
      /* Recovery remains generic when authority has expired. */
    }
  }
  return { received: true };
}
export async function commercialPage(env: Env, session: string) {
  const a = await commercialAccess(env, session);
  const people = (
    await statement(
      env.DB,
      "SELECT id,lead,state,profile_envelope FROM commercial_application_people WHERE application_id=? AND state!='removed' ORDER BY lead DESC,id",
      a.app.id,
    ).all<{ id: string; lead: number; state: string; profile_envelope: string }>()
  ).results;
  const statuses = await Promise.all(
    people.map(async (p, index) => ({
      id: p.id,
      lead: p.lead,
      state: p.state,
      label:
        p.id === a.person.id
          ? 'You'
          : a.person.lead
            ? (
                await unseal<Profile>(
                  env.DATA_ENCRYPTION_KEY,
                  'commercial-person:' + p.id,
                  p.profile_envelope,
                )
              ).invitationName || 'Participant ' + (index + 1)
            : 'Participant ' + (index + 1),
    })),
  );
  const docs = (
    await statement(
      env.DB,
      'SELECT id,person_id,entity_id,category,period_label,scan_status,review_status FROM commercial_application_evidence WHERE application_id=?',
      a.app.id,
    ).all<Evidence>()
  ).results;
  const offers = (
    await statement(
      env.DB,
      'SELECT id,envelope FROM commercial_application_offers WHERE application_id=? ORDER BY authorised_at DESC,id DESC LIMIT 1',
      a.app.id,
    ).all<{ id: string; envelope: string }>()
  ).results;
  let offer: z.infer<typeof commercialOffer> | null = null;
  if (offers[0]) {
    const value = await unseal<z.infer<typeof commercialOffer>>(
      env.DATA_ENCRYPTION_KEY,
      'commercial-offer:' + offers[0].id,
      offers[0].envelope,
    );
    if (value.permittedPersonIds.includes(a.person.id)) offer = value;
  }
  const readiness = commercialReadiness(
    a.shared,
    people.map((p) => p.id),
    docs,
    a.config.guarantee,
  );
  return {
    reference: a.app.reference,
    status: a.app.status,
    version: a.app.version,
    personVersion: a.person.version,
    personId: a.person.id,
    lead: Boolean(a.person.lead),
    profile: a.profile,
    shared: a.shared,
    people: statuses,
    documents: docs.filter((d) => d.person_id === a.person.id),
    readiness: a.person.lead
      ? readiness
      : { ready: a.person.state === 'ready', issues: [], manualReview: [] },
    offer,
    notice: {
      hash: await digest(
        JSON.stringify([
          a.config.privacyVersion,
          a.config.collectionNotice,
          a.config.providerDisclosure,
          a.config.recipient,
          a.config.retention,
        ]),
      ),
      version: a.config.privacyVersion,
      text: a.config.collectionNotice,
      providers: a.config.providerDisclosure,
      recipient: a.flow.agent_name,
      retention: a.config.retention,
    },
    informationRequests: await Promise.all(
      (
        await statement(
          env.DB,
          "SELECT id,envelope FROM commercial_application_events WHERE application_id=? AND kind='information_requested' AND (actor_person_id IS NULL OR actor_person_id=?) ORDER BY created_at DESC LIMIT 5",
          a.app.id,
          a.person.id,
        ).all<{ id: string; envelope: string }>()
      ).results.map(async (e) => ({
        id: e.id,
        ...(await unseal<{ instructions: string }>(
          env.DATA_ENCRYPTION_KEY,
          'commercial-event:' + e.id,
          e.envelope,
        )),
      })),
    ),
    privacyRequests: (
      await statement(
        env.DB,
        'SELECT id,kind,status,created_at FROM commercial_application_privacy_requests WHERE application_id=? AND person_id=? ORDER BY created_at DESC LIMIT 20',
        a.app.id,
        a.person.id,
      ).all()
    ).results,
    property: {
      title: a.flow.title,
      address: a.flow.display_address,
      suburb: a.flow.suburb,
      postcode: a.flow.postcode,
    },
    guarantee: a.config.guarantee,
    securityRequirements: a.config.securityRequirements,
    requiredPersonalEvidence: a.config.requiredPersonalEvidence,
  };
}
export { commercialEditable };
