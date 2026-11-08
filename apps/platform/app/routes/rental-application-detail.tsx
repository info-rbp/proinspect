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
  <Panel title="Reference checks" description="Manual contact log; no automated tenant suitability decisions.">
   {d.applicants.map((person:any)=><section key={person.id} className="stack">
    <h3>Applicant {person.ordinal}: {person.answers.identity?.fullName}</h3>
    <p className="small">Reference contact authorisation: <strong>{person.referenceConsent?'Provided':'Not provided'}</strong>. Contact only on instructions from the leasing representative.</p>
    {(d.referenceChecks??[]).filter((check:any)=>check.applicantId===person.id).map((check:any)=><div className="record-row" key={check.id}>
     <div><strong>{check.target.replaceAll('_',' ')} — {check.outcome.replaceAll('_',' ')}</strong>
      <p className="small">{check.method.replaceAll('_',' ')} · {new Date(check.createdAt).toLocaleString('en-AU')}</p>
      <p>{check.note}</p>{check.evidenceReference&&<p className="small">Internal evidence reference: {check.evidenceReference}</p>}
     </div></div>)}
    {person.referenceConsent&&person.state==='complete'&&['submitted','ready_for_handoff'].includes(a.status)&&<OperationForm endpoint={base+'/reference-checks'} defaults={{applicantId:person.id}} label="Record reference check">
     <Select name="target" label="Reference to check" options={[
      ...(person.answers.rental?.hasRentalHistory==='Yes'?[{value:'previous_lessor',label:'Previous landlord or property manager'}]:[]),
      ...(['Employed','Self-employed'].includes(person.answers.employment?.employmentType)?[{value:'employer',label:'Employer contact'}]:[]),
      {value:'personal_1',label:'Personal referee 1'},{value:'personal_2',label:'Personal referee 2'}
     ]}/>
     <Select name="outcome" label="Recorded outcome" options={choices(['contact_attempted','confirmed','not_confirmed','unable_to_contact','not_applicable'])}/>
     <Select name="method" label="Contact method" options={choices(['phone','email','other','not_contacted'])}/>
     <Input name="evidenceReference" label="Internal evidence reference" required={false} help="Required for confirmed/not-confirmed outcomes. Use an internal call or email record ID."/>
     <TextArea name="note" label="Factual verification notes" help="Record contact and factual responses only. Avoid protected attributes."/>
    </OperationForm>}
   </section>)}
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
  <Panel title="Agency email handoff — Google Apps Script"><p>The signed, recipient-bound Google Apps Script handoff adapter is implemented but requires independent activation and provider acceptance. A staged record is not evidence that an email was delivered.</p>
   {d.handoffs?.length>0?d.handoffs.map((h:any)=><div className="record-row" key={h.id}><div><strong>Submission handoff: {h.status.replaceAll('_',' ')}</strong><p className="small">Staged {new Date(h.staged_at).toLocaleString('en-AU')} · {h.format_version}</p></div></div>):<p className="small">No handoff staged. Review uploaded documents and move the application to ready for handoff when appropriate.</p>}
   <p className="small">Applicant documents are never attached or made public. A delivery receipt establishes provider acceptance, not successful delivery to an inbox.</p>
  </Panel>
  {a.status==='decision_recorded'&&d.outcome&&<Panel title="Agency decision and tenancy handover">
   <p><strong>Recorded agency decision: {d.outcome.outcome==='successful'?'Successful':'Unsuccessful'}</strong></p>
   <p className="small">Source reference: {d.outcome.authority_reference} · Recorded {new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeZone:'Australia/Perth'}).format(new Date(d.outcome.recorded_at))}</p>
   {d.outcome.outcome==='successful'?<>
    <p>The authorised leasing representative must confirm the offer and proposed tenancy terms. ProInspect records the instruction but does not make an offer or automatically create a tenancy.</p>
    <p className="small">Next steps: verify the actual tenant identities and email addresses, create the correct property tenancy, obtain the current approved WA Form 1AA, arrange signing by all parties, verify bond and initial rent arrangements, and issue the entry condition report and tenancy documents.</p>
    <Link className="button secondary small" to={w.href+'/tenancies'}>Open tenancy creation and invitation</Link>
    <p className="small">The tenancy and agreement-signing workflows have separate authority checks and release gates. Never copy identity, income documents or applicant private access links into an ordinary tenancy invitation.</p>
   </>:<p>No tenancy should be created from this unsuccessful application. Continue to honour the applicant's privacy and retention rights.</p>}
  </Panel>}
  {a.status==='decision_recorded'&&d.outcome?.outcome==='successful'&&<Panel title="Tenancy commencement — controlled handover">
   <p>Only an authorised lessor or manager may instruct commencement. This workflow does not offer a tenancy, sign a statutory form, or activate a lease on an application decision alone.</p>
   {!d.tenancyHandover?.configured?<p role="status">Tenancy handover remains disabled until the database migration, recipient/privacy approvals and independently reviewed release have been completed.</p>:
    !d.tenancyHandover.exists?<OperationForm endpoint={base+'/tenancy-handover'} defaults={{applicationVersion:a.version}} label="Prepare pending tenancy and send individual invitations">
     <Input name="startsOn" label="Approved tenancy commencement — Perth date" type="date"/>
     <Input name="endsOn" label="Fixed term end date (leave blank for periodic)" type="date" required={false}/>
     <Input name="writtenOfferReference" label="Separate written lessor instruction reference" help="A successful application is not itself an offer or authority to create a tenancy."/>
     <label><input type="checkbox" name="confirmWrittenOffer" value="true" required/> I have verified the lessor’s separate written tenancy-commencement instruction and agreed dates.</label>
     <label><input type="checkbox" name="confirmRecipientAuthority" value="true" required/> I have confirmed the currently authorised manager or landlord for this property.</label>
     <label><input type="checkbox" name="confirmPrivateInvitations" value="true" required/> I am authorised to invite all adult applicants to their own verified accounts without sharing private application documents.</label>
    </OperationForm>:<div className="stack">
     <p><strong>Handover: {d.tenancyHandover.status.replaceAll('_',' ')}</strong> · Tenancy: {d.tenancyHandover.tenancyStatus} · {d.tenancyHandover.invitedCount} invited adults</p>
     <p className="small">All invited adults verified: {d.tenancyHandover.allParticipantsVerified?'Yes':'Not yet'} · Executed official Form 1AA recorded: {d.tenancyHandover.executedAgreementRecorded?'Yes':'No'}</p>
     <Link className="button secondary small" to={w.href+'/tenancies/'+d.tenancyHandover.tenancyId+'/wa-forms'}>Prepare and review statutory tenancy forms</Link>
     {d.tenancyHandover.status==='awaiting_agreement'&&<>
      <p className="small">The tenancy remains pending. Applicants must accept separate verified invitations; the authoritative Form 1AA must be issued, executed by all parties, reviewed and stored before activation.</p>
      {d.tenancyHandover.canActivate&&<OperationForm endpoint={base+'/tenancy-handover/activate'} label="Activate after executed Form 1AA verification">
       <Input name="activationReference" label="Independent executed agreement and commencement review reference"/>
       <label><input type="checkbox" name="confirmExecutedAgreement" value="true" required/> I verified the official completed and fully signed Form 1AA PDF and evidence.</label>
       <label><input type="checkbox" name="confirmVerifiedParticipants" value="true" required/> I confirmed every tenant’s independently verified identity and access.</label>
       <label><input type="checkbox" name="confirmCommencementRecords" value="true" required/> I checked lawful commencement, information sheet, bond and condition report arrangements.</label>
      </OperationForm>}
      {!d.tenancyHandover.executedAgreementRecorded&&<OperationForm endpoint={base+'/tenancy-handover/void'} label="Void unexecuted handover">
       <Input name="reasonReference" label="Written authority to void and evidence reference"/>
       <label><input type="checkbox" name="confirmVoid" value="true" required/> I understand this revokes pending invitations and ends the pending record; it does not revoke an executed tenancy.</label>
      </OperationForm>}
     </>}
     {d.tenancyHandover.status==='activated'&&<p role="status">The original application has been linked to an active tenancy following verified execution. Use the tenancy workspace for all subsequent operations.</p>}
    </div>}
  </Panel>}
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
   <p className="small">Moving to ready for handoff stages an immutable application summary. Sending requires the independently released, signed Apps Script transport and a valid provider acceptance receipt; do not assume an email was delivered to an inbox.</p></Panel>}
 </aside></div></>;
}
