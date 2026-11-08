import { assert, statement, uid, now, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { propertyAccess, operationsWrite } from '../../../../packages/authorization/server';
import { requireReleaseApproval } from './release-governance.server';
export async function scope(
  env: Env,
  user: Principal,
  w: Workspace,
  propertyId?: string,
  write = false,
) {
  assert(
    env.COMMERCIAL_OPERATIONS_ENABLED === 'true',
    503,
    'COMMERCIAL_OPERATIONS_DISABLED',
    'Commercial lease operations are not enabled.',
  );
  await requireReleaseApproval(env, 'commercial');
  assert(
    ['commercial', 'property-manager', 'staff'].includes(w.kind),
    403,
    'COMMERCIAL_WORKSPACE_REQUIRED',
    'Use the authorised commercial or professional management workspace.',
  );
  if (w.kind === 'staff') operationsWrite(user);
  if (propertyId) {
    const p = await propertyAccess(env, user, w, propertyId, write);
    assert(
      p.sector === 'commercial',
      422,
      'COMMERCIAL_ONLY',
      'This register only supports commercial properties.',
    );
    return p;
  }
  return null;
}
export async function leaseAccess(
  env: Env,
  user: Principal,
  w: Workspace,
  id: string,
  write = false,
) {
  const l = await statement(env.DB, 'SELECT * FROM commercial_lease_register WHERE id=?', id).first<
    Record<string, any>
  >();
  assert(l, 404, 'COMMERCIAL_LEASE_NOT_FOUND', 'Lease record not found.');
  await scope(env, user, w, l.property_id, write);
  assert(
    w.kind === 'staff' || l.client_id === w.scopeId,
    404,
    'COMMERCIAL_LEASE_NOT_FOUND',
    'Lease record not found.',
  );
  return l;
}
export async function issuedEvidence(env: Env, l: Record<string, any>, id: string) {
  const d = await statement(
    env.DB,
    "SELECT d.id FROM documents d JOIN document_grants g ON g.document_id=d.id AND g.recipient_kind='client' AND g.recipient_id=? WHERE d.id=? AND d.property_id=? AND d.status='issued'",
    l.client_id,
    id,
    l.property_id,
  ).first();
  assert(
    d,
    422,
    'COMMERCIAL_EVIDENCE_SCOPE',
    'Choose an issued document expressly shared with the commissioning client for this property.',
  );
}
export function event(
  env: Env,
  user: Principal,
  l: string,
  t: string | null,
  action: string,
  ref: string,
) {
  return statement(
    env.DB,
    'INSERT INTO commercial_lease_events(id,lease_id,task_id,actor_id,action,reference,created_at) VALUES(?,?,?,?,?,?,?)',
    uid('cle'),
    l,
    t,
    user.id,
    action,
    ref,
    now(),
  );
}
