import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { activity, dateOnly, isoDate, recordId, reference, replay, receipt, version, guard } from '../../../../packages/operations/core';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { tenancyAccess } from './tenancies.server';
import { WA_BOND_RULES, waResidentialBondLimit, type BondWorkflowCode } from '../../../../packages/validation/wa-bonds';

const cents = z.number().int().min(0).max(100000000);
const workflowCodes = ['B01','B02','B03','B04','B05','B06','B07','B08','B09',
  'B10','B11','B12','B13','B14','B15','B16','B17','B18','B19','B20','B21','B22','B23'] as const;
const txCodes = z.enum(workflowCodes);
const claimCategories = z.enum(['property_damage','garden','carpet_cleaning','cleaning',
  'pet_fumigation','keys_security','unpaid_rent','unpaid_utilities','other_breach']);
const governmentChannels = z.enum(['manual','bondsonline','ecourts','other']);
const createSchema = z.object({tenancyId:recordId,weeklyRentCents:cents,
  generalCents:cents,petCents:cents.default(0),requestKey:recordId});
const txSchema = z.object({code:txCodes, details:z.string().min(5).max(5000),
  generalDeltaCents:z.number().int().min(-100000000).max(100000000).default(0),
  petDeltaCents:z.number().int().min(-100000000).max(100000000).default(0),
  requestKey:recordId});
const receiptSchema = z.object({kind:z.enum(['general','pet']),amountCents:cents.positive(),
  paidAt:isoDate,payer:z.string().min(2).max(180),paymentReference:reference,transactionId:recordId.optional(),requestKey:recordId});
const confirmSchema = z.object({version,status:z.enum(['submitted','confirmed','rejected','cancelled']),
  channel:governmentChannels.optional(),externalReference:reference.optional(),
  confirmationDocumentId:recordId.optional(),governmentBondReference:reference.optional(),agentManualExceptionReference:reference.optional(),requestKey:recordId});
const claimSchema = z.object({category:claimCategories,amountCents:cents.positive(),
  explanation:z.string().min(5).max(3500),evidenceDocumentId:recordId,requestKey:recordId});
const noticeSchema = z.object({kind:z.enum(['release_application','invitation_to_submit','commissioner_decision','appeal','variation','other']),
  governmentReference:reference, receivedAt:isoDate,responseDueAt:isoDate.optional(),
  documentId:recordId.optional(),requestKey:recordId});
const caseSchema = z.object({status:z.enum(['notice_received','responded','referred','submissions','determined','appealed','declined','resolved']),
  decision:z.string().max(5000).optional(),reference:reference.optional(),governmentDocumentId:recordId.optional(),
  decisionAt:isoDate.optional(),appealDueAt:isoDate.optional(),version:version.optional(),requestKey:recordId});
const evidenceSchema = z.object({documentId:recordId,category:z.enum(['lodgement','variation','release','claim','notice','dispute','court','government_confirmation','other']),
  transactionId:recordId.optional(),requestKey:recordId});

