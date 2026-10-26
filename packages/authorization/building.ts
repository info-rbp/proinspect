import { assert, statement, now, type Env } from '../database/types';
import type { Principal, Workspace } from '../domain/index';
import { operationsWrite, clientMembership } from './server';
import { requireReleaseApproval } from '../../apps/platform/worker/features/release-governance.server';
export type AuthorisedBuilding = { id: string; scheme_id: string; scheme_name: string; name: string; property_id: string | null };

/** A professional building assignment is never inferred from a resident's scheme membership. */
export function buildingScope(user: Principal, w: Workspace, alias = 'b') {
  const time = now();
  if (w.kind === 'staff') return { sql: user.staffRole && user.staffRole !== 'inspector' ? '1=1' : '0=1', values: [] as string[] };
  if (w.kind === 'building-manager') return {
    sql: `${alias}.id=? AND EXISTS(SELECT 1 FROM building_manager_assignments a
      JOIN clients c ON c.id=a.client_id AND c.status='active'
      JOIN users u ON u.id=a.user_id AND u.active=1 AND u.verified_at IS NOT NULL
      JOIN scheme_client_links l ON l.client_id=a.client_id AND l.scheme_id=${alias}.scheme_id
      WHERE a.building_id=${alias}.id AND a.user_id=? AND a.status='approved' AND a.revoked_at IS NULL
      AND a.starts_at<=? AND a.ends_at>? AND l.role IN('building_manager','strata_manager')
      AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))`,
    values: [w.scopeId, user.id, time, time, time, time],
  };
  if (w.kind === 'strata-manager') return {
    sql: `EXISTS(SELECT 1 FROM scheme_client_links l JOIN clients c ON c.id=l.client_id
      JOIN client_memberships m ON m.client_id=c.id AND m.user_id=? AND m.active=1
      WHERE l.scheme_id=${alias}.scheme_id AND l.client_id=? AND c.status='active'
      AND l.role IN('strata_manager','building_manager') AND l.starts_at<=? AND (l.ends_at IS NULL OR l.ends_at>?))`,
    values: [user.id, w.scopeId, time, time],
  };
  if (w.kind === 'council') return {
    sql: `${alias}.scheme_id=? AND EXISTS(SELECT 1 FROM scheme_memberships m WHERE m.scheme_id=${alias}.scheme_id AND m.user_id=? AND m.role='council_member' AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?))`,
    values: [w.scopeId, user.id, time, time],
  };
  if (w.kind === 'building') return {
    sql: `${alias}.scheme_id=? AND EXISTS(SELECT 1 FROM scheme_memberships m JOIN strata_lots l ON l.id=m.lot_id AND l.scheme_id=m.scheme_id WHERE l.building_id=${alias}.id AND m.user_id=? AND m.role IN('owner','resident') AND m.starts_at<=? AND (m.ends_at IS NULL OR m.ends_at>?))`,
    values: [w.scopeId, user.id, time, time],
  };
  return { sql: '0=1', values: [] as string[] };
}
export async function buildingsFor(env: Env, user: Principal, w: Workspace) {
  await requireReleaseApproval(env, 'building');
  const s = buildingScope(user, w);
  return (await statement(env.DB, `SELECT b.*,s.name AS scheme_name FROM scheme_buildings b JOIN strata_schemes s ON s.id=b.scheme_id WHERE ${s.sql} ORDER BY s.name,b.name LIMIT 80`, ...s.values).all<AuthorisedBuilding>()).results;
}
export async function buildingAccess(env: Env, user: Principal, w: Workspace, id: string, write = false) {
  await requireReleaseApproval(env, 'building');
  if (write) {
    if (w.kind === 'staff') operationsWrite(user);
    else if (w.kind === 'strata-manager') await clientMembership(env, user, w.scopeId, true);
    else assert(w.kind === 'building-manager', 403, 'BUILDING_WRITE_FORBIDDEN', 'Professional building authority is required.');
  }
  const s = buildingScope(user, w);
  const b = await statement(env.DB, `SELECT b.*,s.name AS scheme_name FROM scheme_buildings b JOIN strata_schemes s ON s.id=b.scheme_id WHERE b.id=? AND (${s.sql})`, id, ...s.values).first<AuthorisedBuilding>();
  assert(b, 404, 'BUILDING_NOT_FOUND', 'Building is not assigned to this workspace.');
  return b;
}
