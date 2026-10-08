import { statement, now, assert, type Env } from '../database/types';
import type { Principal, Workspace } from '../domain/index';
import { activity } from '../operations/core';

/** Resource grants are evaluated inside the selected workspace, never unioned across roles. */
export function documentScope(user: Principal, w: Workspace, alias = 'd') {
  const time = now();
  if (w.kind === 'staff')
    return user.staffRole === 'inspector'
      ? {
          sql: `EXISTS(SELECT 1 FROM work_orders wo WHERE wo.id=${alias}.work_order_id AND wo.assigned_staff_id=?)`,
          values: [user.id],
        }
      : { sql: '1=1', values: [] as string[] };
  const issued = `${alias}.status IN('issued','archived')`;
  if (['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(w.kind)) {
    const assignment = ['owner', 'admin'].includes(w.role)
      ? ''
      : ` AND EXISTS(SELECT 1 FROM portfolio_assignments pa WHERE pa.client_id=? AND pa.user_id=? AND pa.property_id=${alias}.property_id)`;
    return {
      sql: `((${issued} AND EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=${alias}.id AND g.recipient_kind='client' AND g.recipient_id=?)) OR ${alias}.uploaded_client_id=?)${assignment}`,
      values: [w.scopeId, w.scopeId, ...(assignment ? [w.scopeId, user.id] : [])],
    };
  }
  if (w.kind === 'tenant')
    return {
      sql: `${issued} AND EXISTS(SELECT 1 FROM document_grants g JOIN tenancy_memberships tm ON tm.tenancy_id=g.recipient_id WHERE g.document_id=${alias}.id AND g.recipient_kind='tenancy' AND g.recipient_id=? AND tm.user_id=? AND tm.starts_at<=${alias}.issued_at AND (tm.ends_at IS NULL OR tm.ends_at>=${alias}.issued_at))`,
      values: [w.scopeId, user.id],
    };
  if (w.kind === 'building' || w.kind === 'council')
    return {
      sql: `${issued} AND ${alias}.scheme_id=? AND EXISTS(SELECT 1 FROM document_grants g JOIN scheme_memberships m ON m.scheme_id=g.recipient_id WHERE g.document_id=${alias}.id AND g.recipient_id=${alias}.scheme_id AND m.user_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) AND ${w.kind === 'council' ? "g.recipient_kind='scheme_council' AND m.role='council_member'" : "((g.recipient_kind='scheme_resident' AND m.role='resident') OR (g.recipient_kind='scheme_owner' AND m.role='owner'))"})`,
      values: [w.scopeId, user.id, time, time],
    };
  return { sql: '0=1', values: [] as string[] };
}
export async function downloadWorkspaceDocument(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
) {
  const s = documentScope(user, w);
  const doc = await statement(
    env.DB,
    `SELECT d.id,d.object_key,d.property_id,d.scheme_id FROM documents d WHERE d.id=? AND (${s.sql})`,
    id,
    ...s.values,
  ).first<{
    id: string;
    object_key: string;
    property_id: string | null;
    scheme_id: string | null;
  }>();
  assert(doc, 404, 'DOCUMENT_NOT_FOUND', 'Document not found in this workspace.');
  const object = await env.DOCUMENTS.get(doc.object_key);
  assert(object, 404, 'DOCUMENT_UNAVAILABLE', 'The document file is unavailable.');
  await activity(env, user, 'document.downloaded', 'document', id, doc.property_id, doc.scheme_id, {
    workspace: w.kind,
  }).run();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ProInspect-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
