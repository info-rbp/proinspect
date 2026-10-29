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
/** Paid enrollments are opt-in; historical all-inclusive customers are untouched.
 * An active Stripe subscription without a settled, current invoice never grants access.
 */
export async function paidResidentialCoverage(env: Env, clientId: string, propertyId: string): Promise<boolean> {
 const enrolled=await statement(env.DB,
  'SELECT 1 AS enrolled FROM residential_paid_property_enrollments WHERE client_id=? AND property_id=?',
  clientId,propertyId).first();
 if(!enrolled)return true;
 const covered=await statement(env.DB,`
  SELECT b.id FROM stripe_billing_links b
  JOIN stripe_subscription_invoice_observations i ON i.stripe_subscription_id=b.stripe_subscription_id
   AND i.stripe_customer_id=b.stripe_customer_id AND i.price_id=b.price_id
  WHERE b.client_id=? AND b.property_id=? AND b.sector='residential'
   AND b.status='active' AND i.status='paid' AND i.amount_paid_cents>0
   AND i.paid_through>?
   AND NOT EXISTS(SELECT 1 FROM stripe_subscription_risk_holds h
     WHERE h.stripe_subscription_id=b.stripe_subscription_id AND h.status='open')
   AND i.stripe_invoice_id=(
    SELECT latest.stripe_invoice_id FROM stripe_subscription_invoice_observations latest
    WHERE latest.stripe_subscription_id=b.stripe_subscription_id
     AND latest.stripe_customer_id=b.stripe_customer_id
    ORDER BY latest.invoice_created DESC,latest.stripe_invoice_id DESC LIMIT 1
   ) LIMIT 1`,clientId,propertyId,new Date().toISOString()).first();
 return Boolean(covered);
}
export async function includedSubscriptionBooking(
  env: Env,
  clientId: string,
  propertyId: string,
  serviceId: string,
): Promise<IncludedBookingSubscription | null> {
  const subscriptions = await activeSubscriptions(env, clientId);
  const found = subscriptions.find((s) => covers(s, propertyId, serviceId));
  if(found && !(await paidResidentialCoverage(env,clientId,propertyId)))return null;
  return found ? { id: found.id, planCode: found.plan_code } : null;
}
export async function subscriptionBookingCoverage(
  env: Env,
  clientId: string,
  properties: Property[],
  services: Service[],
): Promise<Record<string, string[]>> {
  const subscriptions = await activeSubscriptions(env, clientId);
  const coverage=await Promise.all(properties.map(p=>paidResidentialCoverage(env,clientId,p.id)));
  return Object.fromEntries(
    properties.map((p,index) => [
      p.id,
      services
        .filter(
          (service) =>
            coverage[index] &&
            service.active === 1 &&
            service.sectors.includes(p.sector) &&
            subscriptions.some((sub) => covers(sub, p.id, service.id)),
        )
        .map((service) => service.id),
    ]),
  );
}
