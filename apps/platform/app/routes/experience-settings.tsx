import {Form,useLoaderData,useActionData,useNavigation,data,
  type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,Feedback} from '../../../../packages/ui/components';

export async function loader({request,context,params}:LoaderFunctionArgs){
  return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/experience-preferences`);
}
export async function action({request,context,params}:ActionFunctionArgs){
  const f=await request.formData();
  const response=await callApi(request,context,`/api/w/${params.kind}/${params.scopeId}/experience-preferences`,{
    method:'POST',body:{displayDensity:f.get('displayDensity'),landingSection:f.get('landingSection')}});
  const result=await response.json() as {message?:string;fields?:unknown};
  return data(response.ok?{ok:true,message:result.message}:{error:result.message,fields:result.fields},
    {status:response.status});
}
export default function ExperienceSettings(){
  const d=useWorkspace();
  const {family,availableSections,preferences}=useLoaderData<typeof loader>() as {
    family:string;availableSections:string[];
    preferences:{displayDensity:'comfortable'|'compact';landingSection:string};
  };
  const response=useActionData<any>(),busy=useNavigation().state!=='idle';
  return <>
    <PageHeading eyebrow="My ProInspect" title="My portal preferences"
      description="Personalise how your authorised workspace opens and how dense its layout appears. These settings never change account tags, property relationships or service permissions."/>
    <div className="stack">
      <Feedback value={response}/>
      <section className="panel form-width stack">
        <h2>{family.charAt(0).toUpperCase()+family.slice(1)} experience</h2>
        <Form method="post" className="form">
          <label className="field">Layout density
            <select name="displayDensity" defaultValue={preferences.displayDensity} key={preferences.displayDensity}>
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact tables and records</option>
            </select>
          </label>
          <label className="field">Preferred starting section
            <select name="landingSection" defaultValue={preferences.landingSection} key={preferences.landingSection}>
              {availableSections.map(s=><option key={s} value={s}>
                {s==='overview'?'Overview':s.replaceAll('-',' ').replace(/^./,v=>v.toUpperCase())}
              </option>)}
            </select>
          </label>
          <p className="small">Options are limited to the tools already allowed for your current role and verified account.</p>
          <button className="primary" disabled={busy}>Save preferences</button>
        </Form>
      </section>
      <a className="button secondary" href={d.workspace.href}>Return to workspace</a>
    </div>
  </>;
}
