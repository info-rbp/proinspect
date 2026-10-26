import {useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {PageHeading} from '../../../../packages/ui/components';
import {OperationForm,Input,TextArea,Select,Panel} from '../components/OperationForm';
export async function loader({request,context}:LoaderFunctionArgs){return loadApi(request,context,'/api/staff/pricing');}
export default function PricingAdministration(){const d=useLoaderData<typeof loader>();return <>
<PageHeading title="Service price approvals" description="Map source fee SKUs to canonical services and explicit property/location scopes. A different administrator must approve each immutable variant. No default region or commercial approval is inferred."/>
<Panel title="Draft a source-backed service variant"><OperationForm endpoint="/api/staff/pricing/draft" label="Save price for independent review" defaults={{paymentPolicy:'invoice_after_confirmation'}}>
<Select name="serviceId" label="Operational service" options={d.services.map((s:any)=>({value:s.id,label:s.name}))}/>
<Select name="sourceCode" label="Source fee item (not all catalogue items are appointment services)" options={d.sourceItems.map((s:any)=>({value:s.id,label:s.id+' - '+s.name+' - '+s.feeText}))}/>
<Input name="label" label="Customer-facing scope title"/><Input name="postcodes" label="Exact eligible WA postcodes, separated by commas"/>
<fieldset><legend>Eligible property types</legend>{d.propertyTypes.map((s:string)=><label key={s}><input type="checkbox" name="propertyTypes" value={s}/>{s}</label>)}</fieldset>
<TextArea name="scopeText" label="Agreed inclusions, exclusions, limits and source mapping rationale"/>
<Select name="gstBasisPoints" label="Approved GST treatment" options={[{value:'1000',label:'10% GST'},{value:'0',label:'No GST (document the basis)'}]}/>
<Input name="startsAt" type="datetime-local" label="Valid from"/><Input name="expiresAt" type="datetime-local" label="Expires at"/>
<p>Current guest scheduling confirms the appointment before a separate invoice/payment request. Payment-first appointment holds are not introduced by this price approval.</p>
</OperationForm></Panel>
{d.variants.map((v:any)=><Panel key={v.id} title={v.label} description={`${v.source_code} / ${v.service_id} / ${v.status}`}><p>{v.scope_text}</p><p>Source amount: {v.source_fee}. Region: {v.postcodes_json}. Property types: {v.property_types_json}.</p><p>Exact scope: <code>{v.scope_sha256}</code></p>
{v.status==='draft'&&<OperationForm endpoint="/api/staff/pricing/approve" label="Approve exact price and scope" defaults={{variantId:v.id,scopeSha256:v.scope_sha256}}><Input name="reference" label="Independent written commercial approval reference"/><label><input type="checkbox" name="scopeAndServiceAreaConfirmed" required/>I verified the source SKU, inclusions, canonical service and exact coverage area.</label><label><input type="checkbox" name="taxTreatmentConfirmed" required/>The tax treatment is approved.</label><label><input type="checkbox" name="paymentTermsConfirmed" required/>The invoice-after-confirmation arrangement is approved.</label></OperationForm>}
{v.status!=='withdrawn'&&<OperationForm endpoint="/api/staff/pricing/withdraw" label="Withdraw future use" defaults={{variantId:v.id}}><Input name="reference" label="Withdrawal reason/reference"/></OperationForm>}
</Panel>)}</>;}
