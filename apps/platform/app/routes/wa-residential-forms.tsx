import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace,workspaceApi } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { OperationForm,Input,TextArea,Panel,Select } from '../components/OperationForm';

type Field={key:string;label:string;type:string;required:boolean};
type Definition={code:string;name:string;stage:string;audience:string;purpose:string;fields:Field[];kind:string;signature:string;responseDays?:number};
type FormCase={
  id:string;formCode:string;status:string;version:number;createdAt:string;dueAt:string|null;
  dueBasis:string|null;receiptAt:string|null;decisionStatus:string|null;externalStatus:string|null;
  noticeInvalidatedAt:string|null;bookingId:string|null;issuedDocumentId:string|null;details:any;
};
type Data={propertyId:string;definitions:Definition[];cases:FormCase[];source:string};
export const meta=()=>[{title:'WA Residential Tenancy Forms | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 return { ...(await loadApi(request,context,
  `/api/w/${params.kind}/${params.scopeId}/tenancies/${params.tenancyId}/wa-forms`) as Data),
  tenancyId:params.tenancyId };
}
const stages=[
 ['commencement','Start the tenancy'],
 ['active','Manage an active tenancy'],
 ['breach','Breaches and requests'],
 ['ending','End the tenancy and vacate'],
 ['bond','Bonds and finalisation'],
] as const;

export default function WAResidentialForms(){
 const d=useLoaderData<typeof loader>(),workspace=useWorkspace();
 const w=workspace.workspace,prefix=workspaceApi(w.kind,w.scopeId);
 const tenancyId=d.tenancyId!;
 const bookings=workspace.bookings.filter(b=>b.property_id===d.propertyId&&b.status==='confirmed');
 return <div className="stack">
  <PageHeading title="WA Residential Tenancy Forms"
    description="Prepare guided residential tenancy records, obtain review and manage controlled document evidence. This is not an automated legal-service or government-lodgement service."/>
  <div className="actions">
   <Link to={`${w.href}/tenancies/${tenancyId}`}>Back to tenancy</Link>
   <a href={d.source} target="_blank" rel="noopener noreferrer">WA Consumer Protection official forms</a>
   {w.kind==='staff'&&<Link to={`${w.href}/wa-form-templates`}>Official-template library</Link>}
  </div>
  <Panel title="Existing tenancy form cases">
   {d.cases.length===0&&<p>No residential statutory form cases are recorded for this tenancy.</p>}
   {d.cases.map(c=><div className="record-row" key={c.id}>
    <div>
     <strong>{d.definitions.find(x=>x.code===c.formCode)?.name??c.formCode}</strong>
     <p className="small">Created {c.createdAt}</p>
     <Badge status={c.status}/>
     {c.decisionStatus&&<p>Recorded response: {c.decisionStatus.replaceAll('_',' ')}</p>}
     {c.externalStatus&&<p>External record: {c.externalStatus.replaceAll('_',' ')}</p>}
     {c.dueAt&&<p className="small">Advisory response deadline: {new Date(c.dueAt).toLocaleString('en-AU',{timeZone:'Australia/Perth'})} (confirm statutory calculation)</p>}
     {c.noticeInvalidatedAt&&<p>Booking changed: the existing entry notice must be reassessed.</p>}
    </div>
    <Link to={`${w.href}/tenancies/${tenancyId}/wa-forms/${c.id}`}>View case and actions →</Link>
   </div>)}
  </Panel>
  {stages.map(([stage,title])=>{
   const definitions=d.definitions.filter(x=>x.stage===stage);
   if(!definitions.length)return null;
   return <Panel key={stage} title={title} description="Use the relevant prescribed form. Completing this draft does not itself issue, sign, legally serve or lodge anything.">
    {definitions.map(form=><details key={form.code}>
     <summary>{form.name}</summary>
     <p>{form.purpose}</p>
     {form.responseDays&&<p className="small">Indicative response period: {form.responseDays} days after verified receipt, subject to current WA law and exceptions.</p>}
     <OperationForm endpoint={`${prefix}/wa-forms`}
      defaults={{tenancyId,formCode:form.code}} label="Save form draft">
      {form.code==='WA_FORM_19'&&<Select name="bookingId" label="Confirmed inspection booking"
        options={bookings.map(booking=>({value:booking.id,label:booking.reference??booking.id}))}/>}
      {form.fields.map(field=>field.key==='entryPurpose'?
       <Select key={field.key} name={`answers.${field.key}`} label={field.label}
        options={[
         {value:'routine',label:'Routine inspection'},
         {value:'repairs',label:'Necessary repairs or maintenance'},
         {value:'other',label:'Other purpose — Staff legal review required'},
        ]}/>:
       field.type==='textarea'?
        <TextArea key={field.key} name={`answers.${field.key}`} label={field.label} required={field.required}/>:
        <Input key={field.key} name={`answers.${field.key}`} label={field.label}
         type={field.type==='date'?'date':field.type==='number'?'number':'text'}
         required={field.required}/>
      )}
      <TextArea name="notes" label="Relevant background or questions for review" required={false}/>
     </OperationForm>
    </details>)}
   </Panel>;
  })}
  <p className="small">
   The Form 2 family-violence pathway is intentionally unavailable here; it uses a separate restricted process.
   Historical bond-disposal forms are preserved, but the current 2026 bond-release application is used for new cases.
   Legal effect and signature requirements are not determined by this screen.
  </p>
 </div>;
}
