import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nextFridayPerthAnchor} from '../packages/finance/friday-billing.ts';
function t(utc:string){return Date.parse(utc)}
test('weekly renewal anchor is Friday at 9 am Perth time',()=>{
 for(const day of ['2026-10-29T06:00:00Z','2026-10-30T02:00:00Z','2027-01-04T02:05:00Z','2027-06-01T09:00:00Z']){
  const value=nextFridayPerthAnchor(t(day))*1000;
  const local=new Date(value+8*3600_000);
  assert.equal(local.getUTCDay(),5);
  assert.equal(local.getUTCHours(),9);
  assert.ok(value>t(day));
  assert.ok(value-t(day)<=7*86400_000);
 }
 assert.equal(new Date(nextFridayPerthAnchor(t('2026-10-29T06:00:00Z'))*1000).toISOString(),'2026-10-30T01:00:00.000Z');
 assert.equal(new Date(nextFridayPerthAnchor(t('2026-10-30T00:15:00Z'))*1000).toISOString(),'2026-10-30T01:00:00.000Z');
 assert.equal(new Date(nextFridayPerthAnchor(t('2026-10-30T01:15:00Z'))*1000).toISOString(),'2026-11-06T01:00:00.000Z');
 assert.throws(()=>nextFridayPerthAnchor(0),RangeError);
});
test('Checkout demands weekly $50, automatic GST, a saved payment method and no off-cycle proration',()=>{
 const s=readFileSync('apps/platform/worker/features/stripe-billing.server.ts','utf8');
 assert.match(s,/subscription_data\[billing_cycle_anchor\]/);
 assert.match(s,/subscription_data\[proration_behavior\]/);
 assert.match(s,/form\.set\('payment_method_collection','always'\)/);
 assert.match(s,/LIVE_RESIDENTIAL_PRICE/);
 assert.match(s,/automatic_tax\[enabled\]/);
 assert.doesNotMatch(s,/payment_method_types/);
});
test('live credentials and approved tax category guard every live checkout',()=>{
 const s=readFileSync('apps/platform/worker/features/residential-live-stripe.server.ts','utf8');
 assert.match(s,/prod_VWXmN5UFyCZhrC/);
 assert.match(s,/price_1UVUgqEynzcud8MVLxm1mGRn/);
 assert.match(s,/rk_live_/);
 assert.match(s,/RESIDENTIAL_APPROVED_TAX_CODE/);
 assert.match(s,/txcd_10203001/);
 assert.match(s,/verifyLiveResidentialTax/);
 assert.match(s,/RESIDENTIAL_LIVE_BILLING_ENABLED/);
});

test('disabling customer acquisition does not disable signed renewal webhooks or risk reconciliation',()=>{
 const credentials=readFileSync('apps/platform/worker/features/residential-live-stripe.server.ts','utf8');
 const finance=readFileSync('apps/platform/worker/features/finance.server.ts','utf8');
 const ledger=readFileSync('apps/platform/worker/features/stripe-billing.server.ts','utf8');
 assert.match(credentials,/New live residential signups remain disabled/);
 assert.match(credentials,/export function liveResidentialCredentialsReady/);
 assert.match(finance,/liveResidentialCredentialsReady\(env\)/);
 assert.doesNotMatch(ledger,/event\.livemode===live && \(!live \|\| env\.RESIDENTIAL_LIVE_BILLING_ENABLED/);
});

test('live checkout cannot silently migrate historical all-inclusive properties',()=>{
 const src=readFileSync('apps/platform/worker/features/stripe-billing.server.ts','utf8');
 assert.match(src,/RESIDENTIAL_PAID_ENROLLMENT_REQUIRED/);
 assert.match(src,/property\.sector==='residential' && !live/);
 assert.match(src,/Existing all-inclusive properties/i);
});

test('failed renewals have a controlled grace, but voids, uncollectible invoices and fraud holds do not',()=>{
 const code=readFileSync('packages/authorization/subscription-booking.ts','utf8');
 const billing=readFileSync('apps/platform/worker/features/stripe-billing.server.ts','utf8');
 assert.match(code,/failure_event\.event_type IN \('invoice\.payment_failed','invoice\.payment_action_required'\)/);
 assert.match(billing,/eventType==='invoice\.payment_action_required'/);
 assert.match(code,/stripe_subscription_risk_holds/);
});
test('re-adding a pending enrolled property can resume Checkout without migrating historical properties',()=>{
 const code=readFileSync('apps/platform/worker/services.server.ts','utf8');
 assert.match(code,/billingRequired: Boolean\(enrolled\)/);
 assert.match(code,/residential_paid_property_enrollments/);
});

test('an existing live subscriber can still access cancellation after the new-signup release is disabled',()=>{
 const source=readFileSync('apps/platform/worker/features/billing-accounts.server.ts','utf8');
 assert.match(source,/w\.kind==='landlord'&&accounts\.results\.some/);
 assert.match(source,/right to cancel even when new signups are paused/);
 assert.match(source,/subscription_cancel\?\.mode==='at_period_end'/);
 assert.match(source,/await clientAdmin\(env,user,w\)/);
});
