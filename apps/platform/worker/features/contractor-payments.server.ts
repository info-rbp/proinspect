import { z } from 'zod';
import { assert, statement, now, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { clientAdmin, clientMembership, propertyScope, operationsWrite, workOrderAccess } from '../../../../packages/authorization/server';
import { activity, recordId, reference, replay, receipt } from '../../../../packages/operations/core';

/**
 * Contractor payment decisions are deliberately separate from rent, bonds and
 * strata trust funds. Every payment has a real work order, a verified quote
 * approval, and an identified contractor. No automatic payouts or escrow.
 */
const MODEL = z.enum(['platform_collect', 'payer_direct']);
const amount = z.number().int().min(1).max(100_000_000);
const idempotencyKey = z.string().min(16).max(100);
const SANDBOX = 'acct_1USumhEv62nbUZok';
const referenceValue = reference;

type Plan = {
  id: string; work_order_id: string; client_id: string; property_id: string;
  contractor_id: string; mode: 'platform_collect' | 'payer_direct';
  status: string; version: number; gross_cents: number; platform_fee_cents: number;
  checkout_session_id: string | null; stripe_payment_intent_id: string | null;
  stripe_transfer_id: string | null; payer_approved_by: string | null;
  release_approved_by: string | null;
};

export function collectionsEnabled(env: Env): boolean {
  return env.APP_ENV !== 'production' && env.STRIPE_ACCOUNT_ID === SANDBOX &&
    env.CONTRACTOR_PAYMENTS_ENABLED === 'true' &&
    env.STRIPE_CONNECT_MARKETPLACE_APPROVED === 'true' &&
    env.STRIPE_CONNECT_COLLECTION_ENABLED === 'true' &&
    env.STRIPE_TAX_READY === 'true' &&
    /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? '');
}
export function transfersEnabled(env: Env): boolean {
  return collectionsEnabled(env) && env.STRIPE_CONNECT_TRANSFERS_ENABLED === 'true';
}
function allowedWorkspace(w: Workspace) {
  assert(['landlord', 'property-manager', 'commercial', 'staff'].includes(w.kind), 403,
    'PAYMENT_SCOPE_FORBIDDEN', 'Contractor payments require an authorised property or operations workspace.');
}
async function payer(env: Env, user: Principal, w: Workspace) {
  allowedWorkspace(w);
  assert(w.kind !== 'staff', 403, 'CUSTOMER_REQUIRED', 'Only a client administrator can authorise contractor expenditure.');
  await clientAdmin(env, user, w);
}
function staff(user: Principal, w: Workspace) {
  assert(w.kind === 'staff', 403, 'STAFF_REQUIRED', 'Operations staff access is required.');
  operationsWrite(user);
}
async function getPlan(env: Env, user: Principal, w: Workspace, id: string): Promise<Plan> {
  allowedWorkspace(w);
  const p = await statement(env.DB, 'SELECT * FROM contractor_payment_plans WHERE id=?', id).first<Plan>();
  assert(p, 404, 'CONTRACTOR_PAYMENT_NOT_FOUND', 'Contractor payment plan was not found.');
  if (w.kind === 'staff') {
    assert(user.staffRole !== 'inspector' && user.staffRole !== 'read_only', 403,
      'PAYMENT_FORBIDDEN', 'This staff role cannot access contractor finances.');
  } else {
    assert(p.client_id === w.scopeId, 404, 'CONTRACTOR_PAYMENT_NOT_FOUND', 'Payment is not part of this client account.');
    await workOrderAccess(env, user, w, p.work_order_id);
  }
  return p;
}
async function updateState(env: Env, plan: Plan, status: string, actor: string | null, extra: Record<string,string|number|null> = {}) {
  const fields = ['status=?','last_actor_id=?','updated_at=?','version=version+1',...Object.keys(extra).map(k=>`${k}=?`)];
  const bind: (string|number|null)[] = [status,actor,now(),...Object.values(extra),plan.id,plan.version,plan.status];
  const result = await statement(env.DB,`UPDATE contractor_payment_plans SET ${fields.join(',')} WHERE id=? AND version=? AND status=?`,...bind).run();
  assert(result.meta.changes===1,409,'PAYMENT_STATE_CHANGED','The payment was changed by another actor; reload and review.');
}
export async function listContractorPayments(env: Env, user: Principal, w: Workspace) {
  allowedWorkspace(w);
  if(w.kind==='staff') assert(user.staffRole!=='inspector'&&user.staffRole!=='read_only',403,'PAYMENT_FORBIDDEN','Staff finance role required.');
  else await clientMembership(env,user,w.scopeId);
  const scope = w.kind==='staff'?null:propertyScope(user,w);
  const result = await statement(env.DB,
    `SELECT p.*,c.name AS contractor_name,wo.title AS work_title,wo.status AS work_status,
      r.stripe_account_id AS recipient_account_id, r.status AS recipient_registration_status
     FROM contractor_payment_plans p
     JOIN contractors c ON c.id=p.contractor_id
     JOIN work_orders wo ON wo.id=p.work_order_id
     LEFT JOIN contractor_connect_recipients r ON r.contractor_id=p.contractor_id
     WHERE ${w.kind==='staff'?'1=1':`p.client_id=? AND EXISTS(SELECT 1 FROM properties prop WHERE prop.id=p.property_id AND (${scope!.sql}))`} ORDER BY p.created_at DESC LIMIT 150`,
    ...(w.kind==='staff'?[]:[w.scopeId,...scope!.values])).all();
  return {items:result.results,modeOptions:['payer_direct','platform_collect'],
    sandboxCollectionEnabled:collectionsEnabled(env),sandboxTransfersEnabled:transfersEnabled(env)};
}
export async function createContractorPayment(env: Env,user: Principal,w: Workspace,input: unknown) {
  allowedWorkspace(w);
  if(w.kind==='staff') staff(user,w); else await payer(env,user,w);
  const d=z.object({workOrderId:recordId,mode:MODEL,grossCents:amount,
    platformFeeCents:z.number().int().min(0).max(100_000_000).default(0),
    quoteReference:referenceValue,invoiceReference:referenceValue,requestKey:idempotencyKey}).parse(input);
  const original = await replay(env,user,'contractor-payment.create',d.requestKey,d);
  if(original.result) return {...original.result,replayed:true};
  assert(d.platformFeeCents<d.grossCents,422,'FEE_INVALID','Platform fee must be below approved payment total.');
  if(d.mode==='payer_direct') assert(d.platformFeeCents===0,422,'FEE_INVALID','No platform commission is collected from an external contractor payment.');
  const wo=await workOrderAccess(env,user,w,d.workOrderId);
  assert(wo.client_id&&wo.property_id&&!wo.scheme_id,409,'PROPERTY_WORK_ORDER_REQUIRED',
    'Contractor payment models require a property work order and commissioning client, not bond or strata custody.');
  assert(wo.contractor_id,409,'CONTRACTOR_REQUIRED','Assign an active contractor to this work order first.');
  assert(['approved','assigned','scheduled','in_progress','report_pending','completed'].includes(wo.status),409,
    'WORK_ORDER_NOT_APPROVED','The work order must have an approved scope.');
  const contractor = await statement(env.DB,'SELECT id FROM contractors WHERE id=? AND active=1',wo.contractor_id).first();
  assert(contractor,409,'CONTRACTOR_INACTIVE','The selected contractor is not active.');
  const approved=await statement(env.DB,
    "SELECT id,amount_cents,authority_reference FROM approvals WHERE work_order_id=? AND status='approved' AND decided_at IS NOT NULL AND amount_cents>=? ORDER BY decided_at DESC LIMIT 1",
    wo.id,d.grossCents).first<{id:string;amount_cents:number;authority_reference:string|null}>();
  assert(approved,409,'APPROVED_QUOTE_REQUIRED',
    'An authorised approval covering the full contractor amount is required.');
  const id=uid('cp'),time=now(),output={id,mode:d.mode,status:'draft'};
  await env.DB.batch([
    statement(env.DB,
      `INSERT INTO contractor_payment_plans(id,work_order_id,client_id,property_id,contractor_id,mode,gross_cents,platform_fee_cents,quote_reference,invoice_reference,approval_id,status,last_actor_id,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft',?,?,?)`,
      id,wo.id,wo.client_id,wo.property_id,wo.contractor_id,d.mode,d.grossCents,d.platformFeeCents,d.quoteReference,d.invoiceReference,approved.id,user.id,time,time),
    activity(env,user,'contractor.payment.created','contractor-payment',id,wo.property_id),
    receipt(env,user,'contractor-payment.create',d.requestKey,original.fingerprint,output),
  ]);
  return output;
}
export async function authoriseContractorPayment(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
  await payer(env,user,w);
  const d=z.object({authorityReference:referenceValue}).parse(input);
  const p=await getPlan(env,user,w,id);
  assert(p.status==='draft',409,'PAYMENT_NOT_DRAFT','This payment arrangement is no longer a draft.');
  await updateState(env,p,p.mode==='payer_direct'?'external_due':'awaiting_checkout',user.id,
    {payer_approved_by:user.id,payer_approved_at:now(),payer_authority_reference:d.authorityReference});
  return {id,status:p.mode==='payer_direct'?'external_due':'awaiting_checkout'};
}
export async function reportExternalPayment(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
  await payer(env,user,w);
  const d=z.object({paymentReference:referenceValue}).parse(input);
  const p=await getPlan(env,user,w,id);
  assert(p.mode==='payer_direct'&&p.status==='external_due',409,'DIRECT_PAYMENT_NOT_READY','Only authorised direct payments can be reported.');
  await updateState(env,p,'external_reported',user.id,
    {external_payment_reference:d.paymentReference,external_reported_by:user.id,external_reported_at:now()});
  return {id,status:'external_reported',verificationRequired:true};
}
export async function verifyExternalPayment(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
  staff(user,w);
  const d=z.object({verificationReference:referenceValue}).parse(input);
  const p=await getPlan(env,user,w,id);
  assert(p.mode==='payer_direct'&&p.status==='external_reported',409,'DIRECT_PAYMENT_NOT_REPORTED','There is no external payment awaiting review.');
  await updateState(env,p,'external_verified',user.id,
    {external_verification_reference:d.verificationReference,external_verified_by:user.id,external_verified_at:now()});
  return {id,status:'external_verified'};
}
export async function registerContractorRecipient(env:Env,user:Principal,w:Workspace,input:unknown) {
  staff(user,w);
  const d=z.object({contractorId:recordId,stripeAccountId:z.string().regex(/^acct_[A-Za-z0-9]+$/)}).parse(input);
  const contractor=await statement(env.DB,'SELECT id FROM contractors WHERE id=? AND active=1',d.contractorId).first();
  assert(contractor,404,'CONTRACTOR_NOT_FOUND','Select a registered active contractor.');
  // This is a reference only. No Stripe identity, bank destination or capability
  // can be self-certified: each transfer rechecks the live v2 recipient status.
  await statement(env.DB,`INSERT INTO contractor_connect_recipients(contractor_id,stripe_account_id,status,recorded_by,created_at,updated_at)
    VALUES(?,?,'pending',?,?,?) ON CONFLICT(contractor_id) DO UPDATE SET stripe_account_id=excluded.stripe_account_id,status='pending',recorded_by=excluded.recorded_by,updated_at=excluded.updated_at,identity_verification_reference=NULL,identity_verified_by=NULL,identity_verified_at=NULL`,
    d.contractorId,d.stripeAccountId,user.id,now(),now()).run();
  return {contractorId:d.contractorId,status:'pending',providerVerificationRequired:true};
}

