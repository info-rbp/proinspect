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
 const taxOrPriceRead=!form&&(
   /^\/tax\/(?:settings|registrations)$/.test(path) ||
   /^\/prices\/price_[A-Za-z0-9_]+$/.test(path) ||
   /^\/products\/prod_[A-Za-z0-9_]+$/.test(path));
 assert(portalRead||taxOrPriceRead||/^\/(?:account|checkout\/sessions|customers|invoices|invoiceitems|refunds|payment_intents|charges|billing_portal\/sessions)(?:\/[A-Za-z0-9_]+)*$/.test(path),500,'PROVIDER_PATH','Unapproved Stripe operation.');
 const response=await fetch('https://api.stripe.com/v1'+path,{method:form?'POST':'GET',headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':STRIPE_API_VERSION,...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:form,signal:AbortSignal.timeout(15000)});
 assert(response.ok,502,'STRIPE_OPERATION_FAILED','Stripe did not complete this operation. Retry safely; settlement is not assumed.');
 return await response.json() as Record<string,any>;
}

/** Resolve invoice payments through the 2025-03-31.basil+ Stripe object graph.
 * A PaymentIntent can pay multiple invoices: paginate, never pick the first.
 */
export async function paidInvoiceIdsForPaymentIntent(env:Env,paymentIntentId:string):Promise<string[]>{
 sandboxConfiguration(env);
 assert(/^pi_[A-Za-z0-9_]+$/.test(paymentIntentId),422,'PAYMENT_INTENT_INVALID','Invalid provider payment identity.');
 const result:string[]=[];let cursor:string|null=null;
 for(let page=0;page<10;page++){
  const query=new URLSearchParams({status:'paid',limit:'100','payment[type]':'payment_intent',
   'payment[payment_intent]':paymentIntentId});
  if(cursor)query.set('starting_after',cursor);
  const response=await fetch('https://api.stripe.com/v1/invoice_payments?'+query.toString(),{
   headers:{Authorization:'Bearer '+env.STRIPE_SECRET_KEY,'Stripe-Version':STRIPE_API_VERSION},
   signal:AbortSignal.timeout(15000)
  });
  assert(response.ok,502,'INVOICE_PAYMENT_LOOKUP_FAILED','Unable to verify payment-to-invoice ownership.');
  const list=await response.json() as {data?:Array<Record<string,any>>;has_more?:boolean};
  assert(Array.isArray(list.data),502,'INVOICE_PAYMENT_LIST_INVALID','Invalid provider invoice payment response.');
  for(const item of list.data){
   const invoiceId=typeof item.invoice==='string'?item.invoice:item.invoice?.id;
   if(item.status==='paid'&&item.payment?.type==='payment_intent' &&
      item.payment?.payment_intent===paymentIntentId &&
      typeof invoiceId==='string'&&/^in_[A-Za-z0-9_]+$/.test(invoiceId))result.push(invoiceId);
  }
  if(!list.has_more)return [...new Set(result)];
  cursor=list.data.at(-1)?.id??null;
  assert(cursor&&/^inpay_[A-Za-z0-9_]+$/.test(cursor),502,'INVOICE_PAYMENT_PAGINATION','Invalid invoice payment page cursor.');
 }
 assert(false,503,'INVOICE_PAYMENT_PAGES_EXCEEDED','Invoice payment resolution requires manual reconciliation.');
}
