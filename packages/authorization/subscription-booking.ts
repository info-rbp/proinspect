import { statement, type Env } from '../database/types';
import type { Property, Service } from '../domain/index';

/**
 * A Landlord subscription can cover a globally request-only service without
 * publishing a $0 catalogue price (which would expose the price to all clients).
 *
 * The approved subscription's allowance_json must explicitly contain:
 *   { "includedServiceIds": ["property-condition-report", "routine-inspection"] }
 * or an explicit "*" for all sector-compatible services.
 * Missing/malformed allowances never grant access.
 */
export interface IncludedBookingSubscription {
  id: string;
  planCode: string;
}
interface SubscriptionRecord {
  id: string;
  property_id: string | null;
  plan_code: string;
  allowance_json: string;
}
function includedServiceIds(allowanceJson: string): string[] {
  try {
    const value: unknown = JSON.parse(allowanceJson);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const ids = (value as { includedServiceIds?: unknown }).includedServiceIds;
    if (!Array.isArray(ids) || !ids.length) return [];
    if (!ids.every((s) => typeof s === 'string' && (s === '*' || /^[a-z0-9_-]+$/.test(s))))
      return [];
    return ids;
  } catch {
    return [];
  }
}
async function activeSubscriptions(env: Env, clientId: string): Promise<SubscriptionRecord[]> {
  return (
    await statement(
      env.DB,
      "SELECT id,property_id,plan_code,allowance_json FROM subscriptions WHERE client_id=? AND status='active' ORDER BY created_at DESC",
      clientId,
    ).all<SubscriptionRecord>()
  ).results;
}
function covers(
  sub: SubscriptionRecord,
  propertyId: string,
  serviceId: string,
): boolean {
  if (sub.property_id !== null && sub.property_id !== propertyId) return false;
  const ids = includedServiceIds(sub.allowance_json);
  return ids.includes('*') || ids.includes(serviceId);
}
export async function includedSubscriptionBooking(
  env: Env,
  clientId: string,
  propertyId: string,
  serviceId: string,
): Promise<IncludedBookingSubscription | null> {
  const subscriptions = await activeSubscriptions(env, clientId);
  const found = subscriptions.find((s) => covers(s, propertyId, serviceId));
  return found ? { id: found.id, planCode: found.plan_code } : null;
}
export async function subscriptionBookingCoverage(
  env: Env,
  clientId: string,
  properties: Property[],
  services: Service[],
): Promise<Record<string, string[]>> {
  const subscriptions = await activeSubscriptions(env, clientId);
  return Object.fromEntries(
    properties.map((p) => [
      p.id,
      services
        .filter(
          (service) =>
            service.active === 1 &&
            service.sectors.includes(p.sector) &&
            subscriptions.some((sub) => covers(sub, p.id, service.id)),
        )
        .map((service) => service.id),
    ]),
  );
}