export function event(env:Env,user:Principal,bondId:string,action:string,transactionId:string|null=null,metadata:Record<string,unknown>={}) {
 return statement(env.DB,'INSERT INTO bond_events(id,bond_id,transaction_id,actor_id,action,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
 uid('be'),bondId,transactionId,user.id,action,JSON.stringify(metadata),now());
}
export async function authorized(env:Env,user:Principal,w:Workspace,bondId:string,write=false){
 const bond=await statement(env.DB,'SELECT * FROM bonds WHERE id=?',bondId).first<Record<string,any>>();
 assert(bond,404,'BOND_NOT_FOUND','Bond not found.');
 const tenancy=await tenancyAccess(env,user,w,bond.tenancy_id,write&&w.kind!=='tenant');
 assert(tenancy.property_id===bond.property_id,409,'BOND_PROPERTY_MISMATCH','Bond has an invalid tenancy link.');
 assert(w.kind==='staff'||w.kind==='tenant'||['landlord','property-manager'].includes(w.kind),
   403,'BOND_RESIDENTIAL_ONLY','Residential bond records are not available to this portal.');
 const property=await statement(env.DB,'SELECT sector FROM properties WHERE id=?',bond.property_id).first<{sector:string}>();
 assert(property?.sector==='residential',422,'BOND_RESIDENTIAL_ONLY','WA residential bond workflow only.');
 if(write && w.kind==='tenant')
   assert(false,403,'BOND_MANAGER_REQUIRED','This bond action requires the landlord or manager.');
 return bond;
}
export async function document(env:Env,bond:Record<string,any>,documentId:string) {
 const d=await statement(env.DB,"SELECT id FROM documents WHERE id=? AND property_id=? AND tenancy_id=? AND status='issued'",
 documentId,bond.property_id,bond.tenancy_id).first();
 assert(d,422,'BOND_DOCUMENT_INVALID','Attach an issued document belonging to this tenancy.');
}
export async function mutation(env:Env,user:Principal,action:string,key:string,payload:unknown,commands:ReturnType<typeof statement>[],result:unknown){
 const r=await replay(env,user,action,key,payload);
 if(r.result) return r.result;
 await env.DB.batch([...commands,receipt(env,user,action,key,r.fingerprint,result)]);
 return result;
}
export async function createBond(env:Env,user:Principal,w:Workspace,input:unknown){
 const d=createSchema.parse(input);assert(w.kind!=='tenant',403,'BOND_MANAGER_REQUIRED','Only the managing party may open a bond.');
 const t=await tenancyAccess(env,user,w,d.tenancyId,true);
 const p=await statement(env.DB,'SELECT sector FROM properties WHERE id=?',t.property_id).first<{sector:string}>();
 assert(p?.sector==='residential',422,'BOND_RESIDENTIAL_ONLY','Use the residential tenancy workflow.');
 assert(!waResidentialBondLimit(d.weeklyRentCents,d.generalCents,d.petCents).length,422,'BOND_AMOUNT_CAP',waResidentialBondLimit(d.weeklyRentCents,d.generalCents,d.petCents).join(' '));
 const existing=await statement(env.DB,'SELECT id FROM bonds WHERE tenancy_id=?',d.tenancyId).first<{id:string}>();
 if(existing)return {bondId:existing.id};
 const id=uid('bond'),time=now(),answer={bondId:id};
 return mutation(env,user,'bond.create',d.requestKey,d,[
  statement(env.DB,'INSERT INTO bonds(id,tenancy_id,property_id,created_by,weekly_rent_cents,general_cents,pet_cents,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
   id,d.tenancyId,t.property_id,user.id,d.weeklyRentCents,d.generalCents,d.petCents,time,time),
  event(env,user,id,'bond.created',null,{generalCents:d.generalCents,petCents:d.petCents}),
  activity(env,user,'bond.created','bond',id,t.property_id)
 ],answer);
}
export async function listBonds(env:Env,user:Principal,w:Workspace,tenancyId:string){
 await tenancyAccess(env,user,w,tenancyId);
 if(!['landlord','property-manager','tenant','staff'].includes(w.kind))return {bonds:[]};
 const rows=(await statement(env.DB,'SELECT id FROM bonds WHERE tenancy_id=? ORDER BY created_at DESC',tenancyId).all<{id:string}>()).results;
 return {bonds:await Promise.all(rows.map(async r=>getBond(env,user,w,r.id)))};
}
export async function getBond(env:Env,user:Principal,w:Workspace,id:string){
 const b=await authorized(env,user,w,id);
 const rows=(await statement(env.DB,'SELECT * FROM bond_transactions WHERE bond_id=? ORDER BY created_at,id',id).all<Record<string,any>>()).results;
 const isTenant=w.kind==='tenant';
 const transactions=await Promise.all(rows.map(async t=>({
  id:t.id,code:t.code,status:t.status,generalDeltaCents:t.general_delta_cents,petDeltaCents:t.pet_delta_cents,
  details:isTenant&&t.created_by!==user.id?'This bond transaction was recorded by another authorised party. Contact the managing landlord for details.':(await unseal<{details:string}>(env.DATA_ENCRYPTION_KEY,`bond-tx:${t.id}`,t.details_envelope)).details,
  createdAt:t.created_at,submittedAt:t.submitted_at,confirmedAt:t.confirmed_at,
  externalReference:t.external_reference,version:t.version,
  channel:t.channel,
 })));
 const participants=(await statement(env.DB,'SELECT id,user_id,role,status,effective_at,ended_at,external_reference,government_document_id FROM bond_parties WHERE bond_id=? ORDER BY created_at',id).all()).results;
 const receipts=(await statement(env.DB,'SELECT id,transaction_id,kind,amount_cents,paid_at,due_at,lodgement_confirmed_at FROM bond_receipts WHERE bond_id=? ORDER BY created_at',id).all()).results;
 const cases=(await statement(env.DB,'SELECT id,transaction_id,status,external_reference,decision_at,appeal_due_at,version FROM bond_cases WHERE bond_id=? ORDER BY created_at',id).all()).results;
 const notices=(await statement(env.DB,'SELECT id,kind,government_reference,received_at,response_due_at FROM bond_notices WHERE bond_id=? ORDER BY received_at',id).all()).results;
 const deadlines=(await statement(env.DB,'SELECT id,kind,source,due_at,completed_at FROM bond_deadlines WHERE bond_id=? ORDER BY due_at',id).all()).results;
 const claims=(await statement(env.DB,'SELECT id,transaction_id,category,amount_cents,evidence_document_id FROM bond_claims WHERE bond_id=?',id).all()).results;
 const allocations=(await statement(env.DB,"SELECT a.id,a.transaction_id,a.recipient_kind,a.party_id,a.target_bond_id,a.general_cents,a.pet_cents FROM bond_allocations a WHERE a.bond_id=? ORDER BY a.created_at",id).all<Record<string,any>>()).results;
 const contributions=(await statement(env.DB,"SELECT party_id,receipt_id,amount_cents FROM bond_contributions WHERE bond_id=? ORDER BY created_at",id).all<Record<string,any>>()).results;
 const worksheets=(await statement(env.DB,'SELECT transaction_id,official_form,policy_version FROM bond_preparations WHERE bond_id=?',id).all()).results;
 const verification=(await statement(env.DB,"SELECT transaction_id,document_id,external_reference,result,reviewed_at FROM bond_external_verifications WHERE bond_id=? ORDER BY reviewed_at",id).all()).results;
 const reconciliations=(await statement(env.DB,'SELECT transaction_id,government_reference,general_cents,pet_cents,outcome,created_at FROM bond_payout_reconciliations WHERE bond_id=?',id).all()).results;
 const exceptions=(await statement(env.DB,'SELECT id,kind,status,created_at FROM bond_exception_cases WHERE bond_id=?',id).all()).results;
 return {id:b.id,tenancyId:b.tenancy_id,propertyId:b.property_id,status:b.status,
  bondReference:b.bond_reference,generalCents:b.general_cents,petCents:b.pet_cents,
  heldGeneralCents:b.held_general_cents,heldPetCents:b.held_pet_cents,weeklyRentCents:b.weekly_rent_cents,
  version:b.version,transactions,participants:isTenant?participants.filter((p:any)=>p.user_id===user.id):participants,receipts,cases,notices,deadlines,claims,
  allocations:isTenant?allocations.map(a=>({...a,party_id:null,target_bond_id:null})):allocations,
  contributions:isTenant?[]:contributions,worksheets,verification:isTenant?verification.map(v=>({transaction_id:v.transaction_id,result:v.result,reviewed_at:v.reviewed_at})):verification,reconciliations,
  exceptions:isTenant?[]:exceptions,workflowRules:WA_BOND_RULES,
  governmentSubmission:'external_only',roles:{canManage:!isTenant,canApplyRelease:true},
  guidance:'ProInspect coordinates records; only government confirmation establishes an official bond outcome.'};
}
export async function createTransaction(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown){
 const d=txSchema.parse(input),b=await authorized(env,user,w,bondId);
 assert(d.code!=='B09'&&d.code!=='B19',403,'BOND_ESTATE_RESTRICTED','Estate matters require confidential exception caseworker review, not ordinary bond transaction details.');
 assert(d.code!=='B20',403,'BOND_CONFIDENTIAL_RESTRICTED','Family-violence bond workflows must use the separately protected case process; ordinary bond records are not a safe intake.');
 assert(d.code!=='B23',422,'BOND_LEGACY_RECORD_ONLY','Legacy disposal documents are historical; new applications use the current release form.');
 const tenant=w.kind==='tenant';
 assert(!tenant||['B13','B16','B17','B18'].includes(d.code),403,'BOND_ACTION_FORBIDDEN','This transaction requires the managing party.');
 assert(b.status!=='released',409,'BOND_CLOSED','Released bonds cannot be modified.');
 if(d.code==='B01')assert(b.status==='draft'||b.status==='awaiting_lodgement',409,'BOND_LODGEMENT_STATE','Initial lodgement can only start once.');
 if(d.code==='B01')assert(d.generalDeltaCents===0&&d.petDeltaCents===0,422,'BOND_INITIAL_AMOUNT','Initial lodgement is derived from the registered bond and recorded payments.');
 if(['B04','B05','B06','B07','B08','B16','B17','B18','B21','B22'].includes(d.code))
   assert(d.generalDeltaCents===0&&d.petDeltaCents===0,422,'BOND_NON_FINANCIAL_AMOUNT','Administrative workflows cannot change the financial balance.');
 if(['B02','B03'].includes(d.code)){
   assert(d.generalDeltaCents>=0&&d.petDeltaCents>=0&&d.generalDeltaCents+d.petDeltaCents>0,
    422,'BOND_TOPUP_AMOUNT','Top-ups must be positive.');
   assert(d.code==='B02'?d.petDeltaCents===0:d.generalDeltaCents===0,422,'BOND_TOPUP_CATEGORY','Choose the correct general or pet bond category.');
   assert(d.code!=='B03'||b.pet_cents+d.petDeltaCents<=35000,422,'BOND_PET_CAP','Residential pet bonds cannot exceed $350.');
 }
 if(['B10','B11','B12','B13','B14','B15'].includes(d.code)){
   assert(d.generalDeltaCents<=0&&d.petDeltaCents<=0&&d.generalDeltaCents+d.petDeltaCents<0,
    422,'BOND_RELEASE_AMOUNT','A release needs a negative general or pet amount.');
   assert(-d.generalDeltaCents<=b.held_general_cents&&-d.petDeltaCents<=b.held_pet_cents,
    422,'BOND_RELEASE_BALANCE','Release cannot exceed the confirmed bond.');
 }
 const changes=['B02','B03','B10'].includes(d.code);
 if(changes)assert(b.status==='active',409,'BOND_NOT_ACTIVE','The bond must be active for this transaction.');
 const id=uid('btx'),time=now(),payload={bondId,transactionId:id};
 return mutation(env,user,'bond.tx.create',d.requestKey,{bondId,...d},[
  statement(env.DB,'INSERT INTO bond_transactions(id,bond_id,code,general_delta_cents,pet_delta_cents,details_envelope,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
   id,bondId,d.code,d.generalDeltaCents,d.petDeltaCents,await seal(env.DATA_ENCRYPTION_KEY,`bond-tx:${id}`,{details:d.details}),user.id,time,time),
  event(env,user,bondId,'transaction.created',id,{code:d.code}),
  activity(env,user,'bond.transaction_created','bond_transaction',id,b.property_id)
 ],payload);
}
export async function recordReceipt(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown){
 const d=receiptSchema.parse(input),b=await authorized(env,user,w,bondId,true);
 assert(b.status!=='released',409,'BOND_CLOSED','Bond is closed.');
 if(b.status==='active')assert(d.transactionId,422,'BOND_TOPUP_CONTEXT','Select the appropriate pending bond variation for additional funds.');
 if(d.transactionId){
   const t=await statement(env.DB,'SELECT code,status FROM bond_transactions WHERE bond_id=? AND id=?',bondId,d.transactionId).first<{code:string;status:string}>();
   assert(t&&t.status==='draft'&&['B02','B03'].includes(t.code)&&
      (t.code==='B02'?d.kind==='general':d.kind==='pet'),422,
      'BOND_PAYMENT_VARIATION','Additional bond receipts must match a draft variation.');
 }
 const paid=new Date(d.paidAt);assert(paid.getTime()<=Date.now()+300000,422,'BOND_RECEIPT_FUTURE','Payment cannot be dated in the future.');
 const due=new Date(paid.getTime()+14*24*3600*1000).toISOString(),id=uid('brc'),deadline=uid('bdue'),time=now();
 return mutation(env,user,'bond.receipt',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_receipts(id,bond_id,transaction_id,kind,amount_cents,payer_envelope,payment_reference,paid_at,due_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
 id,bondId,d.transactionId??null,d.kind,d.amountCents,await seal(env.DATA_ENCRYPTION_KEY,`bond-receipt:${id}`,{payer:d.payer}),d.paymentReference,d.paidAt,due,user.id,time),
 statement(env.DB,"INSERT INTO bond_deadlines(id,bond_id,transaction_id,kind,source,due_at,created_at) VALUES(?,?,?,'lodgement','receipt',?,?)",deadline,bondId,d.transactionId??null,due,time),
 statement(env.DB,"UPDATE bonds SET status=CASE WHEN status='draft' THEN 'awaiting_lodgement' ELSE status END,version=version+1,updated_at=? WHERE id=?",time,bondId),
 event(env,user,bondId,'payment.recorded',null,{kind:d.kind,amountCents:d.amountCents,receiptId:id}),
 activity(env,user,'bond.payment_recorded','bond',bondId,b.property_id)
 ],{receiptId:id,dueAt:due});
}
export async function confirmTransaction(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown) {
 const d=confirmSchema.parse(input),tenantSubmission=w.kind==='tenant'&&d.status==='submitted';
 const b=await authorized(env,user,w,bondId,!tenantSubmission);
 const action='bond.tx.transition',payload={bondId,id,...d};
 const retry=await replay(env,user,action,d.requestKey,payload);
 if(retry.result)return retry.result;
 const tx=await statement(env.DB,'SELECT * FROM bond_transactions WHERE id=? AND bond_id=?',id,bondId).first<Record<string,any>>();
 assert(tx,404,'BOND_TRANSACTION_NOT_FOUND','Bond transaction not found.');
 if(tenantSubmission)
  assert(tx.code==='B13'&&tx.created_by===user.id&&d.channel==='manual',403,
    'BOND_TENANT_SUBMISSION_RESTRICTED','A tenant may record only their own manual bond release application.');
 assert(tx.version===d.version&&['draft','submitted'].includes(tx.status),409,'BOND_TRANSACTION_CHANGED','A newer transaction version exists.');
 assert((tx.status==='draft'&&['submitted','cancelled'].includes(d.status))||
   (tx.status==='submitted'&&['confirmed','rejected'].includes(d.status)),
   409,'BOND_TRANSITION_INVALID','The requested transaction transition is not available.');
 const releaseCodes=['B10','B11','B12','B13','B14','B15'];
 const isRelease=releaseCodes.includes(tx.code);
 const isTopUp=['B02','B03'].includes(tx.code);
 const code=tx.code as BondWorkflowCode;
 if(d.status==='submitted') {
  assert(d.channel&&d.externalReference,422,'BOND_SUBMISSION_REFERENCE','Record the actual external channel and application reference.');
  if(w.kind==='property-manager'&&d.channel==='manual')
   assert(d.agentManualExceptionReference,422,'AGENT_BONDSONLINE_REQUIRED','Agents generally use BondsOnline. Record the documented manual exception.');
  const worksheet=await statement(env.DB,'SELECT official_form FROM bond_preparations WHERE transaction_id=?',id).first();
  assert(worksheet,422,'BOND_WORKSHEET_REQUIRED','Complete the form-specific preparation checklist before recording an external submission.');
  if(['B09','B19','B20','B23'].includes(tx.code))
   assert(false,403,'BOND_RESTRICTED_PROCESS','This workflow requires a different protected or historical process.');
  if(isRelease) {
   assert(tx.general_delta_cents<=0&&tx.pet_delta_cents<=0&&tx.general_delta_cents+tx.pet_delta_cents<0,
    422,'BOND_RELEASE_AMOUNT','A release requires an amount.');
   const totals=await statement(env.DB,'SELECT COALESCE(SUM(general_cents),0) AS g,COALESCE(SUM(pet_cents),0) AS p FROM bond_allocations WHERE transaction_id=?',id)
      .first<{g:number;p:number}>();
   assert((totals?.g??0)===-tx.general_delta_cents&&(totals?.p??0)===-tx.pet_delta_cents,422,
     'BOND_ALLOCATION_MISMATCH','Recipient allocations must reconcile to every general/pet cent proposed for release.');
   if(tx.code==='B11')assert(-tx.general_delta_cents===b.held_general_cents&&-tx.pet_delta_cents===b.held_pet_cents,
     422,'BOND_FULL_RELEASE_AMOUNT','A full return must account for all confirmed money held.');
   if(tx.code==='B12'){
    const claims=await statement(env.DB,'SELECT COALESCE(SUM(amount_cents),0) AS amount FROM bond_claims WHERE transaction_id=?',id).first<{amount:number}>();
    const landlord=await statement(env.DB,"SELECT COALESCE(SUM(general_cents+pet_cents),0) AS amount FROM bond_allocations WHERE transaction_id=? AND recipient_kind='landlord'",id).first<{amount:number}>();
    assert((claims?.amount??0)>0&&(claims?.amount??0)===(landlord?.amount??0),
      422,'BOND_DEDUCTION_RECONCILIATION','Landlord payouts must equal evidenced deduction claims.');
   }
   if(tx.code==='B14')assert(await statement(env.DB,"SELECT id FROM bond_allocations WHERE transaction_id=? AND recipient_kind='new_bond'",id).first(),
      422,'BOND_TRANSFER_PAIR_REQUIRED','Create a linked new-bond allocation before transferring funds.');
   if(tx.code==='B15')assert(await statement(env.DB,"SELECT id FROM bond_allocations WHERE transaction_id=? AND recipient_kind='housing_loan'",id).first(),
      422,'BOND_ASSISTANCE_REFERENCE_REQUIRED','Record the housing-loan repayment allocation.');
   if(tx.code!=='B10') {
    const t=await statement(env.DB,'SELECT status,ends_at FROM tenancies WHERE id=?',b.tenancy_id)
      .first<{status:string;ends_at:string|null}>();
    assert(t&&(t.status==='ended'||(t.ends_at!==null&&t.ends_at<=now())),
      422,'BOND_TENANCY_ACTIVE','Full bond release applications normally require the tenancy to have ended; use the approved restricted exception where applicable.');
   }
  }
  if(isTopUp){
   const kind=tx.code==='B02'?'general':'pet',needed=tx.code==='B02'?tx.general_delta_cents:tx.pet_delta_cents;
   const paid=await statement(env.DB,'SELECT COALESCE(SUM(amount_cents),0) AS n FROM bond_receipts WHERE bond_id=? AND transaction_id=? AND kind=?',
      bondId,id,kind).first<{n:number}>();
   assert((paid?.n??0)>=needed,422,'BOND_TOPUP_RECEIPT_REQUIRED','Record the additional funds and lodgement deadline before submission.');
   if(tx.code==='B03')assert(b.pet_cents+needed<=35000,422,'BOND_PET_CAP','Residential pet bond exceeds $350.');
  }
 }
 if(d.status==='confirmed') {
  assert(tx.external_reference&&d.confirmationDocumentId,422,'BOND_CONFIRMATION_EVIDENCE','Attach the actual official confirmation.');
  await document(env,b,d.confirmationDocumentId);
  const approved=await statement(env.DB,"SELECT id FROM bond_external_verifications WHERE bond_id=? AND transaction_id=? AND document_id=? AND external_reference=? AND result='verified' ORDER BY reviewed_at DESC LIMIT 1",
    bondId,id,d.confirmationDocumentId,tx.external_reference).first();
  assert(approved,422,'BOND_GOVERNMENT_REVIEW_REQUIRED','Independent Staff review of the official external confirmation is required.');
  if(tx.code==='B01') {
   assert(d.governmentBondReference,422,'BOND_OFFICIAL_NUMBER_REQUIRED','Enter the official confirmed bond number.');
   const totals=(await statement(env.DB,'SELECT kind,COALESCE(SUM(amount_cents),0) AS n FROM bond_receipts WHERE bond_id=? GROUP BY kind',bondId)
      .all<{kind:string;n:number}>()).results;
   const value=new Map(totals.map(x=>[x.kind,x.n]));
   assert((value.get('general')??0)>=b.general_cents&&(value.get('pet')??0)>=b.pet_cents,
     422,'BOND_RECEIPTS_MISSING','Record the funds received for each bond category.');
  }
  if(isTopUp)assert(
    tx.general_delta_cents>=0&&tx.pet_delta_cents>=0&&tx.general_delta_cents+tx.pet_delta_cents>0,
    422,'BOND_INVALID_TOPUP','Bond top-up amounts must be positive.');
  if(isRelease) {
   assert(b.held_general_cents+tx.general_delta_cents>=0&&b.held_pet_cents+tx.pet_delta_cents>=0,
    422,'BOND_RELEASE_OVERDRAW','Proposed release exceeds confirmed funds.');
   assert(!await statement(env.DB,'SELECT id FROM bond_payout_reconciliations WHERE transaction_id=?',id).first(),
    409,'BOND_PAYOUT_ALREADY_RECORDED','A payout is already reconciled.');
  }
 }
 if(d.status==='rejected'){
  assert(d.confirmationDocumentId,422,'BOND_REJECTION_EVIDENCE','An official rejection needs reviewed evidence.');
  await document(env,b,d.confirmationDocumentId!);
  const approved=await statement(env.DB,"SELECT id FROM bond_external_verifications WHERE bond_id=? AND transaction_id=? AND document_id=? AND result='verified'",bondId,id,d.confirmationDocumentId).first();
  assert(approved,422,'BOND_REJECTION_UNVERIFIED','Staff must review the rejection evidence.');
 }
 const time=now();
 let status=b.status,g=b.held_general_cents,p=b.held_pet_cents,authorizedG=b.general_cents,authorizedP=b.pet_cents;
 let officialRef:string|null=null;
 if(d.status==='submitted')
  status=isRelease?'release_pending':tx.code==='B01'?'lodgement_submitted':['B16','B17','B18'].includes(tx.code)?'in_dispute':'variation_pending';
 if(d.status==='rejected')status='exception';
 if(d.status==='confirmed'){
  if(tx.code==='B01'){
   g=b.general_cents;p=b.pet_cents;officialRef=d.governmentBondReference??null;status='active';
  }else if(isTopUp){
   g+=tx.general_delta_cents;p+=tx.pet_delta_cents;
   authorizedG+=tx.general_delta_cents;authorizedP+=tx.pet_delta_cents;status='active';
  }else if(isRelease){
   status='payout_pending'; // actual funds remain held until independent payout reconciliation
  }else{
   status=['B16','B17','B18'].includes(tx.code)?'in_dispute':'active';
  }
 }
 const next={id,status:d.status,bondStatus:status};
 const commands=[
 statement(env.DB,'UPDATE bond_transactions SET status=?,version=version+1,channel=COALESCE(?,channel),external_reference=COALESCE(?,external_reference),confirmation_document_id=COALESCE(?,confirmation_document_id),submitted_at=CASE WHEN ?=\'submitted\' THEN ? ELSE submitted_at END,confirmed_at=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_at END,confirmed_by=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_by END,updated_at=? WHERE id=? AND bond_id=? AND version=?',
  d.status,d.channel??null,d.externalReference??null,d.confirmationDocumentId??null,d.status,time,d.status,time,d.status,user.id,time,id,bondId,d.version),
 guard(env),
 statement(env.DB,'UPDATE bonds SET status=?,bond_reference=COALESCE(?,bond_reference),held_general_cents=?,held_pet_cents=?,general_cents=?,pet_cents=?,version=version+1,updated_at=?,confirmed_at=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_at END WHERE id=? AND version=?',
  status,officialRef,g,p,authorizedG,authorizedP,time,d.status,time,bondId,b.version),
 guard(env),
 event(env,user,bondId,'transaction.'+d.status,id,{code:tx.code,externalReference:d.externalReference??tx.external_reference}),
 activity(env,user,'bond.transaction_'+d.status,'bond_transaction',id,b.property_id)
 ];
 if(d.status==='confirmed'&&(tx.code==='B01'||isTopUp)){
  commands.push(statement(env.DB,"UPDATE bond_deadlines SET completed_at=? WHERE bond_id=? AND kind='lodgement' AND completed_at IS NULL AND (transaction_id IS NULL OR transaction_id=?)",
    time,bondId,id));
  commands.push(statement(env.DB,'UPDATE bond_receipts SET lodgement_confirmed_at=? WHERE bond_id=? AND lodgement_confirmed_at IS NULL AND (transaction_id IS NULL OR transaction_id=?)',
    time,bondId,id));
 }
 return mutation(env,user,action,d.requestKey,payload,commands,next);
}
export async function addClaim(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown){
 const d=claimSchema.parse(input),b=await authorized(env,user,w,bondId,true);
 const tx=await statement(env.DB,'SELECT code,status FROM bond_transactions WHERE id=? AND bond_id=?',id,bondId).first<{code:string;status:string}>();
 assert(tx&&tx.code==='B12'&&tx.status==='draft',409,'BOND_CLAIM_STATE','Claims require a draft landlord-deduction release.');
 await document(env,b,d.evidenceDocumentId);
 const total=await statement(env.DB,'SELECT COALESCE(SUM(amount_cents),0) AS total FROM bond_claims WHERE transaction_id=?',id).first<{total:number}>();
 assert((total?.total??0)+d.amountCents<=b.held_general_cents+b.held_pet_cents,422,'BOND_CLAIM_LIMIT','Claims exceed confirmed bond held.');
 const cid=uid('bcl');return mutation(env,user,'bond.claim',d.requestKey,{bondId,id,...d},[
 statement(env.DB,'INSERT INTO bond_claims(id,bond_id,transaction_id,category,amount_cents,explanation_envelope,evidence_document_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
 cid,bondId,id,d.category,d.amountCents,await seal(env.DATA_ENCRYPTION_KEY,`bond-claim:${cid}`,{explanation:d.explanation}),d.evidenceDocumentId??null,user.id,now()),
 event(env,user,bondId,'claim.added',id,{claimId:cid,category:d.category,amountCents:d.amountCents})
 ],{claimId:cid});
}
export async function addEvidence(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown){
 const d=evidenceSchema.parse(input),b=await authorized(env,user,w,bondId);
 await document(env,b,d.documentId);
 if(d.transactionId)assert(await statement(env.DB,'SELECT id FROM bond_transactions WHERE id=? AND bond_id=?',d.transactionId,bondId).first(),
  404,'BOND_TRANSACTION_NOT_FOUND','Transaction not found.');
 const id=uid('bev');return mutation(env,user,'bond.evidence',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_evidence(id,bond_id,transaction_id,document_id,category,submitted_by,created_at) VALUES(?,?,?,?,?,?,?)',
 id,bondId,d.transactionId??null,d.documentId,d.category,user.id,now()),
 event(env,user,bondId,'evidence.linked',d.transactionId??null,{documentId:d.documentId,category:d.category})
 ],{evidenceId:id});
}
export async function addNotice(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown){
 const d=noticeSchema.parse(input),b=await authorized(env,user,w,bondId);
 if(w.kind==='tenant')assert(['release_application','invitation_to_submit','appeal','other'].includes(d.kind),
    403,'BOND_OFFICIAL_NOTICE_RESTRICTED','Only the managing party may record this official notice type.');
 assert(await statement(env.DB,'SELECT id FROM bond_transactions WHERE id=? AND bond_id=?',id,bondId).first(),
 404,'BOND_TRANSACTION_NOT_FOUND','Transaction not found.');
 if(['release_application','invitation_to_submit','commissioner_decision','appeal'].includes(d.kind))
   assert(d.documentId,422,'BOND_OFFICIAL_NOTICE_DOCUMENT','Attach the official notice before recording a response deadline.');
 if(d.documentId)await document(env,b,d.documentId);
 if(d.responseDueAt)assert(new Date(d.responseDueAt)>new Date(d.receivedAt),422,'BOND_NOTICE_DEADLINE','The official response deadline must follow receipt.');
 const nid=uid('bn'),deadline=uid('bdue');
 const commands=[
  statement(env.DB,'INSERT INTO bond_notices(id,bond_id,transaction_id,kind,government_reference,received_at,response_due_at,document_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  nid,bondId,id,d.kind,d.governmentReference,d.receivedAt,d.responseDueAt??null,d.documentId??null,user.id,now()),
  event(env,user,bondId,'government_notice.recorded',id,{kind:d.kind,reference:d.governmentReference})
 ];
 if(d.responseDueAt)commands.push(statement(env.DB,"INSERT INTO bond_deadlines(id,bond_id,transaction_id,kind,source,due_at,created_at) VALUES(?,?,?,?,'government_notice',?,?)",
 deadline,bondId,id,d.kind==='invitation_to_submit'?'submission':d.kind==='appeal'?'appeal':'response',d.responseDueAt,now()));
 return mutation(env,user,'bond.notice',d.requestKey,{bondId,id,...d},commands,{noticeId:nid});
}
export async function recordCase(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown){
 const d=caseSchema.parse(input),b=await authorized(env,user,w,bondId);
 if(w.kind==='tenant')assert(['notice_received','responded','referred','submissions','appealed'].includes(d.status),
   403,'BOND_CASE_OUTCOME_RESTRICTED','A managing party must record official outcomes.');
 assert(await statement(env.DB,'SELECT id FROM bond_transactions WHERE id=? AND bond_id=?',id,bondId).first(),404,'BOND_TRANSACTION_NOT_FOUND','Transaction not found.');
 const existing=await statement(env.DB,'SELECT * FROM bond_cases WHERE transaction_id=? ORDER BY created_at DESC LIMIT 1',id).first<Record<string,any>>();
 const cid=existing?.id??uid('bcase'),allowed:Record<string,string[]>={
 notice_received:['responded','referred'],responded:['referred','resolved'],referred:['submissions','declined','determined'],
 submissions:['determined','declined'],determined:['appealed','resolved'],appealed:['resolved'],declined:['resolved'],resolved:[]};
 if(existing){assert(d.version===existing.version,409,'BOND_CASE_CHANGED','Case has changed.');
 assert(allowed[existing.status]?.includes(d.status),409,'BOND_CASE_TRANSITION','Invalid case transition.');}
 else assert(d.status==='notice_received'||d.status==='referred',422,'BOND_CASE_START','Start with an official notice/referral.');
 if(['determined','declined','resolved'].includes(d.status)){
    assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),
     403,'BOND_OFFICIAL_DECISION_STAFF','Official dispute outcomes require designated Staff review.');
    assert(d.reference&&d.governmentDocumentId,422,'BOND_DECISION_EVIDENCE','Attach the official decision reference and issued evidence.');
    await document(env,b,d.governmentDocumentId!);
    const ok=await statement(env.DB,"SELECT id FROM bond_external_verifications WHERE bond_id=? AND document_id=? AND external_reference=? AND result='verified'",
      bondId,d.governmentDocumentId!,d.reference!).first();
    assert(ok,422,'BOND_DECISION_NOT_REVIEWED','Independent Staff verification of the official decision is required.');
 }
 if(d.status==='determined')assert(d.decisionAt&&d.decision,422,'BOND_DECISION_REQUIRED','Record the official determination and date.');
 const decision=d.decision?await seal(env.DATA_ENCRYPTION_KEY,`bond-case:${cid}`,{decision:d.decision}):null;
 const commands=existing?[
 statement(env.DB,'UPDATE bond_cases SET status=?,decision_envelope=COALESCE(?,decision_envelope),external_reference=COALESCE(?,external_reference),decision_at=COALESCE(?,decision_at),appeal_due_at=COALESCE(?,appeal_due_at),version=version+1,updated_at=? WHERE id=? AND version=?',
 d.status,decision,d.reference??null,d.decisionAt??null,d.appealDueAt??null,now(),cid,d.version!)
 ]:[
 statement(env.DB,'INSERT INTO bond_cases(id,bond_id,transaction_id,status,decision_envelope,external_reference,decision_at,appeal_due_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
 cid,bondId,id,d.status,decision,d.reference??null,d.decisionAt??null,d.appealDueAt??null,user.id,now(),now())
 ];
 commands.push(event(env,user,bondId,'case.'+d.status,id,{caseId:cid}));
 if(d.appealDueAt)commands.push(statement(env.DB,"INSERT INTO bond_deadlines(id,bond_id,transaction_id,kind,source,due_at,created_at) VALUES(?,?,?,'appeal','government_notice',?,?)",uid('bdue'),bondId,id,d.appealDueAt,now()));
 return mutation(env,user,'bond.case',d.requestKey,{bondId,id,...d},commands,{caseId:cid,status:d.status});
}

