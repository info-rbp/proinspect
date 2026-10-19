import { useState } from 'react';
import { Form, Link, redirect, data, useLoaderData, useActionData, useSearchParams,
 type LoaderFunctionArgs, type ActionFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import { AppError, type Env } from '../../../../packages/database/types';
import { rentalPage,saveRentalSection,inviteRentalApplicant,resendRentalInvitation,removeRentalApplicant,finishRentalApplicant,
 submitRental,withdrawRental,uploadRentalDocument,deleteRentalDocument } from '../../../platform/worker/features/rental-applications.server';
import { ANSWER_STEPS,FIELDS,FORM18_STEPS,stepComplete,type Form18Field,
 type Form18Step,type AnswerStep,type Form18Answers } from '../../../../packages/marketing/form18';
import '../../../../packages/ui/rental-application.css';

export const meta=()=>[{title:'Private tenancy application | ProInspect'},
 {name:'robots',content:'noindex, nofollow, noarchive'},{name:'referrer',content:'strict-origin'}];
const privateHeaders={'Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow'};
export async function loader({context,params}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 try{return data(await rentalPage(env,params.token??''),{headers:privateHeaders});}
 catch(error){if(error instanceof AppError)throw new Response(error.message,{status:error.status,headers:privateHeaders});throw error;}
}
export async function action({context,params,request}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env,token=params.token??'';
 const target=(step:string)=>'/rental-application/'+token+'?step='+encodeURIComponent(step);
 const fail=(message:string,status=422)=>data({error:message},{status,headers:privateHeaders});
 if(request.headers.get('Origin')!==new URL(request.url).origin)return fail('Reload this page and try again.',403);
 const size=Number(request.headers.get('Content-Length')??0);
 if(size>10*1024*1024)return fail('Each supporting file must be 8 MB or smaller.',413);
 try{
  const type=request.headers.get('content-type')??'';
  let form:FormData;
  if(type.includes('multipart/form-data'))form=await request.formData();
  else {
   const body=await request.text();
   if(body.length>20000)return fail('The form is too large.',413);
   form=new FormData();
   new URLSearchParams(body).forEach((v,k)=>form.append(k,v));
  }
  const intent=String(form.get('intent')??'');
  if(intent==='save'){
   const section=String(form.get('section')??'') as AnswerStep;
   if(!ANSWER_STEPS.includes(section))return fail('Unknown application section.');
   const values:Record<string,unknown>={};
   for(const field of FIELDS[section])values[field.key]=String(form.get(field.key)??'');
   await saveRentalSection(env,token,section,values,Number(form.get('version')));
   const index=FORM18_STEPS.findIndex(x=>x.id===section);
   return redirect(target(FORM18_STEPS[Math.min(index+1,FORM18_STEPS.length-1)].id));
  }
  if(intent==='invite'){
   await inviteRentalApplicant(env,token,{name:form.get('inviteName'),email:form.get('inviteEmail')});
   return redirect(target('review'));
  }
  if(intent==='resend'){
   await resendRentalInvitation(env,token,Number(form.get('ordinal')));
   return redirect(target('review'));
  }
  if(intent==='remove'){
   await removeRentalApplicant(env,token,Number(form.get('ordinal')));
   return redirect(target('review'));
  }
  if(intent==='upload'){
   await uploadRentalDocument(env,token,form);
   return redirect(target('documents'));
  }
  if(intent==='delete-document'){
   await deleteRentalDocument(env,token,String(form.get('documentId')));
   return redirect(target('documents'));
  }
  if(intent==='finish'){
   await finishRentalApplicant(env,token,{
    accurate:form.get('accurate')==='yes',
    shareWithRepresentative:form.get('shareWithRepresentative')==='yes',
    notAnAgreement:form.get('notAnAgreement')==='yes',
    noticeAcknowledged:form.get('noticeAcknowledged')==='yes'
   },Number(form.get('version')));
   return redirect(target('review'));
  }
  if(intent==='submit'){
   await submitRental(env,token);
   return redirect(target('review'));
  }
  if(intent==='withdraw'){
   await withdrawRental(env,token);
   return redirect(target('review'));
  }
  return fail('Choose an application action.');
 }catch(error){
  const msg=error instanceof AppError?error.message:error instanceof Error?error.message:'';
  const safe=msg.startsWith('FIELD_REQUIRED:')?'Please complete '+msg.slice(15)+'.':
   msg.startsWith('FIELD_INVALID:')?'Check '+msg.slice(14)+'.':
   ({
    IDENTITY_REQUIRED:'Enter your full name, mobile telephone and current address.',
    RENTAL_HISTORY_INCOMPLETE:'Add your previous rental address and the name of the lessor or property manager.',
    EMPLOYMENT_INCOMPLETE:'Enter your occupation and employer or business name.',
    DATE_OF_BIRTH_INVALID:'Enter a valid date of birth.',
    FIELD_TOO_LONG:'One of your answers is too long.',
    DOCUMENT_DUPLICATE:'You have already uploaded this document.',
    DOCUMENT_LIMIT:'You can upload up to ten documents.',
    DOCUMENT_INVALID:'The selected file does not match a supported format.',
    DRAFT_CHANGED:'Your application changed in another tab. Reload before saving.',
   } as Record<string,string>)[msg]??(error instanceof AppError?msg:'Unable to save. Please check the details and try again.');
  return fail(safe,error instanceof AppError?error.status:422);
 }
}
function Fields({section,answers}: {section:AnswerStep;answers:Record<string,string>}){
 const [rental,setRental]=useState(answers.hasRentalHistory??'');
 const [employment,setEmployment]=useState(answers.employmentType??'');
 return <div className="rental-fields">{FIELDS[section].map((field:Form18Field)=>{
  if(section==='rental'&&field.key!=='hasRentalHistory'&&rental!=='Yes')return null;
  if(section==='employment'&&['occupation','employer','employerAddress','employedFrom','employedTo','employerContact','employerPhone'].includes(field.key)&&!['Employed','Self-employed'].includes(employment))return null;
  const wide=field.kind==='textarea'||field.key.toLowerCase().includes('address')||field.key==='fullName';
  const value=answers[field.key]??'';
  return <div className={'rental-field'+(wide?' wide':'')} key={field.key}>
   {field.section&&<h3 className="rental-field-group-title">{field.section}</h3>}
   <label htmlFor={'form18-'+field.key}>{field.label}{field.required&&<span aria-label="required"> *</span>}</label>
   {field.kind==='select'?<select id={'form18-'+field.key} name={field.key}
      defaultValue={value} required={field.required}
      onChange={field.key==='hasRentalHistory'?e=>setRental(e.target.value):field.key==='employmentType'?e=>setEmployment(e.target.value):undefined}>
       <option value="">Please select</option>{field.options?.map(o=><option value={o} key={o}>{o}</option>)}
     </select>:
    field.kind==='textarea'?<textarea id={'form18-'+field.key} name={field.key} rows={3} maxLength={700} defaultValue={value}/>:
    <input id={'form18-'+field.key} name={field.key} type={field.kind??'text'}
     min={field.kind==='number'?'0':undefined} step={field.kind==='number'?'0.01':undefined}
     max={field.kind==='date'&&field.key==='dateOfBirth'?new Date().toISOString().slice(0,10):undefined}
     defaultValue={value} maxLength={700} required={field.required} autoComplete="off"/>}
   {field.hint&&<small>{field.hint}</small>}
  </div>;
 })}</div>;
}
function Household({people,editable}:{
 people:{ordinal:number;name:string;maskedEmail:string;state:string}[];editable:boolean
}){
 return <section className="rental-household-section"><h3>Household applicants</h3>
  <p className="rental-muted">Each adult applicant completes their own private form. Applicants cannot read each other's confidential answers or documents.</p>
  <div className="rental-household">{people.map(p=><div className="rental-household-card" key={p.ordinal}><div>
   <strong>{p.ordinal===1?'Primary applicant':'Applicant '+p.ordinal} — {p.name}</strong>
   <small>{p.maskedEmail}</small></div>
   <div><span className={'rental-state'+(p.state==='complete'?'':' waiting')}>{p.state==='complete'?'Complete':p.state==='invited'?'Invited':'In progress'}</span>
    {editable&&p.ordinal>1&&<Form method="post"><input type="hidden" name="intent" value="remove"/><input type="hidden" name="ordinal" value={p.ordinal}/>
      <button className="rental-inline-button" type="submit">Remove</button></Form>}
    {editable&&p.ordinal>1&&<Form method="post"><input type="hidden" name="intent" value="resend"/><input type="hidden" name="ordinal" value={p.ordinal}/><button className="rental-inline-button" type="submit">Resend private link</button></Form>}
   </div></div>)}</div>
  {editable&&people.length<10&&<div className="rental-section-note">
   <h3>Invite another applicant</h3><p>Send a private application link by email. The household application waits for everyone to finish.</p>
   <Form method="post" className="rental-form"><input name="intent" type="hidden" value="invite"/>
    <div className="rental-fields"><div className="rental-field"><label htmlFor="invite-name">Applicant's name</label><input id="invite-name" name="inviteName" required minLength={2} maxLength={120}/></div>
    <div className="rental-field"><label htmlFor="invite-email">Applicant's email</label><input id="invite-email" name="inviteEmail" type="email" required maxLength={254}/></div></div>
    <button className="button secondary" type="submit">Send private invitation</button>
   </Form></div>}
 </section>;
}
function Documents({docs,editable}: {docs:any[];editable:boolean}){
 return <><div className="rental-section-note">Documents are stored privately. Files are quarantined for security review and are never shared through public marketing pages or ordinary email attachments. Please upload only requested evidence.</div>
 {editable&&<Form method="post" encType="multipart/form-data" className="rental-form">
  <input type="hidden" name="intent" value="upload"/>
  <div className="rental-drop-zone"><div className="rental-field">
    <label htmlFor="rental-file">Add supporting document</label>
    <input id="rental-file" type="file" name="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"/>
    <small>PDF, JPEG, PNG or WebP · 8 MB per file · 10 files maximum. Do not upload unrelated sensitive documents.</small>
   </div><div className="rental-field"><label htmlFor="rental-category">Document category</label>
     <select id="rental-category" name="category" required><option value="identity">Identification</option><option value="income">Income or employment</option><option value="rental_history">Rental history</option><option value="other">Other requested evidence</option></select>
   </div><button className="button secondary" type="submit">Upload securely</button></div>
 </Form>}
 <h3 style={{marginTop:'2rem'}}>Your uploaded documents ({docs.length})</h3>
 {docs.length===0?<p className="rental-muted">No documents uploaded. You can continue unless the authorised leasing representative specifically requests supporting evidence.</p>:
 <ul className="rental-document-list">{docs.map((doc:any)=><li key={doc.id}><div><strong>{doc.filename}</strong><small>{doc.category.replaceAll('_',' ')} · {(doc.size_bytes/1048576).toFixed(2)} MB · {doc.review_status==='quarantined'?'Pending security review':doc.review_status}</small></div>
 {editable&&<Form method="post"><input type="hidden" name="intent" value="delete-document"/><input type="hidden" name="documentId" value={doc.id}/><button className="rental-inline-button" type="submit">Remove file</button></Form>}</li>)}</ul>}
 {editable&&<div className="rental-actions"><Link to="?step=references">← Back to references</Link><Link className="button" to="?step=review">Review my application →</Link></div>}
 </>;
}
function Review({page,editable}:{page:any;editable:boolean}){
 const answers=page.answers as Form18Answers;
 const complete=ANSWER_STEPS.every(s=>stepComplete(answers,s));
 const pending=page.household.some((p:any)=>p.state!=='complete');
 const submitted=['submitted','ready_for_handoff','forwarded','decision_recorded'].includes(page.status);
 if(page.status==='withdrawn')return <div role="status" className="rental-success"><h2>Application withdrawn</h2><p>This application is no longer active. Retained information remains subject to our privacy and retention policy.</p></div>;
 return <>
  <div className="rental-section-note">Review your answers below. Only your own personal details appear here. Your co-applicants' confidential answers are not displayed to you.</div>
  <div className="rental-summary">{ANSWER_STEPS.map(step=><details key={step} open={step==='identity'}>
    <summary>{FORM18_STEPS.find(x=>x.id===step)?.title} · {stepComplete(answers,step)?'Complete':'Needs attention'}</summary>
    <dl>{FIELDS[step].filter(f=>Boolean(answers[step]?.[f.key])).map(f=><Entry key={f.key} label={f.label} value={answers[step][f.key]}/>)}</dl>
    {editable&&<Link to={'?step='+step}>Edit this section →</Link>}
   </details>)}</div>
  {page.role==='primary'&&<Household people={page.household} editable={editable&&page.status==='draft'}/>}
  <section className="rental-notice"><h3>Information for applicants — Form 18</h3>
   <p>This application assists the identified landlord or leasing representative in considering an application to rent residential premises under the Residential Tenancies Act 1987 (WA). Submitting it does not create a tenancy agreement or guarantee an offer.</p>
   <p>Your details are collected for this application and, with your consent, made available to the responsible leasing representative, not to other applicants. Applicants must be considered in accordance with applicable WA equal opportunity and privacy obligations.</p>
   <h3>Tenancy database information — Form 18 Attachment A</h3>
   {page.notice.mode==='configured'?<div className="rental-notice-list">{page.notice.entries.map((n:any,i:number)=><article key={i}><strong>{n.name}</strong><p>Operator: {n.operatorContact}</p><p>How to obtain information: {n.accessInstructions}</p></article>)}</div>:
    <p>The leasing representative has confirmed that tenancy databases are not used for this application. If that changes, an appropriate written notice must be provided.</p>}
   <p className="rental-legal">This is an electronic Form 18-based intake, not a signed lease. Do not lodge identification documents by ordinary email. Authorised staff review uploaded files through restricted document storage.</p>
  </section>
  {page.state==='complete'&&editable?<div className="rental-success"><h3>Your declaration is complete</h3><p>If you edit any section, you must declare again.</p></div>:null}
  {editable&&page.state!=='complete'&&<Form method="post" className="rental-form">
   <input type="hidden" name="intent" value="finish"/><input type="hidden" name="version" value={page.version}/>
   <h3>Your declaration</h3>
   <label className="rental-check"><input name="accurate" type="checkbox" value="yes" required/><span>I have reviewed my answers and believe they are accurate.</span></label>
   <label className="rental-check"><input name="shareWithRepresentative" type="checkbox" value="yes" required/><span>I authorise ProInspect to share my application details with {page.property.agentName}, the responsible leasing representative, solely for this application.</span></label>
   <label className="rental-check"><input name="notAnAgreement" type="checkbox" value="yes" required/><span>I understand this application is not a tenancy agreement or approval.</span></label>
   <label className="rental-check"><input name="noticeAcknowledged" type="checkbox" value="yes" required/><span>I acknowledge receiving the tenancy database information displayed above and have reviewed the <Link to="/privacy">privacy policy</Link>.</span></label>
   <button className="button rental-full-button" type="submit" disabled={!complete}>Complete my declaration</button>
   {!complete&&<p className="rental-muted">Complete the required Form 18 sections before declaring.</p>}
  </Form>}
  {page.role==='primary'&&page.state==='complete'&&editable&&<div className="rental-form"><h3>Submit household application</h3>
   <p className="rental-muted">Every included applicant must complete their own declaration before final submission.</p>
   <Form method="post"><input type="hidden" name="intent" value="submit"/><button type="submit" className="button rental-full-button" disabled={pending}>{pending?'Waiting for additional applicants':'Submit application securely →'}</button></Form>
  </div>}
  {page.role!=='primary'&&page.state==='complete'&&editable&&<p className="rental-success">Your section is complete. The primary applicant will submit the household application when everyone is ready.</p>}
  {submitted&&<div role="status" className="rental-success"><h2>Application received</h2><p>Reference: <strong>{page.reference}</strong></p><p>Your application was submitted for administrative handling by ProInspect. The landlord or authorised leasing representative makes the tenancy decision. This is not an offer of tenancy.</p></div>}
  {editable&&page.role==='primary'&&<div className="rental-actions"><Link to="?step=documents">← Supporting documents</Link><Form method="post"><input name="intent" value="withdraw" type="hidden"/><button type="submit" className="rental-inline-button">Withdraw this application</button></Form></div>}
 </>;
}
function Entry({label,value}:{label:string;value:string}){return <><dt>{label}</dt><dd>{value}</dd></>;}
export default function RentalApplication(){
 const page=useLoaderData<typeof loader>() as any;
 const result=useActionData<typeof action>() as {error?:string}|undefined;
 const [params]=useSearchParams();
 const selected=params.get('step') as Form18Step;
 const step=FORM18_STEPS.some(s=>s.id===selected)?selected:'identity';
 const index=FORM18_STEPS.findIndex(s=>s.id===step);
 const editable=['draft','information_requested'].includes(page.status);
 const stepDef=FORM18_STEPS[index];
 const percent=Math.round((index+1)/FORM18_STEPS.length*100);
 return <div className="rental-shell"><div className="site-container">
  <nav className="rental-breadcrumb" aria-label="Breadcrumb"><Link to="/properties-for-lease">Properties for lease</Link> <span aria-hidden="true"> / </span><span>Private application</span></nav>
  <div className="rental-progress-header"><div><p className="eyebrow">Residential application · {page.reference}</p><h1>Complete your application</h1><p className="rental-muted">{page.property.title} · {page.property.address} · {page.property.agentName}</p></div>
   <div><span className="rental-state">{page.status.replaceAll('_',' ')}</span></div></div>
  <div className="rental-workspace">
   <aside className="rental-rail" aria-label="Application progress"><div className="rental-progress-label">Step {index+1} of {FORM18_STEPS.length}</div><div className="rental-progress-bar"><div style={{width:percent+'%'}}/></div>
    <nav className="rental-steps" aria-label="Application sections">{FORM18_STEPS.map((s,i)=><Link key={s.id} to={'?step='+s.id} aria-current={s.id===step?'step':undefined} className={'rental-step'+(s.id===step?' active':'')}>
      <span className="rental-step-number">{i+1}</span><span>{s.title}</span>
     </Link>)}</nav>
    <p className="rental-muted">Answers are saved when you select <strong>Save &amp; continue</strong>. Keep this private link secure.</p>
   </aside>
   <section className="rental-paper" id="rental-form-main">
    <div className="rental-card-heading"><div><p className="rental-progress-label">{page.role==='primary'?'Primary applicant':'Applicant '+page.ordinal}</p><h2>{stepDef.title}</h2><p>{stepDef.help}</p></div></div>
    {result?.error&&<p role="alert" className="notice warning">{result.error}</p>}
    {step==='review'?<Review page={page} editable={editable}/>:
     step==='documents'?<Documents docs={page.documents} editable={editable}/>:
     <>{editable?<Form method="post" className="rental-form" key={step}>
        <input type="hidden" name="intent" value="save"/><input type="hidden" name="section" value={step}/><input type="hidden" name="version" value={page.version}/>
        {step==='identity'&&<div className="rental-section-note">Contact email: <strong>{page.answers.identity?.email}</strong>. Your private link is tied to this address. It cannot be changed from the form.</div>}
        <Fields section={step as AnswerStep} answers={page.answers[step]??{}}/>
        <div className="rental-actions"><Link to={'?step='+FORM18_STEPS[Math.max(0,index-1)].id}>← Previous step</Link>
         <button className="button" type="submit">Save &amp; continue →</button></div>
       </Form>:<><p className="rental-muted">The application is read-only at this stage.</p><dl className="rental-summary">{FIELDS[step as AnswerStep].filter(f=>page.answers[step]?.[f.key]).map(f=><Entry key={f.key} label={f.label} value={page.answers[step][f.key]}/>)}</dl><Link to="?step=review">View submission status</Link></>}</>}
   </section>
  </div>
 </div></div>;
}