/** Server-only sandbox API request. Never put API credentials into responses. */
async function stripeRequest(env:Env,path:string,method:'GET'|'POST',form?:URLSearchParams,key?:string) {
  assert(env.STRIPE_SECRET_KEY && /^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY) && env.STRIPE_ACCOUNT_ID===SANDBOX,
    503,'STRIPE_SANDBOX_REQUIRED','Sandbox payment credentials are not available.');
  const res=await fetch('https://api.stripe.com'+path,{method,headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,
    'Stripe-Version':'2026-08-26.dahlia',...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
    ...(key?{'Idempotency-Key':key}:{})},body:form,signal:AbortSignal.timeout(15000)});
  assert(res.ok,502,'STRIPE_PROVIDER_UNAVAILABLE','Stripe could not verify this financial instruction. No settlement has been confirmed.');
  return res.json() as Promise<Record<string,any>>;
}
export async function verifyContractorRecipient(env:Env,user:Principal,w:Workspace,input:unknown) {
  staff(user,w);
  const d=z.object({contractorId:recordId,identityVerificationReference:referenceValue}).parse(input);
  const row=await statement(env.DB,'SELECT * FROM contractor_connect_recipients WHERE contractor_id=?',d.contractorId)
    .first<{stripe_account_id:string;recorded_by:string;status:string}>();
  assert(row&&row.status==='pending',409,'RECIPIENT_NOT_PENDING','A Stripe recipient must first be linked by operations.');
  assert(row.recorded_by!==user.id,403,'INDEPENDENT_REVIEW_REQUIRED',
    'The reviewer must be different from the operator who linked this recipient.');
  const account=await stripeRequest(env,`/v2/core/accounts/${encodeURIComponent(row.stripe_account_id)}?include%5B%5D=configuration.recipient&include%5B%5D=identity`,'GET');
  const caps=account.configuration?.recipient?.capabilities?.stripe_balance;
  assert(account.id===row.stripe_account_id&&account.identity?.country==='AU'&&
    caps?.stripe_transfers?.status==='active'&&caps?.payouts?.status==='active',409,'RECIPIENT_NOT_VERIFIED',
    'Recipient verification and Stripe transfer/payout capabilities must be active.');
  // The reference identifies the independently reviewed legal-identity evidence.
  // No bank account numbers, KYC documents or personal identifiers are retained here.
  await statement(env.DB,`UPDATE contractor_connect_recipients SET status='verified',
    identity_verification_reference=?,identity_verified_by=?,identity_verified_at=?,updated_at=?
    WHERE contractor_id=? AND status='pending'`,d.identityVerificationReference,user.id,now(),now(),d.contractorId).run();
  return {contractorId:d.contractorId,status:'verified'};
}

