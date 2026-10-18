import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, TextArea, Panel, Select, choices } from '../components/OperationForm';

const workflowNames: Record<string,string> = {
 B01:'Initial lodgement',B02:'General bond top-up',B03:'Pet bond addition',
 B04:'Add bond tenant',B05:'Remove bond tenant',B06:'Change landlord',
 B07:'Change property manager',B08:'Update government contact details',
 B09:'Deceased tenant: variation',B10:'Partial bond release',
 B11:'Full return without deductions',B12:'Release with claimed deductions',
 B13:'Tenant-initiated release',B14:'Transfer to a new bond',
 B15:'Housing bond assistance repayment',B16:'Disputed/no-response release',
 B17:'Commissioner evidence submission',B18:'Magistrates Court appeal',
 B19:'Deceased tenant: release',B20:'Restricted family-violence bond process',
 B21:'Missing or overdue lodgement',B22:'Payout/reconciliation discrepancy',
 B23:'Transitional legacy disposal record',
};
type Transaction = {id:string;code:string;status:string;details:string;version:number;externalReference?:string;generalDeltaCents:number;petDeltaCents:number};
type Bond = {id:string;status:string;bondReference?:string;generalCents:number;petCents:number;heldGeneralCents:number;heldPetCents:number;weeklyRentCents:number;transactions:Transaction[];participants:any[];receipts:any[];claims:any[];deadlines:any[];notices:any[];cases:any[];governmentSubmission:string;};
const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n/100);
export async function loader({request,context,params}:LoaderFunctionArgs) {
 const root=`/api/w/${params.kind}/${params.scopeId}`;
 return {
  bonds:await loadApi(request,context,`${root}/tenancies/${params.tenancyId}/bonds`),
  detail:await loadApi(request,context,`${root}/tenancies/${params.tenancyId}`),
 } as {bonds:{bonds:Bond[]};detail:any};
}
export default function TenancyBonds(){
 const {bonds,detail}=useLoaderData<typeof loader>();
 const d=useWorkspace(),w=d.workspace,base=workspaceApi(w.kind,w.scopeId);
 const canManage=w.kind!=='tenant';
 const tenancy=detail.tenancy;
 return <>
  <PageHeading title="Bond management" description="Coordinate WA residential bond lodgement, variations, releases and government decisions. ProInspect does not lodge or disburse money; confirmed outcomes must be supported by government records."/>
  <p><Link to={`${w.href}/tenancies/${tenancy.id}`}>← Back to tenancy</Link> · Official forms: <a href="https://www.consumerprotection.wa.gov.au/bonds-manual-forms" target="_blank" rel="noreferrer">WA Bonds manual forms</a></p>
  <div className="stack">
  {!bonds.bonds.length && canManage && <Panel title="Start a bond register" description="Use actual payment and rent values. The government bond remains unconfirmed until lodgement evidence is attached.">
   <OperationForm endpoint={base+'/bonds'} defaults={{tenancyId:tenancy.id}} label="Create bond register">
    <Input name="weeklyRentCents" label="Weekly rent (cents)" type="number"/>
    <Input name="generalCents" label="Initial general bond (cents)" type="number"/>
    <Input name="petCents" label="Initial pet bond (cents)" type="number" required={false}/>
   </OperationForm>
  </Panel>}
  {!bonds.bonds.length && !canManage && <p>No bond information has yet been recorded for this tenancy.</p>}
  {bonds.bonds.map(b=><div className="stack" key={b.id}>
   <Panel title="Bond register" description="This is a record of information provided to ProInspect, not a live Bonds Administration balance.">
    <div className="grid-3">
     <div><strong>Status</strong><p><Badge status={b.status}/></p></div>
     <div><strong>Government reference</strong><p>{b.bondReference||'Not confirmed'}</p></div>
     <div><strong>Recorded bond</strong><p>{money(b.generalCents+b.petCents)}</p></div>
     <div><strong>General bond</strong><p>{money(b.heldGeneralCents)}</p></div>
     <div><strong>Pet bond</strong><p>{money(b.heldPetCents)}</p></div>
     <div><strong>Total confirmed held</strong><p>{money(b.heldGeneralCents+b.heldPetCents)}</p></div>
    </div>
   </Panel>
   {canManage&&<Panel title="Record a government bond party" description="This does not change the official participant register until government evidence is confirmed.">
    <OperationForm endpoint={`${base}/bonds/${b.id}/parties`} label="Add pending participant">
     <Select name="role" label="Legal relationship" options={choices(['tenant','landlord','agent','estate'])}/>
     <Input name="name" label="Legal name"/>
     <Input name="effectiveAt" type="datetime-local" label="Effective date/time"/>
    </OperationForm>
   </Panel>}
   {!!b.participants.length&&<Panel title="Bond parties and externally confirmed changes">
    {b.participants.map((p:any)=><div className="record-row" key={p.id}>
      <div><strong>{p.role}</strong><p>Status: {p.status} · Effective: {p.effective_at}</p>
        {p.external_reference&&<p className="small">Government reference: {p.external_reference}</p>}</div>
      {canManage&&p.status!=='former'&&<OperationForm endpoint={`${base}/bonds/${b.id}/parties/${p.id}/status`}
        defaults={{status:p.status==='pending'?'confirmed':'former'}} label={p.status==='pending'?'Confirm government party':'Record official party removal'}>
        <Input name="governmentReference" label="Government variation/reference"/>
        <Input name="governmentDocumentId" label="Issued government certificate document ID"/>
      </OperationForm>}
    </div>)}
   </Panel>}
   {canManage && <Panel title="Record a bond payment" description="Recording a receipt starts a 14-day reminder; it does not transfer funds or lodge the bond.">
    <OperationForm endpoint={`${base}/bonds/${b.id}/receipts`} label="Record received payment">
     <Select name="kind" label="Bond payment category" options={choices(['general','pet'])}/>
     <Input name="amountCents" type="number" label="Amount received (cents)"/>
     <Input name="paidAt" type="datetime-local" label="Date payment received"/>
     <Input name="payer" label="Payer's name"/>
     <Input name="paymentReference" label="Actual payment reference"/>
    </OperationForm>
   </Panel>}
   <Panel title="Start a bond workflow" description="Select an applicable official process. New drafts are not sent to government automatically.">
    <OperationForm endpoint={`${base}/bonds/${b.id}/transactions`} label="Create bond workflow">
     <Select name="code" label="Workflow" options={Object.entries(workflowNames).filter(([c])=>!['B20','B23'].includes(c)&&(canManage||['B13','B16','B17','B18'].includes(c))).map(([value,label])=>({value,label}))}/>
     <TextArea name="details" label="Instructions, context and evidence required"/>
     <Input name="generalDeltaCents" label="Proposed general bond change in cents (+ or -)" type="number" required={false}/>
     <Input name="petDeltaCents" label="Proposed pet bond change in cents (+ or -)" type="number" required={false}/>
    </OperationForm>
   </Panel>
   {b.receipts.length>0&&<Panel title="Payment receipt and lodgement deadlines">
    {b.receipts.map((r:any)=><p key={r.id}>{r.kind}: {money(r.amount_cents)} received {r.paid_at} · Lodgement due {r.due_at} · {r.lodgement_confirmed_at?'Confirmation recorded':'Not yet confirmed'}</p>)}
   </Panel>}
   {b.transactions.map(tx=><Panel key={tx.id} title={workflowNames[tx.code]||tx.code} description={tx.details}>
    <p><Badge status={tx.status}/> · Recorded external reference: {tx.externalReference||'None'} · General change: {money(tx.generalDeltaCents)} · Pet change: {money(tx.petDeltaCents)}</p>
    {(canManage||(w.kind==='tenant'&&tx.code==='B13'))&&tx.status==='draft'&&<OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/status`} defaults={{version:tx.version,status:'submitted'}} label="Record external submission">
     <Select name="channel" label="Actual submission channel" options={choices(canManage?['manual','bondsonline','ecourts','other']:['manual'])}/>
     <Input name="externalReference" label="Actual application/submission reference"/>
    </OperationForm>}
    {canManage&&tx.status==='submitted'&&<>
      <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/status`} defaults={{version:tx.version,status:'confirmed'}} label="Record verified government confirmation">
       <Input name="confirmationDocumentId" label="Issued government confirmation document ID" help="Upload and issue the government record to the correct tenancy first."/>
       {tx.code==='B01'&&<Input name="governmentBondReference" label="Confirmed official bond number"/>}
      </OperationForm>
      <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/status`} defaults={{version:tx.version,status:'rejected'}} label="Record external rejection">
       <p className="small">Only use this after the government has rejected the transaction.</p>
      </OperationForm>
    </>}
    {canManage&&tx.code==='B12'&&tx.status==='draft'&&
     <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/claims`} label="Add deduction claim">
      <Select name="category" label="Deduction type" options={choices(['property_damage','garden','carpet_cleaning','cleaning','pet_fumigation','keys_security','unpaid_rent','unpaid_utilities','other_breach'])}/>
      <Input name="amountCents" label="Amount claimed (cents)" type="number"/>
      <TextArea name="explanation" label="Explanation and supporting evidence"/>
      <Input name="evidenceDocumentId" label="Issued supporting document ID" required={false}/>
     </OperationForm>}
    <details><summary>Record a government notice, dispute or determination</summary>
     <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/notices`} label="Record government notice">
      <Select name="kind" label="Notice kind" options={choices(['release_application','invitation_to_submit','commissioner_decision','appeal','variation','other'])}/>
      <Input name="governmentReference" label="Actual government notice reference"/>
      <Input name="receivedAt" type="datetime-local" label="Received date/time"/>
      <Input name="responseDueAt" type="datetime-local" label="Deadline on official notice" required={false}/>
      <Input name="documentId" label="Issued notice document ID" required={false}/>
     </OperationForm>
     <OperationForm endpoint={`${base}/bonds/${b.id}/transactions/${tx.id}/case`} label="Record case milestone">
      <Select name="status" label="Actual case stage" options={choices(['notice_received','responded','referred','submissions','determined','appealed','declined','resolved'])}/>
      <Input name="version" label="Existing case version (leave empty to create)" type="number" required={false}/>
      <Input name="reference" label="Actual case reference" required={false}/>
      <TextArea name="decision" label="Official decision summary or explanation" required={false}/>
      <Input name="decisionAt" label="Decision date/time" type="datetime-local" required={false}/>
      <Input name="appealDueAt" label="Appeal deadline from notice" type="datetime-local" required={false}/>
     </OperationForm>
    </details>
   </Panel>)}
   {!!b.claims.length&&<Panel title="Recorded deduction claims">{b.claims.map((c:any)=><p key={c.id}>{c.category.replaceAll('_',' ')}: {money(c.amount_cents)}</p>)}</Panel>}
   {!!b.notices.length&&<Panel title="Government notices">{b.notices.map((n:any)=><p key={n.id}>{n.kind.replaceAll('_',' ')} · {n.government_reference} · Received {n.received_at}{n.response_due_at?' · Deadline '+n.response_due_at:''}</p>)}</Panel>}
   {!!b.cases.length&&<Panel title="Disputes and determinations">{b.cases.map((c:any)=><p key={c.id}>{c.status} · {c.external_reference||'No government reference'} · Case version {c.version}</p>)}</Panel>}
   {!!b.deadlines.length&&<Panel title="Bond deadlines">{b.deadlines.map((x:any)=><p key={x.id}>{x.kind} · {x.due_at} · {x.completed_at?'Completed':'Outstanding'}</p>)}</Panel>}
  </div>)}
  <p className="small">This module records externally administered bond transactions. For urgent legal matters or disputed claims, use official WA guidance and qualified advice. A submission reference is not government confirmation.</p>
  </div>
 </>;
}
