import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { seal } from '../../../../packages/auth/crypto';
import { activity, isoDate, recordId, reference, replay, receipt } from '../../../../packages/operations/core';
import { WA_BOND_RULES, bondWorksheetErrors, type BondWorkflowCode } from '../../../../packages/validation/wa-bonds';
import { authorized, document, event, mutation } from './bonds.server';

const requestKey=recordId;
const money=z.number().int().positive().max(100000000);
const preparation=z.object({
 fields:z.record(z.string().min(1).max(70),z.string().max(500)).refine(v=>Object.keys(v).length<=30),
 acknowledgeExternalProcess:z.literal(true),requestKey,
});
const allocation=z.object({
 recipientKind:z.enum(['tenant','landlord','housing_loan','new_bond']),
 partyId:recordId.optional(),targetBondId:recordId.optional(),
 generalCents:z.number().int().min(0).max(100000000).default(0),
 petCents:z.number().int().min(0).max(100000000).default(0),
 paymentReference:reference.optional(),requestKey,
});
const contribution=z.object({partyId:recordId,receiptId:recordId,amountCents:money,requestKey});
const verification=z.object({
 transactionId:recordId.optional(),documentId:recordId,externalReference:reference,
 sourceChannel:z.enum(['bondsonline','manual','ecourts','other']),
 verificationMethod:z.enum(['government_portal','government_correspondence','official_certificate','court_record']),
 reviewNotes:z.string().trim().min(20).max(1500),result:z.enum(['verified','rejected']),
 requestKey
});
const reconcile=z.object({
 governmentReference:reference,governmentDocumentId:recordId,
 generalCents:z.number().int().min(0).max(100000000),
 petCents:z.number().int().min(0).max(100000000),
 outcome:z.enum(['matched','exception']),notes:z.string().trim().min(10).max(1500),requestKey
});
const exception=z.object({
 kind:z.enum(['estate','failed_lodgement','payout_mismatch','missing_government_record','manual_review']),
 details:z.string().trim().min(10).max(1500),transactionId:recordId.optional(),requestKey
});
const exceptionStatus=z.object({status:z.enum(['in_review','referred','resolved']),requestKey});
function staffOnly(w:Workspace,user:Principal) {
 assert(w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??''),
  403,'BOND_STAFF_REVIEW_REQUIRED','A designated staff reviewer is required for government evidence and reconciliation.');
}
async function txAccess(env:Env,bondId:string,id:string) {
 const tx=await statement(env.DB,'SELECT * FROM bond_transactions WHERE bond_id=? AND id=?',bondId,id).first<Record<string,any>>();
 assert(tx,404,'BOND_TRANSACTION_NOT_FOUND','Bond transaction not found in this bond.');
 return tx;
}
export async function prepareBondForm(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown) {
 const d=preparation.parse(input),b=await authorized(env,user,w,bondId);
 const tx=await txAccess(env,bondId,id),rule=WA_BOND_RULES[tx.code as BondWorkflowCode];
 assert(rule&&rule.form!=='legacy'&&rule.form!=='restricted',403,'BOND_WORKSHEET_RESTRICTED','This form needs restricted case processing.');
 assert(tx.status==='draft',409,'BOND_PREPARATION_CLOSED','Only draft transactions may have their worksheet changed.');
 if(w.kind==='tenant')assert(rule.allowTenantInitiation&&tx.created_by===user.id,
   403,'BOND_WORKSHEET_FORBIDDEN','You may prepare only your own tenant-initiated application.');
 const errors=bondWorksheetErrors(tx.code as BondWorkflowCode,d.fields);
 assert(!errors.length,422,'BOND_WORKSHEET_INCOMPLETE',errors.join(' '));
 if(['B02','B03'].includes(tx.code)){
  const notice=new Date(d.fields.writtenNoticeDate).getTime();
  const effective=new Date(d.fields.topUpEffectiveDate).getTime();
  assert(Number.isFinite(notice)&&Number.isFinite(effective)&&effective-notice>=60*86400000,
    422,'BOND_TOPUP_NOTICE','Record a valid increase date at least 60 days after the applicable written notice.');
  if(tx.code==='B02'){
   const newRent=Number(d.fields.newWeeklyRentCents);
   assert(Number.isInteger(newRent)&&newRent>=b.weekly_rent_cents&&newRent<=100000000,
     422,'BOND_RENT_INCREASE_EVIDENCE','A general bond top-up needs the verified new weekly rent in cents.');
   assert(newRent>120000||b.general_cents+tx.general_delta_cents<=newRent*4,
     422,'BOND_GENERAL_TOPUP_CAP','The general bond top-up exceeds the four-week cap for the recorded weekly rent.');
  }else assert(b.pet_cents+tx.pet_delta_cents<=35000,422,'BOND_PET_CAP','Residential pet bond cannot exceed $350.');
 }
 const exists=await statement(env.DB,'SELECT id FROM bond_preparations WHERE transaction_id=?',id).first();
 assert(!exists,409,'BOND_WORKSHEET_EXISTS','Create a new transaction draft to replace a recorded worksheet.');
 const wid=uid('bw'),time=now();
 return mutation(env,user,'bond.worksheet',d.requestKey,{bondId,id,...d},[
 statement(env.DB,'INSERT INTO bond_preparations(id,bond_id,transaction_id,official_form,worksheet_envelope,policy_version,acknowledged_external,prepared_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
  wid,bondId,id,rule.form,await seal(env.DATA_ENCRYPTION_KEY,`bond-worksheet:${wid}`,d.fields),'WA_BONDS_OCT_2026',1,user.id,time,time),
 event(env,user,bondId,'official_worksheet.prepared',id,{form:rule.form,requiredFields:rule.required}),
 activity(env,user,'bond.worksheet_prepared','bond',bondId,b.property_id)
 ],{preparationId:wid,officialForm:rule.form,officialUrl:rule.form==='external'?null:'https://www.consumerprotection.wa.gov.au/bonds-manual-forms'});
}
export async function addBondContribution(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown) {
 const d=contribution.parse(input),b=await authorized(env,user,w,bondId,true);
 const party=await statement(env.DB,"SELECT role FROM bond_parties WHERE id=? AND bond_id=? AND status IN('confirmed','pending')",
  d.partyId,bondId).first<{role:string}>();
 assert(party?.role==='tenant',422,'BOND_CONTRIBUTOR_NOT_TENANT','Select a tenant participating in the bond.');
 const received=await statement(env.DB,'SELECT amount_cents FROM bond_receipts WHERE id=? AND bond_id=?',d.receiptId,bondId).first<{amount_cents:number}>();
 assert(received,404,'BOND_RECEIPT_NOT_FOUND','The bond receipt is not available.');
 const existing=await statement(env.DB,'SELECT COALESCE(SUM(amount_cents),0) AS total FROM bond_contributions WHERE receipt_id=?',d.receiptId).first<{total:number}>();
 assert((existing?.total??0)+d.amountCents<=received.amount_cents,422,'BOND_CONTRIBUTION_EXCESS','Contributions exceed funds recorded as received.');
 const id=uid('bcnt');return mutation(env,user,'bond.contribution',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_contributions(id,bond_id,party_id,receipt_id,amount_cents,created_by,created_at) VALUES(?,?,?,?,?,?,?)',
  id,bondId,d.partyId,d.receiptId,d.amountCents,user.id,now()),
 event(env,user,bondId,'contribution.assigned',null,{receiptId:d.receiptId,partyId:d.partyId,amountCents:d.amountCents}),
 activity(env,user,'bond.contribution_recorded','bond',bondId,b.property_id)
 ],{contributionId:id});
}
export async function addBondAllocation(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown) {
 const d=allocation.parse(input),b=await authorized(env,user,w,bondId);
 const tx=await txAccess(env,bondId,id);
 assert(tx.status==='draft'&&['B10','B11','B12','B13','B14','B15','B19'].includes(tx.code),
 409,'BOND_ALLOCATION_STATE','Allocations belong to a draft release application.');
 assert(d.generalCents+d.petCents>0,422,'BOND_ALLOCATION_EMPTY','Allocate a positive amount.');
 const isTenant=w.kind==='tenant';
 if(isTenant)assert(tx.code==='B13'&&tx.created_by===user.id&&d.recipientKind==='tenant',
  403,'BOND_ALLOCATION_FORBIDDEN','Tenants may allocate only their own tenant-initiated return.');
 else await authorized(env,user,w,bondId,true);
 assert((d.recipientKind==='tenant')===Boolean(d.partyId),422,'BOND_ALLOCATION_PARTY','A tenant payout requires an authorised bond party.');
 assert((d.recipientKind==='new_bond')===Boolean(d.targetBondId),422,'BOND_ALLOCATION_DESTINATION','A transfer requires a different target bond.');
 if(d.recipientKind==='new_bond'){
  assert(d.targetBondId&&tx.code==='B14'&&d.targetBondId!==bondId,422,'BOND_TRANSFER_CONTEXT','Choose a separate new tenancy bond.');
  const target=await statement(env.DB,"SELECT id,property_id FROM bonds WHERE id=?",d.targetBondId).first<{id:string;property_id:string}>();
  assert(target,422,'BOND_DESTINATION_MISSING','The new bond must exist in ProInspect.');
  // Writing this transfer may reveal a second tenancy. Require access to both.
  await authorized(env,user,w,d.targetBondId,true);
 }
 if(d.recipientKind==='housing_loan')assert(tx.code==='B15'&&d.paymentReference,
  422,'BOND_HOUSING_LOAN_REFERENCE','Record the official assistance-loan allocation reference.');
 if(d.recipientKind==='landlord')assert(tx.code==='B12',422,'BOND_LANDLORD_ALLOCATION','Only an evidenced landlord claim may receive bond funds.');
 if(d.recipientKind==='tenant'){
   assert(d.partyId,422,'BOND_ALLOCATION_PARTY','Choose a verified tenant bond party.');
   const party=await statement(env.DB,'SELECT user_id,role,status FROM bond_parties WHERE bond_id=? AND id=?',bondId,d.partyId)
      .first<{user_id:string|null;role:string;status:string}>();
   assert(party?.status==='confirmed'&&['tenant','estate'].includes(party.role),422,
      'BOND_RECIPIENT_NOT_CONFIRMED','Tenant/estate recipients must match the confirmed government bond parties.');
   if(isTenant)assert(party.user_id===user.id,403,'BOND_NOT_YOUR_SHARE','Only your own registered bond party share is available.');
 }
 const sums=await statement(env.DB,'SELECT COALESCE(SUM(general_cents),0) AS g,COALESCE(SUM(pet_cents),0) AS p FROM bond_allocations WHERE bond_id=? AND transaction_id=?',
  bondId,id).first<{g:number;p:number}>();
 assert((sums?.g??0)+d.generalCents<=-tx.general_delta_cents&&(sums?.p??0)+d.petCents<=-tx.pet_delta_cents,
  422,'BOND_ALLOCATION_EXCESS','Recipient allocations exceed the proposed release amounts.');
 const aid=uid('ball');return mutation(env,user,'bond.allocation',d.requestKey,{bondId,id,...d},[
 statement(env.DB,'INSERT INTO bond_allocations(id,bond_id,transaction_id,recipient_kind,party_id,target_bond_id,general_cents,pet_cents,payment_reference,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  aid,bondId,id,d.recipientKind,d.partyId??null,d.targetBondId??null,d.generalCents,d.petCents,d.paymentReference??null,user.id,now()),
 event(env,user,bondId,'allocation.added',id,{recipientKind:d.recipientKind,generalCents:d.generalCents,petCents:d.petCents}),
 activity(env,user,'bond.allocation_recorded','bond',bondId,b.property_id)
 ],{allocationId:aid});
}
export async function verifyExternalBondDocument(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown) {
 staffOnly(w,user);
 const d=verification.parse(input),b=await authorized(env,user,w,bondId,true);
 await document(env,b,d.documentId);
 if(d.transactionId){
   const tx=await txAccess(env,bondId,d.transactionId);
   assert(tx.external_reference===d.externalReference,422,'BOND_REFERENCE_MISMATCH','Evidence must match the actual external transaction reference.');
 }
 const origin=await statement(env.DB,'SELECT created_by FROM documents WHERE id=?',d.documentId).first<{created_by:string}>();
 assert(origin?.created_by!==user.id,403,'BOND_SELF_VERIFICATION','An uploaded government document requires an independent staff reviewer.');
 const id=uid('bverify'),time=now();
 return mutation(env,user,'bond.verification',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_external_verifications(id,bond_id,transaction_id,document_id,external_reference,source_channel,verification_method,review_notes_envelope,result,reviewed_by,reviewed_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  id,bondId,d.transactionId??null,d.documentId,d.externalReference,d.sourceChannel,d.verificationMethod,
  await seal(env.DATA_ENCRYPTION_KEY,`bond-verify:${id}`,{notes:d.reviewNotes}),d.result,user.id,time),
 event(env,user,bondId,'external_document.'+d.result,d.transactionId??null,{documentId:d.documentId,reference:d.externalReference}),
 activity(env,user,'bond.external_review','bond',bondId,b.property_id)
 ],{verificationId:id,result:d.result});
}
export async function reconcileBondPayout(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown) {
 staffOnly(w,user);
 const d=reconcile.parse(input),b=await authorized(env,user,w,bondId,true),tx=await txAccess(env,bondId,id);
 assert(tx.status==='confirmed'&&['B10','B11','B12','B13','B14','B15','B19'].includes(tx.code),
  409,'BOND_PAYOUT_NOT_CONFIRMED','Only a government-confirmed release can be reconciled.');
 assert(b.status==='payout_pending',409,'BOND_PAYOUT_STATE','There is no pending confirmed payout.');
 assert(tx.external_reference===d.governmentReference,422,'BOND_PAYOUT_REFERENCE','Payout must match the release application.');
 await document(env,b,d.governmentDocumentId);
 assert(tx.confirmation_document_id!==d.governmentDocumentId,422,'BOND_PAYOUT_PROOF_SEPARATE','Use separate government payout evidence, not the release approval document.');
 const verified=await statement(env.DB,"SELECT id FROM bond_external_verifications WHERE bond_id=? AND document_id=? AND external_reference=? AND result='verified'",
  bondId,d.governmentDocumentId,d.governmentReference).first();
 assert(verified,422,'BOND_PAYOUT_EVIDENCE_UNVERIFIED','An independent staff reviewer must verify the actual payout confirmation.');
 const targetG=-tx.general_delta_cents,targetP=-tx.pet_delta_cents;
 assert(d.generalCents===targetG&&d.petCents===targetP,422,'BOND_PAYOUT_MISMATCH','Payout must exactly match the government-approved release amounts.');
 if(tx.code==='B14'){
  const target=await statement(env.DB,'SELECT b.id,b.status FROM bonds b JOIN bond_allocations a ON a.target_bond_id=b.id WHERE a.transaction_id=? AND a.recipient_kind=\'new_bond\' LIMIT 1',id)
    .first<{id:string;status:string}>();
  assert(target&&['active','awaiting_lodgement','lodgement_submitted'].includes(target.status),422,'BOND_TRANSFER_UNMATCHED',
     'The linked new bond must exist with a recorded lodgement process.');
 }
 const existed=await statement(env.DB,'SELECT id FROM bond_payout_reconciliations WHERE transaction_id=?',id).first();
 assert(!existed,409,'BOND_PAYOUT_ALREADY_RECONCILED','This release already has a reconciliation record.');
 const rid=uid('brecon'),time=now(),nextG=b.held_general_cents-d.generalCents,nextP=b.held_pet_cents-d.petCents;
 assert(nextG>=0&&nextP>=0,422,'BOND_PAYOUT_BALANCE','Reconciled payout cannot exceed confirmed bond held.');
 const nextStatus=d.outcome==='matched'?(nextG+nextP===0?'released':'active'):'exception';
 const actions=[statement(env.DB,'INSERT INTO bond_payout_reconciliations(id,bond_id,transaction_id,government_reference,government_document_id,general_cents,pet_cents,outcome,reconciled_by,notes_envelope,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   rid,bondId,id,d.governmentReference,d.governmentDocumentId,d.generalCents,d.petCents,d.outcome,user.id,
   await seal(env.DATA_ENCRYPTION_KEY,`bond-recon:${rid}`,{notes:d.notes}),time),
 statement(env.DB,'UPDATE bonds SET status=?,held_general_cents=CASE WHEN ?=\'matched\' THEN ? ELSE held_general_cents END,held_pet_cents=CASE WHEN ?=\'matched\' THEN ? ELSE held_pet_cents END,updated_at=?,version=version+1 WHERE id=?',
   nextStatus,d.outcome,nextG,d.outcome,nextP,time,bondId),
 event(env,user,bondId,'payout.'+d.outcome,id,{reconciliationId:rid}),
 activity(env,user,'bond.payout_reconciled','bond',bondId,b.property_id)
 ];
 return mutation(env,user,'bond.payout',d.requestKey,{bondId,id,...d},actions,
   {reconciliationId:rid,status:nextStatus});
}
export async function createBondException(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown) {
 staffOnly(w,user);
 const d=exception.parse(input),b=await authorized(env,user,w,bondId,true);
 if(d.transactionId)await txAccess(env,bondId,d.transactionId);
 const id=uid('bex');return mutation(env,user,'bond.exception',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_exception_cases(id,bond_id,transaction_id,kind,details_envelope,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
   id,bondId,d.transactionId??null,d.kind,await seal(env.DATA_ENCRYPTION_KEY,`bond-exception:${id}`,{details:d.details}),user.id,now(),now()),
 event(env,user,bondId,'exception.opened',d.transactionId??null,{exceptionId:id,kind:d.kind}),
 activity(env,user,'bond.exception_opened','bond',bondId,b.property_id)
 ],{exceptionId:id,status:'open'});
}
export async function changeBondException(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown) {
 staffOnly(w,user);
 const d=exceptionStatus.parse(input),b=await authorized(env,user,w,bondId,true);
 const existing=await statement(env.DB,'SELECT status FROM bond_exception_cases WHERE id=? AND bond_id=?',id,bondId).first<{status:string}>();
 assert(existing,404,'BOND_EXCEPTION_NOT_FOUND','Case not found.');
 assert(existing.status!=='resolved'&&(d.status==='resolved'||d.status==='referred'||d.status==='in_review'),
   409,'BOND_EXCEPTION_CLOSED','This case is already resolved.');
 return mutation(env,user,'bond.exception.status',d.requestKey,{bondId,id,...d},[
 statement(env.DB,'UPDATE bond_exception_cases SET status=?,resolved_by=?,updated_at=? WHERE id=? AND bond_id=?',
   d.status,d.status==='resolved'?user.id:null,now(),id,bondId),
 event(env,user,bondId,'exception.'+d.status,null,{exceptionId:id}),
 activity(env,user,'bond.exception_status','bond',bondId,b.property_id)
 ],{exceptionId:id,status:d.status});
}
