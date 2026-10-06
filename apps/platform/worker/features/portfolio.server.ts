import { z } from 'zod';
import { statement, assert, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import {
  clientAdmin,
  clientMembership,
  propertyAccess,
  managesProperty,
  operationsWrite,
  schemeAccess,
  workspace,
} from '../../../../packages/authorization/server';
import { email, addressKey } from '../../../../packages/validation/index';
import { seal, unseal, digest, randomToken } from '../../../../packages/auth/crypto';
import { mailEvent } from '../../../../packages/notifications/server';
import {
  shortText,
  reference,
  recordId,
  isoDate,
  guard,
  clearGuard,
  activity,
  dateOnly,
} from '../../../../packages/operations/core';

export async function applyOrganisation(env: Env, user: Principal, input: unknown) {
  const d = z
    .object({
      name: shortText,
      kind: z.enum(['property-manager', 'strata-manager', 'commercial']),
      businessReference: reference,
    })
    .parse(input);
  const existing = await statement(
    env.DB,
    "SELECT id FROM organisation_applications WHERE user_id=? AND workspace_kind=? AND status='pending'",
    user.id,
    d.kind,
  ).first();
  if (existing) return existing;
  const id = uid('org');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO organisation_applications(id,user_id,name,workspace_kind,business_reference,status,created_at) VALUES(?,?,?,?,?,'pending',?)",
      id,
      user.id,
      d.name,
      d.kind,
      d.businessReference,
      now(),
    ),
    activity(env, user, 'organisation.requested', 'organisation_application', id),
  ]);
  return { id, status: 'pending' };
}
export async function approveOrganisation(env: Env, user: Principal, id: string, input: unknown) {
  operationsWrite(user);
  const d = z.object({ decision: z.enum(['approved', 'declined']), reference }).parse(input);
  const a = await statement(env.DB, 'SELECT * FROM organisation_applications WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(a, 404, 'APPLICATION_NOT_FOUND', 'Application not found.');
  if (a.status === d.decision) return { clientId: a.client_id, status: a.status };
  assert(
    a.status === 'pending',
    409,
    'APPLICATION_REVIEWED',
    'Application has already been reviewed.',
  );
  const clientId = d.decision === 'approved' ? uid('cli') : null;
  const statements = [];
  if (clientId)
    statements.push(
      statement(
        env.DB,
        'INSERT INTO clients(id,name,client_type,created_at) VALUES(?,?,?,?)',
        clientId,
        a.name,
        a.workspace_kind === 'property-manager'
          ? 'agency'
          : a.workspace_kind === 'commercial'
            ? 'commercial_landlord'
            : 'other',
        now(),
      ),
      statement(
        env.DB,
        "INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES(?,?,?,'owner',?)",
        uid('mem'),
        clientId,
        a.user_id,
        now(),
      ),
      statement(
        env.DB,
        'INSERT INTO client_entitlements(client_id,workspace_kind,approved_by,created_at) VALUES(?,?,?,?)',
        clientId,
        a.workspace_kind,
        user.id,
        now(),
      ),
    );
  statements.push(
    statement(
      env.DB,
      "UPDATE organisation_applications SET status=?,client_id=?,reviewed_by=?,review_reference=? WHERE id=? AND status='pending'",
      d.decision,
      clientId,
      user.id,
      d.reference,
      id,
    ),
    guard(env),
    activity(env, user, 'organisation.reviewed', 'organisation_application', id, null, null, {
      status: d.decision,
      clientId,
    }),
    clearGuard(env),
  );
  await env.DB.batch(statements);
  return { clientId, status: d.decision };
}
const portfolioProperty = z.object({
  address: z.string().trim().min(5).max(180),
  suburb: z.string().trim().min(2).max(80),
  postcode: z.string().regex(/^\d{4}$/),
  propertyType: shortText.default('Other'),
  ownerName: shortText,
  ownerEmail: email.optional(),
  authorityReference: reference,
});
export function portfolioStatements(
  env: Env,
  user: Principal,
  w: Workspace,
  d: z.infer<typeof portfolioProperty>,
) {
  const id = uid('prop'),
    time = now();
  return {
    id,
    statements: [
      statement(
        env.DB,
        'INSERT INTO properties(id,address,suburb,postcode,address_key,sector,property_type,created_at) VALUES(?,?,?,?,?,?,?,?)',
        id,
        d.address,
        d.suburb,
        d.postcode,
        addressKey(d.address, d.suburb, d.postcode),
        w.kind === 'commercial' ? 'commercial' : 'residential',
        d.propertyType,
        time,
      ),
      statement(
        env.DB,
        'INSERT INTO client_property_links(id,client_id,property_id,role,starts_at) VALUES(?,?,?,?,?)',
        uid('link'),
        w.scopeId,
        id,
        w.kind === 'commercial' ? 'asset_manager' : 'managing_agent',
        time,
      ),
      statement(
        env.DB,
        'INSERT INTO property_management_relationships(id,property_id,manager_client_id,mode,starts_at) VALUES(?,?,?,?,?)',
        uid('mgmt'),
        id,
        w.scopeId,
        w.kind === 'commercial' ? 'commercial_managed' : 'agency_managed',
        time,
      ),
      statement(
        env.DB,
        'INSERT INTO portfolio_owners(property_id,client_id,name,email) VALUES(?,?,?,?)',
        id,
        w.scopeId,
        d.ownerName,
        d.ownerEmail ?? null,
      ),
      activity(env, user, 'portfolio.property_created', 'property', id, id, null, {
        clientId: w.scopeId,
        authorityReference: d.authorityReference,
      }),
    ],
  };
}
export async function addPortfolioProperty(
  env: Env,
  user: Principal,
  w: Workspace,
  input: unknown,
) {
  assert(
    w.kind === 'property-manager' || w.kind === 'commercial',
    403,
    'PORTFOLIO_REQUIRED',
    'Use a professional portfolio workspace.',
  );
  await clientAdmin(env, user, w);
  const d = portfolioProperty.parse(input);
  assert(
    !(await statement(
      env.DB,
      'SELECT id FROM properties WHERE address_key=?',
      addressKey(d.address, d.suburb, d.postcode),
    ).first()),
    409,
    'PROPERTY_REVIEW_REQUIRED',
    'This address requires relationship review; no access has been granted.',
  );
  const plan = portfolioStatements(env, user, w, d);
  await env.DB.batch(plan.statements);
  return { propertyId: plan.id };
}
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n')) {
      row.push(cell.trim());
      cell = '';
      if (c === '\n') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
      }
    } else if (c !== '\r') cell += c;
  }
  assert(!quoted, 422, 'CSV_INVALID', 'An unclosed quoted field was found.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export async function previewImport(env: Env, user: Principal, w: Workspace, input: unknown) {
  await clientAdmin(env, user, w);
  assert(
    ['property-manager', 'commercial'].includes(w.kind),
    403,
    'PORTFOLIO_REQUIRED',
    'Use a professional portfolio.',
  );
  const d = z
    .object({ csv: z.string().min(5).max(50000), authorityReference: reference })
    .parse(input);
  const [head, ...rows] = parseCsv(d.csv.replace(/^\uFEFF/, ''));
  assert(
    head && rows.length > 0 && rows.length <= 20,
    422,
    'IMPORT_LIMIT',
    'Use 1 to 20 rows per reviewed import.',
  );
  const required = ['address', 'suburb', 'postcode', 'ownerName'];
  assert(
    required.every((h) => head.includes(h)),
    422,
    'CSV_HEADERS',
    'Required headers: address,suburb,postcode,ownerName. Optional: ownerEmail,propertyType.',
  );
  const errors: { row: number; message: string }[] = [],
    valid: z.infer<typeof portfolioProperty>[] = [],
    seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const raw = Object.fromEntries(head.map((h, i) => [h, row[i] || undefined]));
    const result = portfolioProperty.safeParse({
      ...raw,
      authorityReference: d.authorityReference,
    });
    if (!result.success) {
      errors.push({ row: index + 2, message: 'Check the address, postcode and owner fields.' });
      continue;
    }
    const p = result.data,
      key = addressKey(p.address, p.suburb, p.postcode);
    if (
      seen.has(key) ||
      (await statement(env.DB, 'SELECT id FROM properties WHERE address_key=?', key).first())
    )
      errors.push({
        row: index + 2,
        message:
          'Duplicate or existing property requires review; it will not be linked automatically.',
      });
    else valid.push(p);
    seen.add(key);
  }
  if (errors.length) return { valid: false, errors, count: rows.length };
  const id = uid('imp'),
    fingerprint = await digest(JSON.stringify(valid));
  await statement(
    env.DB,
    "INSERT INTO portfolio_imports(id,client_id,user_id,envelope,fingerprint,status,created_at) VALUES(?,?,?,?,?,'preview',?)",
    id,
    w.scopeId,
    user.id,
    await seal(env.DATA_ENCRYPTION_KEY, `import:${id}`, valid),
    fingerprint,
    now(),
  ).run();
  return {
    id,
    valid: true,
    count: valid.length,
    properties: valid.map((p) => ({
      address: p.address,
      suburb: p.suburb,
      postcode: p.postcode,
      ownerName: p.ownerName,
    })),
    errors: [],
  };
}
export async function applyImport(env: Env, user: Principal, w: Workspace, id: string) {
  await clientAdmin(env, user, w);
  const row = await statement(
    env.DB,
    'SELECT * FROM portfolio_imports WHERE id=? AND client_id=? AND user_id=?',
    id,
    w.scopeId,
    user.id,
  ).first<Record<string, any>>();
  assert(row, 404, 'IMPORT_NOT_FOUND', 'Import preview not found.');
  if (row.status === 'applied') return { id, replayed: true };
  assert(
    Date.now() - Date.parse(row.created_at) < 86400000,
    409,
    'IMPORT_EXPIRED',
    'Create a new preview before importing.',
  );
  const rows = await unseal<z.infer<typeof portfolioProperty>[]>(
    env.DATA_ENCRYPTION_KEY,
    `import:${id}`,
    row.envelope,
  );
  const plans = rows.map((d) => portfolioStatements(env, user, w, d));
  await env.DB.batch([
    statement(
      env.DB,
      "UPDATE portfolio_imports SET status='applied',applied_at=? WHERE id=? AND status='preview'",
      now(),
      id,
    ),
    guard(env),
    ...plans.flatMap((p) => p.statements),
    clearGuard(env),
  ]);
  return { id, count: rows.length, propertyIds: plans.map((p) => p.id) };
}
export async function assignPortfolio(env: Env, user: Principal, w: Workspace, input: unknown) {
  await clientAdmin(env, user, w);
  const d = z
    .object({ propertyId: recordId, userId: recordId, assigned: z.boolean() })
    .parse(input);
  await propertyAccess(env, user, w, d.propertyId);
  assert(
    await statement(
      env.DB,
      'SELECT id FROM client_memberships WHERE client_id=? AND user_id=? AND active=1',
      w.scopeId,
      d.userId,
    ).first(),
    422,
    'MEMBER_REQUIRED',
    'Select an active team member.',
  );
  await env.DB.batch([
    d.assigned
      ? statement(
          env.DB,
          'INSERT INTO portfolio_assignments(user_id,property_id,client_id) VALUES(?,?,?) ON CONFLICT DO NOTHING',
          d.userId,
          d.propertyId,
          w.scopeId,
        )
      : statement(
          env.DB,
          'DELETE FROM portfolio_assignments WHERE user_id=? AND property_id=? AND client_id=?',
          d.userId,
          d.propertyId,
          w.scopeId,
        ),
    activity(
      env,
      user,
      'portfolio.assignment_changed',
      'property',
      d.propertyId,
      d.propertyId,
      null,
      { userId: d.userId, assigned: d.assigned },
    ),
  ]);
  return { ok: true };
}
export async function inviteMember(env: Env, user: Principal, w: Workspace, input: unknown) {
  const d = z
    .object({
      email,
      role: z.enum(['admin', 'member', 'viewer', 'resident', 'owner', 'council_member']),
      schemeId: recordId.optional(),
      lotId: recordId.optional(),
      endsAt: isoDate.optional(),
    })
    .parse(input);
  if (d.schemeId) {
    if (w.kind !== 'staff') await clientAdmin(env, user, w);
    await schemeAccess(env, user, w, d.schemeId, true);
    assert(
      ['resident', 'owner', 'council_member'].includes(d.role),
      422,
      'ROLE_INVALID',
      'Choose a building relationship.',
    );
    if (d.role === 'council_member')
      assert(d.endsAt, 422, 'TERM_REQUIRED', 'Council access requires a term end date.');
    if (d.lotId)
      assert(
        await statement(
          env.DB,
          'SELECT id FROM strata_lots WHERE id=? AND scheme_id=?',
          d.lotId,
          d.schemeId,
        ).first(),
        422,
        'LOT_MISMATCH',
        'Choose a lot in this scheme.',
      );
  } else {
    await clientAdmin(env, user, w);
    assert(
      ['admin', 'member', 'viewer'].includes(d.role),
      422,
      'ROLE_INVALID',
      'Choose an organisation role.',
    );
  }
  if (d.endsAt) assert(d.endsAt > now(), 422, 'TERM_INVALID', 'Choose a future end date.');
  const token = randomToken(),
    url = `${env.APP_ORIGIN}/invitations/accept?token=${token}`;
  await env.DB.batch([
    statement(
      env.DB,
      'INSERT INTO portal_invitations(token_hash,email,client_id,scheme_id,lot_id,role,starts_at,ends_at,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      await digest(token),
      d.email,
      d.schemeId ? null : w.scopeId,
      d.schemeId ?? null,
      d.lotId ?? null,
      d.role,
      now(),
      d.endsAt ?? null,
      new Date(Date.now() + 7 * 86400000).toISOString(),
      user.id,
      now(),
    ),
    await mailEvent(env, 'membership.invited', {
      to: d.email,
      subject: 'Your ProInspect workspace invitation',
      heading: 'You have been invited',
      body: 'Sign in with the invited email address to accept this relationship. A workspace invitation does not grant access to unrelated records.',
      href: url,
      sensitive: true,
    }),
    activity(
      env,
      user,
      'membership.invited',
      'workspace',
      d.schemeId ?? w.scopeId,
      null,
      d.schemeId ?? null,
      { role: d.role },
    ),
  ]);
  return { invited: true, ...(env.APP_ENV === 'local' ? { localInvitationUrl: url } : {}) };
}
export async function acceptPortalInvitation(env: Env, user: Principal, token: string) {
  assert(
    typeof token === 'string' && /^[a-f0-9]{64}$/.test(token),
    422,
    'INVITATION_INVALID',
    'Invalid invitation.',
  );
  const hash = await digest(token),
    i = await statement(
      env.DB,
      'SELECT * FROM portal_invitations WHERE token_hash=? AND email=? AND consumed_at IS NULL AND expires_at>?',
      hash,
      user.email,
      now(),
    ).first<Record<string, any>>();
  if (!i) return null;
  const grantor = await statement(
    env.DB,
    'SELECT u.id,u.email,u.display_name,sp.role AS staffRole FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id AND sp.active=1 WHERE u.id=? AND u.active=1',
    i.created_by,
  ).first<Principal>();
  assert(grantor, 403, 'INVITATION_REVOKED', 'The inviting account is no longer authorised.');
  if (i.client_id) {
    const m = await clientMembership(env, grantor, i.client_id, true);
    assert(
      ['owner', 'admin'].includes(m.role),
      403,
      'INVITATION_REVOKED',
      'The invitation authority has changed.',
    );
  } else if (!grantor.staffRole) {
    const links = await statement(
      env.DB,
      `SELECT l.client_id FROM scheme_client_links l JOIN client_memberships m ON m.client_id=l.client_id WHERE l.scheme_id=? AND m.user_id=? AND m.active=1 AND m.role IN('owner','admin') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?)`,
      i.scheme_id,
      grantor.id,
      now(),
      now(),
    ).first();
    assert(links, 403, 'INVITATION_REVOKED', 'The scheme invitation authority has changed.');
  } else operationsWrite(grantor);
  assert(
    !i.ends_at || i.ends_at > now(),
    403,
    'INVITATION_EXPIRED',
    'The relationship term has ended.',
  );
  const statements = [
    statement(
      env.DB,
      'UPDATE portal_invitations SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>?',
      now(),
      hash,
      now(),
    ),
    guard(env),
  ];
  if (i.client_id)
    statements.push(
      statement(
        env.DB,
        'INSERT INTO client_memberships(id,client_id,user_id,role,created_at) VALUES(?,?,?,?,?) ON CONFLICT(client_id,user_id) DO NOTHING',
        uid('mem'),
        i.client_id,
        user.id,
        i.role,
        now(),
      ),
    );
  else
    statements.push(
      statement(
        env.DB,
        'INSERT INTO scheme_memberships(id,user_id,scheme_id,lot_id,role,starts_at,ends_at,approved_by) VALUES(?,?,?,?,?,?,?,?)',
        uid('sm'),
        user.id,
        i.scheme_id,
        i.lot_id,
        i.role,
        now(),
        i.ends_at,
        i.created_by,
      ),
    );
  statements.push(
    activity(
      env,
      user,
      'membership.accepted',
      'workspace',
      i.scheme_id ?? i.client_id,
      null,
      i.scheme_id,
    ),
    clearGuard(env),
  );
  await env.DB.batch(statements);
  return { accepted: true, returnTo: '/workspaces' };
}
export async function updateTeamMember(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  await clientAdmin(env, user, w);
  const d = z
    .object({ role: z.enum(['admin', 'member', 'viewer']), active: z.boolean() })
    .parse(input);
  assert(
    id !== user.id,
    409,
    'SELF_CHANGE_FORBIDDEN',
    'Another administrator must change your own membership.',
  );
  const member = await statement(
    env.DB,
    'SELECT role FROM client_memberships WHERE client_id=? AND user_id=?',
    w.scopeId,
    id,
  ).first<{ role: string }>();
  assert(
    member && member.role !== 'owner',
    403,
    'OWNER_PROTECTED',
    'The account owner cannot be changed here.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE client_memberships SET role=?,active=? WHERE client_id=? AND user_id=?',
      d.role,
      d.active ? 1 : 0,
      w.scopeId,
      id,
    ),
    guard(env),
    activity(env, user, 'team.member_updated', 'client', w.scopeId, null, null, {
      userId: id,
      role: d.role,
      active: d.active,
    }),
    clearGuard(env),
  ]);
  return { ok: true };
}
export async function createPlan(env: Env, user: Principal, w: Workspace, input: unknown) {
  assert(managesProperty(w), 403, 'PORTFOLIO_REQUIRED', 'Use your property-management workspace.');
  const d = z
    .object({
      propertyId: recordId,
      serviceId: recordId,
      intervalMonths: z.number().int().min(1).max(24),
      nextDue: dateOnly,
    })
    .parse(input);
  const p = await propertyAccess(env, user, w, d.propertyId, true);
  const service = await statement(
    env.DB,
    'SELECT sectors_json FROM services WHERE id=? AND active=1',
    d.serviceId,
  ).first<{ sectors_json: string }>();
  assert(
    service && JSON.parse(service.sectors_json).includes(p.sector),
    422,
    'SERVICE_INVALID',
    'Choose a service for this property.',
  );
  const id = uid('plan');
  await env.DB.batch([
    statement(
      env.DB,
      "INSERT INTO recurring_plans(id,client_id,property_id,service_id,interval_months,next_due,status,created_by,created_at) VALUES(?,?,?,?,?,?,'active',?,?)",
      id,
      w.scopeId,
      d.propertyId,
      d.serviceId,
      d.intervalMonths,
      d.nextDue,
      user.id,
      now(),
    ),
    activity(env, user, 'plan.created', 'recurring_plan', id, p.id),
  ]);
  return { id };
}
export async function updatePlan(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  input: unknown,
) {
  assert(managesProperty(w), 403, 'PORTFOLIO_REQUIRED', 'Use a property-management workspace.');
  const p = await statement(
    env.DB,
    'SELECT * FROM recurring_plans WHERE id=? AND client_id=?',
    id,
    w.scopeId,
  ).first<Record<string, any>>();
  assert(p, 404, 'PLAN_NOT_FOUND', 'Plan not found.');
  await propertyAccess(env, user, w, p.property_id, true);
  const d = z
    .object({
      version: z.number().int().positive(),
      status: z.enum(['active', 'paused', 'ended']),
      nextDue: dateOnly.optional(),
    })
    .parse(input);
  assert(
    p.status !== 'ended' && p.version === d.version,
    409,
    'PLAN_CHANGED',
    'This plan has ended or changed.',
  );
  await env.DB.batch([
    statement(
      env.DB,
      'UPDATE recurring_plans SET status=?,next_due=COALESCE(?,next_due),version=version+1 WHERE id=? AND version=?',
      d.status,
      d.nextDue ?? null,
      id,
      d.version,
    ),
    guard(env),
    activity(env, user, 'plan.updated', 'recurring_plan', id, p.property_id, null, {
      status: d.status,
    }),
    clearGuard(env),
  ]);
  return { ok: true };
}