export async function contractorCheckout(env:Env,user:Principal,w:Workspace,id:string) {
  await payer(env,user,w);
  const p=await getPlan(env,user,w,id);
  assert(p.mode==='platform_collect'&&['awaiting_checkout','checkout_open'].includes(p.status),409,
    'PLATFORM_PAYMENT_NOT_READY','The platform collection is not authorised.');
  assert(collectionsEnabled(env),503,'MARKETPLACE_NOT_APPROVED','Marketplace collection is disabled pending Stripe, legal and tax approval.');
  if(p.checkout_session_id) return {url:(await statement(env.DB,'SELECT checkout_url FROM contractor_payment_plans WHERE id=?',p.id).first<{checkout_url:string|null}>())?.checkout_url};
  const form=new URLSearchParams({mode:'payment',
    success_url:`${env.APP_ORIGIN}${w.href}/contractor-payments?checkout=returned`,
    cancel_url:`${env.APP_ORIGIN}${w.href}/contractor-payments?checkout=cancelled`,
    'line_items[0][price_data][currency]':'aud',
    'line_items[0][price_data][unit_amount]':String(p.gross_cents),
    'line_items[0][price_data][product_data][name]':'Approved contractor work order '+p.work_order_id,
    'line_items[0][quantity]':'1',
    'metadata[contractor_plan_id]':p.id,'metadata[client_id]':p.client_id,
    'payment_intent_data[transfer_group]':p.id,
    'payment_intent_data[metadata][contractor_plan_id]':p.id,
    client_reference_id:p.id,
    integration_identifier:'proinspect_contractor_audlxrqs'});
  // Deliberately NO automatic transfer, destination, application_fee_amount or second tax calculation.
  const session=await stripeRequest(env,'/v1/checkout/sessions','POST',form,'proinspect-contractor-checkout-'+p.id);
  assert(typeof session.id==='string'&&session.id.startsWith('cs_test_')&&session.mode==='payment'&&session.livemode===false&&
    typeof session.url==='string'&&session.url.startsWith('https://checkout.stripe.com/'),502,
    'STRIPE_SESSION_INVALID','Stripe returned an unexpected checkout session.');
  await updateState(env,p,'checkout_open',user.id,{checkout_session_id:session.id,checkout_url:session.url});
  return {url:session.url};
}

