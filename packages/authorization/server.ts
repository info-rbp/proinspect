import type { Env } from '../database/types';
import { assert, statement, now } from '../database/types';
import {
  WORKSPACES,
  type WorkspaceKind,
  type Workspace,
  type Principal,
  type Property,
} from '../domain/index';

export const ENABLED_WORKSPACES: readonly WorkspaceKind[] = ['landlord', 'tenant', 'staff'];
export async function workspaces(env: Env, user: Principal): Promise<Workspace[]> {
  const result: Workspace[] = [];
  const clients = await statement(
    env.DB,
    `SELECT c.id,c.name,c.client_type,m.role FROM clients c JOIN client_memberships m ON m.client_id=c.id WHERE m.user_id=? AND m.active=1 AND c.status='active'`,
    user.id,
  ).all<{ id: string; name: string; client_type: string; role: string }>();
  for (const row of clients.results) {
    const kind: WorkspaceKind =
      row.client_type === 'landlord'
        ? 'landlord'
        : row.client_type === 'agency'
          ? 'property-manager'
          : row.client_type === 'commercial_landlord' || row.client_type === 'asset_manager'
            ? 'commercial'
            : 'strata-manager';
    if (ENABLED_WORKSPACES.includes(kind))
      result.push({
        kind,
        scopeId: row.id,
        name: row.name,
        role: row.role,
        href: `/w/${kind}/${row.id}`,
      });
  }
  const memberships = await statement(
    env.DB,
    `SELECT t.id,p.address FROM tenancy_memberships tm JOIN tenancies t ON t.id=tm.tenancy_id JOIN properties p ON p.id=t.property_id WHERE tm.user_id=? AND tm.starts_at<=?`,
    user.id,
    now(),
  ).all<{ id: string; address: string }>();
  for (const row of memberships.results)
    result.push({
      kind: 'tenant',
      scopeId: row.id,
      name: row.address,
      role: 'tenant',
      href: `/w/tenant/${row.id}`,
    });
  if (user.staffRole)
    result.push({
      kind: 'staff',
      scopeId: 'operations',
      name: 'ProInspect operations',
      role: user.staffRole,
      href: '/w/staff/operations',
    });
  return result;
}
export async function workspace(
  env: Env,
  user: Principal,
  kind: string,
  scopeId: string,
): Promise<Workspace> {
  assert(
    kind in WORKSPACES && ENABLED_WORKSPACES.includes(kind as WorkspaceKind),
    404,
    'WORKSPACE_UNAVAILABLE',
    'This workspace is not available.',
  );
  const match = (await workspaces(env, user)).find((w) => w.kind === kind && w.scopeId === scopeId);
  assert(match, 403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.');
  return match;
}
export function staffWrite(user: Principal) {
  assert(
    user.staffRole && user.staffRole !== 'read_only',
    403,
    'STAFF_WRITE_REQUIRED',
    'This action requires an authorised staff role.',
  );
}
export function operationsWrite(user: Principal) {
  assert(
    user.staffRole === 'administrator' || user.staffRole === 'operations_manager',
    403,
    'OPERATIONS_REQUIRED',
    'This action requires an operations manager.',
  );
}
export async function clientMembership(env: Env, user: Principal, clientId: string, write = false) {
  const member = await statement(
    env.DB,
    `SELECT m.role,c.client_type FROM client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.user_id=? AND m.client_id=? AND m.active=1 AND c.status='active'`,
    user.id,
    clientId,
  ).first<{ role: string; client_type: string }>();
  assert(member, 403, 'CLIENT_FORBIDDEN', 'This client account is not available to you.');
  if (write)
    assert(member.role !== 'viewer', 403, 'READ_ONLY', 'Your account has view-only access.');
  return member;
}
export async function propertiesFor(env: Env, user: Principal, w: Workspace): Promise<Property[]> {
  if (w.kind === 'staff') {
    const restricted = user.staffRole === 'inspector';
    return (
      await statement(
        env.DB,
        `SELECT p.* FROM properties p WHERE p.archived_at IS NULL ${restricted ? 'AND EXISTS(SELECT 1 FROM work_orders wo WHERE wo.property_id=p.id AND wo.assigned_staff_id=?)' : ''} ORDER BY p.address LIMIT 100`,
        ...(restricted ? [user.id] : []),
      ).all<Property>()
    ).results;
  }
  if (w.kind === 'tenant')
    return (
      await statement(
        env.DB,
        `SELECT p.* FROM properties p JOIN tenancies t ON t.property_id=p.id JOIN tenancy_memberships tm ON tm.tenancy_id=t.id WHERE t.id=? AND tm.user_id=?`,
        w.scopeId,
        user.id,
      ).all<Property>()
    ).results;
  await clientMembership(env, user, w.scopeId);
  return (
    await statement(
      env.DB,
      `SELECT DISTINCT p.* FROM properties p JOIN property_management_relationships pm ON pm.property_id=p.id WHERE pm.manager_client_id=? AND pm.starts_at<=? AND (pm.ends_at IS NULL OR pm.ends_at>?) AND p.archived_at IS NULL AND pm.mode='self_managed' AND p.sector='residential' AND EXISTS(SELECT 1 FROM client_property_links l WHERE l.client_id=? AND l.property_id=p.id AND l.role IN('owner','landlord') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?)) ORDER BY p.address LIMIT 100`,
      w.scopeId,
      now(),
      now(),
      w.scopeId,
      now(),
      now(),
    ).all<Property>()
  ).results;
}
export async function propertyAccess(
  env: Env,
  user: Principal,
  w: Workspace,
  propertyId: string,
  write = false,
) {
  if (write) {
    if (w.kind === 'staff') staffWrite(user);
    else {
      assert(
        w.kind === 'landlord',
        403,
        'PROPERTY_WRITE_FORBIDDEN',
        'This workspace cannot manage property records.',
      );
      await clientMembership(env, user, w.scopeId, true);
    }
  }
  const property = (await propertiesFor(env, user, w)).find((p) => p.id === propertyId);
  assert(property, 404, 'PROPERTY_NOT_FOUND', 'Property not found in this workspace.');
  return property;
}
export async function currentTenancy(env: Env, user: Principal, tenancyId: string) {
  const t = await statement(
    env.DB,
    `SELECT t.* FROM tenancies t JOIN tenancy_memberships m ON m.tenancy_id=t.id WHERE t.id=? AND m.user_id=? AND t.status='active' AND t.starts_at<=? AND (t.ends_at IS NULL OR t.ends_at>?) AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)`,
    tenancyId,
    user.id,
    now(),
    now(),
    now(),
    now(),
  ).first<{
    id: string;
    property_id: string;
    status: string;
    starts_at: string;
    ends_at: string | null;
  }>();
  assert(t, 403, 'TENANCY_INACTIVE', 'An active tenancy is required to create a new request.');
  return t;
}
export async function workOrderAccess(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  write = false,
) {
  const order = await statement(env.DB, 'SELECT * FROM work_orders WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(order, 404, 'WORK_ORDER_NOT_FOUND', 'Work order not found.');
  if (w.kind === 'staff') {
    if (write) staffWrite(user);
    assert(
      user.staffRole !== 'inspector' || order.assigned_staff_id === user.id,
      404,
      'WORK_ORDER_NOT_FOUND',
      'Work order not found.',
    );
  } else {
    assert(
      w.kind === 'landlord' && order.client_id === w.scopeId,
      404,
      'WORK_ORDER_NOT_FOUND',
      'Work order not found.',
    );
    await propertyAccess(env, user, w, order.property_id, write);
  }
  return order;
}
export async function documentAllowed(
  env: Env,
  user: Principal,
  documentId: string,
): Promise<boolean> {
  const doc = await statement(
    env.DB,
    'SELECT id,property_id,status,work_order_id FROM documents WHERE id=?',
    documentId,
  ).first<{ id: string; property_id: string; status: string; work_order_id: string | null }>();
  if (!doc) return false;
  if (user.staffRole && user.staffRole !== 'inspector') return true;
  if (user.staffRole === 'inspector' && doc.work_order_id) {
    const assigned = await statement(
      env.DB,
      'SELECT id FROM work_orders WHERE id=? AND assigned_staff_id=?',
      doc.work_order_id,
      user.id,
    ).first();
    if (assigned) return true;
  }
  if (doc.status !== 'issued') return false;
  const grant = await statement(
    env.DB,
    `SELECT g.document_id FROM document_grants g WHERE g.document_id=? AND ((g.recipient_kind='user' AND g.recipient_id=?) OR (g.recipient_kind='client' AND EXISTS(SELECT 1 FROM client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.client_id=g.recipient_id AND m.user_id=? AND m.active=1 AND c.status='active')) OR (g.recipient_kind='tenancy' AND EXISTS(SELECT 1 FROM tenancy_memberships tm JOIN documents d ON d.id=g.document_id WHERE tm.tenancy_id=g.recipient_id AND tm.user_id=? AND tm.starts_at<=d.issued_at AND (tm.ends_at IS NULL OR tm.ends_at>=d.issued_at)))) LIMIT 1`,
    documentId,
    user.id,
    user.id,
    user.id,
  ).first();
  return Boolean(grant);
}
