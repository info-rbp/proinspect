import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { operationsWrite, administrator } from '../../../../packages/authorization/server';
import { tenancyAccess } from './tenancies.server';
import {
  recordId,
  shortText,
  reference,
  version,
  boundedFile,
  activity,
  guard,
  clearGuard,
} from '../../../../packages/operations/core';
import { seal, unseal } from '../../../../packages/auth/crypto';
// Intake/recordkeeping only. Issuance uses an uploaded, reviewed official form; no generated legal substitute.
export const FORM_DEFINITIONS = [
  {
    code: 'WA_FORM_22',
    name: 'Tenant notice of termination',
    version: '2026-10-review-1',
    audience: 'tenant',
  },
  { code: 'WA_FORM_25', name: 'Pet request', version: '2026-10-review-1', audience: 'tenant' },
  {
    code: 'WA_FORM_26',
    name: 'Minor modification request',
    version: '2026-10-review-1',
    audience: 'tenant',
  },
  {
    code: 'WA_BOND_LODGEMENT',
    name: 'Bond lodgement record',
    version: '2026-10-review-1',
    audience: 'manager',
  },
  {
    code: 'WA_BOND_DISPOSAL',
    name: 'Bond disposal coordination',
    version: '2026-10-review-1',
    audience: 'both',
  },
];
export async function formsData(env: Env, user: Principal, w: Workspace, tenancyId: string) {
  await tenancyAccess(env, user, w, tenancyId);
  const rows = (
    await statement(
      env.DB,
      `SELECT * FROM statutory_forms WHERE tenancy_id=? ${w.kind === 'tenant' ? 'AND created_by=?' : ''} ORDER BY created_at DESC`,
      tenancyId,
      ...(w.kind === 'tenant' ? [user.id] : []),
    ).all<Record<string, any>>()
  ).results;
  return {
    definitions: FORM_DEFINITIONS,
    forms: await Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        form_code: r.form_code,
        status: r.status,
        version: r.version,
        created_at: r.created_at,
        issued_document_id: r.issued_document_id,
        service_reference: r.service_reference,
        answers: await unseal(env.DATA_ENCRYPTION_KEY, `form:${r.id}`, r.answers_envelope),
      })),
    ),
    source: 'https://www.consumerprotection.wa.gov.au/rental-forms-and-notices',
  };
}
export async function createForm(env: Env, user: Principal, w: Workspace, input: unknown) {
  const d = z
    .object({ tenancyId: recordId, formCode: z.string(), details: z.string().min(10).max(6000) })
    .parse(input);
  const t = await tenancyAccess(env, user, w, d.tenancyId, w.kind !== 'tenant');
  assert(
    t.status === 'active' || d.formCode === 'WA_BOND_DISPOSAL',
    409,
    'TENANCY_ENDED',
    'Only bond-disposal recordkeeping is available for a past tenancy.',
  );
  const definition = FORM_DEFINITIONS.find((f) => f.code === d.formCode);
  assert(
    definition,
    422,
    'FORM_UNAVAILABLE',
    'This form is not available in the ordinary workflow.',
  );
  assert(
    definition.audience !== 'manager' || w.kind !== 'tenant',
    403,
    'MANAGER_REQUIRED',
    'This form is managed by the current property manager.',
  );
  const id = uid('form');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO statutory_forms(id,tenancy_id,created_by,form_code,definition_version,answers_envelope,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',?,?)",
      id,
      d.tenancyId,
      user.id,
      d.formCode,
      definition.version,
      await seal(env.DATA_ENCRYPTION_KEY, `form:${id}`, { details: d.details }),
      now(),
      now(),
    ),
    activity(env, user, 'tenancy.form_draft_created', 'statutory_form', id, t.property_id),
  ]);
  return { id };
}
export async function updateForm(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  const f = await statement(env.DB, 'SELECT * FROM statutory_forms WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(f, 404, 'FORM_NOT_FOUND', 'Form not found.');
  const t = await tenancyAccess(env, user, w, f.tenancy_id, w.kind !== 'tenant');
  const d = z
    .object({
      version,
      status: z.enum(['submitted', 'under_review', 'ready', 'recorded']),
      documentId: recordId.optional(),
      reference: reference.optional(),
    })
    .parse(input);
  if (w.kind === 'tenant')
    assert(
      f.created_by === user.id && d.status === 'submitted',
      403,
      'REVIEW_REQUIRED',
      'Only your draft can be submitted.',
    );
  else if (w.kind === 'staff') operationsWrite(user);
  const next: Record<string, string[]> = {
    draft: ['submitted'],
    submitted: ['under_review'],
    under_review: ['ready'],
    ready: ['recorded'],
  };
  assert(
    f.version === d.version && next[f.status]?.includes(d.status),
    409,
    'FORM_CHANGED',
    'Form state has changed.',
  );
  if (d.status === 'ready') {
    assert(
      d.documentId,
      422,
      'OFFICIAL_DOCUMENT_REQUIRED',
      'Upload and issue a reviewed official form first.',
    );
    assert(
      await statement(
        env.DB,
        "SELECT d.id FROM documents d JOIN document_grants g ON g.document_id=d.id WHERE d.id=? AND d.property_id=? AND d.tenancy_id=? AND d.status='issued' AND g.recipient_kind='tenancy' AND g.recipient_id=?",
        d.documentId,
        t.property_id,
        t.id,
        t.id,
      ).first(),
      422,
      'FORM_DOCUMENT_CONTEXT',
      'The reviewed PDF must be issued to this tenancy.',
    );
  }
  if (d.status === 'recorded')
    assert(
      d.reference,
      422,
      'SERVICE_EVIDENCE_REQUIRED',
      'Record the actual service or lodgement reference. Portal publication alone is not legal service.',
    );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE statutory_forms SET status=?,issued_document_id=COALESCE(?,issued_document_id),service_reference=COALESCE(?,service_reference),version=version+1,updated_at=? WHERE id=? AND version=?',
      d.status,
      d.documentId ?? null,
      d.reference ?? null,
      now(),
      id,
      d.version,
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO statutory_case_events(id,form_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?)',
      uid('fe'),
      id,
      user.id,
      d.status,
      d.reference ?? null,
      now(),
    ),
    activity(env, user, 'tenancy.form_status_recorded', 'statutory_form', id, t.property_id, null, {
      status: d.status,
    }),
    clearGuard(env),
  ]);
  return { id, status: d.status };
}
function restrictedEnabled(env: Env) {
  assert(
    env.RESTRICTED_WORKFLOWS_ENABLED === 'true',
    503,
    'RESTRICTED_WORKFLOW_DISABLED',
    'The confidential intake workflow is disabled until its release controls are approved.',
  );
}
async function caseAccess(env: Env, user: Principal, id: string) {
  restrictedEnabled(env);
  const c = await statement(env.DB, 'SELECT * FROM restricted_form_cases WHERE id=?', id).first<
    Record<string, any>
  >();
  const allowed =
    c &&
    (c.applicant_user_id === user.id ||
      (await statement(
        env.DB,
        'SELECT g.case_id FROM restricted_case_grants g JOIN staff_profiles s ON s.user_id=g.staff_user_id AND s.active=1 JOIN restricted_reviewers r ON r.staff_user_id=s.user_id AND r.active=1 WHERE g.case_id=? AND g.staff_user_id=?',
        id,
        user.id,
      ).first()));
  assert(allowed, 404, 'CASE_NOT_FOUND', 'Confidential case not found.');
  return c!;
}
function privateAudit(env: Env, user: Principal, id: string, action: string) {
  return statement(
    env.DB,
    'INSERT INTO restricted_audit(id,case_id,actor_id,action,created_at) VALUES(?,?,?,?,?)',
    uid('ra'),
    id,
    user.id,
    action,
    now(),
  );
}
export async function restrictedData(env: Env, user: Principal, w: Workspace) {
  restrictedEnabled(env);
  assert(
    w.kind === 'tenant' || w.kind === 'staff',
    403,
    'CONFIDENTIAL_ACCESS',
    'This workspace cannot open confidential cases.',
  );
  const cases = (
    await statement(
      env.DB,
      `SELECT c.id,c.status,c.version,c.created_at FROM restricted_form_cases c WHERE (c.applicant_user_id=? ${w.kind === 'tenant' ? 'AND c.tenancy_id=?' : ''}) OR EXISTS(SELECT 1 FROM restricted_case_grants g JOIN restricted_reviewers r ON r.staff_user_id=g.staff_user_id AND r.active=1 JOIN staff_profiles s ON s.user_id=g.staff_user_id AND s.active=1 WHERE g.case_id=c.id AND g.staff_user_id=?) ORDER BY c.created_at DESC`,
      user.id,
      ...(w.kind === 'tenant' ? [w.scopeId] : []),
      user.id,
    ).all()
  ).results;
  const reviewers = (
    await statement(
      env.DB,
      'SELECT u.id,u.display_name FROM restricted_reviewers r JOIN staff_profiles s ON s.user_id=r.staff_user_id AND s.active=1 JOIN users u ON u.id=s.user_id AND u.active=1 WHERE r.active=1 ORDER BY u.display_name',
    ).all()
  ).results;
  return { cases, reviewers };
}
export async function createRestrictedCase(
  env: Env,
  user: Principal,
  w: Workspace,
  input: unknown,
) {
  restrictedEnabled(env);
  assert(w.kind === 'tenant', 403, 'TENANT_REQUIRED', 'Open this intake from your own tenancy.');
  await tenancyAccess(env, user, w, w.scopeId);
  const d = z
    .object({
      details: z.string().min(10).max(6000),
      safeContact: z.string().max(500).default(''),
      reviewerId: recordId,
    })
    .parse(input);
  assert(
    await statement(
      env.DB,
      'SELECT r.staff_user_id FROM restricted_reviewers r JOIN staff_profiles s ON s.user_id=r.staff_user_id AND s.active=1 WHERE r.staff_user_id=? AND r.active=1',
      d.reviewerId,
    ).first(),
    422,
    'REVIEWER_UNAVAILABLE',
    'Choose an approved confidential-case reviewer.',
  );
  const id = uid('case');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO restricted_form_cases(id,applicant_user_id,tenancy_id,envelope,status,created_at) VALUES(?,?,?,?,'draft',?)",
      id,
      user.id,
      w.scopeId,
      await seal(env.DATA_ENCRYPTION_KEY, `case:${id}`, {
        details: d.details,
        safeContact: d.safeContact,
      }),
      now(),
    ),
    statement(
      env.DB,
      'INSERT INTO restricted_case_grants(case_id,staff_user_id,granted_by) VALUES(?,?,?)',
      id,
      d.reviewerId,
      user.id,
    ),
    privateAudit(env, user, id, 'created_and_reviewer_authorised'),
  ]);
  return { id };
}
export async function restrictedDetail(env: Env, user: Principal, id: string) {
  const c = await caseAccess(env, user, id);
  await privateAudit(env, user, id, 'viewed').run();
  return {
    id: c.id,
    status: c.status,
    version: c.version,
    applicant: c.applicant_user_id === user.id,
    details: await unseal(env.DATA_ENCRYPTION_KEY, `case:${id}`, c.envelope),
    evidence: (
      await statement(
        env.DB,
        'SELECT id,created_at,size FROM restricted_evidence WHERE case_id=?',
        id,
      ).all()
    ).results,
  };
}
export async function uploadRestrictedEvidence(
  env: Env,
  user: Principal,
  id: string,
  form: FormData,
) {
  const c = await caseAccess(env, user, id);
  assert(
    c.applicant_user_id === user.id,
    403,
    'APPLICANT_REQUIRED',
    'Only the applicant may add supporting evidence.',
  );
  const f = await boundedFile(form);
  assert(
    f.file.size <= 2 * 1024 * 1024,
    413,
    'FILE_SIZE',
    'Confidential files must be smaller than 2 MB.',
  );
  const evidenceId = uid('evidence'),
    key = `confidential/${evidenceId}`;
  let binary = '';
  for (const byte of new Uint8Array(f.bytes)) binary += String.fromCharCode(byte);
  const encrypted = await seal(env.DATA_ENCRYPTION_KEY, `evidence:${evidenceId}`, {
    content: btoa(binary),
    contentType: f.mime,
  });
  await env.RESTRICTED_DOCUMENTS.put(key, encrypted, {
    httpMetadata: { contentType: 'application/octet-stream' },
  });
  try {
    await env.DB.batch([
      statement(
        env.DB,
        'INSERT INTO restricted_evidence(id,case_id,object_key,envelope,size,created_at) VALUES(?,?,?,?,?,?)',
        evidenceId,
        id,
        key,
        await seal(env.DATA_ENCRYPTION_KEY, `evidence-meta:${evidenceId}`, {
          name: f.name,
          sha256: f.hash,
        }),
        f.file.size,
        now(),
      ),
      privateAudit(env, user, id, 'evidence_uploaded'),
    ]);
  } catch (error) {
    await env.RESTRICTED_DOCUMENTS.delete(key);
    throw error;
  }
  return { id: evidenceId };
}
export async function downloadRestrictedEvidence(env: Env, user: Principal, id: string) {
  restrictedEnabled(env);
  const e = await statement(env.DB, 'SELECT * FROM restricted_evidence WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(e, 404, 'EVIDENCE_NOT_FOUND', 'Evidence not found.');
  await caseAccess(env, user, e.case_id);
  const object = await env.RESTRICTED_DOCUMENTS.get(e.object_key);
  assert(object, 404, 'EVIDENCE_NOT_FOUND', 'Evidence unavailable.');
  const data = await unseal<{ content: string }>(
    env.DATA_ENCRYPTION_KEY,
    `evidence:${id}`,
    await object.text(),
  );
  await privateAudit(env, user, e.case_id, 'evidence_downloaded').run();
  return new Response(
    Uint8Array.from(atob(data.content), (c) => c.charCodeAt(0)),
    {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="evidence-${id}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    },
  );
}
export async function updateRestrictedCase(env: Env, user: Principal, id: string, input: unknown) {
  const c = await caseAccess(env, user, id),
    d = z.object({ version, status: z.enum(['submitted', 'under_review', 'closed']) }).parse(input);
  const next: Record<string, string[]> = {
    draft: ['submitted'],
    submitted: ['under_review'],
    under_review: ['closed'],
  };
  assert(
    c.version === d.version && next[c.status]?.includes(d.status),
    409,
    'CASE_CHANGED',
    'The case has changed.',
  );
  assert(
    d.status === 'submitted' ? c.applicant_user_id === user.id : c.applicant_user_id !== user.id,
    403,
    'CASE_ROLE',
    'This action requires the designated participant.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE restricted_form_cases SET status=?,version=version+1 WHERE id=? AND version=?',
      d.status,
      id,
      d.version,
    ),
    guard(env),
    privateAudit(env, user, id, d.status),
    clearGuard(env),
  ]);
  return { id, status: d.status };
}
export async function setRestrictedReviewer(env: Env, user: Principal, input: unknown) {
  administrator(user);
  const d = z.object({ userId: recordId, active: z.boolean() }).parse(input);
  assert(
    await statement(
      env.DB,
      "SELECT user_id FROM staff_profiles WHERE user_id=? AND active=1 AND role IN('administrator','operations_manager')",
      d.userId,
    ).first(),
    422,
    'REVIEWER_INVALID',
    'Choose an active operational reviewer.',
  );
  // No case identifiers or applicant data enter the general audit.
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO restricted_reviewers(staff_user_id,active) VALUES(?,?) ON CONFLICT(staff_user_id) DO UPDATE SET active=excluded.active',
      d.userId,
      d.active ? 1 : 0,
    ),
    activity(env, user, 'confidential.reviewer_configured', 'user', d.userId, null, null, {
      active: d.active,
    }),
  ]);
  return { ok: true };
}
