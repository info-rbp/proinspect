import {Form,Link,useLoaderData,useActionData,useNavigation,data,
  type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,Feedback} from '../../../../packages/ui/components';

export async function loader({request,context,params}:LoaderFunctionArgs){
  const api=`/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}/co-living`;
  const [configuration,operations]=await Promise.all([
    loadApi(request,context,api),loadApi(request,context,api+'/operations')]);
  return {configuration,operations,propertyId:params.propertyId};
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData(),action=String(f.get('action')??'');
  const raw=(name:string)=>String(f.get(name)??'').trim();
  const timestamp=(name:string)=>{
    const value=Date.parse(raw(name));return Number.isFinite(value)?new Date(value).toISOString():null;
  };
  const intOrNull=(name:string)=>raw(name)===''?null:Number(raw(name));
  let payload:Record<string,unknown>={action};
  if(action==='record_terms')payload={...payload,tenancyId:raw('tenancyId'),
    rentCents:intOrNull('rentCents'),expectedBondCents:intOrNull('expectedBondCents'),
    rentPeriod:raw('rentPeriod'),utilityBasis:raw('utilityBasis'),
    sourceReference:raw('sourceReference'),agreementDocumentId:raw('agreementDocumentId')||null};
  else if(action==='review_terms')payload={...payload,tenancyId:raw('tenancyId')};
  else if(action==='occupancy_event')payload={...payload,tenancyId:raw('tenancyId'),
    kind:raw('kind'),effectiveAt:timestamp('effectiveAt'),note:raw('note'),
    evidenceReference:raw('evidenceReference')};
  else if(action==='inspect_shared')payload={...payload,spaceId:raw('spaceId'),
    inspectedAt:timestamp('inspectedAt'),note:raw('note')};
  else if(action==='publish_shared')payload={...payload,inspectionId:raw('inspectionId'),
    publicSummary:raw('publicSummary')};
  else return data({error:'Unknown operational action.'},{status:422});
  const res=await callApi(request,context,
    `/api/w/${params.kind}/${params.scopeId}/properties/${params.propertyId}/co-living/operations`,
    {method:'POST',body:payload});
  const result=await res.json() as {message?:string;fields?:unknown};
  return data(res.ok?{ok:true,message:result.message??'Saved for review.'}:
    {error:result.message??'Action declined.',fields:result.fields},{status:res.status});
}
const date=(value:string)=>value?new Date(value).toLocaleDateString('en-AU'):'';
export default function CoLivingOperations(){
  const w=useWorkspace().workspace,root=w.href;
  const {configuration,operations,propertyId}=useLoaderData<typeof loader>() as any;
  const outcome=useActionData<any>(),busy=useNavigation().state!=='idle';
  const occupancies=configuration.occupancies??[],spaces=configuration.spaces??[];
  const selectTenancy=(name:string)=><select name={name} defaultValue="" required>
    <option value="">Select an occupancy</option>
    {occupancies.map((o:any)=><option key={o.tenancy_id} value={o.tenancy_id}>
      {spaces.find((s:any)=>s.id===o.space_id)?.label??'Private room'} — {o.status} ({o.tenancy_id.slice(0,14)}…)
    </option>)}
  </select>;
  const authorisedReviewer=w.kind==='staff';
  const sharedSpaces=spaces.filter((s:any)=>s.space_type==='shared_area'&&s.active);
  return <>
    <PageHeading eyebrow="Residential Co-living" title="Occupancy & shared-area operations"
      description="Review room/bed terms and movements, record common-area condition and publish only independently reviewed safe summaries. No legal execution, bond lodgement or rent transfer occurs here."/>
    <div className="stack">
      <Link to={root+'/properties/'+propertyId+'/co-living'}>Back to rooms & occupants</Link>
      <Feedback value={outcome}/>
      <section className="panel stack"><h2>Room/bed rent, bond & utilities reference</h2>
        <p>Operational figures are drafts until a separate Staff reviewer checks the record. Amounts are cents, not payment instructions.</p>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="record_terms"/>
          <label className="field">Occupancy{selectTenancy('tenancyId')}</label>
          <div className="grid-2">
            <label className="field">Rent (cents)<input type="number" min="0" name="rentCents" /></label>
            <label className="field">Expected bond (cents)<input type="number" min="0" name="expectedBondCents"/></label>
          </div>
          <label className="field">Rent period<select name="rentPeriod" defaultValue="weekly">
            <option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option>
            <option value="monthly">Monthly</option></select></label>
          <label className="field">Utility sharing<select name="utilityBasis" defaultValue="included">
            <option value="included">Included</option><option value="equal_share">Equal share</option>
            <option value="metered">Metered</option><option value="manual">Manually allocated</option>
          </select></label>
          <label className="field">Agreement/source reference<input name="sourceReference" minLength={8} required/></label>
          <label className="field">Issued tenancy document ID (optional)<input name="agreementDocumentId"/></label>
          <button className="primary" disabled={busy||!occupancies.length}>Record draft terms</button>
        </Form>
        {operations.terms.length&&<h3>Terms register</h3>}
        {operations.terms.map((t:any)=><div className="record-row" key={t.tenancy_id}>
          <div><strong>{t.space}</strong><p className="small">{t.review_status} · {t.rent_cents??'—'} rent cents/{t.rent_period} · {t.expected_bond_cents??'—'} bond cents · {t.utility_basis}</p></div>
          {authorisedReviewer&&t.review_status==='draft'&&<Form method="post">
            <input type="hidden" name="action" value="review_terms"/>
            <input type="hidden" name="tenancyId" value={t.tenancy_id}/>
            <button className="button secondary" disabled={busy}>Verify recorded figures</button>
          </Form>}
        </div>)}
      </section>
      <section className="panel stack"><h2>Check-in, check-out & transfer history</h2>
        <p>A transfer requires a separate authorised tenancy/invitation. This log does not change tenancy dates.</p>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="occupancy_event"/>
          <label className="field">Occupancy{selectTenancy('tenancyId')}</label>
          <label className="field">Event<select name="kind">
            {['check_in','check_out','condition_review','transfer_requested','agreement_review','rent_review','bond_review','utilities_review']
              .map(k=><option value={k} key={k}>{k.replaceAll('_',' ')}</option>)}</select></label>
          <label className="field">Effective date/time<input type="datetime-local" name="effectiveAt" required/></label>
          <label className="field">Evidence reference<input name="evidenceReference" minLength={8} required/></label>
          <label className="field">Private operations note<textarea name="note" minLength={8} required rows={3}/></label>
          <button className="primary" disabled={busy||!occupancies.length}>Record event</button>
        </Form>
        {operations.events.map((e:any)=><div className="record-row" key={e.id}>
          <div><strong>{e.space} — {e.kind.replaceAll('_',' ')}</strong>
            <p className="small">{date(e.effective_at)} · Ref: {e.evidence_reference}</p>
            <p>{e.note}</p></div>
        </div>)}
      </section>
      <section className="panel stack"><h2>Common-area condition reporting</h2>
        <p>Draft notes are encrypted and manager-only. Only a separately reviewed summary becomes visible to residents; no raw photos or private room notes are published.</p>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="inspect_shared"/>
          <label className="field">Shared area<select name="spaceId" defaultValue="" required>
            <option value="">Select shared area</option>
            {sharedSpaces.map((s:any)=><option key={s.id} value={s.id}>{s.label}</option>)}
          </select></label>
          <label className="field">Inspected at<input name="inspectedAt" type="datetime-local" required/></label>
          <label className="field">Private condition notes<textarea name="note" minLength={8} required/></label>
          <button className="primary" disabled={busy||!sharedSpaces.length}>Save private draft</button>
        </Form>
        {operations.inspections.map((i:any)=><div className="panel stack" key={i.id}>
          <strong>{i.space} · {date(i.inspected_at)} · {i.status}</strong>
          {i.public_summary&&<p>{i.public_summary}</p>}
          {authorisedReviewer&&i.status!=='published'&&<Form method="post" className="form">
            <input type="hidden" name="action" value="publish_shared"/>
            <input type="hidden" name="inspectionId" value={i.id}/>
            <label className="field">Independently reviewed resident-safe summary
              <textarea name="publicSummary" required minLength={8} maxLength={500}/>
            </label>
            <button className="primary" disabled={busy}>Publish to residents</button>
          </Form>}
        </div>)}
      </section>
    </div>
  </>;
}
