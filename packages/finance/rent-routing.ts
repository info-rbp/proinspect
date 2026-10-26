/** WA residential rent-routing policy. A planning record is never a payment instruction. */
export const RENT_ROUTE_POLICY_VERSION = 'WA_RENT_ROUTING_OCT_2026';
export const WA_RENT_GUIDANCE = 'https://www.consumerprotection.wa.gov.au/paying-rent';
export type RentRoute = 'agency_trust_external' | 'landlord_direct_external' | 'landlord_connect_candidate';
export type ManagerMode = 'agency_managed' | 'self_managed';
export type MoneyAction = 'charge' | 'transfer' | 'payout' | 'refund';

export function rentRouteAllowed(mode: ManagerMode, route: RentRoute): boolean {
  return mode === 'agency_managed'
    ? route === 'agency_trust_external'
    : route === 'landlord_direct_external' || route === 'landlord_connect_candidate';
}
/** Never use a platform payment balance as a rent trust account. */
export function rentMovementPermitted(_route: RentRoute, _action: MoneyAction): false {
  return false;
}
/** A proposed Connect route cannot be activated without external legal/Stripe approval. */
export function requiresApprovalBeforeConnect(_mode: ManagerMode, _route: RentRoute): true {
  return true;
}
export function rentRouteDescription(route: RentRoute): string {
  switch (route) {
    case 'agency_trust_external': return 'Agency-managed: pay the licensed agency through its nominated trust-account process. ProInspect does not receive rent.';
    case 'landlord_direct_external': return 'Self-managed: pay the landlord using their independently approved external payment method. ProInspect does not receive rent.';
    case 'landlord_connect_candidate': return 'Proposed future Stripe Connect integration for an eligible self-managing landlord. No charge, transfer or payout is enabled.';
  }
}
