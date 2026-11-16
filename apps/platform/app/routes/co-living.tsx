import {
  Form, Link, useLoaderData, useActionData, useNavigation,
  data, type LoaderFunctionArgs, type ActionFunctionArgs,
} from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Feedback } from '../../../../packages/ui/components';

export async function loader({request,context,params}:LoaderFunctionArgs) {
  const propertyId=params.propertyId??'';
  const overview=await loadApi(request,context,
    `/api/w/${params.kind}/${params.scopeId}/properties/${propertyId}/co-living`);
  return {propertyId,overview} as any;
}
export async function action({request,context,params}:ActionFunctionArgs) {
  const form=await request.formData();
  const intent=String(form.get('intent')??'');
  const api=`/api/w/${params.kind}/${params.scopeId}`;
  let target=`${api}/properties/${params.propertyId}/co-living`;
  let payload:Record<string,unknown>;
  if(intent==='configure')payload={action:'configure',allocationMode:form.get('allocationMode')};
  else if(intent==='add_space')payload={action:'add_space',label:form.get('label'),spaceType:form.get('spaceType')};
  else if(intent==='invite') {
    target=`${api}/tenancies`;
    const start=String(form.get('startsAt')??''),end=String(form.get('endsAt')??'');
    payload={
      propertyId:params.propertyId,
      spaceId:form.get('spaceId'),
      email:form.get('email'),
      startsAt:new Date(start+'T00:00:00+08:00').toISOString(),
      endsAt:end?new Date(end+'T23:59:59+08:00').toISOString():undefined,
    };
  } else return data({error:'Unknown co-living action.'},{status:422});
  const response=await callApi(request,context,target,{method:'POST',body:payload});
  const result=await response.json() as Record<string,any>;
  if(!response.ok)return data({error:result.message??'Action unavailable.',fields:result.fields},{status:response.status});
  return data({ok:true,message:result.message??'Resident invitation queued.'});
}
export default function CoLiving() {
  const d=useWorkspace();
  const {propertyId,overview}=useLoaderData<typeof loader>();
  const result=useActionData<any>(),pending=useNavigation().state!=='idle';
  const site=overview.site as {allocation_mode:'room'|'bed'}|null;
  const spaces=(overview.spaces??[]) as {id:string;label:string;space_type:string;active:number}[];
  const occupancies=(overview.occupancies??[]) as {space_id:string;tenancy_id:string;status:string;starts_at:string;ends_at:string|null}[];
  const canConfigure=d.workspace.kind==='staff' || ['owner','admin'].includes(d.workspace.role);
  const privateSpaces=spaces.filter(s=>s.active&&s.space_type!=='shared_area');
  return <>
    <PageHeading eyebrow="Residential property operations" title="Co-living"
      description="One property, separate private rooms or beds, shared areas and individually invited residents."/>
    <div className="stack">
      <div className="actions">
        <Link to={d.workspace.href+'/properties/'+encodeURIComponent(propertyId)}>Return to property</Link>
        <Link className="button secondary" to={d.workspace.href+'/properties/'+encodeURIComponent(propertyId)+'/co-living/operations'}>
          Occupancy, finances &amp; common-area condition
        </Link>
      </div>
      <Feedback value={result}/>
      {!site?<section className="panel stack">
        <h2>Configure co-living</h2>
        <p>This setting is intended for properties with separate room or bed tenancies. An existing whole-property tenancy must be reviewed before enabling it.</p>
        {canConfigure?<Form method="post" className="form">
          <input type="hidden" name="intent" value="configure"/>
          <label className="field">How are private occupancies allocated?
            <select name="allocationMode" defaultValue="room">
              <option value="room">By room</option><option value="bed">By bed</option>
            </select>
          </label>
          <button className="primary" disabled={pending}>Configure property</button>
        </Form>:<p>Only an account owner or administrator can configure a co-living property.</p>}
      </section>:<>
        <section className="panel stack"><h2>Private spaces and shared areas</h2>
          <p>Allocation: by {site.allocation_mode}. Shared areas are available to invited occupants, but do not create another tenancy.</p>
          {spaces.length?<div className="stack">{spaces.map(s=><div className="record-row" key={s.id}>
            <strong>{s.label}</strong><span className="small">{s.space_type.replace('_',' ')} · {s.active?'Active':'Inactive'}</span>
          </div>)}</div>:<p>No spaces have been added yet.</p>}
          {canConfigure&&<Form method="post" className="form">
            <input type="hidden" name="intent" value="add_space"/>
            <label className="field">Space name<input name="label" required maxLength={64} placeholder="Room 1 / Bed A / Shared kitchen"/></label>
            <label className="field">Space type
              <select name="spaceType" defaultValue={site.allocation_mode}>
                <option value={site.allocation_mode}>Private {site.allocation_mode}</option>
                <option value="shared_area">Shared area</option>
              </select>
            </label>
            <button className="primary" disabled={pending}>Add space</button>
          </Form>}
        </section>
        <section className="panel stack"><h2>Invite a resident to a room or bed</h2>
          <p>Residents cannot sign up to the Resident Portal independently. Invitations must be addressed to their own email and accepted after verification. Other residents' tenancy records remain private.</p>
          {privateSpaces.length&&d.workspace.role!=='viewer'?<Form method="post" className="form">
            <input type="hidden" name="intent" value="invite"/>
            <label className="field">Private space<select required name="spaceId" defaultValue=""><option value="">Choose a room or bed</option>
              {privateSpaces.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>
            <label className="field">Resident email<input type="email" name="email" required/></label>
            <div className="grid-2">
              <label className="field">Tenancy start<input name="startsAt" type="date" required/></label>
              <label className="field">Tenancy end (optional)<input name="endsAt" type="date"/></label>
            </div>
            <button className="primary" disabled={pending}>Create occupancy and send invitation</button>
          </Form>:<p>Add private rooms or beds before inviting residents.</p>}
        </section>
        <section className="panel stack"><h2>Recorded occupancies</h2>
          {occupancies.length?occupancies.map(o=><div className="record-row" key={o.tenancy_id}>
            <div><strong>{spaces.find(s=>s.id===o.space_id)?.label??'Private space'}</strong>
              <p className="small">{o.status} · {o.starts_at} · {o.ends_at??'Ongoing'}</p></div>
            <Link to={d.workspace.href+'/tenancies/'+encodeURIComponent(o.tenancy_id)}>Review tenancy</Link>
          </div>):<p>No occupancies yet.</p>}
        </section>
      </>}
    </div>
  </>;
}