const participantSchema=z.object({role:z.enum(['tenant','landlord','agent','estate']),
  name:z.string().trim().min(2).max(180),memberUserId:recordId.optional(),effectiveAt:isoDate,requestKey:recordId});
const participantStatus=z.object({status:z.enum(['confirmed','former']),
  governmentReference:reference,governmentDocumentId:recordId,requestKey:recordId});
export async function addParticipant(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown){
 const d=participantSchema.parse(input),b=await authorized(env,user,w,bondId,true);
 if(d.role==='tenant'&&d.memberUserId)assert(await statement(env.DB,
   'SELECT id FROM tenancy_memberships WHERE tenancy_id=? AND user_id=? AND starts_at<=? AND (ends_at IS NULL OR ends_at>?)',
    b.tenancy_id,d.memberUserId,now(),now()).first(),422,'BOND_PARTY_NOT_TENANT','The selected user is not a current member of this tenancy.');
 else if(d.memberUserId)assert(false,422,'BOND_PARTY_MEMBER','Only tenant bond parties can link to a tenancy user.');
 const id=uid('bparty'),created=now();
 return mutation(env,user,'bond.participant.add',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_parties(id,bond_id,user_id,role,name_envelope,effective_at,created_at) VALUES(?,?,?,?,?,?,?)',
  id,bondId,d.memberUserId??null,d.role,await seal(env.DATA_ENCRYPTION_KEY,`bond-party:${id}`,{name:d.name}),d.effectiveAt,created),
 event(env,user,bondId,'participant.recorded',null,{partyId:id,role:d.role,status:'pending'}),
 activity(env,user,'bond.participant_added','bond',bondId,b.property_id)
 ],{partyId:id,status:'pending'});
}
export async function updateParticipant(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown){
 const d=participantStatus.parse(input),b=await authorized(env,user,w,bondId,true);
 const p=await statement(env.DB,'SELECT * FROM bond_parties WHERE id=? AND bond_id=?',id,bondId).first<Record<string,any>>();
 assert(p,404,'BOND_PARTY_NOT_FOUND','Bond party not found.');
 assert((p.status==='pending'&&d.status==='confirmed')||(p.status==='confirmed'&&d.status==='former'),
   409,'BOND_PARTY_TRANSITION','The government party status cannot be changed this way.');
 await document(env,b,d.governmentDocumentId);
 const approved=await statement(env.DB,"SELECT id FROM bond_external_verifications WHERE bond_id=? AND document_id=? AND external_reference=? AND result='verified'",
   bondId,d.governmentDocumentId,d.governmentReference).first();
 assert(approved,422,'BOND_PARTY_GOV_REVIEW','Independent Staff review of the official participant variation is required.');
 const time=now();
 return mutation(env,user,'bond.participant.transition',d.requestKey,{bondId,id,...d},[
 statement(env.DB,'UPDATE bond_parties SET status=?,external_reference=?,government_document_id=?,ended_at=? WHERE id=? AND bond_id=? AND status=?',
  d.status,d.governmentReference,d.governmentDocumentId,d.status==='former'?time:null,id,bondId,p.status),
 event(env,user,bondId,'participant.'+d.status,null,{partyId:id,role:p.role,reference:d.governmentReference}),
 activity(env,user,'bond.participant_'+d.status,'bond',bondId,b.property_id)
 ],{partyId:id,status:d.status});
}

