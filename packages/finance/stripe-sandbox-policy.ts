/** Credential shape checks only; provider identity must still be verified remotely. */
export const STRIPE_SANDBOX_ACCOUNT = 'acct_1USumhEv62nbUZok';
export function isSandboxApiKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && /^(?:rk|sk)_test_[A-Za-z0-9_]+$/.test(value);
}
export function isStripeWebhookSecret(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 && /^whsec_[A-Za-z0-9_]+$/.test(value);
}
export function isBillingPortalConfigurationId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && /^bpc_[A-Za-z0-9_]+$/.test(value);
}
type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : null;
}
/** Fail closed on missing fields or new enabled portal capabilities. No defaults are trusted. */
export function isReviewedSandboxPortal(value: unknown, id: string, origin: string): boolean {
  const p = object(value), features = object(p?.features), metadata = object(p?.metadata);
  if (!isBillingPortalConfigurationId(id) || !p || !features || !metadata) return false;
  if (p.id !== id || p.active !== true || p.livemode !== false ||
      metadata.application !== 'proinspect' || metadata.environment !== 'staging') return false;
  if (p.default_return_url !== origin + '/workspaces' || object(p.login_page)?.enabled !== false) return false;
  for (const name of ['invoice_history', 'payment_method_update'])
    if (object(features[name])?.enabled !== true) return false;
  for (const name of ['customer_update', 'subscription_update', 'subscription_cancel', 'subscription_pause'])
    if (object(features[name])?.enabled !== false) return false;
  return Object.entries(features).every(([name, feature]) =>
    ['invoice_history', 'payment_method_update'].includes(name) || object(feature)?.enabled === false);
}
