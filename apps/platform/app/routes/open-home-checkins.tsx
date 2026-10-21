import { useState,type FormEvent } from 'react';
import { Form,Link,useLoaderData,useRevalidator,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { openHomeCheckInUrl } from '../../../../packages/marketing/open-home';

type Recipient={id:string;email:string;display_name:string;client_name:string};
type ReportSettings={
 enabled:boolean;recipientUserId:string|null;authorityReference:string;version:number;updatedAt:string|null;
};
type ReportRow={
 session_id:string;session_end_at:string;report_date_perth:string;attendance_count:number;
 preregistered_arrivals:number;walk_in_arrivals:number;registered_count:number;queued_at:string;
 delivery_status:string;sent_at:string|null;error_code:string|null;recipient_email:string;
};
function ReportPreferences({listingId,settings,eligibleRecipients,enabledGlobally,provider}:{
 listingId:string;settings:ReportSettings;eligibleRecipients:Recipient[];
 enabledGlobally:boolean;provider:string;
}){
 const [enabled,setEnabled]=useState(settings.enabled);
 const [recipientUserId,setRecipientUserId]=useState(settings.recipientUserId??'');
 const [authorityReference,setAuthorityReference]=useState(settings.authorityReference);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const revalidator=useRevalidator();
 const save=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMessage('');
  try{
   const response=await fetch('/api/staff/open-home-checkins/settings',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({listingId,settings:{
     version:settings.version,enabled,recipientUserId:recipientUserId||null,authorityReference,
    }}),
   });
   const body=await response.json() as {message?:string};
   if(!response.ok)throw new Error(body.message??'The attendance-report settings could not be saved.');
   setMessage('Attendance-report settings saved. New eligible inspection sessions will be emailed at 9:00 AM Perth time the following day.');
   revalidator.revalidate();
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to save.');}
  finally{setBusy(false);}
 };
 return <section className="panel stack">
  <h2>Automatic next-day attendance report</h2>
  <p>One report per completed inspection session, automatically queued at <strong>9:00 AM Australia/Perth on the day after the inspection ends</strong>. The recipient receives an attendance summary and a sign-in-protected link to the visitor register and CSV export. Cancelled inspections are excluded.</p>
  <p className="small">Global rollout: <strong>{enabledGlobally?'Enabled':'Disabled until release approval'}</strong> · Sending provider: {provider}. Email scheduling does not depend on Google Sheets or Apps Script.</p>
  <form onSubmit={save} className="stack">
   <label className="field">
    <span><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Enable one next-day report for every completed inspection at this property</span>
   </label>
   <label className="field">Authorised recipient's verified ProInspect account
    <select value={recipientUserId} onChange={e=>setRecipientUserId(e.target.value)} required={enabled}>
     <option value="">Select verified client contact</option>
     {eligibleRecipients.map(r=><option key={r.id} value={r.id}>{r.email} · {r.client_name}</option>)}
    </select>
   </label>
   {eligibleRecipients.length===0&&<p className="notice warning">There are no verified owner/administrator accounts belonging to the instructing agency or recorded landlord. Verify an authorised account before activating automatic reports.</p>}
   <label className="field">Written instruction / report-sharing authority reference
    <input value={authorityReference} onChange={e=>setAuthorityReference(e.target.value)}
     required={enabled} minLength={enabled?5:undefined} maxLength={200}
     placeholder="Approved instruction or agency authority reference"/>
   </label>
   <p className="small">The recipient must remain verified and authorised at the time of delivery. Changing recipients or revoking authority suppresses pending emails. Visitor details are never included in the email itself; the full register requires a permitted account login.</p>
   <div className="actions"><button className="button" type="submit" disabled={busy||enabled&&(!recipientUserId||authorityReference.trim().length<5)}>
    {busy?'Saving…':'Save next-day email settings'}</button></div>
   {message&&<p role="status">{message}</p>}
  </form>
 </section>;
}
export async function loader({request,context}:LoaderFunctionArgs){
 const url=new URL(request.url);
 const {listings}=await loadApi(request,context,'/api/staff/leasing');
 const rows=listings as Array<{id:string;title:string;display_address:string;kind:string;status:string}>;
 const requested=url.searchParams.get('listingId')??'';
 const listingId=rows.some(p=>p.id===requested)?requested:(rows.find(p=>p.status==='published')??rows[0])?.id??'';
 const sessionId=url.searchParams.get('sessionId')??'';
 const attendance=listingId?await loadApi(request,context,
  '/api/staff/open-home-checkins?listingId='+encodeURIComponent(listingId)+
   (sessionId?'&sessionId='+encodeURIComponent(sessionId):'')):null;
 return {listings:rows,listingId,sessionId,attendance,origin:url.origin};
}
export default function OpenHomeCheckInRegister(){
 const {listings,listingId,sessionId,attendance,origin}=useLoaderData<typeof loader>();
 const w=useWorkspace().workspace;
 const perth=(v:string)=>new Date(v).toLocaleString('en-AU',{
  timeZone:'Australia/Perth',day:'numeric',month:'short',year:'numeric',
  hour:'numeric',minute:'2-digit',
 });
 const sessions=attendance?.sessions as Array<{id:string;starts_at:string;ends_at:string;status:string}>??[];
 const checkIns=attendance?.checkIns as Array<{
  id:string;sessionId:string;arrivedAt:string;sessionStart:string;
  preRegistered:boolean;source:string;contact:{name:string;phone:string;email:string};
 }>??[];
 const reporting=attendance?.reporting as {
  settings:ReportSettings;enabledGlobally:boolean;provider:string;eligibleRecipients:Recipient[];reports:ReportRow[];
 }|undefined;
 return <>
  <PageHeading title="Open home attendance" eyebrow="ProInspect · Leasing operations"
   description="Visitor check-ins tied to advertised properties and inspection sessions, with scheduled next-day reporting to authorised leasing representatives."/>
  <div className="actions">
   <Link className="button secondary" to={w.href+'/leasing'}>Property leasing administration</Link>
   <Link className="button secondary" to="/open-home/check-in">Public visitor check-in</Link>
  </div>
  <section className="panel stack">
   <h2>Attendance register</h2>
   <Form method="get" className="grid-2">
    <label className="field">Property listing
     <select name="listingId" defaultValue={listingId} required>
      {listings.map(p=><option key={p.id} value={p.id}>{p.display_address} ({p.kind}, {p.status})</option>)}
     </select>
    </label>
    <label className="field">Inspection session
     <select name="sessionId" defaultValue={sessionId}>
      <option value="">All sessions at this property</option>
      {sessions.map(s=><option value={s.id} key={s.id}>{perth(s.starts_at)} AWST · {s.status}</option>)}
     </select>
    </label>
    <div className="actions"><button className="button" type="submit">View attendance</button></div>
   </Form>
   {attendance&&<div className="actions">
    <Badge status={checkIns.length?'active':'pending'}/>
    <span className="small">{checkIns.length} recorded visitor {checkIns.length===1?'arrival':'arrivals'} (showing up to 500)</span>
   </div>}
   {!listings.length?<p>No advertised leasing properties have been added.</p>:
    checkIns.length===0?<p>No visitors have checked in for this selection.</p>:
    <div className="table-wrap"><table>
     <thead><tr><th>Arrived (AWST)</th><th>Full name</th><th>Phone</th><th>Email</th><th>Inspection</th><th>Registration</th></tr></thead>
     <tbody>{checkIns.map(c=><tr key={c.id}>
      <td>{perth(c.arrivedAt)}</td><td><strong>{c.contact.name}</strong></td>
      <td>{c.contact.phone}</td><td>{c.contact.email}</td>
      <td>{perth(c.sessionStart)} AWST</td>
      <td>{c.preRegistered?'Matched advance registration':'Walk-in visitor'}</td>
     </tr>)}</tbody>
    </table></div>}
  </section>
  {reporting&&<ReportPreferences key={listingId+'-'+reporting.settings.version}
   listingId={listingId} settings={reporting.settings} eligibleRecipients={reporting.eligibleRecipients}
   enabledGlobally={reporting.enabledGlobally} provider={reporting.provider}/>}
  {reporting&&<section className="panel stack">
   <h2>Next-day reports and email delivery status</h2>
   <p className="small">These are the reports generated at 9:00 AM Perth the day after each inspection. Email acceptance is recorded separately from inbox delivery.</p>
   {reporting.reports.length===0?<p>No reports have been generated for the selected property and session.</p>:
    <div className="table-wrap"><table>
     <thead><tr><th>Inspection ended</th><th>Attended</th><th>Pre-registered</th><th>Walk-ins</th><th>Recipient</th><th>Email</th><th>Report</th></tr></thead>
     <tbody>{reporting.reports.map(r=><tr key={r.session_id}>
      <td>{perth(r.session_end_at)} AWST</td><td>{r.attendance_count}</td>
      <td>{r.preregistered_arrivals}</td><td>{r.walk_in_arrivals}</td>
      <td>{r.recipient_email}</td><td><Badge status={r.delivery_status}/>{r.error_code&&<span className="small"> {r.error_code}</span>}</td>
      <td><Link to={'/open-home/report/'+encodeURIComponent(r.session_id)}>View report</Link></td>
     </tr>)}</tbody>
    </table></div>}
  </section>}
  {attendance&&<section className="panel stack">
   <h2>Property and session links</h2>
   <p>Use these direct links for on-site QR signage or attendee instructions. Each link selects the existing approved property and session without exposing personal information.</p>
   {sessions.length===0?<p>No inspection sessions have been created for this property.</p>:
    <div className="stack">{sessions.map(s=>{
     const link=openHomeCheckInUrl(origin,listingId,s.id);
     return <div className="record-row" key={s.id}>
      <div><strong>{perth(s.starts_at)} AWST</strong><p className="small">Session: {s.status}</p>
       <a href={link} className="small" target="_blank" rel="noopener noreferrer">Open QR-ready check-in link ↗</a>
       <p className="small" style={{overflowWrap:'anywhere'}}>{link}</p></div>
     </div>;
    })}</div>}
  </section>}
 </>;
}
