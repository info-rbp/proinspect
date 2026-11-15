import { Form, Link, useLoaderData, useActionData, useNavigation, data, type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { loadApi, callApi } from '../lib/api.server';
import { CLIENT_AREAS } from '../../../../packages/domain/client-navigation';
import { PageHeading, Feedback } from '../../../../packages/ui/components';

const LABELS: Record<string,string>={residential:'Residential',commercial:'Commercial',strata:'Strata','co-living':'Co-Living',construction:'Construction',leasing:'Leasing',maintenance:'Maintenance'};
export async function loader({request,context,params}:LoaderFunctionArgs){
 const workspace=await loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId);
 if(!['landlord','property-manager','commercial','strata-manager'].includes(workspace.workspace.kind))throw new Response('Account settings unavailable',{status:403});
 const prefs=await loadApi(request,context,'/api/client-accounts/'+params.scopeId+'/service-interests');
 return {workspace:workspace.workspace,prefs};
}
export async function action({request,context,params}:ActionFunctionArgs){
 const input=await request.formData();
 const response=await callApi(request,context,'/api/client-accounts/'+params.scopeId+'/service-interests',{method:'POST',body:{area:input.get('area'),requested:input.get('requested')==='yes'}});
 const payload=await response.json() as Record<string,any>;
 if(!response.ok)return data({error:payload.message??'Unable to save this preference.'},{status:response.status});
 return {ok:true,message:'Your account service interests have been saved.'};
}
export default function AccountServices(){
 const {workspace:w,prefs}=useLoaderData<typeof loader>();
 const result=useActionData<typeof action>(),busy=useNavigation().state!=='idle';
 const admin=['owner','admin'].includes(w.role);
 return <div className="stack">
  <PageHeading eyebrow="Client Portal settings" title="Manage accounts &amp; services" description="Choose the service areas your organisation is interested in. Selecting an area does not approve a sector, property, service, subscription or payment."/>
  <section className="panel stack"><h2>Current account</h2><p><strong>{w.name}</strong> — {w.role}</p><p>Switch accounts through the workspace selector. Professional accounts and property management rights require independent verification.</p>
   <div className="actions"><Link to="/workspaces">Switch account</Link><Link to="/organisation">Request professional organisation</Link><Link to="/onboarding">Set up eligible owner account</Link><Link to="/account">Profile &amp; security</Link></div>
  </section>
  <section className="panel stack"><h2>Service interests</h2>
   {!prefs.ready&&<p role="status">Account service preferences require the pending database migration. Existing account permissions remain unchanged.</p>}
   <p>Available services still depend on approved market rules, verified property/scheme relationships and your individual permissions.</p>
   <Feedback value={result}/>
   <div className="client-dashboard-grid">{CLIENT_AREAS.map(area=>{
    const chosen=prefs.areas.includes(area);
    return <div className="panel" key={area}><h3>{LABELS[area]}</h3>
      <p>{area==='co-living'||area==='construction'?'Full management functionality is in development.':'Request interest in eligible services for this area.'}</p>
      <p className="small">Account preference: {chosen?'Selected':'Not selected'}</p>
      {admin&&prefs.ready&&<Form method="post"><input type="hidden" name="area" value={area}/><input type="hidden" name="requested" value={chosen?'no':'yes'}/>
      <button className="button secondary" type="submit" disabled={busy}>{chosen?'Remove interest':'Add interest'}</button></Form>}
    </div>;
   })}</div>
   {!admin&&<p>Only account owners and administrators can update service interests.</p>}
  </section>
  <section className="panel"><h2>Subscriptions &amp; billing</h2><p>Subscriptions are optional and must be separately selected under approved terms. Setting a service interest does not start paid billing.</p>
    {admin&&<Link to={w.href+'/billing'}>Review billing and subscriptions</Link>}</section>
 </div>;
}
