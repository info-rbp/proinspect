import { assert, statement, now, type Env } from '../../../../packages/database/types';
import type { Principal } from '../../../../packages/domain/index';

export const LIVE_RESIDENTIAL_ACCOUNT = 'acct_1USumSEynzcud8MV';
export const LIVE_RESIDENTIAL_PRODUCT = 'prod_VWXmN5UFyCZhrC';
export const LIVE_RESIDENTIAL_PRICE = 'price_1UVUgqEynzcud8MVLxm1mGRn';
export const LIVE_RESIDENTIAL_PORTAL_CONFIG = 'bpc_1UVo5XEynzcud8MVDJ4cYZ7p';
export const LIVE_RESIDENTIAL_WEEKLY_EX_GST_CENTS = 5000;
export const LIVE_STRIPE_API_VERSION = '2026-09-30.endive';

/** Friday 09:00 Australia/Perth. WA observes UTC+08 year-round.
 * If Checkout is within two hours of the cutoff, use the following Friday.
 */
export function nextFridayPerthAnchor(nowMs: number = Date.now()): number {
 assert(Number.isSafeInteger(nowMs) && nowMs > 0, 422, 'FRIDAY_CLOCK_INVALID', 'Invalid billing timestamp.');
 const local = new Date(nowMs + 8 * 3600_000), days = (5 - local.getUTCDay() + 7) % 7;
 let anchor = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, 1, 0, 0);
 if (anchor <= nowMs + 2 * 3600_000) anchor += 7 * 86400_000;
 return Math.floor(anchor / 1000);
}
export function isLiveResidential(env: Env): boolean {
 return env.APP_ENV === 'production';
}
export function liveResidentialCredentialsReady(env: Env) {
 assert(isLiveResidential(env) && env.RESIDENTIAL_LIVE_BILLING_ENABLED === 'true', 503,
  'RESIDENTIAL_LIVE_DISABLED', 'Live residential billing awaits independent release approval.');
 assert(env.STRIPE_RESIDENTIAL_LIVE_ACCOUNT_ID === LIVE_RESIDENTIAL_ACCOUNT, 503,
  'RESIDENTIAL_ACCOUNT_MISMATCH', 'The Stripe account is not the approved live account.');
 assert(/^rk_live_[A-Za-z0-9_]{16,}$/.test(env.STRIPE_RESIDENTIAL_LIVE_KEY ?? ''), 503,
  'RESIDENTIAL_KEY_MISSING', 'Configure a restricted live Stripe key in Cloudflare secrets.');
 assert(/^whsec_[A-Za-z0-9_]{16,}$/.test(env.STRIPE_RESIDENTIAL_LIVE_WEBHOOK_SECRET ?? ''), 503,
  'RESIDENTIAL_WEBHOOK_MISSING', 'Configure the residential live webhook signing secret.');
}
export function liveResidentialReady(env: Env) {
 liveResidentialCredentialsReady(env);
 assert(/^txcd_[0-9]{8}$/.test(env.RESIDENTIAL_APPROVED_TAX_CODE ?? '') &&
  env.RESIDENTIAL_APPROVED_TAX_CODE !== 'txcd_10203001', 503,
  'RESIDENTIAL_TAX_CODE_UNAPPROVED', 'The property-services tax category needs approval; the current code classifies downloadable software.');
}
export async function liveResidentialApi(env: Env, path: string, form?: URLSearchParams, idempotencyKey?: string): Promise<Record<string, any>> {
 liveResidentialCredentialsReady(env);
 // Fail closed: no live subscription mutation, refund, price, or invoice mutation through this adapter.
 const read = /^\/(?:account|tax\/settings|tax\/registrations|prices\/price_[A-Za-z0-9_]+|products\/prod_[A-Za-z0-9_]+|checkout\/sessions\/cs_(?:live|test)_[A-Za-z0-9_]+|billing_portal\/configurations\/bpc_[A-Za-z0-9_]+|charges\/ch_[A-Za-z0-9_]+)$/.test(path)
  || /^\/invoice_payments\?[A-Za-z0-9_=%&.-]+$/.test(path);
 const write = /^\/(?:customers|checkout\/sessions|billing_portal\/sessions)$/.test(path);
 assert(form ? write : read, 500, 'LIVE_PROVIDER_PATH', 'Unapproved live Stripe operation.');
 const response = await fetch('https://api.stripe.com/v1' + path, {
  method: form ? 'POST' : 'GET',
  headers: { Authorization: 'Bearer ' + env.STRIPE_RESIDENTIAL_LIVE_KEY,
   'Stripe-Version': LIVE_STRIPE_API_VERSION,
   ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
   ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
  body: form, signal: AbortSignal.timeout(15000)
 });
 assert(response.ok, 502, 'RESIDENTIAL_STRIPE_ERROR', 'Stripe did not complete this operation. Settlement is not assumed.');
 return await response.json() as Record<string, any>;
}
export async function verifyLiveResidentialAccount(env: Env) {
 const account = await liveResidentialApi(env, '/account');
 assert(account.id === LIVE_RESIDENTIAL_ACCOUNT, 503,
  'RESIDENTIAL_KEY_ACCOUNT_MISMATCH', 'The restricted key is not assigned to the approved Stripe account.');
}
export async function verifyLiveResidentialTax(env: Env) {
 liveResidentialReady(env);
 const [settings, regs, price, product] = await Promise.all([
  liveResidentialApi(env, '/tax/settings'), liveResidentialApi(env, '/tax/registrations'),
  liveResidentialApi(env, '/prices/' + LIVE_RESIDENTIAL_PRICE),
  liveResidentialApi(env, '/products/' + LIVE_RESIDENTIAL_PRODUCT)
 ]);
 assert(settings.status === 'active' && settings.head_office?.address?.country === 'AU', 503,
  'LIVE_TAX_SETTINGS_PENDING', 'Live Australian Stripe Tax configuration must be active.');
 assert(Array.isArray(regs.data) && regs.data.some((r: any) => r.country === 'AU' && r.status === 'active'), 503,
  'LIVE_GST_REGISTRATION_REQUIRED', 'Stripe must have an active Australian GST registration.');
 const exclusive = price.tax_behavior === 'exclusive' ||
  (price.tax_behavior === 'unspecified' && settings.defaults?.tax_behavior === 'exclusive');
 assert(price.livemode === true && price.active === true && price.product === LIVE_RESIDENTIAL_PRODUCT &&
  price.id === LIVE_RESIDENTIAL_PRICE && price.unit_amount === LIVE_RESIDENTIAL_WEEKLY_EX_GST_CENTS &&
  price.currency === 'aud' && price.recurring?.interval === 'week' && price.recurring?.interval_count === 1 &&
  price.recurring?.usage_type === 'licensed' && exclusive, 503,
  'LIVE_PRICE_MISMATCH', 'Live price must be AUD $50 per week per property plus GST.');
 assert(product.id === LIVE_RESIDENTIAL_PRODUCT && product.active === true &&
  product.default_price === LIVE_RESIDENTIAL_PRICE && product.tax_code === env.RESIDENTIAL_APPROVED_TAX_CODE,
  503, 'LIVE_TAX_CATEGORY_MISMATCH', 'Stripe Product must use the approved residential property support tax category.');
}
export async function ensureLiveResidentialCustomer(env: Env, user: Principal, clientId: string): Promise<string> {
 await verifyLiveResidentialAccount(env);
 const c = await statement(env.DB, "SELECT id,name FROM clients WHERE id=? AND status='active'", clientId)
  .first<{ id: string; name: string }>();
 assert(c, 404, 'LIVE_BILLING_CLIENT_REQUIRED', 'An authorised customer account is required.');
 const old = await statement(env.DB, 'SELECT stripe_account_id,mode,stripe_customer_id FROM billing_accounts WHERE client_id=?', clientId)
  .first<{ stripe_account_id: string; mode: string; stripe_customer_id: string | null }>();
 if (old) {
  assert(old.mode === 'live' && old.stripe_account_id === LIVE_RESIDENTIAL_ACCOUNT, 409,
   'BILLING_ENVIRONMENT_MISMATCH', 'The client is mapped to another billing environment.');
  if (old.stripe_customer_id) return old.stripe_customer_id;
 }
 await statement(env.DB, "INSERT INTO billing_accounts(client_id,stripe_account_id,mode,created_by,created_at,updated_at) VALUES(?,?,'live',?,?,?) ON CONFLICT(client_id) DO NOTHING",
  clientId, LIVE_RESIDENTIAL_ACCOUNT, user.id, now(), now()).run();
 const customer = await liveResidentialApi(env, '/customers',
  new URLSearchParams({ name: c.name, 'metadata[proinspect_client_id]': clientId,
   'metadata[proinspect_product]': LIVE_RESIDENTIAL_PRODUCT }),
  'proinspect-live-residential-customer-' + clientId);
 assert(/^cus_[A-Za-z0-9_]+$/.test(customer.id ?? '') && customer.livemode === true, 502,
  'LIVE_CUSTOMER_INVALID', 'Stripe customer creation could not be verified.');
 await statement(env.DB, "UPDATE billing_accounts SET stripe_customer_id=?,updated_at=? WHERE client_id=? AND mode='live' AND stripe_account_id=? AND (stripe_customer_id IS NULL OR stripe_customer_id=?)",
  customer.id, now(), clientId, LIVE_RESIDENTIAL_ACCOUNT, customer.id).run();
 const saved = await statement(env.DB, "SELECT stripe_customer_id FROM billing_accounts WHERE client_id=? AND mode='live'", clientId)
  .first<{ stripe_customer_id: string }>();
 assert(saved?.stripe_customer_id === customer.id, 409, 'LIVE_CUSTOMER_CHANGED', 'The billing customer mapping changed.');
 return customer.id as string;
}
export async function liveInvoiceIdsForPaymentIntent(env: Env, paymentIntentId: string): Promise<string[]> {
 liveResidentialReady(env);
 assert(/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId), 422, 'PAYMENT_INTENT_INVALID', 'Invalid payment identity.');
 const ids: string[] = []; let cursor: string | undefined;
 for (let page = 0; page < 12; page++) {
  const params = new URLSearchParams({ status: 'paid', limit: '100',
   'payment[type]': 'payment_intent', 'payment[payment_intent]': paymentIntentId });
  if (cursor) params.set('starting_after', cursor);
  const list = await liveResidentialApi(env, '/invoice_payments?' + params);
  assert(Array.isArray(list.data), 502, 'INVOICE_PAYMENT_RESPONSE_INVALID', 'Invalid invoice payment response.');
  for (const item of list.data) {
   const invoice = typeof item.invoice === 'string' ? item.invoice : item.invoice?.id;
   if (item.status === 'paid' && item.payment?.payment_intent === paymentIntentId &&
    /^in_[A-Za-z0-9_]+$/.test(invoice ?? '')) ids.push(invoice);
  }
  if (!list.has_more) return [...new Set(ids)];
  cursor = list.data.at(-1)?.id;
  assert(typeof cursor === 'string' && /^inpay_[A-Za-z0-9_]+$/.test(cursor), 502,
   'INVOICE_PAYMENT_PAGINATION', 'Invalid Stripe invoice payment pagination.');
 }
 assert(false, 503, 'INVOICE_PAYMENT_LIMIT', 'Invoice payments require manual reconciliation.');
}
