import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace,workspaceApi } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { OperationForm,Input,TextArea,Panel,Select } from '../components/OperationForm';
type Field={key:string;label:string;type:string;required:boolean};
type Definition={code:string;name:string;stage:string;audience:string;purpose:string;fields:Field[];kind:string;signature:string;responseDays?:number};
type FormCase={id:string;formCode:string;status:string;version:number;createdAt:string;dueAt:string|null;details:any};
type Data={definitions:Definition[];cases:FormCase[];source:string};
export const meta=()=>[{title:'WA Residential Tenancy Forms | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/tenancies/${params.tenancyId}/wa-forms`) as Data;
}
export default function WAResidentialForms(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 const prefix=workspaceApi(w.kind,w.scopeId);
 const tenancyId=new URL(typeof window!=='undefined'?window.location.href:'http://localhost').pathname.split('/').at(-2)??'';
 return <div className="stack">
   <PageHeading title="WA Residential Tenancy Forms" description="Approved official forms are separate from application instructions. An online draft is not a legal notice, bond lodgement or court filing." />
   <Link to={`${w.href}/tenancies/${tenancyId}`}>Back to tenancy</Link>
   <Panel title="Start a residential form">
     <OperationForm endpoint={`${prefix}/wa-forms`} defaults={{tenancyId}} label="Save draft form instructions">
       <Select name="formCode" label="WA form" options={d.definitions.map(f=>({value:f.code,label:f.name}))}/>
       <TextArea name="notes" label="Supporting instructions / questions for review" required={false}/>
       <p className="small">Select the appropriate form, then follow the official source for field requirements. The draft is private until reviewed and issued.</p>
     </OperationForm>
     <p><a href={d.source} target="_blank" rel="noopener noreferrer">Official WA Consumer Protection forms and notices</a></p>
   </Panel>
   <Panel title="Form catalogue">
     {d.definitions.map(f=><details key={f.code}><summary>{f.name} — {f.stage}</summary>
       <p>{f.purpose}</p>
       <p className="small">Official document source and legal approval required before issue. {f.responseDays?`Nominal response window: ${f.responseDays} days (confirm statutory receipt and exceptions).`:''}</p>
       <OperationForm endpoint={`${prefix}/wa-forms`} defaults={{tenancyId,formCode:f.code}} label="Create reviewed-workflow draft">
         {f.fields.map(field=><Input key={field.key} name={`answers.${field.key}`} label={field.label}
             type={field.type==='date'?'date':field.type==='number'?'number':'text'} required={field.required}/>)}
         <TextArea name="notes" label="Additional instructions" required={false}/>
       </OperationForm>
     </details>)}
   </Panel>
   <Panel title="My form cases">
    {!d.cases.length&&<p>No statutory form cases have been started for this tenancy.</p>}
    {d.cases.map(c=><details key={c.id}>
     <summary>{d.definitions.find(f=>f.code===c.formCode)?.name??c.formCode} — {c.status}</summary>
     <Badge status={c.status}/>
     <p className="small">Created {c.createdAt}. Current version {c.version}. An official document may require staff review before it can be issued.</p>
     {c.status==='draft'&&<OperationForm endpoint={`${prefix}/wa-forms/${c.id}`} defaults={{version:c.version,status:'submitted'}} label="Submit draft for review"/>}
     {['draft','submitted'].includes(c.status)&&<OperationForm endpoint={`${prefix}/wa-forms/${c.id}`} defaults={{version:c.version,status:'withdrawn'}} label="Withdraw draft"/>}
     {w.kind==='staff'&&c.status==='submitted'&&<OperationForm endpoint={`${prefix}/wa-forms/${c.id}`} defaults={{version:c.version,status:'under_review'}} label="Begin official review"><Input name="reviewReference" label="Review reference"/></OperationForm>}
     {w.kind==='staff'&&c.status==='under_review'&&<OperationForm endpoint={`${prefix}/wa-forms/${c.id}`} defaults={{version:c.version,status:'approved'}} label="Approve for preparation"><Input name="reviewReference" label="Official-document review reference"/></OperationForm>}
    </details>)}
   </Panel>
 </div>;
}
