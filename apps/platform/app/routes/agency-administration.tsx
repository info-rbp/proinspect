import { useLoaderData,type LoaderFunctionArgs } from 'react-router';
import {loadApi} from '../lib/api.server';
import {OperationForm,Input,Select,choices} from '../components/OperationForm';
export async function loader({request,context}:LoaderFunctionArgs){return loadApi(request,context,'/api/staff/agency-outsourcing');}
const money=(v:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(v/100);
export default function AgencyStaff(){
 const d=useLoaderData<typeof loader>();
 const opts=(arr:any[],label:string)=>arr.map(x=>({value:x.id,label:x[label]}));
 const draft=d.agreements.filter((a:any)=>a.status==='draft'),approved=d.agreements.filter((a:any)=>a.status==='approved');
 return <div className="stack"><h1>Agency outsourcing agreements</h1>
 <p>Internal commercial administration. Only verified, authorised ProInspect Staff may approve terms and statements. Nothing here sends a Stripe invoice or collects a payment.</p>
 <section className="panel stack"><h2>Verified owner access</h2><p>Confirm the owner's property ownership, current agency appointment and verified user identity independently before granting access.</p>
 <OperationForm endpoint="/api/staff/agency-outsourcing/grant-owner" label="Grant verified read-only property access">
 <Select name="agencyClientId" label="Approved agency" options={opts(d.agencies,'name')}/>
 <Input name="propertyId" label="Verified agency-managed property ID"/>
 <Input name="ownerUserId" label="Verified owner user ID"/>
 <Input name="authorityReference" label="Ownership and agency appointment evidence reference"/>
 <Select name="allowInspections" label="Allow inspection overview" options={choices(['true','false'])} value="true"/>
 <Select name="allowReports" label="Permit specifically selected issued reports" options={choices(['true','false'])} value="false"/>
 </OperationForm></section>
 <section className="panel stack"><h2>Agency agreements</h2>
 <OperationForm endpoint="/api/staff/agency-outsourcing/draft-agreement" label="Save draft agreement">
 <Select name="clientId" label="Agency" options={opts(d.agencies,'name')}/>
 <Input name="reference" label="Agency agreement reference"/>
 <Select name="tier" label="Managed portfolio band" options={[{value:'50_149',label:'50–149 properties'},{value:'150_499',label:'150–499 properties'},{value:'500_1000',label:'500–1,000 properties'},{value:'custom',label:'Custom'}]}/>
 <Select name="pricingModel" label="Commercial arrangement" options={choices(['per_service','retainer','hybrid'])}/>
 <Input name="baseMonthlyCents" label="Approved monthly base amount, cents" type="number"/>
 <Input name="gstBasisPoints" label="Agreed GST basis points (1000 = 10%)" type="number"/>
 <Input name="effectiveAt" label="Effective date" type="datetime-local"/>
 </OperationForm>
 <OperationForm endpoint="/api/staff/agency-outsourcing/set-rate" label="Set draft service rate">
 <Select name="agreementId" label="Draft agreement" options={opts(draft,'reference')}/>
 <Select name="serviceId" label="Service" options={opts(d.services,'name')}/>
 <Input name="rateCents" label="Approved additional service rate (cents), zero when included" type="number"/>
 <Select name="included" label="Included at no extra charge" options={choices(['true','false'])}/>
 </OperationForm>
 <OperationForm endpoint="/api/staff/agency-outsourcing/approve-agreement" label="Independently approve contract">
 <Select name="agreementId" label="Draft agreement" options={opts(draft,'reference')}/>
 <Input name="approvalReference" label="Independent approval / signed agreement reference"/>
 </OperationForm>
 {d.agreements.map((a:any)=><p key={a.id}>{a.reference} · {a.tier} · {a.status} · {money(a.base_monthly_cents)} base excl. GST</p>)}
 </section>
 <section className="panel stack"><h2>Monthly property-service statements</h2>
 <p>Record only completed Work Orders with an approved service rate; statements are internal, dated, reviewable, and cannot create live financial charges.</p>
 <OperationForm endpoint="/api/staff/agency-billing/record-work" label="Record completed billable Work Order">
 <Select name="workOrderId" label="Completed agency Work Order" options={opts(d.works,'reference')}/>
 <Select name="agreementId" label="Approved agreement" options={opts(approved,'reference')}/>
 </OperationForm>
 <OperationForm endpoint="/api/staff/agency-billing/prepare-statement" label="Prepare closed month statement">
 <Select name="agreementId" label="Approved agreement" options={opts(approved,'reference')}/>
 <Input name="period" label="Closed month" type="month"/>
 </OperationForm>
 <OperationForm endpoint="/api/staff/agency-billing/approve-statement" label="Independent statement approval">
 <Select name="statementId" label="Draft statement" options={d.statements.filter((s:any)=>s.status==='draft').map((s:any)=>({value:s.id,label:s.period+' · '+money(s.total_cents)}))}/>
 <Input name="reviewReference" label="Reconciliation / second person sign-off reference"/>
 </OperationForm>
 {d.statements.map((s:any)=><p key={s.id}>{s.period} · {money(s.total_cents)} incl. GST · {s.status}</p>)}
 </section>
 </div>;
}