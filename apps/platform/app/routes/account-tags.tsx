import {
  Form, useLoaderData, useActionData, useNavigation,
  type LoaderFunctionArgs, type ActionFunctionArgs, data,
} from 'react-router';
import { loadApi,callApi } from '../lib/api.server';
import { PageHeading,Feedback } from '../../../../packages/ui/components';
import { ACCOUNT_EXPERIENCE_TAGS,EXPERIENCE_TAG_LABELS } from '../../../../packages/domain/portal-experience';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/account-tags`);
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData();
  const response=await callApi(request,context,`/api/w/${params.kind}/${params.scopeId}/account-tags`,{
    method:'POST',body:{clientId:f.get('clientId'),tag:f.get('tag'),action:f.get('action'),reference:f.get('reference')}
  });
  const result=await response.json() as Record<string,any>;
  return data(response.ok?{ok:true,message:result.message}:{error:result.message,fields:result.fields},{status:response.status});
}
export default function AccountTags(){
  const d=useLoaderData<typeof loader>() as {clients:{id:string;name:string;client_type:string;tags:string[]}[]};
  const result=useActionData<any>(),pending=useNavigation().state!=='idle';
  return <>
    <PageHeading title="Account experience tags" eyebrow="Staff administration"
      description="Add presentation tags to tailor the account experience. Tags do not create roles, property authority or billing entitlements."/>
    <div className="stack">
      <Feedback value={result}/>
      <section className="panel form-width stack"><h2>Manage a verified account</h2>
        <Form method="post" className="form">
          <label className="field">Account<select name="clientId" required defaultValue="">
            <option value="">Choose account</option>
            {d.clients.map(c=><option key={c.id} value={c.id}>{c.name} ({c.client_type})</option>)}
          </select></label>
          <label className="field">Experience tag<select name="tag" required defaultValue="co_living">
            {ACCOUNT_EXPERIENCE_TAGS.map(t=><option key={t} value={t}>{EXPERIENCE_TAG_LABELS[t]}</option>)}
          </select></label>
          <label className="field">Action<select name="action" defaultValue="add">
            <option value="add">Add tag</option><option value="remove">Remove tag</option>
          </select></label>
          <label className="field">Reviewed reason / source reference
            <input name="reference" required minLength={8} maxLength={300} placeholder="Approved request or management reference"/>
          </label>
          <button className="primary" disabled={pending}>Save experience tag</button>
        </Form>
      </section>
      <section className="panel stack"><h2>Current account tags</h2>
        {d.clients.filter(c=>c.tags.length).length?
          d.clients.filter(c=>c.tags.length).map(c=><div key={c.id} className="record-row">
            <strong>{c.name}</strong>
            <span className="small">{c.tags.map(t=>EXPERIENCE_TAG_LABELS[t as keyof typeof EXPERIENCE_TAG_LABELS]??t).join(', ')}</span>
          </div>):<p>No additional account tags assigned.</p>}
      </section>
    </div>
  </>;
}
