import { assert, statement, now, type Env } from '../database/types';
import type { Principal, Workspace } from '../domain/index';
import { booksServices, propertyScope } from './server';

/** A workspace is resolved by the server. Never union another workspace's roles. */
export function documentScope(user: Principal, w: Workspace, alias = 'd') {
  const issued = `${alias}.status IN('issued','archived')`;
  const grant = (test: string) =>
    `EXISTS(SELECT 1 FROM document_grants g WHERE g.document_id=${alias}.id AND ${test})`;
  if (w.kind === 'staff')
    return user.staffRole === 'inspector'
      ? {
          sql: `EXISTS(SELECT 1 FROM work_orders wo WHERE wo.id=${alias}.work_order_id AND wo.assigned_staff_id=?)`,
          values: [user.id],
        }
      : { sql: user.staffRole ? '1=1' : '0=1', values: [] };
  if (booksServices(w)) {
    const account = `(${alias}.uploaded_client_id=? OR (${issued} AND ${grant("g.recipient_kind='client' AND g.recipient_id=?")}))`;
    if (w.kind === 'landlord' || ['owner', 'admin'].includes(w.role))
      return { sql: account, values: [w.scopeId, w.scopeId] };
    if (w.kind === 'strata-manager')
      return {
        sql: `${account} AND EXISTS(SELECT 1 FROM scheme_client_links l WHERE l.scheme_id=${alias}.scheme_id AND l.client_id=? AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))`,
        values: [w.scopeId, w.scopeId, w.scopeId, now(), now()],
      };
    const scope = propertyScope(user, w);
    return {
      sql: `${account} AND EXISTS(SELECT 1 FROM properties p WHERE p.id=${alias}.property_id AND (${scope.sql}))`,
      values: [w.scopeId, w.scopeId, ...scope.values],
    };
  }
  if (w.kind === 'tenant')
    return {
      sql: `${issued} AND ${alias}.tenancy_id=? AND ${grant("(g.recipient_kind='tenancy' AND g.recipient_id=?) OR (g.recipient_kind='user' AND g.recipient_id=?)")} AND EXISTS(SELECT 1 FROM tenancy_memberships m WHERE m.tenancy_id=? AND m.user_id=? AND m.starts_at<=${alias}.issued_at AND (m.ends_at IS NULL OR m.ends_at>=${alias}.issued_at))`,
      values: [w.scopeId, w.scopeId, user.id, w.scopeId, user.id],
    };
  if (w.kind === 'building' || w.kind === 'council') {
    const roles =
      w.kind === 'council'
        ? "g.recipient_kind='scheme_council' AND m.role='council_member'"
        : "((g.recipient_kind='scheme_resident' AND m.role='resident') OR (g.recipient_kind='scheme_owner' AND m.role='owner'))";
    return {
      sql: `${issued} AND ${alias}.scheme_id=? AND EXISTS(SELECT 1 FROM document_grants g JOIN scheme_memberships m ON m.scheme_id=g.recipient_id WHERE g.document_id=${alias}.id AND g.recipient_id=? AND m.user_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) AND (${roles}))`,
      values: [w.scopeId, w.scopeId, user.id, now(), now()],
    };
  }
  return { sql: '0=1', values: [] };
}
export async function downloadWorkspaceDocument(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
) {
  const scope = documentScope(user, w);
  const doc = await statement(
    env.DB,
    `SELECT d.object_key FROM documents d WHERE d.id=? AND (${scope.sql})`,
    id,
    ...scope.values,
  ).first<{ object_key: string }>();
  assert(doc, 404, 'DOCUMENT_NOT_FOUND', 'Document not found in this workspace.');
  const object = await env.DOCUMENTS.get(doc.object_key);
  assert(object, 404, 'DOCUMENT_UNAVAILABLE', 'The document file is unavailable.');
  await statement(
    env.DB,
    'INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
    crypto.randomUUID(),
    user.id,
    'document.downloaded',
    'document',
    id,
    JSON.stringify({ workspaceKind: w.kind, scopeId: w.scopeId }),
    now(),
  ).run();
  return new Response(object.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ProInspect-${id}.pdf"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
