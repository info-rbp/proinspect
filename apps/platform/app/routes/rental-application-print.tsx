import { Link, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { ANSWER_STEPS, FIELDS, FORM18_VERSION, type AnswerStep } from '../../../../packages/marketing/form18';
import '../../../../packages/ui/rental-print.css';
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/staff/rental-applications/'+params.applicationId) as any;
}
export default function RentalApplicationPrint(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace;
 const a=d.application;
 const snapshot=d.latestSubmission?.record;
 const people=snapshot?.applicants??d.applicants;
 const notice=snapshot?.notice??d.notice;
 const documents=snapshot?.documents??d.documents;
 const recordTime=snapshot?.submittedAt??a.submittedAt;
 return <div className="form18-print">
 <div className="form18-print-actions"><Link to={w.href+'/rental-applications/'+a.id}>← Return to application</Link><button className="button" type="button" onClick={()=>window.print()}>Print / Save as PDF</button></div>
 <header className="form18-print-cover">
  <p className="form18-print-label">ProInspect · Residential tenancy application</p>
  <h1>FORM 18</h1><h2>APPLICATION TO RENT RESIDENTIAL PREMISES</h2>
  <p><strong>Residential Tenancies Act 1987 (WA)</strong></p>
  <p className="form18-print-disclaimer">Digitally generated Form 18-format application record. This is not the government-issued paper form, a residential tenancy agreement, or a tenancy offer.</p>
  <dl><dt>Reference</dt><dd>{a.reference}</dd><dt>Property</dt><dd>{a.property}</dd><dt>Responsible leasing representative</dt><dd>{a.leasingRepresentative}</dd><dt>Submitted</dt><dd>{recordTime?new Date(recordTime).toLocaleString('en-AU'):'Draft'}</dd><dt>Applicants</dt><dd>{people.length}</dd></dl>
 </header>
 {people.map((person:any)=><section className="form18-print-applicant" key={person.id}>
   <p className="form18-print-label">{person.ordinal<=3?'FORM 18 — APPLICANT '+person.ordinal:'SUPPLEMENTARY APPLICANT '+person.ordinal}</p>
   <h2>{person.answers.identity?.fullName||'Applicant '+person.ordinal}</h2>
   <p>Declared: {person.declaredAt?new Date(person.declaredAt).toLocaleString('en-AU'):'Not declared'}</p>
   {ANSWER_STEPS.map((step:AnswerStep)=><section key={step}>
     <h3>{step==='identity'?'Applicant personal details':step==='rental'?'Previous rental history':step==='employment'?'Employment and income':'Personal references, next of kin and emergency contact'}</h3>
     <dl>{FIELDS[step].map(field=><div className="form18-print-row" key={field.key}><dt>{field.label}</dt><dd>{person.answers[step]?.[field.key]||'Not provided'}</dd></div>)}</dl>
   </section>)}
 </section>)}
 <section className="form18-print-notice">
  <p className="form18-print-label">FORM 18 — INFORMATION FOR LESSORS AND APPLICANTS</p>
  <h2>Information about this application</h2>
  <p>This application assists the responsible lessor or leasing representative in considering an application for residential premises. It does not form part of a tenancy agreement. Leasing decisions and relevant statutory notices remain the responsibility of the authorised representative.</p>
  <p>Applicants must be considered in accordance with applicable Western Australian equal opportunity requirements. This record is restricted to the authorised purposes of the application.</p>
  <h2>ATTACHMENT A — Written Notice about Use of Tenancy Databases</h2>
  <p>Residential Tenancies Act 1987 (WA), section 82C(2). The following information was displayed to applicants with the declaration.</p>
  {notice.mode==='configured'?notice.entries.map((n:any,i:number)=><dl key={i}><div className="form18-print-row"><dt>Database {i+1}</dt><dd>{n.name}</dd></div><div className="form18-print-row"><dt>Operator contact details</dt><dd>{n.operatorContact}</dd></div><div className="form18-print-row"><dt>How to obtain information</dt><dd>{n.accessInstructions}</dd></div></dl>):
   <p>The identified leasing representative recorded that tenancy databases are not used for this application.</p>}
  <h2>Supporting-document manifest</h2>
  <p>Supporting files are held in restricted storage, not embedded in this printable summary. Download approved records separately under authorised staff access.</p>
  <dl>{documents.map((doc:any)=><div key={doc.id} className="form18-print-row"><dt>{doc.filename}</dt><dd>{doc.category.replaceAll('_',' ')} · {doc.review_status}</dd></div>)}</dl>
  <p className="form18-print-disclaimer">Generated from the submitted ProInspect intake record · {snapshot?.formVersion??FORM18_VERSION} · Submission revision {d.latestSubmission?.version??'draft'} · Application reference {a.reference}</p>
 </section>
 </div>;
}
