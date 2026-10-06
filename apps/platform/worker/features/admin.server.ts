import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  administrator,
  operationsWrite,
  clientAdmin,
  propertyAccess,
  schemeAccess,
} from '../../../../packages/authorization/server';
import {
  recordId,
  shortText,
  reference,
  isoDate,
  activity,
  guard,
  clearGuard,
} from '../../../../packages/operations/core';
export async function adminData(env: Env, user: Principal, w: Workspace) {
  assert(
    w.kind === 'staff' && user.staffRole && user.staffRole !== 'inspector',
    403,
    'ADMIN_VIEW_REQUIRED',
    'This area is restricted to operational administration.',
  );
  const applications = (
    await statement(
      env.DB,
      'SELECT a.*,u.email FROM organisation_applications a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 100',
    ).all()
  ).results;
  const clients = (
    await statement(
      env.DB,
      'SELECT c.id,c.name,c.client_type,c.status,e.workspace_kind FROM clients c LEFT JOIN client_entitlements e ON e.client_id=c.id AND e.active=1 ORDER BY c.name LIMIT 300',
    ).all()
  ).results;
  const staff =
    user.staffRole === 'administrator'
      ? (
          await statement(
            env.DB,
            'SELECT u.id,u.email,u.display_name,s.role,s.active FROM users u LEFT JOIN staff_profiles s ON s.user_id=u.id ORDER BY u.email LIMIT 300',
          ).all()
        ).results
      : [];
  const contractors = (
    await statement(
      env.DB,
      'SELECT id,name,email,active FROM contractors ORDER BY name LIMIT 200',
    ).all()
  ).results;
  const events = (
    await statement(
      env.DB,
      'SELECT id,action,entity_type,entity_id,property_id,scheme_id,created_at FROM audit_events ORDER BY created_at DESC LIMIT 200',
    ).all()
  ).results;
  const counts = (
    await statement(
      env.DB,
      'SELECT status,COUNT(*) AS count FROM work_orders GROUP BY status',
    ).all()
  ).results;
  const payments = (
    await statement(
      env.DB,
      'SELECT status,COUNT(*) AS count,SUM(total_cents) AS total_cents FROM payments GROUP BY status',
    ).all()
  ).results;
  return { applications, clients, staff, contractors, events, counts, payments };
}
export async function searchOperations(env: Env, user: Principal, w: Workspace, query: string) {
  assert(
    w.kind === 'staff' && user.staffRole !== 'inspector',
    403,
    'SEARCH_FORBIDDEN',
    'Global operational search is not available in this workspace.',
  );
  assert(
    query.trim().length >= 2 && query.length <= 100,
    422,
    'SEARCH_LENGTH',
    'Enter 2 to 100 characters.',
  );
  const q = '%' + query.replace(/[\\%_]/g, '\\$&') + '%';
  const properties = (
    await statement(
      env.DB,
      "SELECT id,address,suburb,sector FROM properties WHERE address LIKE ? ESCAPE '\\' OR suburb LIKE ? ESCAPE '\\' ORDER BY address LIMIT 30",
      q,
      q,
    ).all()
  ).results;
  const clients = (
    await statement(
      env.DB,
      "SELECT id,name,client_type FROM clients WHERE name LIKE ? ESCAPE '\\' LIMIT 30",
      q,
    ).all()
  ).results;
  const schemes = (
    await statement(
      env.DB,
      "SELECT id,name,scheme_number FROM strata_schemes WHERE name LIKE ? ESCAPE '\\' OR scheme_number LIKE ? ESCAPE '\\' LIMIT 30",
      q,
      q,
    ).all()
  ).results;
  const workOrders = (
    await statement(
      env.DB,
      "SELECT id,reference,title,status FROM work_orders WHERE reference LIKE ? ESCAPE '\\' OR title LIKE ? ESCAPE '\\' LIMIT 30",
      q,
      q,
    ).all()
  ).results;
  return { properties, clients, schemes, workOrders };
}
export async function setStaff(env: Env, user: Principal, input: unknown) {
  administrator(user);
  const d = z
    .object({
      userId: recordId,
      role: z.enum(['administrator', 'operations_manager', 'inspector', 'read_only']),
      active: z.boolean(),
    })
    .parse(input);
  assert(
    d.userId !== user.id,
    409,
    'SELF_CHANGE_FORBIDDEN',
    'Another administrator must change your own staff access.',
  );
  assert(
    await statement(
      env.DB,
      'SELECT id FROM users WHERE id=? AND active=1 AND verified_at IS NOT NULL',
      d.userId,
    ).first(),
    422,
    'VERIFIED_USER_REQUIRED',
    'The staff member must first verify their account.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO staff_profiles(user_id,role,active) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,active=excluded.active',
      d.userId,
      d.role,
      d.active ? 1 : 0,
    ),
    statement(env.DB, 'UPDATE sessions SET revoked_at=? WHERE user_id=?', now(), d.userId),
    activity(env, user, 'staff.access_changed', 'user', d.userId, null, null, {
      role: d.role,
      active: d.active,
    }),
  ]);
  return { ok: true };
}
export async function setAuthority(env: Env, user: Principal, input: unknown) {
  operationsWrite(user);
  const d = z
    .object({
      clientId: recordId,
      propertyId: recordId.optional(),
      schemeId: recordId.optional(),
      amountCents: z.number().int().min(0).max(100000000),
      reference,
      validUntil: isoDate,
    })
    .parse(input);
  assert(
    Boolean(d.propertyId) !== Boolean(d.schemeId) && d.validUntil > now(),
    422,
    'AUTHORITY_CONTEXT',
    'Select one context and a current authority expiry.',
  );
  const linked = d.schemeId
    ? await statement(
        env.DB,
        'SELECT id FROM scheme_client_links WHERE scheme_id=? AND client_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
        d.schemeId,
        d.clientId,
        now(),
        now(),
      ).first()
    : await statement(
        env.DB,
        'SELECT id FROM property_management_relationships WHERE property_id=? AND manager_client_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
        d.propertyId!,
        d.clientId,
        now(),
        now(),
      ).first();
  assert(linked, 422, 'MANAGEMENT_REQUIRED', 'The client must currently manage this context.');
  await env.DB.batch([
    d.schemeId
      ? statement(
          env.DB,
          'INSERT INTO scheme_authority_profiles(scheme_id,client_id,spending_limit_cents,authority_reference,valid_until) VALUES(?,?,?,?,?) ON CONFLICT(scheme_id,client_id) DO UPDATE SET spending_limit_cents=excluded.spending_limit_cents,authority_reference=excluded.authority_reference,valid_until=excluded.valid_until',
          d.schemeId,
          d.clientId,
          d.amountCents,
          d.reference,
          d.validUntil,
        )
      : statement(
          env.DB,
          'INSERT INTO management_authorities(property_id,client_id,spending_limit_cents,authority_reference,valid_until) VALUES(?,?,?,?,?) ON CONFLICT(property_id,client_id) DO UPDATE SET spending_limit_cents=excluded.spending_limit_cents,authority_reference=excluded.authority_reference,valid_until=excluded.valid_until',
          d.propertyId!,
          d.clientId,
          d.amountCents,
          d.reference,
          d.validUntil,
        ),
    activity(
      env,
      user,
      'management.authority_recorded',
      'client',
      d.clientId,
      d.propertyId ?? null,
      d.schemeId ?? null,
      { reference: d.reference, limit: d.amountCents },
    ),
  ]);
  return { ok: true };
}
export async function linkOwner(env: Env, user: Principal, input: unknown) {
  operationsWrite(user);
  const d = z.object({ propertyId: recordId, clientId: recordId, reference }).parse(input);
  assert(
    await statement(env.DB, 'SELECT id FROM properties WHERE id=?', d.propertyId).first(),
    422,
    'PROPERTY_REQUIRED',
    'Select a property.',
  );
  assert(
    await statement(
      env.DB,
      "SELECT id FROM clients WHERE id=? AND status='active'",
      d.clientId,
    ).first(),
    422,
    'CLIENT_REQUIRED',
    'Select an active owner account.',
  );
  const exists = await statement(
    env.DB,
    "SELECT id FROM client_property_links WHERE property_id=? AND client_id=? AND role='owner' AND ends_at IS NULL",
    d.propertyId,
    d.clientId,
  ).first();
  if (exists) return { ok: true, replayed: true };
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,'owner',?)",
      uid('link'),
      d.clientId,
      d.propertyId,
      now(),
    ),
    activity(env, user, 'ownership.verified', 'property', d.propertyId, d.propertyId, null, {
      clientId: d.clientId,
      reference: d.reference,
    }),
  ]);
  return { ok: true };
}
export async function transferManagement(env: Env, user: Principal, input: unknown) {
  operationsWrite(user);
  const d = z
    .object({
      propertyId: recordId,
      clientId: recordId,
      mode: z.enum(['self_managed', 'agency_managed', 'commercial_managed']),
      reference,
    })
    .parse(input);
  const entitlement =
    d.mode === 'self_managed'
      ? 'landlord'
      : d.mode === 'agency_managed'
        ? 'property-manager'
        : 'commercial';
  assert(
    await statement(
      env.DB,
      "SELECT e.client_id FROM client_entitlements e JOIN clients c ON c.id=e.client_id WHERE e.client_id=? AND e.workspace_kind=? AND e.active=1 AND c.status='active'",
      d.clientId,
      entitlement,
    ).first(),
    422,
    'MANAGER_ENTITLEMENT_REQUIRED',
    'The new manager must hold the matching active portal entitlement.',
  );
  const old = await statement(
    env.DB,
    'SELECT id FROM property_management_relationships WHERE property_id=? AND ends_at IS NULL',
    d.propertyId,
  ).first<{ id: string }>();
  assert(old, 404, 'MANAGEMENT_NOT_FOUND', 'No current manager is recorded.');
  assert(
    !(await statement(
      env.DB,
      "SELECT id FROM work_orders WHERE property_id=? AND status NOT IN('completed','cancelled')",
      d.propertyId,
    ).first()),
    409,
    'HANDOVER_REVIEW_REQUIRED',
    'Resolve or cancel outstanding work before transferring management.',
  );
  assert(
    !(await statement(
      env.DB,
      "SELECT id FROM requests WHERE property_id=? AND status NOT IN('completed','closed')",
      d.propertyId,
    ).first()),
    409,
    'REQUEST_HANDOVER_REQUIRED',
    'Resolve pending requests before transferring management.',
  );
  const time = now();
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE property_management_relationships SET ends_at=? WHERE id=? AND ends_at IS NULL',
      time,
      old.id,
    ),
    guard(env),
    statement(
      env.DB,
      'INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES(?,?,?,?,?)',
      uid('mgmt'),
      d.propertyId,
      d.clientId,
      d.mode,
      time,
    ),
    statement(
      env.DB,
      'INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,?,?)',
      uid('link'),
      d.clientId,
      d.propertyId,
      d.mode === 'agency_managed'
        ? 'managing_agent'
        : d.mode === 'commercial_managed'
          ? 'asset_manager'
          : 'landlord',
      time,
    ),
    activity(env, user, 'management.transferred', 'property', d.propertyId, d.propertyId, null, {
      newClientId: d.clientId,
      reference: d.reference,
      documentsNotAutomaticallyShared: true,
    }),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function addContractor(env: Env, user: Principal, input: unknown) {
  operationsWrite(user);
  const d = z.object({ name: shortText, email: z.string().email().optional() }).parse(input),
    id = uid('ctr');
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO contractors(id,name,email) VALUES(?,?,?)',
      id,
      d.name,
      d.email ?? null,
    ),
    activity(env, user, 'contractor.created', 'contractor', id),
  ]);
  return { id };
}
export async function teamData(env: Env, user: Principal, w: Workspace) {
  await clientAdmin(env, user, w);
  return {
    members: (
      await statement(
        env.DB,
        'SELECT u.id,u.display_name,u.email,m.role,m.active FROM client_memberships m JOIN users u ON u.id=m.user_id WHERE m.client_id=? ORDER BY u.display_name',
        w.scopeId,
      ).all()
    ).results,
    assignments: (
      await statement(
        env.DB,
        'SELECT user_id,property_id FROM portfolio_assignments WHERE client_id=?',
        w.scopeId,
      ).all()
    ).results,
    owners: (
      await statement(
        env.DB,
        'SELECT property_id,name,email FROM portfolio_owners WHERE client_id=?',
        w.scopeId,
      ).all()
    ).results,
  };
}
export async function assignContractor(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  assert(
    w.kind === 'staff',
    403,
    'STAFF_REQUIRED',
    'Operational staff records contractor assignments.',
  );
  operationsWrite(user);
  const d = z
      .object({ version: z.number().int().positive(), contractorId: recordId, reference })
      .parse(input),
    o = await statement(env.DB, 'SELECT * FROM work_orders WHERE id=?', id).first<
      Record<string, any>
    >();
  assert(o, 404, 'WORK_ORDER_NOT_FOUND', 'Work order not found.');
  assert(
    o.version === d.version && !['completed', 'cancelled'].includes(o.status),
    409,
    'WORK_ORDER_CHANGED',
    'Work is closed or changed.',
  );
  assert(
    !o.approval_required || ['approved', 'scheduled', 'assigned', 'in_progress'].includes(o.status),
    409,
    'APPROVAL_REQUIRED',
    'Obtain the pending approval before recording a contractor assignment.',
  );
  assert(
    await statement(
      env.DB,
      'SELECT id FROM contractors WHERE id=? AND active=1',
      d.contractorId,
    ).first(),
    422,
    'CONTRACTOR_INVALID',
    'Select an active contractor.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE work_orders SET contractor_id=?,version=version+1,updated_at=? WHERE id=? AND version=?',
      d.contractorId,
      now(),
      id,
      d.version,
    ),
    guard(env),
    activity(
      env,
      user,
      'work_order.contractor_recorded',
      'work_order',
      id,
      o.property_id,
      o.scheme_id,
      { contractorId: d.contractorId, reference: d.reference },
    ),
    clearGuard(env),
  ]);
  return { ok: true };
}