/** Aggregate operational bond queue; deliberately excludes confidential cases and parties. */
export async function bondReviewQueue(env:Env,user:Principal,w:Workspace){
 assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),403,
  'BOND_STAFF_REQUIRED','This operational queue is limited to authorised Staff reviewers.');
 const rows=(await statement(env.DB,`SELECT b.id,b.tenancy_id,b.status,b.bond_reference,b.updated_at,
  p.address,p.suburb,p.postcode,
  (SELECT MIN(d.due_at) FROM bond_deadlines d WHERE d.bond_id=b.id AND d.completed_at IS NULL) next_deadline,
  (SELECT COUNT(*) FROM bond_transactions tx WHERE tx.bond_id=b.id AND tx.status='submitted') submitted_count,
  (SELECT COUNT(*) FROM bond_exception_cases e WHERE e.bond_id=b.id AND e.status!='resolved') open_exceptions
 FROM bonds b JOIN properties p ON p.id=b.property_id WHERE p.sector='residential'
 ORDER BY CASE WHEN next_deadline IS NULL THEN 1 ELSE 0 END,next_deadline,b.updated_at DESC LIMIT 100`).all()).results;
 return {rows,externalOnly:true,notice:'Government submission and payout evidence must be independently verified. Confidential Form 2 cases are excluded.'};
}
