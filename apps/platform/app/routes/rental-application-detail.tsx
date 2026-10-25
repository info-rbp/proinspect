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
  information_requested:['ready_for_handoff'],ready_for_handoff:[],forwarded:[]};
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
    <p className="small">Applicant record: {doc.applicant_id} · {doc.category} · {(doc.size_bytes/1048576).toFixed(2)} MB</p><Badge status={doc.review_status}/> <span className="small">Scanner result: {doc.scan_status}</span>
    <div className="actions">
     {doc.review_status==='released'&&<a className="button secondary small" href={base+'/documents/'+doc.id+'/download'}>Download approved file</a>}
     {doc.scan_status==='pending'&&<p className="small">Awaiting an independently verified private malware scan; download and release are blocked.</p>}
    </div>
    {doc.review_status==='quarantined'&&role==='administrator'&&<OperationForm endpoint={base+'/documents/'+doc.id+'/review'} label="Record security review">
      <Select name="status" label="Review decision" options={choices(doc.scan_status==='clean'?['released','rejected']:['rejected'])}/>
      <Input name="note" label="Review reason" help="The malware result is recorded through a signed scanner callback, not by entering a reference here."/>
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
  <Panel title="Agency email handoff — Google Apps Script"><p>The complete application is intended to be delivered by a Google Apps Script email workflow designed in a later stage. This branch only stages the recipient-bound record.</p>
   {d.handoffs?.length>0?d.handoffs.map((h:any)=><div className="record-row" key={h.id}><div><strong>Submission handoff: {h.status.replaceAll('_',' ')}</strong><p className="small">Staged {new Date(h.staged_at).toLocaleString('en-AU')} · {h.format_version}</p></div></div>):<p className="small">No handoff staged. Review uploaded documents and move the application to ready for handoff when appropriate.</p>}
   <p className="small">No personal data or files are sent to the agency until a separately approved script, secure delivery method, acknowledgement and consent controls exist.</p>
  </Panel>
  {a.status==='forwarded'&&<Panel title="Record agency decision"><p>Only record a decision communicated by the responsible landlord or agency.</p>
   <OperationForm endpoint={base+'/outcome'} label="Record verified outcome" defaults={{version:a.version,notifyApplicants:true}}>
    <Select name="outcome" label="Decision" options={choices(['successful','unsuccessful'])}/><Input name="authorityReference" label="Decision reference"/><TextArea name="note" label="Source and details of instruction"/>
   </OperationForm></Panel>}
  {role==='administrator'&&<Panel title="Privacy and retention controls">
   <p className="small">Retention deadline: {d.retainedUntil?new Date(d.retainedUntil).toLocaleString('en-AU'):'Not assigned — investigate before enabling intake'}</p>
   <p className="small">Privacy/legal hold: {d.privacyHoldUntil?new Date(d.privacyHoldUntil).toLocaleString('en-AU'):'None'}</p>
   <OperationForm endpoint={base+'/privacy-hold'} label="Set or clear privacy hold"><div className="field"><label>Hold until (optional; leave blank to clear)<input type="datetime-local" name="holdUntil"/></label></div>
    <TextArea name="reason" label="Reason and authority for hold or release"/></OperationForm>
   <h3>Applicant privacy requests</h3>
   {d.privacyRequests?.length===0?<p className="small">No privacy requests.</p>:d.privacyRequests?.map((p:any)=><div className="panel stack" key={p.id}>
     <p><strong>{p.kind}</strong> · {p.status} · {new Date(p.createdAt).toLocaleDateString('en-AU')}</p><p className="small">{p.note||'No further details supplied'}</p>
     {['requested','in_review'].includes(p.status)&&<>
      <OperationForm endpoint={base+'/privacy/'+p.id} label="Save privacy review"><Select name="status" label="Review result" options={choices(p.kind==='erasure'?['in_review','declined']:['in_review','fulfilled','declined'])}/>
       <TextArea name="note" label="Reason / resolution reference"/></OperationForm>
      {p.kind==='erasure'&&['withdrawn','decision_recorded'].includes(a.status)&&<OperationForm endpoint={base+'/erase'} label="Permanently erase application" defaults={{privacyRequestId:p.id}}>
       <p className="small">Erasure deletes applicant data, sealed submissions, documents and history. Confirm there is no active retention hold or pending agency handoff.</p>
       <Input name="confirm" label="Type ERASE to confirm irreversible deletion"/></OperationForm>}
     </>}
    </div>)}
  </Panel>}
  {next[a.status]?.length>0&&<Panel title="Administrative processing"><OperationForm endpoint={base+'/status'} defaults={{version:a.version}} label="Save processing state">
   <Select name="status" label="Next state" options={choices(next[a.status])}/>
   <TextArea name="note" label="Processing or handoff reference"/>
  </OperationForm>
   <p className="small">Moving to ready for handoff stages an immutable application summary for the future Google Apps Script email integration. No email is currently sent to the landlord or agency. A delivered status is not possible until an authenticated script receipt is implemented.</p></Panel>}
 </aside></div></>;
}
