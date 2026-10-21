import { OperationForm, Input, TextArea, Select, Panel, choices } from './OperationForm';
import { WA_BOND_RULES, WA_BOND_FORMS, type BondWorkflowCode } from '../../../../packages/validation/wa-bonds';

type Tx={id:string;code:string;status:string;version:number;externalReference?:string;
 generalDeltaCents:number;petDeltaCents:number;};
type Bond={
 id:string;status:string;heldGeneralCents:number;heldPetCents:number;
 participants:{id:string;role:string;status:string;user_id?:string|null}[];
 receipts:{id:string;amount_cents:number;kind:string}[];
 allocations:{id:string;transaction_id:string;recipient_kind:string;general_cents:number;pet_cents:number}[];
 worksheets:{transaction_id:string;official_form:string;policy_version:string}[];
 verification:{transaction_id?:string|null;result:string;document_id:string;external_reference:string}[];
 exceptions:{id:string;kind:string;status:string}[];
};
type Role={kind:string;staffRole?:string|null};
const fmt=(s:string)=>s.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ');
const isRelease=(code:string)=>['B10','B11','B12','B13','B14','B15','B19'].includes(code);
export function BondWorkflowCompletion({base,b,tx,role,userId}:{
 base:string;b:Bond;tx:Tx;role:Role;userId:string;
}){
 const policy=WA_BOND_RULES[tx.code as BondWorkflowCode];
 const canManage=role.kind!=='tenant';
 const canPrepare=canManage||(role.kind==='tenant'&&policy.allowTenantInitiation===true);
 const prepared=b.worksheets.some(x=>x.transaction_id===tx.id);
 const official=policy.form==='lodgement'||policy.form==='variation'||policy.form==='release'?
  WA_BOND_FORMS[policy.form]:null;
 const allocated=b.allocations.filter(x=>x.transaction_id===tx.id);
 const verified=b.verification.some(x=>x.transaction_id===tx.id&&x.result==='verified');
 return <>
  <Panel title="Official bond preparation checklist" description={policy.notes}>
   <p>Form/process: <strong>{policy.form}</strong> · {prepared?'Worksheet prepared':'Worksheet not completed'}.
    {official&&<> Use the <a href={official} target="_blank" rel="noreferrer">current official WA form</a>.</>}
    {' '}Preparation here does not sign, serve or submit a government application.</p>
   {canPrepare&&tx.status==='draft'&&!prepared&&policy.form!=='restricted'&&policy.form!=='legacy'&&
    <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/prepare`}
      defaults={{acknowledgeExternalProcess:true}} label="Save form preparation checklist">
     {policy.required.map(field=><Input key={field} name={`fields.${field}`}
       type={/(?:date|deadline|tenancyStart|tenancyEndDate|effectiveDate)/i.test(field)?'date':'text'}
       label={fmt(field)}/>)}
     <p className="small">I understand that actual government forms, required signatures, external submissions and lawful service must be completed separately.</p>
    </OperationForm>}
  </Panel>
  {isRelease(tx.code)&&tx.status==='draft'&&canPrepare&&
   <Panel title="Recipient payout allocations" description="Each dollar of general and pet bond being released must be assigned to an eligible recipient before external submission. Do not enter bank details.">
    <div>{allocated.map(a=><p key={a.id}>{a.recipient_kind}: general {a.general_cents}¢, pet {a.pet_cents}¢</p>)}</div>
    <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/allocations`} label="Record recipient allocation">
     <Select name="recipientKind" label="Recipient" options={choices(canManage?
       (tx.code==='B12'?['tenant','landlord']:tx.code==='B14'?['new_bond']:tx.code==='B15'?['tenant','housing_loan']:['tenant']):['tenant'])}/>
     <Select name="partyId" label="Tenant/estate recipient (when selected)" optional
       options={b.participants.filter(p=>p.status==='confirmed'&&(p.role==='tenant'||p.role==='estate')&&
           (role.kind!=='tenant'||p.user_id===userId)).map(p=>({value:p.id,label:p.role+' · '+p.id}))}/>
     <Input name="targetBondId" label="Destination bond ID (new bond transfers only)" required={false}/>
     <Input name="paymentReference" label="Housing assistance / allocation reference (where required)" required={false}/>
     <Input name="generalCents" label="General bond allocation in cents" type="number" required={false}/>
     <Input name="petCents" label="Pet bond allocation in cents" type="number" required={false}/>
    </OperationForm>
   </Panel>}
  {role.kind==='staff'&&tx.status==='submitted'&&
   <Panel title="Independent government-evidence review" description="Check official provenance against BondsOnline, authorised government correspondence or court records. This is a human attestation, not automated verification.">
    <OperationForm endpoint={`${base}/bonds/${b.id}/verifications`}
      defaults={{transactionId:tx.id}} label="Record independent evidence review">
     <Input name="documentId" label="Issued government certificate / official document ID"/>
     <Input name="externalReference" label="Official application/reference" value={tx.externalReference??''}/>
     <Select name="sourceChannel" label="Government channel" options={choices(['manual','bondsonline','ecourts','other'])}/>
     <Select name="verificationMethod" label="Evidence checked against" options={choices(['government_portal','government_correspondence','official_certificate','court_record'])}/>
     <Select name="result" label="Review result" options={choices(['verified','rejected'])}/>
     <TextArea name="reviewNotes" label="Verification evidence and cross-check (minimum 20 characters)"/>
    </OperationForm>
    <p className="small">Current independent review: {verified?'Verified record exists':'Awaiting verified record'}</p>
   </Panel>}
  {role.kind==='staff'&&tx.status==='confirmed'&&isRelease(tx.code)&&b.status==='payout_pending'&&
   <Panel title="Government payout reconciliation" description="Confirm actual external payout and all general/pet amounts against independently checked government evidence. No money is transferred by this form.">
    <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/payout`} label="Reconcile government payout">
     <Input name="governmentReference" label="External release reference" value={tx.externalReference??''}/>
     <Input name="governmentDocumentId" label="Issued external payout confirmation document ID"/>
     <Input name="generalCents" label="General bond paid (cents)" type="number" value={-tx.generalDeltaCents}/>
     <Input name="petCents" label="Pet bond paid (cents)" type="number" value={-tx.petDeltaCents}/>
     <Select name="outcome" label="Actual government outcome" options={choices(['matched','exception'])}/>
     <TextArea name="notes" label="Verification and reconciliation notes"/>
    </OperationForm>
   </Panel>}
 </>;
}
export function BondOperationsCompletion({base,b,role,members}:{
 base:string;b:Bond;role:Role;members:{user_id:string;display_name?:string;email?:string}[];
}){
 const staff=role.kind==='staff';
 return <>
 {role.kind!=='tenant'&&b.receipts.length>0&&b.participants.length>0&&
 <Panel title="Tenant bond-contribution ledger" description="Record individual contribution shares against actually received receipts. Contribution records are immutable.">
  <OperationForm endpoint={`${base}/bonds/${b.id}/contributions`} label="Allocate received contribution">
   <Select name="partyId" label="Tenant bond party" options={b.participants.filter(p=>p.role==='tenant').map(p=>({value:p.id,label:p.id}))}/>
   <Select name="receiptId" label="Recorded receipt" options={b.receipts.map(r=>({value:r.id,label:r.kind+' · '+r.amount_cents+' cents'}))}/>
   <Input name="amountCents" label="Contribution (cents)" type="number"/>
  </OperationForm>
 </Panel>}
 {staff&&<Panel title="Government evidence and exceptional cases" description="Only designated operational staff can review official evidence or record restricted estate/exception cases. Keep family-violence evidence in the separately restricted system.">
  <OperationForm endpoint={`${base}/bonds/${b.id}/verifications`} label="Review supporting government document">
   <Input name="documentId" label="Issued official document ID"/>
   <Input name="externalReference" label="Government notice / bond reference"/>
   <Select name="sourceChannel" label="External source" options={choices(['manual','bondsonline','ecourts','other'])}/>
   <Select name="verificationMethod" label="Verification method" options={choices(['government_portal','government_correspondence','official_certificate','court_record'])}/>
   <Select name="result" label="Outcome" options={choices(['verified','rejected'])}/>
   <TextArea name="reviewNotes" label="Independent checks completed"/>
  </OperationForm>
  <OperationForm endpoint={`${base}/bonds/${b.id}/exceptions`} label="Open restricted operational exception">
   <Select name="kind" label="Exception type" options={choices(['estate','failed_lodgement','payout_mismatch','missing_government_record','manual_review'])}/>
   <TextArea name="details" label="Caseworker instructions (do not include family-violence evidence)"/>
   <Input name="transactionId" label="Related bond transaction ID" required={false}/>
  </OperationForm>
  {b.exceptions.map(c=><div key={c.id} className="record-row">
   <p>{fmt(c.kind)} · {fmt(c.status)}</p>
   {c.status!=='resolved'&&<OperationForm endpoint={`${base}/bonds/${b.id}/exceptions/${c.id}/status`} label="Update exception stage">
    <Select name="status" label="Stage" options={choices(['in_review','referred','resolved'])}/>
   </OperationForm>}
  </div>)}
 </Panel>}
 </>;
}