/** Called only after finance.stripeWebhook has verified the Stripe signature. */
export async function contractorCheckoutEvent(env:Env,event:Record<string,any>) {
  const s=event.data?.object;
  const planId=s?.metadata?.contractor_plan_id;
  if(!planId)return null;
  assert(env.APP_ENV!=='production'&&event.livemode===false&&env.STRIPE_ACCOUNT_ID===SANDBOX,400,
    'LIVE_EVENT_FORBIDDEN','This payment event is not for the sandbox.');
  assert(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed'].includes(event.type),400,
    'EVENT_NOT_SUPPORTED','This contractor checkout event is unsupported.');
  const p=await statement(env.DB,'SELECT * FROM contractor_payment_plans WHERE id=?',String(planId)).first<Plan>();
  assert(p&&p.mode==='platform_collect'&&p.checkout_session_id===s.id&&p.client_id===s.metadata.client_id&&
    s.mode==='payment'&&s.currency==='aud'&&s.amount_total===p.gross_cents,409,
    'CONTRACTOR_PAYMENT_MISMATCH','The provider amount or identity does not match the approved contractor plan.');
  if(await statement(env.DB,'SELECT event_id FROM contractor_connect_webhook_receipts WHERE event_id=?',String(event.id)).first())return {received:true,replayed:true};
  const paid=event.type!=='checkout.session.async_payment_failed'&&s.payment_status==='paid';
  const status=paid?'funded':event.type==='checkout.session.async_payment_failed'&&p.status!=='funded'?'failed':p.status;
  assert(['checkout_open','funded','failed'].includes(p.status),409,'CONTRACTOR_PAYMENT_STATE','This payment requires manual reconciliation.');
  const change=status!==p.status;
  await env.DB.batch([
    statement(env.DB,`INSERT INTO contractor_connect_webhook_receipts(event_id,source,event_type,stripe_object_id,created_at)
       VALUES(?,'checkout',?,?,?)`,String(event.id),String(event.type),s.id,now()),
    ...(change?[statement(env.DB,`UPDATE contractor_payment_plans SET status=?,stripe_payment_intent_id=COALESCE(?,stripe_payment_intent_id),last_actor_id=NULL,updated_at=?,version=version+1 WHERE id=? AND status=?`,
      status,typeof s.payment_intent==='string'?s.payment_intent:null,now(),p.id,p.status)]:[])
  ]);
  return {received:true,paid,settlement:'contractor',replayed:false};
}

