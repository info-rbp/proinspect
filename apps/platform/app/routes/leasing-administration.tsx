import { useState, type FormEvent } from 'react';
import { Link,useLoaderData,useRevalidator,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { perthLocalToUtc, perthUtcToLocal, type ApplicationReadinessCheck } from '../../../../packages/marketing/leasing-operations';

type Notice={name:string;operatorContact:string;accessInstructions:string};
type Mode='unavailable'|'external'|'proinspect';
async function send(path:string,payload:unknown,files=false){
 const res=await fetch(path,{method:'POST',credentials:'same-origin',
  headers:files?{}:{'Content-Type':'application/json'},body:files?payload as FormData:JSON.stringify(payload)});
 const body=await res.json() as {message?:string;id?:string};
 if(!res.ok)throw Error(body.message||'The listing could not be updated.');
 return body;
}
function Notices({rows,setRows}:{rows:Notice[];setRows:(x:Notice[])=>void}){
 return <div className="stack"><p className="small">Provide the exact written notice details supplied by the authorised leasing representative (WA tenancy database notice (Form 18A guidance)).</p>
 {rows.map((r,i)=><div className="panel" key={i}><h4>Tenancy database {i+1}</h4>
  {(['name','operatorContact','accessInstructions'] as const).map(field=><label className="field" key={field}>
   {field==='name'?'Database name':field==='operatorContact'?'Operator contact details':'How applicants can obtain information'}
   <textarea value={r[field]} onChange={e=>setRows(rows.map((n,j)=>j===i?{...n,[field]:e.target.value}:n))} required maxLength={field==='name'?160:800} rows={2}/>
  </label>)}
  <button type="button" className="button secondary small" onClick={()=>setRows(rows.filter((_,j)=>j!==i))}>Remove database</button>
 </div>)}
 {rows.length<6&&<button className="button secondary" type="button" onClick={()=>setRows([...rows,{name:'',operatorContact:'',accessInstructions:''}])}>Add tenancy database</button>}
 </div>;
}
function ModeFields({kind,mode,setMode,noticeMode,setNoticeMode,notices,setNotices}:{
 kind:string;mode:Mode;setMode:(v:Mode)=>void;noticeMode:string;setNoticeMode:(v:string)=>void;
 notices:Notice[];setNotices:(x:Notice[])=>void;
}){
 return <div className="panel stack"><h3>Rental application handling</h3>
 <label className="field">Application method
  <select name="applicationMode" value={mode} onChange={e=>setMode(e.target.value as Mode)}>
   <option value="unavailable">Applications not currently available</option>
   <option value="external">Agency/landlord application portal</option>
   {kind==='residential'&&<option value="proinspect">ProInspect online rental application</option>}
  </select>
 </label>
 {mode==='external'&&<label className="field">Approved application URL<input type="url" name="applicationUrl" required placeholder="https://agency.example/apply/property" maxLength={1000}/></label>}
 {mode==='proinspect'&&<>
  <p className="notice warning">Activate only after verifying a written application-processing instruction. ProInspect facilitates the application; the landlord or licensed leasing representative decides the outcome.</p>
  <label className="field">Written authority reference<input name="applicationAuthorityReference" required minLength={5} maxLength={200}/></label>
  <label className="field">Authorised landlord/agency recipient email<input type="email" name="applicationRecipientEmail" required maxLength={254}/></label>
  <label className="field">Tenancy database notice arrangement
   <select name="tenancyDatabaseNoticeMode" required value={noticeMode} onChange={e=>setNoticeMode(e.target.value)}>
    <option value="unconfigured">Not yet confirmed</option><option value="not_used">Representative confirms no tenancy databases are used</option>
    <option value="configured">Provide written notice details</option>
   </select>
  </label>
  {noticeMode==='configured'&&<Notices rows={notices} setRows={setNotices}/>}
 </>}
 </div>;
}
function CreateListing({clients,properties}: {clients:any[];properties:any[]}){
 const revalidator=useRevalidator(),[kind,setKind]=useState('residential');
 const [mode,setMode]=useState<Mode>('unavailable'),[noticeMode,setNoticeMode]=useState('unconfigured');
 const [notices,setNotices]=useState<Notice[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMessage('');
  const f=new FormData(e.currentTarget);
  const input=(key:string)=>String(f.get(key)??'').trim();
  const num=(key:string)=>input(key)===''?null:Number(input(key));
  try{
   const body={propertyId:input('propertyId'),instructedByClientId:input('instructedByClientId'),
    ownerClientId:input('ownerClientId')||null,kind,slug:input('slug'),title:input('title'),description:input('description'),
    displayAddress:input('displayAddress'),suburb:input('suburb'),postcode:input('postcode'),
    priceCents:input('priceAud')?Math.round(Number(input('priceAud'))*100):null,pricePeriod:input('pricePeriod'),
    bedrooms:num('bedrooms'),bathrooms:num('bathrooms'),parking:num('parking'),areaSqm:num('areaSqm'),
    availableFrom:input('availableFrom')||null,agentName:input('agentName'),
    agentRole:input('agentRole'),applicationMode:mode,
    ...(mode==='external'?{applicationUrl:input('applicationUrl')}:{}),
    applicationAuthorityReference:mode==='proinspect'?input('applicationAuthorityReference'):'',
    applicationRecipientEmail:mode==='proinspect'?input('applicationRecipientEmail'):'',
    tenancyDatabaseNoticeMode:mode==='proinspect'?noticeMode:'unconfigured',
    tenancyDatabaseNotices:mode==='proinspect'&&noticeMode==='configured'?notices:[]};
   const result=await send('/api/staff/leasing',body);
   setMessage('Draft listing created ('+result.id+'). Upload an approved photograph, verify the application configuration, then publish it.');
   revalidator.revalidate();
  }catch(error){setMessage(error instanceof Error?error.message:'Unable to save.');}
  finally{setBusy(false);}
 };
 return <details className="panel"><summary style={{fontWeight:800,cursor:'pointer'}}>Add a property listing</summary>
 <form className="stack" onSubmit={submit}>
  <div className="grid-2">
   <label className="field">Residential or commercial<select value={kind} onChange={e=>{setKind(e.target.value);setMode('unavailable');}}><option value="residential">Residential</option><option value="commercial">Commercial</option></select></label>
   <label className="field">Existing ProInspect property<select name="propertyId" required><option value="">Select property</option>{properties.filter(p=>p.sector===kind).map(p=><option value={p.id} key={p.id}>{p.address} — {p.suburb}</option>)}</select></label>
   <label className="field">Instructing client / agency<select name="instructedByClientId" required><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label className="field">Property owner (if recorded)<select name="ownerClientId"><option value="">Not separately recorded</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label className="field">Public slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="12-example-street-perth"/></label>
   <label className="field">Listing title<input name="title" required minLength={10} maxLength={160}/></label>
   <label className="field">Public address<input name="displayAddress" required minLength={5}/></label>
   <label className="field">Suburb<input name="suburb" required/></label>
   <label className="field">Postcode<input name="postcode" pattern="[0-9]{4}" required/></label>
   <label className="field">Price (AUD)<input type="number" name="priceAud" min={0} step=".01"/></label>
   <label className="field">Price period<select name="pricePeriod"><option value="week">Per week</option><option value="year">Per year</option><option value="on_application">On application</option></select></label>
   {kind==='residential'?<>
    <label className="field">Bedrooms<input type="number" min={0} name="bedrooms"/></label>
    <label className="field">Bathrooms<input type="number" min={0} name="bathrooms"/></label>
    <label className="field">Parking<input type="number" min={0} name="parking"/></label>
   </>:<label className="field">Internal floor area (m²)<input type="number" min={0} name="areaSqm"/></label>}
   <label className="field">Available from<input type="date" name="availableFrom"/></label>
   <label className="field">Responsible leasing representative<input name="agentName" required/></label>
   <label className="field">Leasing representative role<select name="agentRole"><option value="leasing_agent">Leasing agent</option><option value="property_manager">Property manager</option><option value="landlord">Landlord</option></select></label>
  </div>
  <label className="field">Approved property description<textarea rows={5} name="description" minLength={50} maxLength={8000} required/></label>
  <ModeFields kind={kind} mode={mode} setMode={setMode} noticeMode={noticeMode} setNoticeMode={setNoticeMode} notices={notices} setNotices={setNotices}/>
  <button type="submit" className="button" disabled={busy}>{busy?'Creating draft…':'Create draft listing'}</button>
  {message&&<p role="status">{message}</p>}
 </form></details>;
}
function EditApplicationSettings({listing}:{listing:any}){
 const initial=listing.tenancy_database_notice_json?JSON.parse(listing.tenancy_database_notice_json) as Notice[]:[];
 const [mode,setMode]=useState<Mode>(listing.application_mode);
 const [noticeMode,setNoticeMode]=useState(listing.tenancy_database_notice_mode);
 const [notices,setNotices]=useState<Notice[]>(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const revalidator=useRevalidator();
 const save=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();setBusy(true);setMessage('');
  const f=new FormData(e.currentTarget),get=(x:string)=>String(f.get(x)??'').trim();
  try{
   await send('/api/staff/leasing/'+listing.id+'/application-settings',{version:listing.version,
    applicationMode:mode,applicationUrl:mode==='external'?get('applicationUrl'):'',
    applicationAuthorityReference:mode==='proinspect'?get('applicationAuthorityReference'):'',
    applicationRecipientEmail:mode==='proinspect'?get('applicationRecipientEmail'):'',
    tenancyDatabaseNoticeMode:mode==='proinspect'?noticeMode:'unconfigured',
    tenancyDatabaseNotices:mode==='proinspect'&&noticeMode==='configured'?notices:[]});
   setMessage('Application handling configuration saved.');revalidator.revalidate();
  }catch(err){setMessage(err instanceof Error?err.message:'Unable to update.');}
  finally{setBusy(false);}
 };
 return <form onSubmit={save} className="stack"><h4>Application configuration — {listing.title}</h4>
  <div className="panel stack"><label className="field">Application method
   <select value={mode} onChange={e=>setMode(e.target.value as Mode)}>
    <option value="unavailable">No applications</option><option value="external">Agency's own application link</option>
    {listing.kind==='residential'&&<option value="proinspect">ProInspect online rental application</option>}
   </select></label>
   {mode==='external'&&<label className="field">Approved external URL<input type="url" name="applicationUrl" defaultValue={listing.application_url??''} required/></label>}
   {mode==='proinspect'&&<>
    <p className="small">This mode is for residential leasing only. Verify the signed instruction before enabling. The landlord or licensed agency remains the decision-maker.</p>
    <label className="field">Application authority reference<input name="applicationAuthorityReference" required defaultValue={listing.application_authority_reference??''} minLength={5}/></label>
    <label className="field">Verified recipient email<input type="email" required name="applicationRecipientEmail" defaultValue={listing.application_recipient_email??''}/></label>
    <label className="field">Tenancy database notice<select value={noticeMode} onChange={e=>setNoticeMode(e.target.value)}><option value="unconfigured">Not confirmed</option><option value="not_used">No tenancy database used</option><option value="configured">Written notice required</option></select></label>
    {noticeMode==='configured'&&<Notices rows={notices} setRows={setNotices}/>}
   </>}
  </div>
  <button className="button" type="submit" disabled={busy}>{busy?'Saving…':'Save application method'}</button>
  {message&&<p role="status">{message}</p>}
 </form>;
}
function ApprovalControls({listing}:{listing:any}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),revalidator=useRevalidator();
 const submit=async(action:string,payload:Record<string,unknown>)=>{
  setBusy(true);setMessage('');
  try{await send('/api/staff/leasing/'+listing.id+'/'+action,{version:listing.version,...payload});
    setMessage(action==='recipient-challenge'?'Verification email queued for the configured recipient.':'Application authority approved.');revalidator.revalidate();}
  catch(error){setMessage(error instanceof Error?error.message:'Approval action failed.');}finally{setBusy(false);}
 };
 if(listing.kind!=='residential'||listing.application_mode!=='proinspect')return null;
 return <section className="panel stack"><h4>Residential application approval</h4>
 <p className="small">Approval: {listing.rental_approval_state??'pending'} · Recipient verified: {listing.rental_recipient_verified_at?'Yes':'No'}</p>
 <button className="button secondary" type="button" disabled={busy} onClick={()=>submit('recipient-challenge',{})}>Send recipient verification email</button>
 <form className="stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);submit('rental-approve',{
 authorityAttestation:String(f.get('authorityAttestation')),authorityDocumentReference:String(f.get('authorityDocumentReference')),
 privacyNoticeVersion:String(f.get('privacyNoticeVersion')),confirmAuthority:f.get('confirmAuthority')==='on',
 confirmNotice:f.get('confirmNotice')==='on',confirmRecipient:f.get('confirmRecipient')==='on'});}}>
 <label className="field">Written instruction reference<input name="authorityDocumentReference" minLength={6} required/></label>
 <label className="field">Authority evidence and approval notes<textarea name="authorityAttestation" rows={3} minLength={30} required/></label>
 <label className="field">Approved privacy collection notice version<input name="privacyNoticeVersion" minLength={3} required/></label>
 <label><input type="checkbox" name="confirmAuthority" required/> I have checked the written application-processing authority.</label>
 <label><input type="checkbox" name="confirmNotice" required/> I have checked the approved privacy and tenancy-database notices.</label>
 <label><input type="checkbox" name="confirmRecipient" required/> The verified recipient is authorised for this listing.</label>
 <button className="button" type="submit" disabled={busy||!listing.rental_recipient_verified_at}>Record administrator approval</button></form>
 {message&&<p role="status">{message}</p>}</section>;
}

