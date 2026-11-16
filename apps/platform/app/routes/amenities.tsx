import {Form,useLoaderData,useActionData,useNavigation,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,Feedback} from '../../../../packages/ui/components';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/amenities`);
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData(),action=String(f.get('action')??'');
  const get=(k:string)=>String(f.get(k)??'').trim();
  const time=(k:string)=>{const t=Date.parse(get(k));return Number.isFinite(t)?new Date(t).toISOString():null;};
  let body:Record<string,unknown>={action};
  if(action==='create')body={...body,schemeId:get('schemeId'),name:get('name'),description:get('description')};
  else if(action==='request')body={...body,amenityId:get('amenityId'),startsAt:time('startsAt'),endsAt:time('endsAt')};
  else if(action==='cancel')body={...body,requestId:get('requestId')};
  else if(action==='review')body={...body,requestId:get('requestId'),decision:get('decision'),reference:get('reference')};
  else return data({error:'Action not available.'},{status:422});
  const res=await callApi(request,context,`/api/w/${params.kind}/${params.scopeId}/amenities`,{method:'POST',body});
  const value=await res.json() as {message?:string;fields?:unknown};
  return data(res.ok?{ok:true,message:value.message??'Recorded.'}:{error:value.message??'Action unavailable.',fields:value.fields},
    {status:res.status});
}
const when=(v:string)=>new Date(v).toLocaleString('en-AU',{dateStyle:'medium',timeStyle:'short'});
export default function Amenities(){
  const d=useWorkspace(),v=useLoaderData<typeof loader>() as {
    schemes:{id:string;name:string}[];
    amenities:{id:string;scheme_id:string;name:string;description:string}[];
    mine:{id:string;name:string;starts_at:string;ends_at:string;status:string}[];
    reviews:{id:string;name:string;starts_at:string;ends_at:string;status:string}[];
    manager:boolean;
  };
  const result=useActionData<any>(),busy=useNavigation().state!=='idle';
  return <>
    <PageHeading eyebrow="Strata / Resident" title="Shared amenity requests"
      description="Optional, separately approved facilities pilot. Building residents can request time slots; authorised strata managers decide. No levies, payments or statutory council decisions are created."/>
    <div className="stack"><Feedback value={result}/>
      {v.manager&&<section className="panel stack">
        <h2>Register an amenity</h2>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="create"/>
          <label className="field">Scheme<select name="schemeId" required defaultValue="">
            <option value="">Select scheme</option>
            {v.schemes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label className="field">Amenity name<input name="name" minLength={3} maxLength={100} required/></label>
          <label className="field">Description<input name="description" maxLength={400}/></label>
          <button className="primary" disabled={busy}>Register shared facility</button>
        </Form>
      </section>}
      {d.workspace.kind==='building'&&<section className="panel stack">
        <h2>Request a facility time</h2>
        <Form method="post" className="form">
          <input type="hidden" name="action" value="request"/>
          <label className="field">Facility<select name="amenityId" required defaultValue="">
            <option value="">Select facility</option>
            {v.amenities.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
          </select></label>
          <div className="grid-2">
            <label className="field">Start<input type="datetime-local" name="startsAt" required/></label>
            <label className="field">End<input type="datetime-local" name="endsAt" required/></label>
          </div>
          <p className="small">Requests are not confirmed until reviewed. Maximum 12 hours.</p>
          <button className="primary" disabled={busy||!v.amenities.length}>Submit request</button>
        </Form>
      </section>}
      <section className="panel stack"><h2>My requests</h2>
        {v.mine.length?v.mine.map(r=><div className="record-row" key={r.id}>
          <div><strong>{r.name}</strong><p className="small">{when(r.starts_at)} – {when(r.ends_at)} · {r.status}</p></div>
          {r.status==='requested'&&d.workspace.kind==='building'&&
          <Form method="post"><input type="hidden" name="action" value="cancel"/>
            <input type="hidden" name="requestId" value={r.id}/>
            <button className="button secondary" disabled={busy}>Withdraw request</button>
          </Form>}
        </div>):<p>No requests recorded.</p>}
      </section>
      {v.manager&&<section className="panel stack"><h2>Pending manager reviews</h2>
        {v.reviews.length?v.reviews.map(r=><div className="record-row" key={r.id}>
          <div><strong>{r.name}</strong><p className="small">{when(r.starts_at)} – {when(r.ends_at)}</p></div>
          <Form method="post" className="form">
            <input type="hidden" name="action" value="review"/>
            <input type="hidden" name="requestId" value={r.id}/>
            <label className="field">Decision<select name="decision" defaultValue="approved">
              <option value="approved">Approve</option><option value="declined">Decline</option>
            </select></label>
            <label className="field">Authority reference<input name="reference" minLength={8} required/></label>
            <button className="button secondary" disabled={busy}>Record decision</button>
          </Form>
        </div>):<p>No pending requests.</p>}
      </section>}
    </div>
  </>;
}
