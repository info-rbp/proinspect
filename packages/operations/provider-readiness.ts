import {isSandboxApiKey,isStripeWebhookSecret,isBillingPortalConfigurationId} from '../finance/stripe-sandbox-policy.ts';
/** Administrator-only configuration inventory. Presence is not provider acceptance.
 * Never return binding values, URLs, credentials, tokens or test identities.
 */
export interface ProviderReadiness {
 provider:string;state:'configuration_missing'|'acceptance_required'|'sandbox_only'|'adapter_not_connected';
 missing:string[];invalid:string[];note:string;
}
export function providerReadiness(env:Record<string,unknown>):ProviderReadiness[]{
 const present=(name:string)=>typeof env[name]==='string'&&String(env[name]).trim().length>0;
 const check=(provider:string,names:string[],note:string):ProviderReadiness=>{
  const missing=names.filter(n=>!present(n));return {provider,state:missing.length?'configuration_missing':'acceptance_required',missing,invalid:[],note};
 };
 const stripe=check('Stripe sandbox',['STRIPE_ACCOUNT_ID','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET'],'Account identity, signed hosted events and financial reconciliation must be tested. Tax flags do not establish GST acceptance.');
 if(present('STRIPE_ACCOUNT_ID')&&env.STRIPE_ACCOUNT_ID!=='acct_1USumhEv62nbUZok')stripe.invalid.push('STRIPE_ACCOUNT_ID');
 if(present('STRIPE_SECRET_KEY')&&!isSandboxApiKey(env.STRIPE_SECRET_KEY))stripe.invalid.push('STRIPE_SECRET_KEY');
 if(present('STRIPE_WEBHOOK_SECRET')&&!isStripeWebhookSecret(env.STRIPE_WEBHOOK_SECRET))stripe.invalid.push('STRIPE_WEBHOOK_SECRET');
 if(stripe.invalid.length)stripe.state='configuration_missing';
 if(env.APP_ENV==='production'){stripe.state='sandbox_only';stripe.note='The new billing adapter intentionally refuses production execution. A reviewed production policy and live acceptance are still required.';}
 const portal=check('Stripe billing portal',['STRIPE_BILLING_PORTAL_CONFIGURATION_ID'],'A pinned sandbox configuration must be fetched and checked before every portal session. Only invoice history and payment-method updates are allowed; configuration is not provider acceptance.');
 if(present('STRIPE_BILLING_PORTAL_CONFIGURATION_ID')&&!isBillingPortalConfigurationId(env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID)){portal.invalid.push('STRIPE_BILLING_PORTAL_CONFIGURATION_ID');portal.state='configuration_missing';}
 if(env.APP_ENV==='production')portal.state='sandbox_only';
 const email=check('Transactional email',['RESEND_API_KEY','EMAIL_FROM'],'Verify real recipient delivery, bounces, retries and private-link handling; provider acceptance is not inbox delivery.');
 if(env.EMAIL_PROVIDER!=='resend'){email.invalid.push('EMAIL_PROVIDER');email.state='configuration_missing';}
 const scanner=check('Rental document scanner',['RENTAL_SCANNER_ENDPOINT','RENTAL_SCANNER_ALLOWED_HOST','RENTAL_SCANNER_OUTBOUND_SECRET','RENTAL_SCANNER_WEBHOOK_SECRET'],'Test signed verdicts and ensure unavailable or rejected scanning never releases a quarantined file.');
 const handoff=check('Rental agency handoff',['RENTAL_APPS_SCRIPT_ENDPOINT','RENTAL_APPS_SCRIPT_ALLOWED_HOST','RENTAL_APPS_SCRIPT_SECRET'],'Verify agency authority, recipient binding, idempotent acknowledgement and revocation.');
 for(const [item,prefix] of [[scanner,'RENTAL_SCANNER'],[handoff,'RENTAL_APPS_SCRIPT']] as const){
  if(present(prefix+'_ENDPOINT'))try{const u=new URL(String(env[prefix+'_ENDPOINT']));if(u.protocol!=='https:'||u.username||u.password||u.hostname!==env[prefix+'_ALLOWED_HOST'])throw Error();}catch{item.invalid.push(prefix+'_ENDPOINT');item.state='configuration_missing';}
 }
 return [stripe,portal,email,
  check('Turnstile',['TURNSTILE_SITE_KEY','TURNSTILE_SECRET_KEY'],'A configured widget still needs real action/hostname validation and replay rejection; no bypass or synthetic hosted sessions.'),
  check('Google Calendar',['GOOGLE_CALENDAR_SERVICE_ACCOUNT_EMAIL','GOOGLE_CALENDAR_PRIVATE_KEY','GOOGLE_CALENDAR_ID','GOOGLE_CALENDAR_TIMEZONE'],'Read-only connectivity does not prove event write, reschedule, cancellation or conflict acceptance.'),
  scanner,handoff,
  check('Property Report Tool v2',['REPORT_TOOL_V2_ORIGIN','REPORT_TOOL_V2_HANDOFF_KEY','REPORT_TOOL_V2_INGEST_TOKEN'],'The legacy report secrets do not configure v2. Verify paired handoff, large-PDF review and expiry/revocation.'),
  {provider:'Official tenancy agreement signing',state:'adapter_not_connected',missing:[],invalid:[],note:'The DocuSign adapter creates sandbox drafts only. Approved official bytes, field mapping, provider execution and independently reviewed signed-copy evidence remain required.'}
 ];
}
