import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { administrator } from '../../../../packages/authorization/server';
import { recordId, reference, isoDate, activity, guard, clearGuard } from '../../../../packages/operations/core';
import { digest } from '../../../../packages/auth/crypto';
import { PUBLIC_LEGAL_DRAFTS, type PublicLegalKey } from '../../../../packages/marketing/legal-drafts';
import { LEGAL_REQUIREMENTS, legalPurpose, acknowledgementKind, type LegalPurpose } from '../../../../packages/legal-policy';
const keys = Object.keys(PUBLIC_LEGAL_DRAFTS) as [PublicLegalKey, ...PublicLegalKey[]];
type Version = { id: string; document_key: PublicLegalKey; version_label: string; title: string; body_json: string; content_sha256: string; status: string; effective_at: string | null; created_by: string };
const projection = (v: Version) => ({ id: v.id, document_key: v.document_key, version_label: v.version_label, title: v.title,
  body: JSON.parse(v.body_json), content_sha256: v.content_sha256, status: v.status, effective_at: v.effective_at });
export async function currentLegalDocument(env: Env, key: string) {
  if (!Object.hasOwn(PUBLIC_LEGAL_DRAFTS, key)) return null;
  const v = await statement(env.DB, "SELECT * FROM legal_document_versions WHERE document_key=? AND status='approved' AND effective_at<=? ORDER BY effective_at DESC,approved_at DESC,id DESC LIMIT 1", key, now()).first<Version>();
  return v ? projection(v) : null;
}
export async function approvedLegalDocument(env: Env, id: string) {
  const v = await statement(env.DB, "SELECT * FROM legal_document_versions WHERE id=? AND approved_at IS NOT NULL AND effective_at<=? AND status IN('approved','withdrawn')", id, now()).first<Version>();
  assert(v, 404, 'LEGAL_DOCUMENT_UNAVAILABLE', 'Approved document version not found.');
  return projection(v);
}
export async function legalRequirements(env: Env, purpose: string) {
  assert(legalPurpose(purpose), 422, 'LEGAL_PURPOSE_INVALID', 'Unknown transaction type.');
  if (env.LEGAL_ACCEPTANCE_ENABLED !== 'true') return { enabled: false, ready: true, documents: [] };
  const versions = await Promise.all(LEGAL_REQUIREMENTS[purpose].map(key => currentLegalDocument(env, key)));
  return { enabled: true, ready: versions.every(Boolean), documents: versions.filter(v => v !== null).map(v => ({
    id: v.id, title: v.title, version_label: v.version_label, content_sha256: v.content_sha256,
    href: '/legal/documents/' + v.id, acknowledgement: acknowledgementKind(v.document_key),
  })) };
}
/** Return statements for the caller's atomic transaction. No stand-alone consent write can authorize an action. */
export async function legalStatements(env: Env, subject: { kind: 'user' | 'guest' | 'rental' | 'request'; id: string },
  purpose: LegalPurpose, transactionId: string, snapshot: unknown, input: unknown): Promise<D1PreparedStatement[]> {
  if (env.LEGAL_ACCEPTANCE_ENABLED !== 'true') return [];
  const requirements = await legalRequirements(env, purpose);
  assert(requirements.ready, 503, 'LEGAL_REVIEW_PENDING', 'The required approved documents are not yet available.');
  let raw = input;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { assert(false, 422, 'LEGAL_CONSENT_REQUIRED', 'Review and acknowledge the current documents.'); } }
  const consent = z.object({ acknowledged: z.literal(true), documents: z.array(z.object({ id: recordId, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).max(8) }).parse(raw);
  assert(consent.documents.length === requirements.documents.length && new Set(consent.documents.map(d => d.id)).size === consent.documents.length,
    409, 'LEGAL_VERSION_CHANGED', 'The document set changed. Review the current versions before continuing.');
  const time = now(), snapshotHash = await digest(JSON.stringify(snapshot));
  const steps: D1PreparedStatement[] = [];
  for (const doc of requirements.documents) {
    assert(consent.documents.some(c => c.id === doc.id && c.sha256 === doc.content_sha256), 409, 'LEGAL_VERSION_CHANGED', 'The applicable document text changed.');
    // Recheck the current published version inside the business transaction, not only during the preceding read.
    steps.push(statement(env.DB, `INSERT INTO legal_acceptance_receipts(id,subject_kind,subject_id,purpose,transaction_id,document_id,content_sha256,acknowledgement,snapshot_sha256,created_at)
      SELECT ?,?,?,?,?,v.id,v.content_sha256,?,?,? FROM legal_document_versions v
      WHERE v.id=? AND v.content_sha256=? AND v.status='approved' AND v.effective_at<=?
      AND v.id=(SELECT x.id FROM legal_document_versions x WHERE x.document_key=v.document_key AND x.status='approved' AND x.effective_at<=? ORDER BY x.effective_at DESC,x.approved_at DESC,x.id DESC LIMIT 1) ON CONFLICT(subject_kind,subject_id,purpose,transaction_id,document_id) DO NOTHING`,
      uid('lac'), subject.kind, subject.id, purpose, transactionId, doc.acknowledgement, snapshotHash, time, doc.id, doc.content_sha256, time, time), statement(env.DB, `INSERT INTO mutation_guards(changed_rows) SELECT CASE WHEN EXISTS(SELECT 1 FROM legal_acceptance_receipts r JOIN legal_document_versions v ON v.id=r.document_id WHERE r.subject_kind=? AND r.subject_id=? AND r.purpose=? AND r.transaction_id=? AND r.document_id=? AND r.content_sha256=? AND r.snapshot_sha256=? AND v.status='approved' AND v.effective_at<=? AND v.id=(SELECT x.id FROM legal_document_versions x WHERE x.document_key=v.document_key AND x.status='approved' AND x.effective_at<=? ORDER BY x.effective_at DESC,x.approved_at DESC,x.id DESC LIMIT 1)) THEN 1 ELSE 0 END`, subject.kind,subject.id,purpose,transactionId,doc.id,doc.content_sha256,snapshotHash,time,time));
  }
  steps.push(clearGuard(env));
  return steps;
}
export async function legalAdminData(env: Env, user: Principal) {
  administrator(user);
  const [documents, receiptSummary] = await Promise.all([
    statement(env.DB, 'SELECT id,document_key,version_label,title,content_sha256,status,created_by,approved_by,effective_at FROM legal_document_versions ORDER BY created_at DESC LIMIT 150').all(),
    statement(env.DB, 'SELECT purpose,count(*) AS receipts,max(created_at) AS latest FROM legal_acceptance_receipts GROUP BY purpose').all(),
  ]);
  return { enabled: env.LEGAL_ACCEPTANCE_ENABLED === 'true', keys, documents: documents.results, receiptSummary: receiptSummary.results };
}
export async function legalCommand(env: Env, user: Principal, command: string, input: unknown) {
  administrator(user);
  if (command === 'draft') {
    const d = z.object({ documentKey: z.enum(keys), versionLabel: z.string().trim().min(3).max(100), title: z.string().trim().min(3).max(200).optional(), bodyText: z.string().trim().min(30).max(55000).optional() }).parse(input);
    const source = PUBLIC_LEGAL_DRAFTS[d.documentKey];
    const body = d.bodyText ? { intro: 'Review the complete document below.', sections: [['Complete document text', d.bodyText]] } : { intro: source.intro, sections: source.sections };
    const title = d.title ?? source.title, json = JSON.stringify(body), hash = await digest(JSON.stringify({ title, body })), id = uid('ldv');
    await env.DB.batch([statement(env.DB, 'INSERT INTO legal_document_versions(id,document_key,version_label,title,body_json,content_sha256,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)', id, d.documentKey, d.versionLabel, title, json, hash, user.id, now()), activity(env, user, 'legal.draft_created', 'legal_document', id)]);
    return { id, status: 'draft', contentSha256: hash };
  }
  if (command === 'approve') {
    const d = z.object({ documentId: recordId, contentSha256: z.string().regex(/^[a-f0-9]{64}$/), effectiveAt: isoDate,
      approvalReference: reference.refine(v => v.length >= 8), finalTextConfirmed: z.literal(true), operatorIdentityVerified: z.literal(true), commercialConflictsResolved: z.literal(true) }).parse(input);
    const v = await statement(env.DB, 'SELECT * FROM legal_document_versions WHERE id=?', d.documentId).first<Version>();
    assert(v && v.status === 'draft' && v.content_sha256 === d.contentSha256, 409, 'LEGAL_DRAFT_CHANGED', 'Review the exact saved draft.');
    assert(v.created_by !== user.id, 403, 'INDEPENDENT_LEGAL_REVIEW', 'A different administrator must record approval.');
    // A copied review draft is never published merely by checking an approval box.
    assert(!/review draft|not yet.*approved|to be verified|must be confirmed|provisionally|negotiation draft/i.test(v.title + '\n' + v.body_json),
      422, 'LEGAL_DRAFT_TEXT', 'Create a final version with reviewed operator details and resolved draft qualifications before approval.');
    await env.DB.batch([statement(env.DB, "UPDATE legal_document_versions SET status='approved',approved_by=?,approved_at=?,effective_at=?,approval_reference=? WHERE id=? AND status='draft' AND content_sha256=? AND created_by!=?", user.id, now(), d.effectiveAt, d.approvalReference, v.id, d.contentSha256, user.id), guard(env), activity(env, user, 'legal.version_approved', 'legal_document', v.id), clearGuard(env)]);
    return { id: v.id, status: 'approved' };
  }
  assert(command === 'withdraw', 404, 'LEGAL_ACTION_INVALID', 'Unknown legal document action.');
  const d = z.object({ documentId: recordId, reason: reference }).parse(input);
  await env.DB.batch([statement(env.DB, "UPDATE legal_document_versions SET status='withdrawn',withdrawn_by=?,withdrawn_at=?,withdrawal_reason=? WHERE id=? AND status IN('draft','approved')", user.id, now(), d.reason, d.documentId), guard(env), activity(env, user, 'legal.version_withdrawn', 'legal_document', d.documentId), clearGuard(env)]);
  return { id: d.documentId, status: 'withdrawn' };
}
