import type { Env } from '../database/types';
import { assert, statement, now } from '../database/types';
import {
  WORKSPACES,
  type WorkspaceKind,
  type Workspace,
  type Principal,
  type Property,
} from '../domain/index';

export const ENABLED_WORKSPACES: readonly WorkspaceKind[] = [
  'landlord',
  'property-manager',
  'strata-manager',
  'commercial',
  'tenant',
  'building',
  'council',
  'staff',
];
export const PROPERTY_WORKSPACES = ['landlord', 'property-manager', 'commercial'] as const;
export function managesProperty(w: Workspace) {
  return (PROPERTY_WORKSPACES as readonly string[]).includes(w.kind);
}
export function booksServices(w: Workspace) {
  return managesProperty(w) || w.kind === 'strata-manager';
}
export async function workspaces(env: Env, user: Principal): Promise<Workspace[]> {
  const result: Workspace[] = [];
  const clients = await statement(
    env.DB,
    `SELECT c.id,c.name,e.workspace_kind,m.role FROM clients c JOIN client_memberships m ON m.client_id=c.id JOIN client_entitlements e ON e.client_id=c.id AND e.active=1 WHERE m.user_id=? AND m.active=1 AND c.status='active'`,
    user.id,
  ).all<{ id: string; name: string; workspace_kind: WorkspaceKind; role: string }>();
  for (const c of clients.results)
    result.push({
      kind: c.workspace_kind,
      scopeId: c.id,
      name: c.name,
      role: c.role,
      href: `/w/${c.workspace_kind}/${c.id}`,
    });
  const tenancies = await statement(
    env.DB,
    `SELECT t.id,p.address FROM tenancy_memberships m JOIN tenancies t ON t.id=m.tenancy_id JOIN properties p ON p.id=t.property_id WHERE m.user_id=? AND m.starts_at<=?`,
    user.id,
    now(),
  ).all<{ id: string; address: string }>();
  for (const t of tenancies.results)
    result.push({
      kind: 'tenant',
      scopeId: t.id,
      name: t.address,
      role: 'tenant',
      href: `/w/tenant/${t.id}`,
    });
  const schemes = await statement(
    env.DB,
    `SELECT DISTINCT s.id,s.name,m.role FROM scheme_memberships m JOIN strata_schemes s ON s.id=m.scheme_id WHERE m.user_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?)`,
    user.id,
    now(),
    now(),
  ).all<{ id: string; name: string; role: string }>();
  for (const s of schemes.results) {
    const kind = s.role === 'council_member' ? 'council' : 'building';
    if (!result.some((w) => w.kind === kind && w.scopeId === s.id))
      result.push({ kind, scopeId: s.id, name: s.name, role: s.role, href: `/w/${kind}/${s.id}` });
  }
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
    Object.hasOwn(WORKSPACES, kind) && ENABLED_WORKSPACES.includes(kind as WorkspaceKind),
    404,
    'WORKSPACE_UNAVAILABLE',
    'This workspace is not available.',
  );
  const w = (await workspaces(env, user)).find((w) => w.kind === kind && w.scopeId === scopeId);
  assert(w, 403, 'WORKSPACE_FORBIDDEN', 'You do not have access to this workspace.');
  return w;
}
export function staffWrite(user: Principal) {
  assert(
    user.staffRole && user.staffRole !== 'read_only',
    403,
    'STAFF_WRITE_REQUIRED',
    'An authorised staff role is required.',
  );
}
export function operationsWrite(user: Principal) {
  assert(
    user.staffRole === 'administrator' || user.staffRole === 'operations_manager',
    403,
    'OPERATIONS_REQUIRED',
    'An operations manager is required.',
  );
}
export function administrator(user: Principal) {
  assert(
    user.staffRole === 'administrator',
    403,
    'ADMIN_REQUIRED',
    'A platform administrator is required.',
  );
}
export async function clientMembership(env: Env, user: Principal, clientId: string, write = false) {
  const row = await statement(
    env.DB,
    `SELECT m.role,c.client_type FROM client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.user_id=? AND m.client_id=? AND m.active=1 AND c.status='active'`,
    user.id,
    clientId,
  ).first<{ role: string; client_type: string }>();
  assert(row, 403, 'CLIENT_FORBIDDEN', 'This account is not available to you.');
  if (write) assert(row.role !== 'viewer', 403, 'READ_ONLY', 'This account has view-only access.');
  return row;
}
export async function clientAdmin(env: Env, user: Principal, w: Workspace) {
  assert(booksServices(w), 403, 'CLIENT_REQUIRED', 'Use an authorised customer workspace.');
  const m = await clientMembership(env, user, w.scopeId, true);
  assert(
    ['owner', 'admin'].includes(m.role),
    403,
    'ACCOUNT_ADMIN_REQUIRED',
    'An account administrator must perform this action.',
  );
  return m;
}
export function propertyScope(
  user: Principal,
  w: Workspace,
  alias = 'p',
): { sql: string; values: string[] } {
  const time = now();
  if (w.kind === 'staff')
    return user.staffRole === 'inspector'
      ? {
          sql: `EXISTS(SELECT 1 FROM work_orders x WHERE x.property_id=${alias}.id AND x.assigned_staff_id=?)`,
          values: [user.id],
        }
      : { sql: '1=1', values: [] };
  if (w.kind === 'tenant')
    return {
      sql: `EXISTS(SELECT 1 FROM tenancies t JOIN tenancy_memberships m ON m.tenancy_id=t.id WHERE t.property_id=${alias}.id AND t.id=? AND m.user_id=? AND m.starts_at<=?)`,
      values: [w.scopeId, user.id, time],
    };
  if (w.kind === 'building' || w.kind === 'council')
    return {
      sql: `EXISTS(SELECT 1 FROM strata_lots l JOIN scheme_memberships m ON m.lot_id=l.id WHERE l.property_id=${alias}.id AND l.scheme_id=? AND m.user_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?))`,
      values: [w.scopeId, user.id, time, time],
    };
  if (w.kind === 'strata-manager')
    return {
      sql: `EXISTS(SELECT 1 FROM scheme_buildings b JOIN scheme_client_links l ON l.scheme_id=b.scheme_id WHERE b.property_id=${alias}.id AND l.client_id=? AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))`,
      values: [w.scopeId, time, time],
    };
  const sql = `EXISTS(SELECT 1 FROM property_management_relationships m WHERE m.property_id=${alias}.id AND m.manager_client_id=? AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?) ${w.kind === 'landlord' ? `AND m.mode='self_managed' AND ${alias}.sector='residential' AND EXISTS(SELECT 1 FROM client_property_links l WHERE l.property_id=${alias}.id AND l.client_id=m.manager_client_id AND l.role IN('owner','landlord') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))` : w.kind === 'property-manager' ? `AND m.mode='agency_managed'` : `AND m.mode='commercial_managed'`})`;
  const assignment =
    w.kind !== 'landlord' && !['owner', 'admin'].includes(w.role)
      ? ` AND EXISTS(SELECT 1 FROM portfolio_assignments a WHERE a.property_id=${alias}.id AND a.client_id=? AND a.user_id=?)`
      : '';
  return {
    sql: sql + assignment,
    values: [
      w.scopeId,
      time,
      time,
      ...(w.kind === 'landlord' ? [time, time] : []),
      ...(assignment ? [w.scopeId, user.id] : []),
    ],
  };
}
export async function propertiesFor(env: Env, user: Principal, w: Workspace): Promise<Property[]> {
  const s = propertyScope(user, w);
  return (
    await statement(
      env.DB,
      `SELECT p.* FROM properties p WHERE p.archived_at IS NULL AND (${s.sql}) ORDER BY p.address LIMIT 500`,
      ...s.values,
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
        booksServices(w),
        403,
        'PROPERTY_WRITE_FORBIDDEN',
        'This workspace cannot manage property records.',
      );
      await clientMembership(env, user, w.scopeId, true);
    }
  }
  const s = propertyScope(user, w);
  const p = await statement(
    env.DB,
    `SELECT p.* FROM properties p WHERE p.id=? AND p.archived_at IS NULL AND (${s.sql})`,
    propertyId,
    ...s.values,
  ).first<Property>();
  assert(p, 404, 'PROPERTY_NOT_FOUND', 'Property not found in this workspace.');
  return p;
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
  assert(t, 403, 'TENANCY_INACTIVE', 'An active tenancy is required for this action.');
  return t;
}
export async function schemeAccess(
  env: Env,
  user: Principal,
  w: Workspace,
  schemeId: string,
  write = false,
) {
  const s = await statement(env.DB, 'SELECT * FROM strata_schemes WHERE id=?', schemeId).first<
    Record<string, any>
  >();
  assert(s, 404, 'SCHEME_NOT_FOUND', 'Scheme not found.');
  if (w.kind === 'staff') {
    if (write) operationsWrite(user);
    else
      assert(
        user.staffRole && user.staffRole !== 'inspector',
        403,
        'SCHEME_FORBIDDEN',
        'Scheme administration is restricted.',
      );
    return s;
  }
  if (w.kind === 'strata-manager') {
    await clientMembership(env, user, w.scopeId, write);
    const l = await statement(
      env.DB,
      `SELECT id FROM scheme_client_links WHERE scheme_id=? AND client_id=? AND role IN('strata_manager','building_manager') AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)`,
      schemeId,
      w.scopeId,
      now(),
      now(),
    ).first();
    assert(l, 404, 'SCHEME_NOT_FOUND', 'Scheme not found in this portfolio.');
    return s;
  }
  assert(
    !write && ['building', 'council'].includes(w.kind) && w.scopeId === schemeId,
    403,
    'SCHEME_FORBIDDEN',
    'This action requires the managing organisation.',
  );
  const member = await statement(
    env.DB,
    `SELECT id FROM scheme_memberships WHERE scheme_id=? AND user_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) AND role ${w.kind === 'council' ? "='council_member'" : "IN('resident','owner')"}`,
    schemeId,
    user.id,
    now(),
    now(),
  ).first();
  assert(member, 404, 'SCHEME_NOT_FOUND', 'Scheme membership has ended.');
  return s;
}
export async function schemesFor(env: Env, user: Principal, w: Workspace) {
  if (w.kind === 'staff')
    return user.staffRole === 'inspector'
      ? []
      : (await statement(env.DB, 'SELECT * FROM strata_schemes ORDER BY name LIMIT 300').all())
          .results;
  if (w.kind === 'strata-manager')
    return (
      await statement(
        env.DB,
        `SELECT DISTINCT s.* FROM strata_schemes s JOIN scheme_client_links l ON l.scheme_id=s.id WHERE l.client_id=? AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?) ORDER BY s.name LIMIT 300`,
        w.scopeId,
        now(),
        now(),
      ).all()
    ).results;
  if (w.kind === 'building' || w.kind === 'council')
    return [await schemeAccess(env, user, w, w.scopeId)];
  return [];
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
  } else if (w.kind === 'strata-manager' && order.scheme_id)
    await schemeAccess(env, user, w, order.scheme_id, write);
  else if (w.kind === 'council' && order.scheme_id) {
    assert(!write, 403, 'READ_ONLY', 'Council oversight does not assign operational work.');
    await schemeAccess(env, user, w, order.scheme_id);
  } else {
    assert(
      managesProperty(w) && order.client_id === w.scopeId && order.property_id,
      404,
      'WORK_ORDER_NOT_FOUND',
      'Work order not found.',
    );
    await propertyAccess(env, user, w, order.property_id, write);
  }
  return order;
}
export async function requestAccess(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  write = false,
) {
  const r = await statement(env.DB, 'SELECT * FROM requests WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(r, 404, 'REQUEST_NOT_FOUND', 'Request not found.');
  if (w.kind === 'staff') {
    if (write) staffWrite(user);
    if (user.staffRole === 'inspector')
      assert(
        await statement(
          env.DB,
          'SELECT id FROM work_orders WHERE request_id=? AND assigned_staff_id=?',
          id,
          user.id,
        ).first(),
        404,
        'REQUEST_NOT_FOUND',
        'Request not found.',
      );
  } else if (w.kind === 'tenant') {
    assert(
      r.tenancy_id === w.scopeId && r.created_by === user.id,
      404,
      'REQUEST_NOT_FOUND',
      'Request not found.',
    );
    if (write) await currentTenancy(env, user, w.scopeId);
  } else if (w.kind === 'building' || w.kind === 'council') {
    await schemeAccess(env, user, w, r.scheme_id);
    assert(
      r.created_by === user.id,
      404,
      'REQUEST_NOT_FOUND',
      'Only your own request details are available.',
    );
  } else if (w.kind === 'strata-manager') await schemeAccess(env, user, w, r.scheme_id, write);
  else {
    assert(
      managesProperty(w) &&
        r.client_id === w.scopeId &&
        (r.source === 'client' || ['maintenance', 'inspection_access'].includes(r.category)),
      404,
      'REQUEST_NOT_FOUND',
      'Request not found.',
    );
    await propertyAccess(env, user, w, r.property_id, write);
  }
  return r;
}
export async function documentAllowed(
  env: Env,
  user: Principal,
  documentId: string,
): Promise<boolean> {
  const d = await statement(env.DB, 'SELECT * FROM documents WHERE id=?', documentId).first<
    Record<string, any>
  >();
  if (!d) return false;
  if (user.staffRole && user.staffRole !== 'inspector') return true;
  if (
    user.staffRole === 'inspector' &&
    d.work_order_id &&
    (await statement(
      env.DB,
      'SELECT id FROM work_orders WHERE id=? AND assigned_staff_id=?',
      d.work_order_id,
      user.id,
    ).first())
  )
    return true;
  if (d.uploaded_client_id) {
    const m = await statement(
      env.DB,
      "SELECT m.role FROM client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.client_id=? AND m.user_id=? AND m.active=1 AND c.status='active'",
      d.uploaded_client_id,
      user.id,
    ).first<{ role: string }>();
    if (
      m &&
      (['owner', 'admin'].includes(m.role) ||
        (d.property_id &&
          (await statement(
            env.DB,
            'SELECT user_id FROM portfolio_assignments WHERE client_id=? AND user_id=? AND property_id=?',
            d.uploaded_client_id,
            user.id,
            d.property_id,
          ).first())))
    )
      return true;
  }
  if (!['issued', 'archived'].includes(d.status)) return false;
  const grants = (
    await statement(
      env.DB,
      'SELECT recipient_kind,recipient_id FROM document_grants WHERE document_id=?',
      documentId,
    ).all<{ recipient_kind: string; recipient_id: string }>()
  ).results;
  for (const g of grants) {
    if (g.recipient_kind === 'user' && g.recipient_id === user.id) return true;
    if (g.recipient_kind === 'client') {
      const m = await statement(
        env.DB,
        `SELECT m.role FROM client_memberships m JOIN clients c ON c.id=m.client_id WHERE m.client_id=? AND m.user_id=? AND m.active=1 AND c.status='active'`,
        g.recipient_id,
        user.id,
      ).first<{ role: string }>();
      if (
        m &&
        (['owner', 'admin'].includes(m.role) ||
          (d.property_id &&
            (await statement(
              env.DB,
              'SELECT user_id FROM portfolio_assignments WHERE client_id=? AND user_id=? AND property_id=?',
              g.recipient_id,
              user.id,
              d.property_id,
            ).first())))
      )
        return true;
    }
    if (
      g.recipient_kind === 'tenancy' &&
      (await statement(
        env.DB,
        `SELECT id FROM tenancy_memberships WHERE tenancy_id=? AND user_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>=?)`,
        g.recipient_id,
        user.id,
        d.issued_at,
        d.issued_at,
      ).first())
    )
      return true;
    const roles: Record<string, string> = {
      scheme_resident: 'resident',
      scheme_owner: 'owner',
      scheme_council: 'council_member',
    };
    if (
      roles[g.recipient_kind] &&
      g.recipient_id === d.scheme_id &&
      (await statement(
        env.DB,
        `SELECT id FROM scheme_memberships WHERE scheme_id=? AND user_id=? AND role=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)`,
        g.recipient_id,
        user.id,
        roles[g.recipient_kind],
        now(),
        now(),
      ).first())
    )
      return true;
  }
  return false;
}
