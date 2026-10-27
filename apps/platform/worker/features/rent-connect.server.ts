import {assert,now,statement,uid,type Env} from '../../../../packages/database/types';
import type {Principal,Workspace} from '../../../../packages/domain/index';
import {sandboxConnectEnabled,eligibleSelfManagedRoute} from '../../../../packages/finance/connect-policy';
import {verifySandboxAccount,STRIPE_API_VERSION} from './stripe-client.server';
import {tenancyAccess} from './tenancies.server';

async function permitted(env:Env,user:Principal,w:Workspace,planId:string){
 assert(sandboxConnectEnabled(env),503,'CONNECT_DISABLED','Stripe Connect onboarding is restricted to an approved staging sandbox.');
 const p=await statement(env.DB,`SELECT p.*,t.status AS tenancy_status FROM rent_route_plans p JOIN tenancies t ON t.id=p.tenancy_id WHERE p.id=?`,planId).first<Record<string,string>>();
 assert(p,404,'CONNECT_PLAN_MISSING','The rent plan was not found.');
 await tenancyAccess(env,user,w,p.tenancy_id,true);
 assert(eligibleSelfManagedRoute(p.manager_mode,p.route,w.kind,w.role),403,'CONNECT_OWNER_REQUIRED','Only the current self-managing landlord may onboard.');
 assert(p.tenancy_status==='active',409,'CONNECT_INACTIVE','The tenancy is not active.');
 const newest=await statement(env.DB,'SELECT id FROM rent_route_plans WHERE tenancy_id=? ORDER BY created_at DESC,id DESC LIMIT 1',p.tenancy_id).first<{id:string}>();
 assert(newest?.id===planId,409,'CONNECT_STALE_PLAN','A newer rent plan exists.');
 return p;
}
async function stripe(env:Env,path:string,form:URLSearchParams,idempotencyKey:string){
 const result=await fetch('https://api.stripe.com/v1/'+path,{method:'POST',headers:{
  Authorization:'Bearer '+env.STRIPE_SECRET_KEY!,'Content-Type':'application/x-www-form-urlencoded',
  'Idempotency-Key':idempotencyKey,'Stripe-Version':STRIPE_API_VERSION
 },body:form.toString(),signal:AbortSignal.timeout(15000)});
 assert(result.ok,502,'CONNECT_SANDBOX_PROVIDER_FAILED','Sandbox onboarding is temporarily unavailable.');
 return await result.json() as Record<string,unknown>;
}
export async function connectSummary(env:Env,user:Principal,w:Workspace,planId:string){
 await permitted(env,user,w,planId);
 const row=await statement(env.DB,'SELECT status FROM rent_connect_sandbox_accounts WHERE plan_id=?',planId).first<{status:string}>();
 return {planId,environment:'sandbox',accountStatus:row?.status??'not_started',moneyCollectionEnabled:false,disbursementEnabled:false,rentApproved:false};
}
export async function connectOnboard(env:Env,user:Principal,w:Workspace,planId:string){
 await permitted(env,user,w,planId);
 await verifySandboxAccount(env);
 let row=await statement(env.DB,'SELECT account_id FROM rent_connect_sandbox_accounts WHERE plan_id=?',planId).first<{account_id:string}>();
 if(!row){
  const form=new URLSearchParams({type:'express',country:'AU',
   'capabilities[card_payments][requested]':'true','capabilities[transfers][requested]':'true',
   'metadata[proinspect_plan_id]':planId,'metadata[purpose]':'sandbox_landlord_onboarding_only'});
  const acct=await stripe(env,'accounts',form,'proinspect-rent-connect:'+planId);
  assert(typeof acct.id==='string'&&acct.id.startsWith('acct_'),502,'CONNECT_PROVIDER_INVALID','Unexpected provider response.');
  await statement(env.DB,`INSERT INTO rent_connect_sandbox_accounts(id,plan_id,account_id,environment,created_by,created_at,updated_at)
    VALUES(?,?,?,'sandbox',?,?,?) ON CONFLICT(plan_id) DO NOTHING`,
   uid('rentconnect'),planId,acct.id,user.id,now(),now()).run();
  row=await statement(env.DB,'SELECT account_id FROM rent_connect_sandbox_accounts WHERE plan_id=?',planId).first<{account_id:string}>();
 }
 assert(row,503,'CONNECT_ACCOUNT_PENDING','Connected account is pending.');
 const origin=new URL(env.APP_ORIGIN);
 assert(origin.protocol==='https:',503,'CONNECT_SECURE_ORIGIN','Only HTTPS staging return paths are accepted.');
 const destination=new URL(w.href+'/tenancies',origin);
 destination.searchParams.set('connect','returned');
 const refresh=new URL(w.href+'/tenancies',origin);refresh.searchParams.set('connect','refresh');
 const link=await stripe(env,'account_links',new URLSearchParams({account:row.account_id,type:'account_onboarding',
  return_url:destination.toString(),refresh_url:refresh.toString()}),
  'proinspect-rent-connect-link:'+planId+':'+crypto.randomUUID());
 assert(typeof link.url==='string'&&link.url.startsWith('https://connect.stripe.com/'),502,'CONNECT_LINK_INVALID','Provider link was invalid.');
 return {onboardingUrl:link.url,environment:'sandbox',rentApproved:false,moneyCollectionEnabled:false};
}
