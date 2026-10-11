import { Form, Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace, workspaceApi } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
import { OperationForm, Input, Select, TextArea, Panel, choices, options } from '../components/OperationForm';

export async function loader({request,context,params}:LoaderFunctionArgs) {
  const url=new URL(request.url);
  const market=url.searchParams.get('market') || 'RES';
  const api='/api/w/'+params.kind+'/'+params.scopeId+'/v2?market='+encodeURIComponent(market);
  return await loadApi(request,context,api) as any;
}
const price=(cents: number|null|undefined)=>cents == null ? 'Not approved' :
  new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100);
const statusText=(value: string)=>value.replaceAll('_',' ');
export default function V2Business() {
 const d=useLoaderData<typeof loader>();
 const workspace=useWorkspace();
 const api=workspaceApi(workspace.workspace.kind,workspace.workspace.scopeId)+'/v2';
 const writable=['administrator','operations_manager'].includes(workspace.user.staffRole ?? '');
 const marketOptions=d.markets.map((m:any)=>({value:m.code,label:m.name+' ('+m.code+')'}));
 const services=d.services.map((s:any)=>({value:s.code,label:s.code+' — '+s.name}));
 const approvedServices=d.services.filter((s:any)=>s.status==='approved').map((s:any)=>({value:s.code,label:s.name+' ('+s.code+')'}));
 const clients=options(d.clients), properties=options(d.properties,'address'),schemes=options(d.schemes);
 const plans=d.plans.map((p:any)=>({value:p.id,label:p.id+' ['+p.status+']'}));
 const approvedRates=d.rateCards.filter((r:any)=>r.status==='approved');
 const rates=approvedRates.map((r:any)=>({value:r.id,label:r.market_code+' v'+r.version+' ('+r.id+')'}));
 const draftEngagements=d.engagements.filter((e:any)=>e.status==='draft');
 const activeEngagements=d.engagements.filter((e:any)=>e.status==='active');
 const proposedAssignments=d.assignments.filter((a:any)=>a.status==='proposed');
 const activeSubscriptions=d.subscriptions.filter((s:any)=>s.status==='active');
 return <>
  <PageHeading eyebrow="ProInspect V2" title="Business model configuration"
    description="Controlled configuration for eleven property markets. New services and rates remain private and non-bookable until approved. Existing bookings are unaffected."/>
  <div className="stack">
   <div className="grid-4">
    <Panel title="Markets">{d.markets.length} defined · {d.markets.filter((m:any)=>m.enabled).length} enabled</Panel>
    <Panel title="Service definitions">{d.services.length} total · {d.services.filter((s:any)=>s.status==='approved').length} approved</Panel>
    <Panel title="Package versions">{d.plans.length} versions · {d.plans.filter((p:any)=>p.status==='approved').length} approved</Panel>
    <Panel title="Service engagements">{d.engagements.length} recent records</Panel>
   </div>
   <Panel title="Market service eligibility" description="Applicability is proposed, not permission to sell a service. Approve individual services and market rules deliberately.">
    <Form method="get" className="actions">
      <Select name="market" label="Market to review" options={marketOptions} value={d.ruleMarket}/>
      <button type="submit" className="button secondary">View market</button>
    </Form>
    <div className="table-wrap"><table><thead><tr><th>Service</th><th>Market status</th><th>Business status</th></tr></thead><tbody>
      {d.rules.map((r:any)=><tr key={r.service_code}><td>{r.service_code} · {r.name}</td><td>{statusText(r.status)}</td><td>{d.services.find((s:any)=>s.code===r.service_code)?.status}</td></tr>)}
    </tbody></table></div>
    {writable&&<div className="grid-2">
      <OperationForm endpoint={(f)=>api+'/services/'+encodeURIComponent(String(f.get('serviceCode')) )+'/review'} label="Record service review">
        <Select name="serviceCode" label="Service" options={services}/>
        <Select name="status" label="Review decision" options={choices(['review','approved'])}/>
        <p className="small">A service is not bookable until its market eligibility and commercial terms are separately approved.</p>
      </OperationForm>
      <OperationForm endpoint={api+'/rules'} label="Review market-service rule" defaults={{marketCode:d.ruleMarket}}>
        <Select name="serviceCode" label="Service" options={services}/>
        <Select name="status" label="Market eligibility" options={choices(['proposed','approved','blocked'])}/>
        <Input name="notes" label="Market-specific scope notes" required={false}/>
      </OperationForm>
      <OperationForm endpoint={(f)=>api+'/markets/'+encodeURIComponent(String(f.get('marketCode')) )+'/enable'} label="Set market availability">
        <Select name="marketCode" label="Market" options={marketOptions}/>
        <Select name="enabled" label="Market onboarding availability" options={[{value:'false',label:'Disabled'},{value:'true',label:'Enabled for reviewed engagements'}]}/>
      </OperationForm>
    </div>}
   </Panel>
   <Panel title="Canonical asset hierarchy" description="Create scoped asset components under existing properties or schemes. Do not duplicate property addresses or statutory scheme records.">
    <p>{d.assets.length} asset nodes shown. Existing properties, schemes, buildings, lots and common areas are linked automatically.</p>
    <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Type</th><th>Context</th></tr></thead><tbody>
      {d.assets.slice(0,25).map((a:any)=><tr key={a.id}><td>{a.name}</td><td>{a.kind}</td><td>{a.property_id || a.scheme_id}</td></tr>)}
    </tbody></table></div>
    {writable&&<div className="grid-2">
      <OperationForm endpoint={api+'/assets'} label="Create scoped asset">
        <Select name="propertyId" label="Property (or choose scheme)" options={properties} optional/>
        <Select name="schemeId" label="Scheme (or choose property)" options={schemes} optional/>
        <Select name="parentId" label="Parent asset" options={options(d.assets)} optional/>
        <Select name="kind" label="Asset category" options={choices(['building','premises','lot','common_area','plant','equipment','facility','infrastructure','other'])}/>
        <Input name="name" label="Asset name"/>
        <Input name="reference" label="Equipment/reference ID" required={false}/>
      </OperationForm>
      <div className="stack">
       <OperationForm endpoint={api+'/asset-markets'} label="Propose asset market">
        <Select name="propertyId" label="Property (or scheme)" options={properties} optional/>
        <Select name="schemeId" label="Scheme (or property)" options={schemes} optional/>
        <Select name="marketCode" label="Proposed operating market" options={marketOptions}/>
       </OperationForm>
       <OperationForm endpoint={(f)=>api+'/asset-markets/'+encodeURIComponent(String(f.get('assetMarketId')) )+'/review'} label="Review asset classification">
        <Select name="assetMarketId" label="Pending classification" options={proposedAssignments.map((a:any)=>({value:a.id,label:a.market_code+' / '+(a.property_id || a.scheme_id)}))}/>
        <Select name="status" label="Decision" options={choices(['approved','blocked'])}/>
       </OperationForm>
      </div>
    </div>}
   </Panel>
   <Panel title="Operational service engagements" description="Engagements contract ProInspect as an operations provider without replacing existing property managers or scheme authorities.">
    <div className="table-wrap"><table><thead><tr><th>Contract reference</th><th>Market</th><th>Status</th><th>Customer</th></tr></thead><tbody>
      {d.engagements.map((e:any)=><tr key={e.id}><td>{e.reference}</td><td>{e.market_code}</td><td>{e.status}</td><td>{d.clients.find((c:any)=>c.id===e.client_id)?.name ?? e.client_id}</td></tr>)}
    </tbody></table></div>
    {writable&&<div className="grid-2">
      <OperationForm endpoint={api+'/engagements'} label="Record draft engagement">
        <Select name="clientId" label="Commissioning customer" options={clients}/>
        <Select name="propertyId" label="Property (or scheme)" options={properties} optional/>
        <Select name="schemeId" label="Scheme (or property)" options={schemes} optional/>
        <Select name="marketCode" label="Service market" options={marketOptions}/>
        <Input name="reference" label="Unique customer agreement reference"/>
        <TextArea name="scopeSummary" label="Contracted operational scope"/>
        <Input name="startsAt" label="Agreement starts" type="datetime-local"/>
        <Input name="endsAt" label="Agreement ends (optional)" type="datetime-local" required={false}/>
      </OperationForm>
      <OperationForm endpoint={(f)=>api+'/engagements/'+encodeURIComponent(String(f.get('engagementId')) )+'/activate'} label="Activate verified engagement">
        <Select name="engagementId" label="Draft agreement" options={draftEngagements.map((e:any)=>({value:e.id,label:e.reference}))}/>
        <Input name="authorityReference" label="Verified signed appointment / authority"/>
        <p className="small">Requires an approved market assignment and the market to be enabled. This is separate from statutory management appointment.</p>
      </OperationForm>
    </div>}
   </Panel>
   <Panel title="Versioned subscription packages" description="Inspection, Standard and Outsourced plans are seeded as drafts for each market. Limits are per contractual period, not implicit unlimited work.">
     <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Status</th><th>Fee excl. GST</th><th>Annual hours</th></tr></thead><tbody>
       {d.plans.map((p:any)=><tr key={p.id}><td>{p.market_code} · {p.plan_code} v{p.version}</td><td>{p.status}</td><td>{price(p.monthly_fee_cents)}</td><td>{p.included_hours_milli==null?'Unconfigured':(p.included_hours_milli/1000).toLocaleString()}</td></tr>)}
     </tbody></table></div>
     {writable&&<div className="grid-2">
      <OperationForm endpoint={(f)=>api+'/plans/'+encodeURIComponent(String(f.get('planId')) )+'/configure'} label="Save draft allowances and fee">
        <Select name="planId" label="Draft package" options={plans.filter((p:any)=>p.label.includes('[draft]'))}/>
        <Input name="includedHoursMilli" label="Included annual milli-hours" type="number"/>
        <Input name="includedVisits" label="Included annual visits" type="number"/>
        <Input name="includedTickets" label="Included annual coordination tickets" type="number"/>
        <Input name="includedReports" label="Included annual reports" type="number"/>
        <Input name="monthlyFeeCents" label="Approved intended monthly fee (AUD cents)" type="number"/>
      </OperationForm>
      <div className="stack">
        <OperationForm endpoint={(f)=>api+'/plans/'+encodeURIComponent(String(f.get('planId')) )+'/service'} label="Set service inclusion">
          <Select name="planId" label="Draft plan" options={plans.filter((p:any)=>p.label.includes('[draft]'))}/>
          <Select name="serviceCode" label="Service" options={services}/>
          <Select name="inclusion" label="Contract treatment" options={choices(['included','optional','excluded'])}/>
        </OperationForm>
        <OperationForm endpoint={(f)=>api+'/plans/'+encodeURIComponent(String(f.get('planId')) )+'/limit'} label="Set service-specific limit">
          <Select name="planId" label="Draft plan" options={plans.filter((p:any)=>p.label.includes('[draft]'))}/>
          <Select name="serviceCode" label="Included service" options={services}/>
          <Select name="metric" label="Allowance metric" options={choices(['hours_milli','visits','tickets','reports'])}/>
          <Input name="limitQuantity" label="Limit for this service and metric" type="number"/>
        </OperationForm>
        <OperationForm endpoint={(f)=>api+'/plans/'+encodeURIComponent(String(f.get('planId')) )+'/approve'} label="Approve package version">
          <Select name="planId" label="Fully reviewed draft plan" options={plans.filter((p:any)=>p.label.includes('[draft]'))}/>
          <p className="small">Requires complete fee and allowance terms, and approved eligibility for all included services. Approved versions are immutable.</p>
        </OperationForm>
      </div>
     </div>}
   </Panel>
   <Panel title="Cost-based pricing and immutable quotations" description="Set costs, risk contingency and target margin in basis points. No V2 price appears on the public website automatically.">
    <p>{d.rateCards.length} rate cards recorded; {approvedRates.length} approved. Each quote retains its cost assumptions and calculated AUD cents independently of later changes.</p>
    {writable&&<div className="grid-2">
     <OperationForm endpoint={api+'/rate-cards'} label="Create draft cost card">
       <Select name="marketCode" label="Market" options={marketOptions}/>
       <Input name="version" label="Rate card version" type="number" value={1}/>
       <Input name="loadedHourlyCents" label="Loaded hourly labour cost, AUD cents" type="number"/>
       <Input name="travelVisitCents" label="Travel cost per visit, AUD cents" type="number"/>
       <Input name="fixedAdminCents" label="Fixed administration cost, AUD cents" type="number"/>
       <Input name="contingencyBp" label="Contingency, basis points (100 = 1%)" type="number"/>
       <Input name="targetMarginBp" label="Target gross margin, basis points" type="number"/>
       <Input name="gstBp" label="Applicable GST basis points" type="number"/>
     </OperationForm>
     <div className="stack">
       <OperationForm endpoint={(f)=>api+'/rate-cards/'+encodeURIComponent(String(f.get('rateCardId')) )+'/approve'} label="Approve reviewed cost card">
        <Select name="rateCardId" label="Draft rate card" options={d.rateCards.filter((r:any)=>r.status==='draft').map((r:any)=>({value:r.id,label:r.market_code+' v'+r.version}))}/>
       </OperationForm>
       <OperationForm endpoint={api+'/quotes'} label="Generate immutable internal quote"
         result={(r:any)=><p>Calculated quote {r.id}: {price(r.pricing?.exGstCents)} excl. GST. Remains draft.</p>}>
        <Select name="clientId" label="Quoting customer" options={clients}/>
        <Select name="propertyId" label="Property (or scheme)" options={properties} optional/>
        <Select name="schemeId" label="Scheme (or property)" options={schemes} optional/>
        <Select name="engagementId" label="Associated engagement" options={d.engagements.map((e:any)=>({value:e.id,label:e.reference}))} optional/>
        <Select name="marketCode" label="Approved market" options={marketOptions}/>
        <Select name="serviceCode" label="Approved service" options={approvedServices}/>
        <Select name="rateCardId" label="Approved rate card" options={rates}/>
        <Input name="hoursMilli" label="Work hours in milli-hours (1000 = 1h)" type="number"/>
        <Input name="visits" label="Site visits" type="number" value={1}/>
        <Input name="quantity" label="Service units" type="number" value={1}/>
        <Input name="complexityBp" label="Complexity factor (10000 = standard)" type="number" value={10000}/>
        <Input name="externalPassThroughCents" label="Third-party cost per unit, AUD cents" type="number" value={0}/>
       </OperationForm>
     </div>
    </div>}
    <div className="table-wrap"><table><thead><tr><th>Quote reference</th><th>Market</th><th>Service</th><th>Draft total incl. GST</th></tr></thead><tbody>
     {d.quotes.map((q:any)=><tr key={q.id}><td>{q.id}</td><td>{q.market_code}</td><td>{q.service_code}</td><td>{price(q.total_cents)}</td></tr>)}
    </tbody></table></div>
   </Panel>
   <Panel title="Subscriptions and entitlement consumption" description="New subscription periods require active verified engagements and approved plan versions. Consumption is immutable and overages are rejected until separately authorised.">
    <p>{d.subscriptions.length} recent subscription periods; {d.usage.length} aggregated usage metrics.</p>
    {writable&&<div className="grid-2">
      <OperationForm endpoint={api+'/subscriptions'} label="Start an approved subscription period">
        <Select name="engagementId" label="Active service engagement" options={activeEngagements.map((e:any)=>({value:e.id,label:e.reference+' ('+e.market_code+')'}))}/>
        <Select name="planId" label="Approved plan" options={d.plans.filter((p:any)=>p.status==='approved').map((p:any)=>({value:p.id,label:p.id}))}/>
        <Input name="periodStart" label="Contract period starts" type="datetime-local"/>
        <Input name="periodEnd" label="Contract period ends" type="datetime-local"/>
        <Input name="agreedMonthlyCents" label="Approved monthly fee (AUD cents)" type="number"/>
      </OperationForm>
      <OperationForm endpoint={api+'/usage'} label="Post verified included work">
        <Select name="subscriptionId" label="Active period" options={activeSubscriptions.map((s:any)=>({value:s.id,label:s.engagement_id+' · '+s.id}))}/>
        <Select name="serviceCode" label="Included service" options={approvedServices}/>
        <Select name="metric" label="Allowance consumed" options={choices(['hours_milli','visits','tickets','reports'])}/>
        <Input name="quantity" label="Quantity in metric units" type="number"/>
        <Input name="workOrderId" label="Related Work Order ID" required={false}/>
        <Input name="bookingId" label="Related Booking ID" required={false}/>
        <Input name="sourceKey" label="Unique verified source reference"/>
        <p className="small">Link exactly one work order or booking. Subscription and customer scope are verified by the database.</p>
      </OperationForm>
    </div>}
    <div className="table-wrap"><table><thead><tr><th>Engagement</th><th>Period</th><th>Status</th><th>Monthly fee</th></tr></thead><tbody>
      {d.subscriptions.map((s:any)=><tr key={s.id}><td>{s.engagement_id}</td><td>{s.period_start?.slice(0,10)} – {s.period_end?.slice(0,10)}</td><td>{s.status}</td><td>{price(s.agreed_monthly_cents)}</td></tr>)}
    </tbody></table></div>
   </Panel>
   <p className="small">V2 data is a controlled internal contract and does not replace approved pricing, statutory duties, contractor qualifications or existing customer authorisations. <Link to={workspace.workspace.href+'/services'}>Legacy booking catalogue</Link> remains separate.</p>
  </div>
 </>;
}