export async function approveContractorRelease(env:Env,user:Principal,w:Workspace,id:string,input:unknown) {
  await payer(env,user,w);
  const d=z.object({completionReference:referenceValue}).parse(input),p=await getPlan(env,user,w,id);
  assert(p.mode==='platform_collect'&&p.status==='funded',409,'PAYMENT_NOT_SETTLED','Only verified funded contractor payments can be released.');
  const order=await workOrderAccess(env,user,w,p.work_order_id);
  assert(order.status==='completed',409,'WORK_NOT_COMPLETED','Complete and verify the work order before authorising release.');
  await updateState(env,p,'release_approved',user.id,
    {release_approved_by:user.id,release_approved_at:now(),completion_reference:d.completionReference});
  return {id,status:'release_approved',staffVerificationRequired:true};
}

/**
 * A non-repeatable, operations-only transfer instruction. Network uncertainty
 * leaves transfer_initiated for manual reconciliation; never auto-retry or send
 * another transfer for the same work order.
 */
export async function executeContractorTransfer(env:Env,user:Principal,w:Workspace,id:string) {
  staff(user,w);
  const p=await getPlan(env,user,w,id);
  assert(p.mode==='platform_collect'&&p.status==='release_approved'&&p.release_approved_by&&p.release_approved_by!==user.id,
    409,'RELEASE_APPROVAL_REQUIRED','Independent client approval is required.');
  assert(transfersEnabled(env),503,'STRIPE_TRANSFERS_DISABLED','Connect transfers are disabled pending provider and compliance approval.');
  const recipient=await statement(env.DB,'SELECT stripe_account_id FROM contractor_connect_recipients WHERE contractor_id=? AND status=? AND identity_verified_by IS NOT NULL',
    p.contractor_id,'verified').first<{stripe_account_id:string}>();
  assert(recipient,409,'RECIPIENT_NOT_REGISTERED','Connect recipient onboarding must be completed first.');
  // Check the actual v2 capability every time, never infer it from a stored ID.
  const account=await stripeRequest(env,`/v2/core/accounts/${encodeURIComponent(recipient.stripe_account_id)}?include%5B%5D=configuration.recipient&include%5B%5D=defaults&include%5B%5D=identity`,'GET');
  const capability=account.configuration?.recipient?.capabilities?.stripe_balance;
  assert(account.id===recipient.stripe_account_id && account.identity?.country==='AU' &&
    capability?.stripe_transfers?.status==='active' && capability?.payouts?.status==='active',
    409,'RECIPIENT_NOT_VERIFIED','Stripe recipient transfer and payout capabilities are not active.');
  assert(p.stripe_payment_intent_id,409,'PAYMENT_INTENT_REQUIRED','The collected charge must be reconciled first.');
  const pi=await stripeRequest(env,`/v1/payment_intents/${encodeURIComponent(p.stripe_payment_intent_id)}?expand%5B%5D=latest_charge`,'GET');
  const chargeId=typeof pi.latest_charge==='string'?pi.latest_charge:pi.latest_charge?.id;
  const charge=typeof pi.latest_charge==='object' ? pi.latest_charge : null;
  assert(pi.status==='succeeded'&&pi.currency==='aud'&&pi.amount_received===p.gross_cents&&pi.transfer_group===p.id&&
    pi.metadata?.contractor_plan_id===p.id&&typeof chargeId==='string'&&chargeId.startsWith('ch_')&&
    charge?.status==='succeeded'&&charge?.paid===true&&charge?.refunded===false&&
    charge?.disputed===false&&charge?.amount_refunded===0&&charge?.amount===p.gross_cents,
    409,'PAYMENT_UNRECONCILED','The paid charge, amount and refund/dispute state must match before transfer.');
  const net=p.gross_cents-p.platform_fee_cents;
  // Reserve the one-and-only execution attempt before the external call.
  await updateState(env,p,'transfer_initiated',user.id,{transfer_initiated_by:user.id,transfer_initiated_at:now(),
    recipient_account_id:recipient.stripe_account_id,stripe_charge_id:chargeId});
  const transfer=await stripeRequest(env,'/v1/transfers','POST',new URLSearchParams({
    amount:String(net),currency:'aud',destination:recipient.stripe_account_id,source_transaction:chargeId,
    transfer_group:p.id,'metadata[contractor_plan_id]':p.id,
  }),'proinspect-one-transfer-'+p.id);
  assert(typeof transfer.id==='string'&&transfer.id.startsWith('tr_')&&transfer.amount===net&&
    transfer.destination===recipient.stripe_account_id,502,'TRANSFER_RECONCILIATION_REQUIRED',
    'The transfer must be reconciled with Stripe before any further action.');
  const latest=await statement(env.DB,'SELECT * FROM contractor_payment_plans WHERE id=?',p.id).first<Plan>();
  assert(latest?.status==='transfer_initiated',409,'TRANSFER_RECONCILIATION_REQUIRED','Transfer was submitted; manual reconciliation is required.');
  await updateState(env,latest,'transfer_created',user.id,{stripe_transfer_id:transfer.id});
  return {id,status:'transfer_created',transferId:transfer.id,bankPayoutConfirmed:false};
}

