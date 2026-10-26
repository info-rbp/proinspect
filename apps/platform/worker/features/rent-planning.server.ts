import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { activity, isoDate, recordId, reference, replay, receipt } from '../../../../packages/operations/core';
import { tenancyAccess } from './tenancies.server';
import {
 RENT_ROUTE_POLICY_VERSION, rentRouteAllowed, rentRouteDescription,
 type ManagerMode, type RentRoute,
} from '../../../../packages/finance/rent-routing';

const money = z.number().int().positive().max(100000000);
const route = z.enum(['agency_trust_external','landlord_direct_external','landlord_connect_candidate']);
const proposalSchema = z.object({route, amountCents:money,
 frequency:z.enum(['weekly','fortnightly','monthly']), requestKey:recordId});
const externalSchema = z.object({kind:z.enum(['rent_received_external','owner_disbursement_external']),
 amountCents:money, source:z.enum(['agency_trust_statement','landlord_bank_statement','approved_external_ledger']),
 externalReference:reference.max(160),effectiveAt:isoDate,requestKey:recordId});
const reviewSchema=z.object({evidenceKind:z.enum(['official_trust_ledger','bank_statement','accounting_reconciliation']),
 externalEvidenceReference:reference.max(160),requestKey:recordId});
function enabled(env:Env){
 assert(env.RENT_PAYMENT_PLANNING_ENABLED==='true',503,'RENT_PLANNING_DISABLED',
  'Rent routing remains in controlled planning until the financial and legal release gates are approved.');
}
async function scope(env:Env,user:Principal,w:Workspace,tenancyId:string,write=false){
 enabled(env);
 assert(['staff','landlord','property-manager','tenant'].includes(w.kind),403,'RENT_WORKSPACE','This portal cannot access residential rent records.');
 const t=await tenancyAccess(env,user,w,tenancyId,write);
 const property=await statement(env.DB,"SELECT sector FROM properties WHERE id=?",t.property_id).first<{sector:string}>();
 assert(property?.sector==='residential',403,'RENT_RESIDENTIAL_ONLY','Residential tenancy only.');
 const management=await statement(env.DB,
  "SELECT mode FROM property_management_relationships WHERE property_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) ORDER BY starts_at DESC LIMIT 1",
  t.property_id,now(),now()).first<{mode:string}>();
 const mode:ManagerMode|null=management?.mode==='agency_managed'?'agency_managed':management?.mode==='self_managed'?'self_managed':null;
 return {t,mode};
}
async function planAccess(env:Env,user:Principal,w:Workspace,id:string,write=false){
 const p=await statement(env.DB,'SELECT * FROM rent_route_plans WHERE id=?',id).first<Record<string,any>>();
 assert(p,404,'RENT_PLAN_NOT_FOUND','Rent plan not found.');
 const scoped=await scope(env,user,w,p.tenancy_id,write);
 assert(scoped.t.property_id===p.property_id,409,'RENT_SCOPE_CHANGED','Plan no longer matches its property.');
 return {...scoped,plan:p};
}
function proposalAuthor(user:Principal,w:Workspace,mode:ManagerMode|null){
 assert((mode==='self_managed'&&w.kind==='landlord')||(mode==='agency_managed'&&w.kind==='property-manager'),
  403,'RENT_MANAGER_AUTHORITY','Only the currently responsible landlord or agency may prepare this rent route.');
 assert(w.role!=='viewer',403,'RENT_READ_ONLY','Viewing access cannot prepare rent instructions.');
}
export async function rentPlanData(env:Env,user:Principal,w:Workspace,tenancyId:string){
 const {t,mode}=await scope(env,user,w,tenancyId);
 const plans=(await statement(env.DB,'SELECT id,tenancy_id,manager_mode,route,currency,amount_cents,frequency,status,policy_version,created_at FROM rent_route_plans WHERE tenancy_id=? ORDER BY created_at DESC,id DESC LIMIT 20',tenancyId).all<Record<string,any>>()).results;
 const current=plans[0]??null;
 let entries:any[]=[];
 if(current){
  const rows=(await statement(env.DB,`SELECT e.id,e.kind,e.amount_cents,e.effective_at,e.source,e.external_reference,e.created_at,
     v.id AS verified_id,v.reviewed_at,v.evidence_kind FROM rent_external_money_records e
     LEFT JOIN rent_external_verifications v ON v.record_id=e.id WHERE e.plan_id=? ORDER BY e.created_at DESC LIMIT 100`,current.id).all<Record<string,any>>()).results;
  entries=rows.map(r=>({id:r.id,kind:r.kind,amountCents:r.amount_cents,effectiveAt:r.effective_at,
   verified:Boolean(r.verified_id),reviewedAt:r.reviewed_at,
   ...(w.kind==='tenant'?{}:{source:r.source,externalReference:r.external_reference,evidenceKind:r.evidence_kind})}));
 }
 return {tenancyId:t.id,mode,plans:plans.map(p=>({...p,description:rentRouteDescription(p.route as RentRoute)})),
  entries, moneyMovementEnabled:false, stripeConnectEnabled:false,
  disclaimer:'ProInspect does not collect rent, hold trust money or disburse funds in this module.'};
}
export async function createRentPlan(env:Env,user:Principal,w:Workspace,tenancyId:string,input:unknown){
 const d=proposalSchema.parse(input),{t,mode}=await scope(env,user,w,tenancyId,true);
 proposalAuthor(user,w,mode);
 assert(t.status==='active',409,'RENT_TENANCY_INACTIVE','Only an active tenancy can receive a new rent plan.');
 assert(mode!==null&&rentRouteAllowed(mode,d.route),422,'RENT_ROUTE_ILLEGAL','Agency-managed rent must use the agency trust route; a self-managing landlord must use a landlord-owned route.');
 // Candidate Connect accounts are a design proposal only. No Stripe account or bank details are stored.
 const action='rent.plan.proposal',payload={tenancyId,...d},prior=await replay(env,user,action,d.requestKey,payload);
 if(prior.result)return prior.result;
 const id=uid('rentplan'),result={planId:id,status:'proposal_only',moneyMovementEnabled:false};
 await env.DB.batch([
  statement(env.DB,'INSERT INTO rent_route_plans(id,tenancy_id,property_id,manager_mode,route,amount_cents,frequency,policy_version,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
   id,t.id,t.property_id,mode,d.route,d.amountCents,d.frequency,RENT_ROUTE_POLICY_VERSION,user.id,now()),
  activity(env,user,'rent.route_proposed','rent_route_plan',id,t.property_id,null,{route:d.route,amountCents:d.amountCents}),
  receipt(env,user,action,d.requestKey,prior.fingerprint,result)
 ]);
 return result;
}
export async function recordExternalRentEvent(env:Env,user:Principal,w:Workspace,planId:string,input:unknown){
 const d=externalSchema.parse(input),{mode,plan}=await planAccess(env,user,w,planId,true);
 proposalAuthor(user,w,mode);
 assert(plan.manager_mode===mode,409,'RENT_ROUTE_STALE','Management authority has changed; create a new plan.');
 const recent=await statement(env.DB,'SELECT id FROM rent_route_plans WHERE tenancy_id=? ORDER BY created_at DESC,id DESC LIMIT 1',plan.tenancy_id).first<{id:string}>();
 assert(recent?.id===planId,409,'RENT_PLAN_SUPERSEDED','External evidence must be recorded against the most recent plan.');
 if(d.kind==='owner_disbursement_external')assert(mode==='agency_managed',422,'RENT_DISBURSEMENT_NOT_APPLICABLE','A self-managed landlord does not disburse rent to themselves.');
 assert(d.source===(mode==='agency_managed'?'agency_trust_statement':'landlord_bank_statement')||d.source==='approved_external_ledger',
  422,'RENT_RECEIPT_SOURCE','Use the appropriate independently managed source.');
 assert(new Date(d.effectiveAt).getTime()<=Date.now()+300000,422,'RENT_FUTURE_EVENT','Future money movement cannot be recorded as already occurring.');
 const action='rent.external_record',payload={planId,...d},prior=await replay(env,user,action,d.requestKey,payload);
 if(prior.result)return prior.result;
 const id=uid('rentext'),result={recordId:id,verified:false,moneyMovementEnabled:false};
 await env.DB.batch([
  statement(env.DB,'INSERT INTO rent_external_money_records(id,plan_id,kind,amount_cents,source,external_reference,effective_at,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
   id,planId,d.kind,d.amountCents,d.source,d.externalReference,d.effectiveAt,user.id,now()),
  activity(env,user,'rent.external_recorded','rent_external_record',id,plan.property_id,null,{kind:d.kind,amountCents:d.amountCents}),
  receipt(env,user,action,d.requestKey,prior.fingerprint,result)
 ]);
 return result;
}
export async function verifyExternalRentEvent(env:Env,user:Principal,w:Workspace,planId:string,recordIdValue:string,input:unknown){
 const d=reviewSchema.parse(input),{plan}=await planAccess(env,user,w,planId);
 assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),
  403,'RENT_INDEPENDENT_REVIEW_REQUIRED','An authorised Staff reviewer must verify external financial evidence.');
 const e=await statement(env.DB,'SELECT * FROM rent_external_money_records WHERE id=? AND plan_id=?',recordIdValue,planId).first<Record<string,any>>();
 assert(e,404,'RENT_EVIDENCE_NOT_FOUND','External record not found.');
 assert(e.recorded_by!==user.id,403,'RENT_SEPARATION_OF_DUTIES','An event must be reviewed by somebody other than its recorder.');
 if(e.kind==='owner_disbursement_external'){
  assert(plan.manager_mode==='agency_managed',422,'RENT_DISBURSEMENT_NOT_APPLICABLE','Only agency trust disbursements can be recorded.');
  const received=await statement(env.DB,`SELECT COALESCE(SUM(e2.amount_cents),0) n FROM rent_external_money_records e2
   JOIN rent_external_verifications v2 ON v2.record_id=e2.id WHERE e2.plan_id=? AND e2.kind='rent_received_external'`,planId).first<{n:number}>();
  const disbursed=await statement(env.DB,`SELECT COALESCE(SUM(e2.amount_cents),0) n FROM rent_external_money_records e2
   JOIN rent_external_verifications v2 ON v2.record_id=e2.id WHERE e2.plan_id=? AND e2.kind='owner_disbursement_external'`,planId).first<{n:number}>();
  assert((received?.n??0)-(disbursed?.n??0)>=e.amount_cents,422,'RENT_RECONCILIATION_EXCESS','Recorded verified disbursement exceeds independently verified receipts.');
 }
 const action='rent.external_verify',payload={planId,recordIdValue,...d},prior=await replay(env,user,action,d.requestKey,payload);
 if(prior.result)return prior.result;
 const id=uid('rentverify'),result={verificationId:id,recordId:recordIdValue,verified:true,externalOnly:true};
 await env.DB.batch([
  statement(env.DB,'INSERT INTO rent_external_verifications(id,record_id,reviewed_by,evidence_kind,external_evidence_reference,reviewed_at) VALUES(?,?,?,?,?,?)',
   id,recordIdValue,user.id,d.evidenceKind,d.externalEvidenceReference,now()),
  activity(env,user,'rent.external_verified','rent_external_record',recordIdValue,plan.property_id,null,{evidenceKind:d.evidenceKind}),
  receipt(env,user,action,d.requestKey,prior.fingerprint,result)
 ]);
 return result;
}