type LeasingSession={id:string;starts_at:string;ends_at:string;capacity:number|null;booked_count:number;status:string;version:number;instructions:string};
type ListingDetail={listing:any;sessions:LeasingSession[];photos:{id:string;alt_text:string}[];leads:{id:string;session_id:string|null;kind:string;status:string}[];
 applicationReadiness:{checks:ApplicationReadinessCheck[];technicalReady:boolean;notice:string}};
function perthDate(value:string){return new Intl.DateTimeFormat('en-AU',{dateStyle:'medium',timeStyle:'short',timeZone:'Australia/Perth'}).format(new Date(value))+' AWST';}
function ListingInspectionManagement({listing}:{listing:any}){
 const [detail,setDetail]=useState<ListingDetail|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [registrations,setRegistrations]=useState<{id:string;kind:string;status:string;sessionId:string|null;createdAt:string;contact:{name:string;email:string;phone:string;message?:string}}[]|null>(null);
 const refresh=async()=>{
  const response=await fetch('/api/staff/leasing/'+listing.id,{credentials:'same-origin',headers:{Accept:'application/json'}});
  const payload=await response.json() as ListingDetail&{message?:string};
  if(!response.ok)throw Error(payload.message||'Unable to load this property.');
  setDetail(payload);
 };
 const start=async()=>{setBusy(true);setMessage('');try{await refresh();}catch(e){setMessage(e instanceof Error?e.message:'Unable to load.');}finally{setBusy(false);}};
 const loadRegistrations=async()=>{
  setBusy(true);setMessage('');
  try{
   const res=await fetch('/api/staff/leasing/'+listing.id+'/registrations',{credentials:'same-origin',headers:{Accept:'application/json'}});
   const body=await res.json() as {registrations?:NonNullable<typeof registrations>;message?:string};
   if(!res.ok)throw Error(body.message||'Unable to load private registrations.');
   setRegistrations(body.registrations??[]);
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to load private registrations.');}
  finally{setBusy(false);}
 };
 const mutate=async(path:string,payload:unknown)=>{
  setBusy(true);setMessage('');
  try{await send('/api/staff/leasing/'+listing.id+'/'+path,payload);await refresh();setMessage('Inspection record updated.');}
  catch(e){setMessage(e instanceof Error?e.message:'Unable to update.');}
  finally{setBusy(false);}
 };
 const submit=async(e:FormEvent<HTMLFormElement>)=>{
  e.preventDefault();const f=new FormData(e.currentTarget);
  try{
   const startsAt=perthLocalToUtc(String(f.get('startsAt')||'')),endsAt=perthLocalToUtc(String(f.get('endsAt')||''));
   await mutate('sessions',{startsAt,endsAt,capacity:f.get('capacity')?Number(f.get('capacity')):null,instructions:String(f.get('instructions')||'')});
  }catch(err){setMessage(err instanceof Error?err.message:'Invalid inspection time.');}
 };
 return <details className="panel">
  <summary style={{fontWeight:750,cursor:'pointer'}}>Inspection scheduling and rental application readiness</summary>
  <p className="small">Inspection times are entered and displayed in Perth time (AWST). Rental intake cannot be enabled from this page; independent approvals are required.</p>
  <button type="button" className="button secondary small" onClick={start} disabled={busy}>{busy?'Loading…':detail?'Refresh property operations':'Load property operations'}</button>
  {message&&<p role="status">{message}</p>}
  {detail&&<div className="stack">
   <section className="panel stack"><h4>Application release checklist</h4>
    <p className="small">{detail.applicationReadiness.technicalReady?'Recorded technical and approval checks satisfied; independent acceptance still required.':'Application intake remains gated until all required checks are completed.'}</p>
    <div className="stack">{detail.applicationReadiness.checks.map(check=><div className="record-row" key={check.key}>
     <div><strong>{check.passed?'✓':'○'} {check.label}</strong>{!check.passed&&<p className="small">{check.nextAction}</p>}</div>
    </div>)}</div><p className="small">{detail.applicationReadiness.notice}</p>
   </section>
   <section className="panel stack"><h4>Open inspection sessions</h4>
    <p className="small">{detail.sessions.filter(x=>x.status==='scheduled').length} scheduled · {detail.leads.filter(x=>x.kind==='inspection'&&x.status==='active').length} active inspection registrations · {detail.leads.filter(x=>x.kind==='interest'&&x.status==='active').length} interest enquiries.</p>
    {detail.sessions.length===0?<p>No inspections have been scheduled.</p>:detail.sessions.map(session=><div className="panel stack" key={session.id}>
     <div className="actions"><strong>{perthDate(session.starts_at)} – {perthDate(session.ends_at)}</strong><Badge status={session.status}/></div>
     <p className="small">Registered: {session.booked_count}{session.capacity===null?' · No capacity limit':' / '+session.capacity+' places'} · Reference {session.id}</p>
     {session.instructions&&<p className="small">Instructions: {session.instructions}</p>}
     {session.status==='scheduled'&&<>
      <details><summary>Edit inspection time and capacity</summary>
       <form className="stack" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);
        try{mutate('session-edit/'+session.id,{version:session.version,startsAt:perthLocalToUtc(String(f.get('startsAt'))),endsAt:perthLocalToUtc(String(f.get('endsAt'))),
         capacity:f.get('capacity')?Number(f.get('capacity')):null,instructions:String(f.get('instructions')||'')});}
        catch(err){setMessage(err instanceof Error?err.message:'Invalid inspection time.');}
       }}>
        <div className="grid-2"><label className="field">Start — Perth time<input type="datetime-local" name="startsAt" defaultValue={perthUtcToLocal(session.starts_at)} required/></label>
         <label className="field">End — Perth time<input type="datetime-local" name="endsAt" defaultValue={perthUtcToLocal(session.ends_at)} required/></label></div>
        <label className="field">Capacity (blank for unlimited)<input name="capacity" type="number" min={Math.max(1,session.booked_count)} max={200} defaultValue={session.capacity??''}/></label>
        <label className="field">Visitor instructions<input name="instructions" maxLength={600} defaultValue={session.instructions}/></label>
        <button className="button secondary small" disabled={busy} type="submit">Save inspection changes</button>
       </form>
      </details>
      <div className="actions">
       <button type="button" className="button secondary small" disabled={busy} onClick={()=>{if(window.confirm('Cancel this inspection and notify registered visitors?'))mutate('session-status/'+session.id,{version:session.version,status:'cancelled'});}}>Cancel inspection</button>
       {Date.parse(session.starts_at)<=Date.now()&&<button type="button" className="button secondary small" disabled={busy} onClick={()=>{if(window.confirm('Mark this inspection completed?'))mutate('session-status/'+session.id,{version:session.version,status:'completed'});}}>Complete inspection</button>}
      </div>
     </>}
    </div>)}
    <details><summary style={{fontWeight:700}}>Schedule a new inspection</summary>
     <form className="stack" onSubmit={submit}>
      <div className="grid-2"><label className="field">Start — Perth time<input name="startsAt" type="datetime-local" required/></label>
       <label className="field">End — Perth time<input name="endsAt" type="datetime-local" required/></label></div>
      <label className="field">Maximum visitors (optional)<input name="capacity" type="number" min={1} max={200}/></label>
      <label className="field">Visitor instructions<input name="instructions" maxLength={600}/></label>
      <button className="button" type="submit" disabled={busy}>Publish inspection session</button>
     </form>
    </details>
   </section>
   <section className="panel stack"><h4>Private enquiry register</h4>
    <p className="small">Contacts are encrypted. Only authorised operations staff can request the detailed registration register.</p>
    <div className="actions"><button type="button" className="button secondary small" onClick={loadRegistrations} disabled={busy}>{registrations?'Refresh restricted registrations':'View restricted registrations'}</button>
     {registrations&&<button type="button" className="button secondary small" onClick={()=>setRegistrations(null)}>Hide contact details</button>}</div>
    {registrations&&<div className="table-wrap"><table><thead><tr><th>Prospect</th><th>Contact</th><th>Enquiry</th><th>Received</th></tr></thead><tbody>
     {registrations.map(reg=><tr key={reg.id}><td><strong>{reg.contact.name}</strong><p className="small">{reg.status}</p></td>
      <td><a href={'mailto:'+reg.contact.email}>{reg.contact.email}</a><p className="small">{reg.contact.phone}</p></td>
      <td>{reg.kind==='inspection'?'Inspection registration':'General interest'}{reg.contact.message&&<p className="small">{reg.contact.message}</p>}</td>
      <td>{perthDate(reg.createdAt)}</td></tr>)}
    </tbody></table>{registrations.length===0&&<p>No enquiries received.</p>}</div>}
   </section>
  </div>}
 </details>;
}