async function signatureValid(secret:string,t:number,raw:string,provided:string) {
  if(!/^[0-9a-f]{64}$/.test(provided))return false;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const bytes=new Uint8Array((provided.match(/../g)??[]).map(s=>parseInt(s,16)));
  return crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(`${t}.${raw}`));
}
/** Isolated Connect webhooks: never reuse the service Checkout signing secret. */
export async function contractorConnectWebhook(env:Env,request:Request,source:'platform'|'recipients') {
  const secret=source==='platform'?env.STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET:env.STRIPE_CONNECT_RECIPIENT_WEBHOOK_SECRET;
  assert(env.APP_ENV!=='production'&&env.STRIPE_ACCOUNT_ID===SANDBOX&&secret,
    503,'CONNECT_WEBHOOK_DISABLED','Connect webhook processing has not been activated.');
  const raw=await request.text();
  assert(raw.length<=65536,413,'PAYLOAD_TOO_LARGE','Stripe event payload too large.');
  const parts=(request.headers.get('stripe-signature')??'').split(',');
  const stamps=parts.filter(s=>s.startsWith('t=')),signatures=parts.filter(s=>s.startsWith('v1='));
  const timestamp=Number(stamps[0]?.slice(2));
  assert(stamps.length===1&&Number.isInteger(timestamp)&&Math.abs(Date.now()/1000-timestamp)<=300,
    400,'SIGNATURE_INVALID','Invalid webhook timestamp.');
  let verified=false;
  for(const sig of signatures)if(await signatureValid(secret, timestamp,raw,sig.slice(3)))verified=true;
  assert(verified,400,'SIGNATURE_INVALID','Webhook signature was not verified.');
  const event=JSON.parse(raw) as {id:string;type:string;livemode:boolean;account?:string;data?:{object?:Record<string,any>}};
  assert(typeof event.id==='string'&&event.livemode===false&&typeof event.type==='string',
    400,'LIVE_EVENT_FORBIDDEN','Only sandbox events can be recorded.');
  const object=event.data?.object??{};
  if(await statement(env.DB,'SELECT event_id FROM contractor_connect_webhook_receipts WHERE event_id=?',event.id).first())
    return {received:true,replayed:true};
  const allowed = source==='platform'
    ? ['transfer.created','transfer.updated','transfer.reversed','payment_intent.succeeded','payment_intent.payment_failed',
       'charge.refunded','charge.dispute.created','charge.dispute.closed','payout.created','payout.paid','payout.failed']
    : ['account.updated','capability.updated','account.external_account.updated','payout.created','payout.updated','payout.paid','payout.failed','payout.canceled'];
  assert(allowed.includes(event.type),422,'CONNECT_EVENT_UNSUPPORTED','Unexpected Connect event.');
  let plan:Plan|null=null;
  if(source==='platform') {
    if(event.type.startsWith('transfer.')) {
      plan=await statement(env.DB,'SELECT * FROM contractor_payment_plans WHERE stripe_transfer_id=? OR (status=? AND id=?)',
        String(object.id??''),'transfer_initiated',String(object.metadata?.contractor_plan_id??'')).first<Plan>();
      if(plan)assert(object.destination === (await statement(env.DB,'SELECT recipient_account_id FROM contractor_payment_plans WHERE id=?',plan.id).first<{recipient_account_id:string|null}>())?.recipient_account_id,
        409,'TRANSFER_DESTINATION_MISMATCH','Transfer event destination differs from approved recipient.');
    } else if(event.type.startsWith('charge.')) {
      // Refunds can occur BEFORE a transfer is requested and before stripe_charge_id
      // was stored. Match the underlying PaymentIntent, never only the charge.
      const chargeId=event.type.startsWith('charge.dispute.')?object.charge:object.id;
      let paymentIntent=typeof object.payment_intent==='string'?object.payment_intent:null;
      if(!paymentIntent && event.type.startsWith('charge.dispute.') &&
        typeof chargeId==='string' && chargeId.startsWith('ch_')) {
        const origin=await stripeRequest(env,`/v1/charges/${encodeURIComponent(chargeId)}`,'GET');
        paymentIntent=typeof origin.payment_intent==='string'?origin.payment_intent:null;
      }
      plan=await statement(env.DB,
        'SELECT * FROM contractor_payment_plans WHERE stripe_charge_id=? OR stripe_payment_intent_id=?',
        String(chargeId??''),String(paymentIntent??'')).first<Plan>();
    }
  }
  const change=plan&&['transfer.reversed','charge.refunded','charge.dispute.created'].includes(event.type)&&
    ['transfer_created','transfer_initiated','funded','release_approved'].includes(plan.status);
  await env.DB.batch([
    statement(env.DB,'INSERT INTO contractor_connect_webhook_receipts(event_id,source,event_type,stripe_object_id,created_at) VALUES(?,?,?,?,?)',
      event.id,source,event.type,String(object.id??''),now()),
    ...(change?[statement(env.DB,"UPDATE contractor_payment_plans SET status='transfer_review',last_actor_id=NULL,version=version+1,updated_at=? WHERE id=? AND status=?",
      now(),plan!.id,plan!.status)]:[])
  ]);
  return {received:true,flaggedForReview:Boolean(change)};
}