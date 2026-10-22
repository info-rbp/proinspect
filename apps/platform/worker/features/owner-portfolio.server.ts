import { statement, now, type Env } from '../../../../packages/database/types';
import type { Principal, Property } from '../../../../packages/domain/index';
import { workspaces, propertiesFor } from '../../../../packages/authorization/server';

export interface OwnedProperty extends Property {
  clientId: string;
  accountName: string;
  workspaceHref: string;
  upcomingBookings: number;
  openWorkOrders: number;
  openRequests: number;
}
export async function ownerPortfolio(env: Env, user: Principal) {
  const accounts: {
    clientId: string; name: string; sector: 'residential' | 'commercial';
    href: string; propertyCount: number; subscriptionActive: boolean;
  }[] = [];
  const properties: OwnedProperty[] = [];
  for (const w of await workspaces(env, user)) {
    if (!['landlord', 'commercial'].includes(w.kind) || !['owner', 'admin'].includes(w.role))
      continue;
    const sector = w.kind === 'landlord' ? 'residential' : 'commercial';
    const account = await statement(
      env.DB, 'SELECT client_type FROM clients WHERE id=? AND status=\'active\'', w.scopeId,
    ).first<{ client_type: string }>();
    if (account?.client_type !== (sector === 'residential' ? 'landlord' : 'commercial_landlord'))
      continue;
    const ownership = await statement(
      env.DB,
      "SELECT property_id FROM client_property_links WHERE client_id=? AND role IN('owner','landlord') AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)",
      w.scopeId, now(), now(),
    ).all<{ property_id: string }>();
    const ownedIds = new Set(ownership.results.map((link) => link.property_id));
    const visible = (await propertiesFor(env, user, w)).filter(
      (p) => p.sector === sector && ownedIds.has(p.id),
    );
    const activePlan = await statement(
      env.DB, "SELECT id FROM subscriptions WHERE client_id=? AND status='active' LIMIT 1", w.scopeId,
    ).first();
    accounts.push({
      clientId: w.scopeId, name: w.name, sector, href: w.href,
      propertyCount: visible.length, subscriptionActive: Boolean(activePlan),
    });
    for (const p of visible) {
      const counts = await statement(
        env.DB,
        `SELECT
           (SELECT COUNT(*) FROM bookings WHERE client_id=? AND property_id=?
             AND status='confirmed' AND starts_at>=?) AS upcoming,
           (SELECT COUNT(*) FROM work_orders WHERE client_id=? AND property_id=?
             AND status NOT IN ('completed','cancelled')) AS orders,
           (SELECT COUNT(*) FROM requests WHERE client_id=? AND property_id=?
             AND status NOT IN ('closed','cancelled')
             AND (source='client' OR category IN ('maintenance','inspection_access'))) AS requests`,
        w.scopeId, p.id, now(), w.scopeId, p.id, w.scopeId, p.id,
      ).first<{ upcoming: number; orders: number; requests: number }>();
      properties.push({
        ...p, clientId: w.scopeId, accountName: w.name, workspaceHref: w.href,
        upcomingBookings: counts?.upcoming ?? 0,
        openWorkOrders: counts?.orders ?? 0,
        openRequests: counts?.requests ?? 0,
      });
    }
  }
  properties.sort((a, b) => a.sector.localeCompare(b.sector) || a.address.localeCompare(b.address));
  return {
    accounts, properties,
    totals: {
      properties: properties.length,
      residential: properties.filter((p) => p.sector === 'residential').length,
      commercial: properties.filter((p) => p.sector === 'commercial').length,
      upcomingBookings: properties.reduce((n, p) => n + p.upcomingBookings, 0),
      openWorkOrders: properties.reduce((n, p) => n + p.openWorkOrders, 0),
      openRequests: properties.reduce((n, p) => n + p.openRequests, 0),
    },
  };
}
