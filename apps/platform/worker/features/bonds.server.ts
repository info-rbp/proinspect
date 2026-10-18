import { z } from 'zod';
import { assert, now, statement, uid, type Env } from '../../../../packages/database/types';
import type { Principal, Workspace } from '../../../../packages/domain/index';
import { activity, dateOnly, isoDate, recordId, reference, replay, receipt, version } from '../../../../packages/operations/core';
import { seal, unseal } from '../../../../packages/auth/crypto';
import { tenancyAccess } from './tenancies.server';

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
  paidAt:isoDate,payer:z.string().min(2).max(180),paymentReference:reference,requestKey:recordId});
const confirmSchema = z.object({version,status:z.enum(['submitted','confirmed','rejected','cancelled']),
  channel:governmentChannels.optional(),externalReference:reference.optional(),
  confirmationDocumentId:recordId.optional(),requestKey:recordId});
const claimSchema = z.object({category:claimCategories,amountCents:cents.positive(),
  explanation:z.string().min(5).max(3500),evidenceDocumentId:recordId.optional(),requestKey:recordId});
const noticeSchema = z.object({kind:z.enum(['release_application','invitation_to_submit','commissioner_decision','appeal','variation','other']),
  governmentReference:reference, receivedAt:isoDate,responseDueAt:isoDate.optional(),
  documentId:recordId.optional(),requestKey:recordId});
const caseSchema = z.object({status:z.enum(['notice_received','responded','referred','submissions','determined','appealed','declined','resolved']),
  decision:z.string().max(5000).optional(),reference:reference.optional(),
  decisionAt:isoDate.optional(),appealDueAt:isoDate.optional(),version:version.optional(),requestKey:recordId});
const evidenceSchema = z.object({documentId:recordId,category:z.enum(['lodgement','variation','release','claim','notice','dispute','court','government_confirmation','other']),
  transactionId:recordId.optional(),requestKey:recordId});