function ListingOperations({listing}:{listing:any}){
 const workspace=useWorkspace().workspace;
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),revalidator=useRevalidator();
 const publish=async(status:string)=>{setBusy(true);setMessage('');try{await send('/api/staff/leasing/'+listing.id+'/status',{version:listing.version,status});revalidator.revalidate();setMessage('Listing updated.');}catch(e){setMessage(e instanceof Error?e.message:'Action unsuccessful.');}finally{setBusy(false);}};
 const photo=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setMessage('');try{await send('/api/staff/leasing/'+listing.id+'/photos',new FormData(e.currentTarget),true);setMessage('Photograph uploaded.');revalidator.revalidate();}catch(err){setMessage(err instanceof Error?err.message:'Upload failed.');}finally{setBusy(false);}};
 return <div className="stack"><div className="actions"><Badge status={listing.status}/><span className="small">{listing.display_address} · {listing.instructing_client}</span></div>
  <p className="small">Responsible party: {listing.agent_name} · {listing.kind} · Application mode: {listing.application_mode}</p>
  <div className="actions">{listing.status!=='published'&&<button className="button small" type="button" onClick={()=>publish('published')} disabled={busy}>Publish approved listing</button>}
   {listing.status==='published'&&<button className="button secondary small" type="button" onClick={()=>publish('withdrawn')} disabled={busy}>Withdraw listing</button>}
   {listing.status==='published'&&<button className="button secondary small" type="button" onClick={()=>publish('leased')} disabled={busy}>Mark leased</button>}</div>
  <details><summary>Upload approved listing photograph</summary><form onSubmit={photo} className="stack">
   <label className="field">Image file<input name="file" type="file" required accept="image/jpeg,image/png,image/webp"/></label>
   <label className="field">Accessible image description<input name="altText" required minLength={8} maxLength={240}/></label>
   <button type="submit" className="button secondary" disabled={busy}>Upload photo (6 MB maximum)</button>
  </form></details>
  {listing.kind==='residential'&&<Link className="button secondary small" to={workspace.href+'/rental-applications?listingId='+encodeURIComponent(listing.id)}>View this property's rental application queue</Link>}
  <ListingInspectionManagement listing={listing}/>
  <details><summary>Edit application-handling settings</summary><EditApplicationSettings key={listing.version} listing={listing}/></details>
   <ApprovalControls listing={listing}/>
  {message&&<p role="status">{message}</p>}
 </div>;
}
export async function loader({request,context,params}:LoaderFunctionArgs){
 const [leasing,admin]=await Promise.all([
  loadApi(request,context,'/api/staff/leasing'),
  loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId+'/admin')
 ]);
 return {listings:leasing.listings,clients:[...new Map(admin.clients.map((c:any)=>[c.id,{id:c.id,name:c.name}])).values()]};
}
export default function StaffLeasing(){
 const {listings,clients}=useLoaderData<typeof loader>() as any;
 const data=useWorkspace();
 return <><PageHeading title="Property leasing administration" eyebrow="ProInspect operations"
  description="Create and publish approved leasing advertisements, identify the instructing client and choose whether applications use the agency's portal or the authorised ProInspect residential application process."/>
 <div className="actions"><Link className="button secondary" to={data.workspace.href+'/rental-applications'}>View submitted rental applications</Link><Link className="button secondary" to={data.workspace.href+'/open-home-checkins'}>Open home check-ins & next-day reports</Link></div>
 <div className="stack"><CreateListing clients={clients} properties={data.properties}/>
  <section className="panel stack"><h2>Leasing property records</h2>
   {listings.length===0?<p>No properties have been added to the public leasing directory.</p>:
   listings.map((listing:any)=><details key={listing.id} className="panel"><summary style={{cursor:'pointer',fontWeight:750}}>{listing.title} — {listing.status} / {listing.kind}</summary><ListingOperations listing={listing}/></details>)}
  </section>
 </div></>;
}
