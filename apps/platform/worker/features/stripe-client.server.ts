import {assert,type Env} from '../../../../packages/database/types';
import {isSandboxApiKey,isStripeWebhookSecret,STRIPE_SANDBOX_ACCOUNT} from '../../../../packages/finance/stripe-sandbox-policy';
export const SANDBOX_ACCOUNT=STRIPE_SANDBOX_ACCOUNT;
export const STRIPE_API_VERSION='2026-08-26.dahlia';
export function sandboxConfiguration(env:Env){
 assert(['local','staging'].includes(env.APP_ENV)&&env.STRIPE_ACCOUNT_ID===SANDBOX_ACCOUNT,503,'SANDBOX_ONLY','This adapter is restricted to the approved sandbox.');
 assert(isSandboxApiKey(env.STRIPE_SECRET_KEY)&&isStripeWebhookSecret(env.STRIPE_WEBHOOK_SECRET),503,'SANDBOX_CREDENTIALS_REQUIRED','Install a restricted sandbox key and webhook signing secret securely.');
}
/** Confirm the key's first-class account, rather than trusting a copied setting. Never return secrets. */
export async function verifySandboxAccount(env:Env){
 sandboxConfiguration(env);
 const response=await fetch('https://api.stripe.com/v1/account',{headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':STRIPE_API_VERSION},signal:AbortSignal.timeout(10000)});
 assert(response.ok,503,'STRIPE_IDENTITY_UNVERIFIED','The Stripe account identity could not be verified.');
 const account=await response.json() as {id?:string};
 assert(account.id===SANDBOX_ACCOUNT,503,'STRIPE_IDENTITY_MISMATCH','The supplied credential belongs to a different account.');
}
export function integrationIdentifier(id:string){return 'proinspect-'+Array.from(id.replace(/[^a-f0-9]/g,'').slice(0,8),c=>'abcdefghijklmnop'[parseInt(c,16)]).join('').padEnd(8,'a');}
export async function stripeApi(env:Env,path:string,form?:URLSearchParams,idempotencyKey?:string):Promise<Record<string,any>>{
 sandboxConfiguration(env);
 const portalRead=!form&&/^\/billing_portal\/configurations\/bpc_[A-Za-z0-9_]+$/.test(path);
 assert(portalRead||/^\/(?:account|checkout\/sessions|customers|invoices|invoiceitems|refunds|payment_intents|charges|billing_portal\/sessions)(?:\/[A-Za-z0-9_]+)*$/.test(path),500,'PROVIDER_PATH','Unapproved Stripe operation.');
 const response=await fetch('https://api.stripe.com/v1'+path,{method:form?'POST':'GET',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':STRIPE_API_VERSION,...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:form,signal:AbortSignal.timeout(15000)});
 assert(response.ok,502,'STRIPE_OPERATION_FAILED','Stripe did not complete this operation. Retry safely; settlement is not assumed.');
 return await response.json() as Record<string,any>;
}
