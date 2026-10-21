import { useState, type FormEvent } from 'react';
import { Link,useLoaderData,useRevalidator,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';

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
function ListingOperations({listing}:{listing:any}){
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
  <details><summary>Edit application-handling settings</summary><EditApplicationSettings key={listing.version} listing={listing}/></details>
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
 <div className="actions"><Link className="button secondary" to={data.workspace.href+'/rental-applications'}>View submitted rental applications</Link></div>
 <div className="stack"><CreateListing clients={clients} properties={data.properties}/>
  <section className="panel stack"><h2>Leasing property records</h2>
   {listings.length===0?<p>No properties have been added to the public leasing directory.</p>:
   listings.map((listing:any)=><details key={listing.id} className="panel"><summary style={{cursor:'pointer',fontWeight:750}}>{listing.title} — {listing.status} / {listing.kind}</summary><ListingOperations listing={listing}/></details>)}
  </section>
 </div></>;
}
