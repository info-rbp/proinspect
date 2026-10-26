import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace,workspaceApi } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { OperationForm,Input,Select,Panel,choices } from '../components/OperationForm';
import { rentRouteDescription,type RentRoute } from '../../../../packages/finance/rent-routing';

export const meta=()=>[{title:'Residential rent routing | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/tenancies/${params.tenancyId}/rent-routing`);
}
function aud(cents:number){return new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);}
export default function RentRouting(){
 const d=useLoaderData<typeof loader>() as any;
 const {workspace:w,user}=useWorkspace(),base=workspaceApi(w.kind,w.scopeId);
 const canPropose=(w.kind==='landlord'&&d.mode==='self_managed'||w.kind==='property-manager'&&d.mode==='agency_managed')&&w.role!=='viewer';
 const canReview=w.kind==='staff'&&['administrator','operations_manager'].includes(user.staffRole??'');
 const plan=d.plans[0];
 const options:RentRoute[]=d.mode==='agency_managed'?['agency_trust_external']:['landlord_direct_external','landlord_connect_candidate'];
 return <div className="stack">
  <PageHeading title="Residential rent routing" description="Planning and independently evidenced records only. ProInspect does not accept rent, hold trust funds, or send Stripe transfers from this screen."/>
  <div className="actions"><Link to={`${w.href}/tenancies/${d.tenancyId}`}>Back to tenancy</Link><a href="https://www.consumerprotection.wa.gov.au/paying-rent" target="_blank" rel="noreferrer">WA rent payment guidance</a></div>
  <Panel title="Payment destination" description="Agency-managed rent must follow the nominated agency trust-account process. A self-managed landlord may nominate an approved landlord-owned payment arrangement.">
   <p>Recorded management model: <strong>{d.mode?.replaceAll('_',' ')||'Unconfirmed: no route can be prepared'}</strong></p>
   <p>All rent amounts shown are tenancy obligations or externally recorded evidence, not Stripe charges.</p>
   <p><strong>Collection and disbursement are disabled.</strong> A proposed Stripe Connect route is not a live payment method.</p>
  </Panel>
  {canPropose&&<Panel title="Prepare a rent payment route" description="Creates a non-custodial proposal. No payment instructions or bank details are generated.">
   <OperationForm endpoint={`${base}/tenancies/${d.tenancyId}/rent-routing`} label="Record proposed rent route">
    <Select name="route" label="Permitted future payment arrangement" options={options.map(route=>({value:route,label:rentRouteDescription(route)}))}/>
    <Input name="amountCents" type="number" label="Rent per period (AUD cents)" />
    <Select name="frequency" label="Agreed rental frequency" options={choices(['weekly','fortnightly','monthly'])}/>
   </OperationForm>
  </Panel>}
  <Panel title="Recorded proposals">
   {!d.plans.length&&<p>No rent routing proposals recorded.</p>}
   {d.plans.map((p:any)=><div className="record-row" key={p.id}><div><p><strong>{aud(p.amount_cents)} / {p.frequency}</strong></p><p>{p.description}</p><p className="small">{p.created_at}</p></div><Badge status={p.status}/></div>)}
  </Panel>
  {plan&&<Panel title="Independent external payment records" description="These are manually supplied records, not payment or payout instructions. A separate authorised Staff reviewer must confirm each record against an independent source.">
   {d.entries.map((e:any)=><div className="record-row" key={e.id}><div>
    <strong>{e.kind==='rent_received_external'?'External rent receipt':'Externally completed landlord disbursement'}: {aud(e.amountCents)}</strong>
    <p>Event date: {e.effectiveAt}</p><p>{e.verified?'Independent verification recorded':'Unverified — not established as paid'}</p>
    {e.externalReference&&<p className="small">External reference: {e.externalReference}</p>}
    </div>{canReview&&!e.verified&&<OperationForm endpoint={`${base}/rent-plans/${plan.id}/external-records/${e.id}/verify`} label="Record independent review">
      <Select name="evidenceKind" label="Independent evidence" options={choices(['official_trust_ledger','bank_statement','accounting_reconciliation'])}/>
      <Input name="externalEvidenceReference" label="Independent source reference"/>
     </OperationForm>}</div>)}
   {!d.entries.length&&<p>No externally evidenced payments or payouts have been recorded.</p>}
   {canPropose&&<OperationForm endpoint={`${base}/rent-plans/${plan.id}/external-records`} label="Record external event for independent review">
    <Select name="kind" label="Externally completed event" options={choices(d.mode==='agency_managed'?['rent_received_external','owner_disbursement_external']:['rent_received_external'])}/>
    <Input name="amountCents" type="number" label="Actual amount evidenced (AUD cents)" />
    <Select name="source" label="Independent account or ledger source" options={choices(d.mode==='agency_managed'?['agency_trust_statement','approved_external_ledger']:['landlord_bank_statement','approved_external_ledger'])}/>
    <Input name="externalReference" label="External transaction reference (never a BSB or account number)" />
    <Input name="effectiveAt" type="datetime-local" label="Actual event date/time" />
   </OperationForm>}
  </Panel>}
  <Panel title="Stripe Connect — future-only architecture" description="A proposed route cannot create a connected account, charge a tenant, receive rent or pay a landlord.">
   <p>Future self-managed landlord collection requires identity verification, Stripe approval for this rental use case, payer authorisation, a fee-free option where required, and independent settlement reconciliation.</p>
   <p>Agency receipts and landlord disbursements must continue through the agency's nominated trust-account controls. Bonds remain separate and are paid to or released by Bonds Administration.</p>
  </Panel>
 </div>;
}