function event(env:Env,user:Principal,bondId:string,action:string,transactionId:string|null=null,metadata:Record<string,unknown>={}) {
 return statement(env.DB,'INSERT INTO bond_events(id,bond_id,transaction_id,actor_id,action,metadata_json,created_at) VALUES(?,?,?,?,?,?,?)',
 uid('be'),bondId,transactionId,user.id,action,JSON.stringify(metadata),now());
}
async function authorized(env:Env,user:Principal,w:Workspace,bondId:string,write=false){
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
async function document(env:Env,bond:Record<string,any>,documentId:string) {
 const d=await statement(env.DB,"SELECT id FROM documents WHERE id=? AND property_id=? AND tenancy_id=? AND status='issued'",
 documentId,bond.property_id,bond.tenancy_id).first();
 assert(d,422,'BOND_DOCUMENT_INVALID','Attach an issued document belonging to this tenancy.');
}
async function mutation(env:Env,user:Principal,action:string,key:string,payload:unknown,commands:ReturnType<typeof statement>[],result:unknown){
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
  details:(await unseal<{details:string}>(env.DATA_ENCRYPTION_KEY,`bond-tx:${t.id}`,t.details_envelope)).details,
  createdAt:t.created_at,submittedAt:t.submitted_at,confirmedAt:t.confirmed_at,
  externalReference:t.external_reference,version:t.version,
  channel:t.channel,
 })));
 const receipts=(await statement(env.DB,'SELECT id,kind,amount_cents,paid_at,due_at,lodgement_confirmed_at FROM bond_receipts WHERE bond_id=? ORDER BY created_at',id).all()).results;
 const cases=(await statement(env.DB,'SELECT id,transaction_id,status,external_reference,decision_at,appeal_due_at,version FROM bond_cases WHERE bond_id=? ORDER BY created_at',id).all()).results;
 const notices=(await statement(env.DB,'SELECT id,kind,government_reference,received_at,response_due_at FROM bond_notices WHERE bond_id=? ORDER BY received_at',id).all()).results;
 const deadlines=(await statement(env.DB,'SELECT id,kind,source,due_at,completed_at FROM bond_deadlines WHERE bond_id=? ORDER BY due_at',id).all()).results;
 const claims=(await statement(env.DB,'SELECT id,transaction_id,category,amount_cents,evidence_document_id FROM bond_claims WHERE bond_id=?',id).all()).results;
 return {id:b.id,tenancyId:b.tenancy_id,propertyId:b.property_id,status:b.status,
  bondReference:b.bond_reference,generalCents:b.general_cents,petCents:b.pet_cents,
  heldGeneralCents:b.held_general_cents,heldPetCents:b.held_pet_cents,weeklyRentCents:b.weekly_rent_cents,
  version:b.version,transactions,receipts,cases,notices,deadlines,claims,
  governmentSubmission:'external_only',roles:{canManage:!isTenant,canApplyRelease:true},
  guidance:'ProInspect coordinates records; only government confirmation establishes an official bond outcome.'};
}
export async function createTransaction(env:Env,user:Principal,w:Workspace,bondId:string,input:unknown){
 const d=txSchema.parse(input),b=await authorized(env,user,w,bondId);
 const tenant=w.kind==='tenant';
 assert(!tenant||['B13','B16','B17','B18','B20'].includes(d.code),403,'BOND_ACTION_FORBIDDEN','This transaction requires the managing party.');
 assert(b.status!=='released',409,'BOND_CLOSED','Released bonds cannot be modified.');
 if(d.code==='B01')assert(b.status==='draft'||b.status==='awaiting_lodgement',409,'BOND_LODGEMENT_STATE','Initial lodgement can only start once.');
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
 const paid=new Date(d.paidAt);assert(paid.getTime()<=Date.now()+300000,422,'BOND_RECEIPT_FUTURE','Payment cannot be dated in the future.');
 const due=new Date(paid.getTime()+14*24*3600*1000).toISOString(),id=uid('brc'),deadline=uid('bdue'),time=now();
 return mutation(env,user,'bond.receipt',d.requestKey,{bondId,...d},[
 statement(env.DB,'INSERT INTO bond_receipts(id,bond_id,kind,amount_cents,payer_envelope,payment_reference,paid_at,due_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
 id,bondId,d.kind,d.amountCents,await seal(env.DATA_ENCRYPTION_KEY,`bond-receipt:${id}`,{payer:d.payer}),d.paymentReference,d.paidAt,due,user.id,time),
 statement(env.DB,"INSERT INTO bond_deadlines(id,bond_id,kind,source,due_at,created_at) VALUES(?,?,'lodgement','receipt',?,?)",deadline,bondId,due,time),
 statement(env.DB,"UPDATE bonds SET status=CASE WHEN status='draft' THEN 'awaiting_lodgement' ELSE status END,version=version+1,updated_at=? WHERE id=?",time,bondId),
 event(env,user,bondId,'payment.recorded',null,{kind:d.kind,amountCents:d.amountCents,receiptId:id}),
 activity(env,user,'bond.payment_recorded','bond',bondId,b.property_id)
 ],{receiptId:id,dueAt:due});
}
export async function confirmTransaction(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown){
 const d=confirmSchema.parse(input),b=await authorized(env,user,w,bondId,true);
 const tx=await statement(env.DB,'SELECT * FROM bond_transactions WHERE id=? AND bond_id=?',id,bondId).first<Record<string,any>>();
 assert(tx,404,'BOND_TRANSACTION_NOT_FOUND','Bond transaction not found.');
 assert(tx.version===d.version && ['draft','submitted'].includes(tx.status),409,'BOND_TRANSACTION_CHANGED','Transaction has already changed.');
 assert((tx.status==='draft'&&['submitted','cancelled'].includes(d.status))||
 (tx.status==='submitted'&&['confirmed','rejected'].includes(d.status)),409,'BOND_TRANSITION_INVALID','Invalid transaction transition.');
 if(d.status==='submitted')assert(d.channel&&d.externalReference,422,'EXTERNAL_REFERENCE_REQUIRED','Record actual government submission channel and reference.');
 if(d.status==='confirmed'){
  assert(['B01','B02','B03','B10','B11','B12','B13','B14','B15','B19'].includes(tx.code),
    422,'BOND_NON_FINANCIAL_CONFIRMATION','This workflow does not change the government-held bond balance.');
  assert(tx.external_reference&&d.confirmationDocumentId,422,'CONFIRMATION_REQUIRED','External submission reference and a reviewed government confirmation are required.');
  await document(env,b,d.confirmationDocumentId!);
  if(tx.code==='B01') {
   assert(b.status!=='active',409,'BOND_ALREADY_LODGED','Initial bond already confirmed.');
   const receipts=await statement(env.DB,"SELECT kind,COALESCE(SUM(amount_cents),0) AS amount FROM bond_receipts WHERE bond_id=? GROUP BY kind",bondId).all<{kind:string;amount:number}>();
   const totals=new Map(receipts.results.map(x=>[x.kind,x.amount]));
   assert((totals.get('general')??0)>=b.general_cents&&(totals.get('pet')??0)>=b.pet_cents,422,
     'BOND_FUNDS_NOT_RECORDED','Record the payments actually received before confirming lodgement.');
  }
  if(tx.code==='B12'){
    const c=await statement(env.DB,'SELECT COALESCE(SUM(amount_cents),0) AS amount FROM bond_claims WHERE transaction_id=?',id).first<{amount:number}>();
    assert((c?.amount??0)>0 && (c?.amount??0)<=-(tx.general_delta_cents+tx.pet_delta_cents),422,
      'BOND_CLAIMS_MISMATCH','Deductions must be evidenced and reconcile with the proposed bond release.');
  }
  if(['B10','B11','B12','B13','B14','B15','B19'].includes(tx.code))
   assert(tx.general_delta_cents<=0&&tx.pet_delta_cents<=0&&
      b.held_general_cents+tx.general_delta_cents>=0&&b.held_pet_cents+tx.pet_delta_cents>=0,
      422,'BOND_BALANCE','Release amounts must not exceed bond held.');
  if(['B02','B03'].includes(tx.code))
   assert(tx.general_delta_cents>=0&&tx.pet_delta_cents>=0&&(tx.general_delta_cents+tx.pet_delta_cents)>0,
     422,'BOND_VARIATION_AMOUNT','Bond top-ups must be positive.');
 }
 const time=now(),newG=b.held_general_cents+tx.general_delta_cents,newP=b.held_pet_cents+tx.pet_delta_cents;
 const release=['B10','B11','B12','B13','B14','B15','B19'].includes(tx.code);
 const nextStatus=d.status==='confirmed'?(release?(newG+newP===0?'released':'active'):'active'):
  d.status==='submitted'?(release?'release_pending':tx.code==='B01'?'lodgement_submitted':'variation_pending'):
  d.status==='rejected'?'exception':b.status;
 const commands=[statement(env.DB,
  'UPDATE bond_transactions SET status=?,version=version+1,channel=COALESCE(?,channel),external_reference=COALESCE(?,external_reference),confirmation_document_id=COALESCE(?,confirmation_document_id),submitted_at=CASE WHEN ?=\'submitted\' THEN ? ELSE submitted_at END,confirmed_at=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_at END,confirmed_by=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_by END,updated_at=? WHERE id=? AND bond_id=? AND version=?',
  d.status,d.channel??null,d.externalReference??null,d.confirmationDocumentId??null,d.status,time,d.status,time,d.status,user.id,time,id,bondId,d.version),
  statement(env.DB,'UPDATE bonds SET status=?,bond_reference=CASE WHEN ?=\'confirmed\' AND ?=\'B01\' THEN ? ELSE bond_reference END,held_general_cents=CASE WHEN ?=\'confirmed\' THEN ? ELSE held_general_cents END,held_pet_cents=CASE WHEN ?=\'confirmed\' THEN ? ELSE held_pet_cents END,general_cents=CASE WHEN ?=\'confirmed\' AND ? IN (\'B02\',\'B03\') THEN general_cents+? ELSE general_cents END,pet_cents=CASE WHEN ?=\'confirmed\' AND ? IN (\'B02\',\'B03\') THEN pet_cents+? ELSE pet_cents END,version=version+1,updated_at=?,confirmed_at=CASE WHEN ?=\'confirmed\' THEN ? ELSE confirmed_at END WHERE id=?',
   nextStatus,d.status,tx.code,tx.external_reference,d.status,tx.code==='B01'?b.general_cents:newG,d.status,tx.code==='B01'?b.pet_cents:newP,d.status,tx.code,tx.general_delta_cents,d.status,tx.code,tx.pet_delta_cents,time,d.status,time,bondId),
  event(env,user,bondId,'transaction.'+d.status,id,{code:tx.code,externalReference:d.externalReference??tx.external_reference}),
  activity(env,user,'bond.transaction_'+d.status,'bond_transaction',id,b.property_id)
 ];
 if(d.status==='confirmed'){
  commands.push(statement(env.DB,"UPDATE bond_deadlines SET completed_at=? WHERE bond_id=? AND kind='lodgement' AND completed_at IS NULL",time,bondId));
  commands.push(statement(env.DB,'UPDATE bond_receipts SET lodgement_confirmed_at=? WHERE bond_id=? AND lodgement_confirmed_at IS NULL',time,bondId));
 }
 return mutation(env,user,'bond.tx.transition',d.requestKey,{bondId,id,...d},commands,{id,status:d.status,bondStatus:nextStatus});
}
export async function addClaim(env:Env,user:Principal,w:Workspace,bondId:string,id:string,input:unknown){
 const d=claimSchema.parse(input),b=await authorized(env,user,w,bondId,true);
 const tx=await statement(env.DB,'SELECT code,status FROM bond_transactions WHERE id=? AND bond_id=?',id,bondId).first<{code:string;status:string}>();
 assert(tx&&tx.code==='B12'&&tx.status==='draft',409,'BOND_CLAIM_STATE','Claims require a draft landlord-deduction release.');
 if(d.evidenceDocumentId) await document(env,b,d.evidenceDocumentId);
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
 if(d.documentId)await document(env,b,d.documentId);
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
