import type { PublicLegalKey } from './marketing/legal-drafts';

export const LEGAL_PURPOSES = ['onboarding', 'guest-intake', 'booking', 'payment', 'subscription', 'rental'] as const;
export type LegalPurpose = (typeof LEGAL_PURPOSES)[number];
/** Privacy is acknowledgement of a collection notice, not bundled marketing consent. */
export const LEGAL_REQUIREMENTS: Record<LegalPurpose, readonly PublicLegalKey[]> = {
  onboarding: ['privacy', 'platform-terms'],
  'guest-intake': ['privacy', 'platform-terms'],
  booking: ['privacy', 'terms', 'booking-policy', 'service-scopes'],
  payment: ['privacy', 'terms', 'booking-policy'],
  subscription: ['privacy', 'platform-terms', 'terms', 'subscription-terms'],
  rental: ['privacy', 'platform-terms'],
};
export function legalPurpose(value: string): value is LegalPurpose {
  return (LEGAL_PURPOSES as readonly string[]).includes(value);
}
export function acknowledgementKind(key: string): 'privacy_notice' | 'contract' {
  return key === 'privacy' ? 'privacy_notice' : 'contract';
}
