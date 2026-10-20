import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading, Badge } from '../../../../packages/ui/components';
import { OperationForm, Panel, Input, Select, TextArea, choices } from '../components/OperationForm';
import { ANSWER_STEPS, FIELDS, type AnswerStep } from '../../../../packages/marketing/form18';

export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/staff/rental-applications/'+params.applicationId) as any;
}
export default function RentalApplicationDetail(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace,role=useWorkspace().user.staffRole;
 const a=d.application,base='/api/staff/rental-applications/'+a.id;
 const next:Record<string,string[]>={submitted:['information_requested','ready_for_handoff'],
  information_requested:['ready_for_handoff'],ready_for_handoff:['forwarded'],forwarded:['decision_recorded']};
 return <><PageHeading title={a.reference} eyebrow="Restricted residential application"
 description={'Property: '+a.property+' · Leasing representative: '+a.leasingRepresentative}/>
 <div className="actions"><Link to={w.href+'/rental-applications'}>← Application queue</Link><Link className="button secondary" to={w.href+'/rental-applications/'+a.id+'/print'}>Print / Save as PDF</Link><Badge status={a.status}/></div>
 <div className="detail-grid"><div className="stack">
  <Panel title="Household applicants" description="Information is visible only to authorised operations staff. Applicants cannot view other household members' confidential records.">
   {d.applicants.map((person:any)=><article key={person.id} className="stack" style={{borderBottom:'1px solid var(--border)',paddingBottom:'1.3rem'}}>
    <h3>Applicant {person.ordinal}: {person.answers.identity?.fullName}</h3><p className="small">{person.role} · <Badge status={person.state}/> · Declared: {person.declaredAt?new Date(person.declaredAt).toLocaleString('en-AU'):'Not declared'}</p>
    {ANSWER_STEPS.map((step:AnswerStep)=><details key={step} className="panel" style={{boxShadow:'none'}}><summary style={{fontWeight:700,cursor:'pointer'}}>{step.replaceAll('_',' ')} — Application details</summary>
     <dl className="detail-grid" style={{marginTop:'1rem'}}>{FIELDS[step].map(field=><div key={field.key}><dt className="small">{field.label}</dt><dd style={{marginLeft:0,overflowWrap:'anywhere'}}>{person.answers[step]?.[field.key]||'—'}</dd></div>)}</dl>
    </details>)}
   </article>)}
  </Panel>
  <Panel title="Secure supporting documents" description="Uploaded files are quarantined until independently checked. Only approved files may accompany an authorised handoff.">
   {d.documents.length===0?<p>No documents attached.</p>:d.documents.map((doc:any)=><article className="record-row" key={doc.id}><div><strong>{doc.filename}</strong>
    <p className="small">Applicant record: {doc.applicant_id} · {doc.category} · {(doc.size_bytes/1048576).toFixed(2)} MB</p><Badge status={doc.review_status}/>
    <div className="actions">
     {doc.review_status==='released'&&<a className="button secondary small" href={base+'/documents/'+doc.id+'/download'}>Download approved file</a>}
     {doc.review_status==='quarantined'&&role==='administrator'&&<a className="button secondary small" href={base+'/documents/'+doc.id+'/download?quarantine=1'}>Download for isolated security review</a>}
    </div>
    {doc.review_status==='quarantined'&&role==='administrator'&&<OperationForm endpoint={base+'/documents/'+doc.id+'/review'} label="Record security review">
      <Select name="status" label="Review decision" options={choices(['released','rejected'])}/>
      <Input name="scanReference" label="Malware scan / verified review reference" help="Only release after a controlled file security review. Recording a reference does not run a scanner."/>
     </OperationForm>}
   </div></article>)}
  </Panel>
  <Panel title="Application activity"><div className="stack">{d.history.map((e:any)=><div className="record-row" key={e.id}><div><strong>{e.kind.replaceAll('_',' ')}</strong><p className="small">{new Date(e.created_at).toLocaleString('en-AU')}</p></div></div>)}</div></Panel>
 </div><aside className="stack">
  <Panel title="Decision-making boundary"><p>ProInspect is administering this application on behalf of the authorised landlord or leasing agency. ProInspect does not determine applicant suitability, offer a tenancy or execute the tenancy agreement through this workflow.</p>
   <p className="small">Instructing client reference: {a.instructingClientId}</p></Panel>
  <Panel title="Information for lessors and applicants">
   <p>This application is not a tenancy agreement. Application records must be used only for the authorised residential letting purpose.</p>
   <h3>Tenancy database notice — Application details Attachment A</h3>
   {d.notice.mode==='configured'?d.notice.entries.map((n:any,i:number)=><div key={i}><strong>{n.name}</strong><p>Operator contact: {n.operatorContact}</p><p>How to request information: {n.accessInstructions}</p></div>):<p>The responsible representative declared that no tenancy database is used for this application.</p>}
  </Panel>
  {next[a.status]?.length>0&&<Panel title="Administrative processing"><OperationForm endpoint={base+'/status'} defaults={{version:a.version}} label="Save processing state">
   <Select name="status" label="Next state" options={choices(next[a.status])}/>
   <TextArea name="note" label="Processing or handoff reference"/>
  </OperationForm>
   <p className="small">Moving to “Forwarded” sends a reference-only notice to the previously configured recipient; no documents or financial information are attached. Transfer application records through a separately approved secure channel.</p></Panel>}
 </aside></div></>;
}
