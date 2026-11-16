import { assert, statement, now, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';
import { digest } from '../../../../packages/auth/crypto';
/**
 * Invitation-only preview: a token and current verified identity are both
 * required. No public lookup by property address or recipient email exists.
 */
export async function invitedRelationshipPreview(env: Env, user: Principal, token: unknown) {
  assert(typeof token === 'string' && /^[a-f0-9]{64}$/.test(token),
    404, 'INVITATION_NOT_FOUND', 'This invitation is unavailable.');
  const hash = await digest(token);
  const tenancy = await statement(env.DB, `
    SELECT CASE WHEN p.sector='commercial' THEN 'ONB-INV-COM' ELSE 'ONB-INV-RES' END AS flow_id,
      CASE WHEN p.sector='commercial' THEN 'Commercial tenant contact' ELSE 'Residential tenant' END AS role_label,
      p.address AS property_label, t.id AS scope_id, i.expires_at
    FROM invitations i
    JOIN tenancies t ON t.id=i.tenancy_id
    JOIN properties p ON p.id=t.property_id
    WHERE i.token_hash=? AND i.email=? AND i.consumed_at IS NULL AND i.expires_at>?
      AND i.role='tenant' AND t.status='active'`, hash, user.email, now()
  ).first<Record<string, any>>();
  if (tenancy) {
    return { ...tenancy, version: '1.0.0' };
  }
  const portal = await statement(env.DB, `
    SELECT i.role,i.scheme_id,i.lot_id,i.expires_at,
      s.name AS scheme_name,l.lot_number,
      c.name AS organisation_name
    FROM portal_invitations i
    LEFT JOIN strata_schemes s ON s.id=i.scheme_id
    LEFT JOIN strata_lots l ON l.id=i.lot_id
    LEFT JOIN clients c ON c.id=i.client_id
    WHERE i.token_hash=? AND i.email=? AND i.consumed_at IS NULL AND i.expires_at>?`,
    hash, user.email, now()
  ).first<Record<string, any>>();
  assert(portal, 404, 'INVITATION_NOT_FOUND', 'This invitation is unavailable or belongs to another account.');
  const flow = portal.scheme_id
    ? portal.role === 'council_member' ? 'ONB-INV-COUNCIL' : 'ONB-INV-STR'
    : 'ONB-INV-CORE';
  return {
    flow_id: flow, version: '1.0.0',
    role_label: portal.role === 'council_member' ? 'Strata council member'
      : portal.role === 'resident' ? 'Building resident'
      : portal.role === 'owner' ? 'Lot owner' : 'Organisation member',
    property_label: portal.scheme_name
      ? portal.scheme_name + (portal.lot_number ? ' - Lot ' + portal.lot_number : '')
      : (portal.organisation_name ?? 'Organisation'),
    expires_at: portal.expires_at,
  };
}
