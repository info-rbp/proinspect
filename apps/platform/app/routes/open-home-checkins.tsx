import { Form,Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { openHomeCheckInUrl } from '../../../../packages/marketing/open-home';

export async function loader({request,context}:LoaderFunctionArgs){
 const url=new URL(request.url);
 const {listings}=await loadApi(request,context,'/api/staff/leasing');
 const rows=listings as Array<{id:string;title:string;display_address:string;kind:string;status:string}>;
 const wanted=url.searchParams.get('listingId')??'';
 const listingId=rows.some(p=>p.id===wanted)?wanted:(rows.find(p=>p.status==='published')??rows[0])?.id??'';
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
  sheetStatus:string;preRegistered:boolean;source:string;
  contact:{name:string;phone:string;email:string};
 }>??[];
 return <>
  <PageHeading title="Open home attendance" eyebrow="ProInspect · Leasing operations"
   description="Visitor check-ins tied to approved leasing listings and open-inspection sessions. Advance registration is recorded separately from actual arrival."/>
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
    <label className="field">Session
     <select name="sessionId" defaultValue={sessionId}>
      <option value="">All sessions at this property</option>
      {sessions.map(s=><option value={s.id} key={s.id}>{perth(s.starts_at)} AWST · {s.status}</option>)}
     </select>
    </label>
    <div className="actions"><button type="submit" className="button">View attendance</button></div>
   </Form>
   {attendance&&<div className="actions">
    <Badge status={checkIns.length?'active':'pending'}/>
    <span className="small">{checkIns.length} recorded visitor {checkIns.length===1?'arrival':'arrivals'} (showing up to 500)</span>
    <span className="small">Sheet sync: {attendance.sheetConnected?'Enabled':'Awaiting Google Sheet setup'}</span>
   </div>}
   {!listings.length?<p>No advertised leasing properties have been added.</p>:
    checkIns.length===0?<p>No visitors have checked in for this selection.</p>:
    <div className="table-wrap"><table>
     <thead><tr><th>Arrived (AWST)</th><th>Full name</th><th>Phone</th><th>Email</th><th>Inspection</th><th>Registration</th><th>Sheet</th></tr></thead>
     <tbody>{checkIns.map(c=><tr key={c.id}>
      <td>{perth(c.arrivedAt)}</td>
      <td><strong>{c.contact.name}</strong></td>
      <td>{c.contact.phone}</td>
      <td>{c.contact.email}</td>
      <td>{perth(c.sessionStart)} AWST</td>
      <td>{c.preRegistered?'Matched advance registration':'Walk-in visitor'}</td>
      <td><Badge status={c.sheetStatus}/></td>
     </tr>)}</tbody>
    </table></div>}
  </section>
  {attendance&&<section className="panel stack">
   <h2>Property and session links</h2>
   <p>Use these direct links for on-site QR signage or attendee instructions. Each link selects an approved property and session without exposing personal information.</p>
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
  <section className="panel">
   <h2>Google Sheet connection</h2>
   <p>The attendance database is the authoritative source. Each visitor arrival produces a separate pending sync event. When the dedicated Google Sheet and script have been configured and approved, those events can be synchronized without duplicating check-ins.</p>
   <p className="small">No spreadsheet receives contact information while the integration setting is disabled. See docs/OPEN_HOME_CHECKIN.md for setup and the exact spreadsheet columns.</p>
  </section>
 </>;
}
