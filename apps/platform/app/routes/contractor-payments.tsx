import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Input, Panel, Select, options, choices } from '../components/OperationForm';

const currency=(cents:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);
export async function loader({request,context,params}:LoaderFunctionArgs){
 return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/contractor-payments`);
}
export default function ContractorPayments(){
 const {items=[],sandboxCollectionEnabled=false,sandboxTransfersEnabled=false}=useLoaderData<typeof loader>();
 const data=useWorkspace(),w=data.workspace,api=workspaceApi(w.kind,w.scopeId);
 const staff=w.kind==='staff'&&['administrator','operations_manager'].includes(data.user.staffRole??'');
 const owner=!staff&&['owner','admin'].includes(w.role);
 const orders=data.workOrders.filter(o=>o.contractor_id&&o.property_id&&!o.scheme_id&&['approved','assigned','scheduled','in_progress','report_pending','completed'].includes(o.status));
 return <>
   <PageHeading title="Contractor payments" description="Choose who collects the money for each approved work order. ProInspect-managed payment uses a separately approved Stripe Connect arrangement; direct payment is made outside ProInspect and tracked for reconciliation."/>
   <div className="stack">
     <Panel title="Payment models" description="Both payment arrangements remain separate from residential bonds, tenancy rent and statutory agency or strata trust accounts.">
       <p><strong>Landlord/agency pays contractor directly:</strong> the client pays through its own approved bank or trust arrangements. ProInspect tracks authority, reference, reported settlement and independent staff verification. No funds pass through ProInspect.</p>
       <p><strong>ProInspect collects and pays contractor:</strong> the client approves collection, Stripe Checkout confirms the payment, and the client separately approves release after completion. Operations can then request one guarded Connect transfer to a verified contractor account. Stripe fees and dispute risk remain ProInspect responsibilities.</p>
       <p>Sandbox collection: <strong>{sandboxCollectionEnabled?'Enabled for controlled tests':'Disabled pending Stripe and legal acceptance'}</strong>. Transfer requests: <strong>{sandboxTransfersEnabled?'Enabled for controlled tests':'Disabled'}</strong>.</p>
     </Panel>
     {(staff||owner)&&orders.length>0&&<Panel title="Create a contractor payment arrangement" description="Amounts are AUD cents inclusive of the approved contractor invoice tax treatment. The quote must already have an authorised finance approval. Each work order has one payment arrangement.">
       <OperationForm endpoint={`${api}/contractor-payments`} label="Prepare payment choice">
         <Select name="workOrderId" label="Approved contractor work order" options={options(orders,'title')}/>
         <Select name="mode" label="Who collects and pays?" options={[
           {value:'payer_direct',label:'Landlord/agency pays contractor directly'},
           {value:'platform_collect',label:'ProInspect collects then transfers (Stripe approval required)'},
         ]}/>
         <Input type="number" name="grossCents" label="Contractor invoice total (cents, including any GST)"/>
         <Input type="number" name="platformFeeCents" label="Agreed ProInspect fee (cents, zero for direct payment)" value={0}/>
         <Input name="quoteReference" label="Approved quote / authority reference"/>
         <Input name="invoiceReference" label="Contractor invoice reference"/>
       </OperationForm>
     </Panel>}
     {staff&&<Panel title="Contractor Stripe onboarding reference" description="Use a Stripe-connected recipient ID after Stripe-hosted identity verification. Recording an account ID does not mark it as eligible for payouts. Eligibility is checked from Stripe again before a transfer.">
       <OperationForm endpoint={`${api}/contractor-payments/recipients`} label="Link existing Stripe recipient">
         <Select name="contractorId" label="Contractor" options={options(data.contractors)}/>
         <Input name="stripeAccountId" label="Stripe-connected account ID (acct_...)"/>
       </OperationForm>
       <OperationForm endpoint={`${api}/contractor-payments/recipients/verify`} label="Independently verify recipient identity and Stripe capabilities">
         <Select name="contractorId" label="Contractor to verify" options={options(data.contractors)}/>
         <Input name="identityVerificationReference" label="Separate reviewer: legal identity evidence / confirmation reference"/>
       </OperationForm>
     </Panel>}
     <Panel title="Contractor payment register" description="A completed Checkout is not proof of settlement. Direct payments require independent verification; a Stripe transfer is not proof that the contractor's bank payout has arrived.">
       {items.length===0&&<p>No contractor payment arrangements have been recorded for this workspace.</p>}
       {items.map((p:any)=><div key={p.id} className="stack payment-record">
         <div className="record-row"><div>
           <strong>{p.contractor_name}</strong> - {p.work_title}
           <p>{currency(p.gross_cents)} | {p.mode==='payer_direct'?'Direct payer payment':'ProInspect-managed collection'} | {p.invoice_reference}</p>
         </div><Badge status={p.status}/></div>
         <p>Quote: {p.quote_reference}. Work order: {p.work_status}. {p.platform_fee_cents>0?`ProInspect fee ${currency(p.platform_fee_cents)}; contractor transfer ${currency(p.gross_cents-p.platform_fee_cents)}.`:''}</p>
         {owner&&p.status==='draft'&&<OperationForm endpoint={`${api}/contractor-payments/${p.id}/authorise`} label="Authorise this payment method">
           <Input name="authorityReference" label="Contractual consent / signed authority reference"/>
         </OperationForm>}
         {owner&&p.mode==='payer_direct'&&p.status==='external_due'&&<OperationForm endpoint={`${api}/contractor-payments/${p.id}/external-payment`} label="Report external payment">
           <Input name="paymentReference" label="External bank payment / remittance reference"/>
         </OperationForm>}
         {staff&&p.mode==='payer_direct'&&p.status==='external_reported'&&<OperationForm endpoint={`${api}/contractor-payments/${p.id}/verify-external`} label="Verify independent bank evidence">
           <Input name="verificationReference" label="Staff-reviewed proof of settlement"/>
         </OperationForm>}
         {owner&&p.mode==='platform_collect'&&p.status==='awaiting_checkout'&&<OperationForm endpoint={`${api}/contractor-payments/${p.id}/checkout`} label="Open sandbox Stripe Checkout" result={r=>r.url?<a className="button" href={r.url} rel="noreferrer">Continue to secure payment</a>:null}/>}
         {owner&&p.mode==='platform_collect'&&p.status==='funded'&&p.work_status==='completed'&&<OperationForm endpoint={`${api}/contractor-payments/${p.id}/release-approval`} label="Authorise contractor fund release">
           <Input name="completionReference" label="Verified work completion / evidence reference"/>
         </OperationForm>}
         {staff&&p.mode==='platform_collect'&&p.status==='release_approved'&&<OperationForm endpoint={`${api}/contractor-payments/${p.id}/execute-transfer`} label="Request one controlled Stripe transfer"/>}
         {p.status==='transfer_initiated'&&<p>Transfer initiation is awaiting manual reconciliation. Do not retry or send another transfer automatically.</p>}
         {p.status==='transfer_created'&&<p>Stripe transfer created. Contractor bank payout confirmation is separate.</p>}
         {p.status==='external_verified'&&<p>Independent external payment evidence verified by ProInspect staff.</p>}
       </div>)}
     </Panel>
     <p><Link to={`${w.href}/finance`}>Return to approvals and payments</Link></p>
   </div>
 </>;
}