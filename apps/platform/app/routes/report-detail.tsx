import { useEffect,useState } from 'react';
import { data,Form,Link,useLoaderData,useActionData,useNavigation,type LoaderFunctionArgs,type ActionFunctionArgs } from 'react-router';
import { callApi,loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
import { COMPONENT_CLEANLINESS_CATEGORIES,COMPONENT_CONDITION_CATEGORIES,COMPONENT_WORKING_STATUSES,COMPONENT_TEST_STATUSES,COMPONENT_COMPARISON_STATUSES } from '../../../../packages/report-engine/upstream/reportModel';
import type { ReportDraft } from '../../../../packages/report-engine/adapter';
import {ReportOfflineControls} from '../components/ReportOfflineControls';
import {InspectorFieldMode} from '../components/InspectorFieldMode';
export async function loader({request,context,params}:LoaderFunctionArgs){
 const base=`/api/w/${params.kind}/${params.scopeId}/reports/${params.reportId}`;
 const detail=await loadApi(request,context,base);
 const selected=new URL(request.url).searchParams.get('baselineReportId');
 const history=params.kind==='staff'?await loadApi(request,context,base+'/history'+(selected?'?baselineReportId='+encodeURIComponent(selected):'')):null;
 return {...detail,history};
}
export async function action({request,context,params}:ActionFunctionArgs){
 const f=await request.formData(),id=params.reportId,base=`/api/w/${params.kind}/${params.scopeId}/reports/${id}`,intent=String(f.get('intent')||'');
 let endpoint='',body:unknown;
 try{
  if(intent==='upload'){endpoint='evidence';}
  else if(intent==='save'){endpoint='save';body={revision:Number(f.get('revision')),content:JSON.parse(String(f.get('content')))};}
  else if(intent==='submit'){endpoint='submit';body={revision:Number(f.get('revision'))};}
  else if(intent==='assign'){endpoint='reviewer';body={reviewerId:String(f.get('reviewerId'))};}
  else if(intent==='review'){endpoint='review';body={decision:String(f.get('decision')),comment:String(f.get('comment')||''),revision:Number(f.get('revision'))};}
  else if(intent==='reviewEvidence'){endpoint=`evidence/${encodeURIComponent(String(f.get('evidenceId')))}/review`;body={decision:String(f.get('decision'))};}
  else if(intent==='render'){endpoint='render';body={};}
  else if(intent==='renderReview'){endpoint='render-review';body={decision:String(f.get('decision')),sha256:String(f.get('sha256')),reviewReference:String(f.get('reviewReference'))};}
  else if(intent==='renderRevise'){endpoint='render-revise';body={revision:Number(f.get('revision')),reason:String(f.get('reason'))};}
  else if(intent==='issue'){endpoint='issue';body={audience:String(f.get('audience')),recipientId:String(f.get('recipientId')),reviewReference:String(f.get('reviewReference'))};}
  else if(intent==='respond'){
    endpoint='response';
    const entries=[...f.entries()].filter(([key,value])=>key.startsWith('finding:')&&String(value).trim()).map(([key,value])=>{
      const [,areaId,componentId]=key.split(':');
      return {areaId,componentId,comment:String(value).trim()};
    });
    body={generalNote:String(f.get('generalNote')),entries};
  }
  else if(intent==='resolveResponse'){
    endpoint='response/'+encodeURIComponent(String(f.get('responseId')))+'/'+'resolve';
    body={status:String(f.get('status')),resolutionNote:String(f.get('resolutionNote'))};
  }
  else if(intent==='createMaintenanceRequest'){
    endpoint='maintenance/'+encodeURIComponent(String(f.get('candidateId')))+'/'+'create-request';body={};
  }
  else if(intent==='maintenance'){endpoint='maintenance/candidates';body={};}
  else return data({error:'Unknown reporting action.'},{status:422});
 }catch{return data({error:'Report draft JSON could not be read.'},{status:422});}
 const response=await callApi(request,context,base+'/'+endpoint,{method:'POST',...(intent==='upload'?{form:f}:{body})});
 const result=await response.json() as any;
 return data(response.ok?{ok:true,message:result.status?'Report status: '+result.status:'Report action completed.',...result}:{error:result.message||'Report action failed.',code:result.code},{status:response.status});
}
function componentUpdate(draft:ReportDraft,area:number,component:number,field:string,value:unknown):ReportDraft{
 return {...draft,areas:draft.areas.map((a,ai)=>ai!==area?a:{...a,components:a.components.map((c,ci)=>ci!==component?c:{...c,[field]:value})})};
}
function Editor({record,initial,staff}: {record:any,initial:ReportDraft,staff:any}){
 const [draft,setDraft]=useState<ReportDraft>(initial),[dirty,setDirty]=useState(false);
 const [fieldMode,setFieldMode]=useState(false),[interactive,setInteractive]=useState(false);
 const navigation=useNavigation(),busy=!interactive||navigation.state!=='idle';
 useEffect(()=>{setFieldMode(window.matchMedia('(max-width: 680px)').matches);setInteractive(true);},[]);
 useEffect(()=>{setDraft(initial);setDirty(false);},[record.revision]);
 const change=(value:ReportDraft)=>{setDraft(value);setDirty(true);};
 const locked=!['draft','changes_requested'].includes(record.status);
 const addArea=()=>change({...draft,areas:[...draft.areas,{id:'area_'+crypto.randomUUID().replaceAll('-','').slice(0,14),name:'New area',overviewPhotoIds:[],components:[{id:'comp_'+crypto.randomUUID().slice(0,14),component:'Visible condition',commentary:'',conditionCategory:'unable_to_confirm',cleanlinessCategory:'unable_to_confirm',workingStatus:'not_applicable',testStatus:'not_applicable',comparisonStatus:'not_compared',photoIds:[],defects:[],maintenanceRequired:false}]}]});
 const addComponent=(ai:number)=>change({...draft,areas:draft.areas.map((a,j)=>j!==ai?a:{...a,components:[...a.components,{
  id:'comp_'+crypto.randomUUID().replaceAll('-','').slice(0,14),component:'New component',commentary:'',
  conditionCategory:'unable_to_confirm',cleanlinessCategory:'unable_to_confirm',workingStatus:'not_applicable',
  testStatus:'not_applicable',comparisonStatus:'not_compared',photoIds:[],defects:[],maintenanceRequired:false
 } ]})});
 return <section className="panel stack">
   <div><h2>Inspection report draft</h2><p className="small muted">Capture visible conditions and commentary. Changes remain drafts until submitted and independently reviewed.</p></div>
   <div className="actions"><button type="button" className="button secondary small" aria-pressed={fieldMode} disabled={busy} onClick={()=>setFieldMode(v=>!v)}>{fieldMode?'Use full editor':'Use mobile field mode'}</button></div>
   <Form method="post" className="stack" aria-busy={busy}>
     <input type="hidden" name="intent" value="save"/><input type="hidden" name="revision" value={record.revision}/>
     <input type="hidden" name="content" value={JSON.stringify(draft)}/>
     <label>Inspection summary<textarea disabled={locked||busy} rows={4} value={draft.summary} onChange={e=>change({...draft,summary:e.target.value})}/></label>
     {fieldMode&&<InspectorFieldMode draft={draft} onChange={change} locked={locked} dirty={dirty} busy={busy}/>}
     {!fieldMode&&draft.areas.map((area,ai)=><div className="panel stack-sm" key={area.id}>
       <label>Area name<input disabled={locked||busy} value={area.name} onChange={e=>change({...draft,areas:draft.areas.map((a,j)=>ai===j?{...a,name:e.target.value}:a)})}/></label>
       {area.components.map((c,ci)=><fieldset className="stack-sm" key={c.id}>
         <legend><strong>Component {ci+1}</strong></legend>
         <label>Component name<input disabled={locked||busy} value={c.component} onChange={e=>change(componentUpdate(draft,ai,ci,'component',e.target.value))}/></label>
         <div className="grid-2">
           {([['conditionCategory','Condition',COMPONENT_CONDITION_CATEGORIES],['cleanlinessCategory','Cleanliness',COMPONENT_CLEANLINESS_CATEGORIES],['workingStatus','Working status',COMPONENT_WORKING_STATUSES],['testStatus','Test status',COMPONENT_TEST_STATUSES],['comparisonStatus','Comparison',COMPONENT_COMPARISON_STATUSES]] as const).map(([field,label,values])=><label key={field}>{label}
             <select disabled={locked||busy} value={String(c[field]||'')} onChange={e=>change(componentUpdate(draft,ai,ci,field,e.target.value))}>
               {values.map(v=><option value={v} key={v}>{v.replaceAll('_',' ')}</option>)}
             </select>
           </label>)}
         </div>
         <label>Observations<textarea disabled={locked||busy} value={c.commentary} onChange={e=>change(componentUpdate(draft,ai,ci,'commentary',e.target.value))} rows={3}/></label>
         <label><input disabled={locked||busy} type="checkbox" checked={c.maintenanceRequired} onChange={e=>change(componentUpdate(draft,ai,ci,'maintenanceRequired',e.target.checked))}/> Maintenance follow-up required</label>
         <p className="small muted">{c.photoIds.length} linked evidence image(s). All evidence needs independent acceptance before report submission.</p>
       </fieldset>)}
       {!locked&&<button className="button secondary small" type="button" disabled={busy} onClick={()=>addComponent(ai)}>Add component</button>}
     </div>)}
     {!locked&&<div className="actions">{!fieldMode&&<button type="button" className="button secondary" disabled={busy} onClick={addArea}>Add area</button>}
       <button className="primary" disabled={busy}>Save draft{dirty?' *':''}</button></div>}
   </Form>
   {!locked&&<ReportOfflineControls reportId={record.id} revision={record.revision} draft={draft} onRestore={change}/>}
   {!locked&&!fieldMode&&<div className="stack-sm">
     <h3>Attach photographic evidence</h3>
     <p className="small muted">JPEG up to 5 MB. Uploaded evidence remains private and awaits independent review. Save draft changes before uploading photos.</p>
     {draft.areas.map(a=><Form key={a.id} method="post" encType="multipart/form-data" className="form stack-sm">
       <input type="hidden" name="intent" value="upload"/><input type="hidden" name="areaId" value={a.id}/>
       <label>Link photo to<select name="componentId" defaultValue=""><option value="">Area overview</option>{a.components.map(c=><option value={c.id} key={c.id}>{c.component}</option>)}</select></label>
       <label>JPEG for {a.name}<input type="file" name="file" accept="image/jpeg" disabled={busy||dirty} required/></label>
       <button className="button secondary small" disabled={busy||dirty}>Upload area evidence</button>
     </Form>)}
   </div>}
 </section>;
}
function HistoryPanel({history}:{history:any}){
 const data=history.comparison;
 return <section className="panel stack-sm" aria-label="Historical inspection intelligence">
   <h2>Historical comparison and maintenance patterns</h2>
   <p className="small muted">Saved report snapshot compared with an earlier issued, independently approved version. Interpret differences manually; new or changed photographs are not visually analysed.</p>
   {history.choices?.length?<Form method="get" className="form">
    <label>Compare with historical report<select name="baselineReportId" defaultValue={history.selectedBaselineId}>
     {history.choices.map((r:any)=><option key={r.id} value={r.id}>{r.reportType} · {new Date(r.createdAt).toLocaleDateString('en-AU')} · {r.id}</option>)}
    </select></label>
    <button className="button secondary">Compare selected report</button>
   </Form>:<p className="small">No earlier issued report is available within this authorised property and tenancy context.</p>}
   {data&&<div className="stack-sm">
    <p><strong>{data.deteriorated}</strong> deteriorated · <strong>{data.improved}</strong> improved · <strong>{data.unchanged}</strong> unchanged · {data.notComparable} not comparable · {data.newItems} new · {data.missingItems} missing</p>
    {data.findings.filter((finding:any)=>finding.status!=='unchanged').slice(0,60).map((finding:any)=><article className="panel stack-sm" key={finding.key}>
     <p><strong>{finding.area} — {finding.component}</strong> · {finding.status.replaceAll('_',' ')}</p>
     <p className="small muted">Previous: {finding.baselineCondition?.replaceAll('_',' ')||'not recorded'} · Current: {finding.currentCondition?.replaceAll('_',' ')||'not recorded'}</p>
     {finding.reasons.map((reason:string,i:number)=><p key={i} className="small">{reason}</p>)}
     {(finding.maintenanceNow||finding.maintenanceBefore)&&<p className="small">Maintenance recommended: {finding.maintenanceBefore?'previously':'no previous flag'} → {finding.maintenanceNow?'current':'not currently flagged'}</p>}
    </article>)}
   </div>}
   <h3>Recurring maintenance observations</h3>
   {history.recurringMaintenance?.length?history.recurringMaintenance.map((item:any)=><p key={item.key} className="small">
    <strong>{item.area} — {item.component}</strong>: flagged in {item.occurrences} earlier issued inspections.
   </p>):<p className="small muted">No repeated maintenance flags found in accessible issued reports.</p>}
   <p className="small muted">{history.note} Findings never create maintenance work or determine tenant liability automatically. Review evidence and use the normal authorised maintenance-candidate process.</p>
 </section>;
}
export default function ReportDetail(){
 const d=useWorkspace(),payload=useLoaderData<typeof loader>() as any,report=payload.report,action=useActionData<any>(),nav=useNavigation();
 const staff=d.workspace.kind==='staff',manager=staff&&['administrator','operations_manager'].includes(d.user.staffRole||'');
 const editor=staff&&(manager||report.inspector_id===d.user.id);
 const reviewer=staff&&report.reviewer_id===d.user.id&&report.inspector_id!==d.user.id&&report.created_by!==d.user.id;
 const defaultAudience=report.tenancy_id&&report.report_type==='entry'?'tenancy':report.scheme_id?'scheme_council':'client';
 const defaultRecipient=defaultAudience==='tenancy'?report.tenancy_id:defaultAudience==='scheme_council'?report.scheme_id:report.client_id;
 return <div className="stack">
  <PageHeading eyebrow="ProInspect report" title={report.report_type?.replaceAll('_',' ')||'Inspection report'}
   description={`Report ${report.id} · Status: ${report.status}`}/>
  <Link to={`${d.workspace.href}/reports`} className="button secondary small">Back to reports</Link>
  {action?.error&&<p role="alert" className="notice">{action.error}</p>}
  {action?.ok&&<p role="status" className="notice">{action.message}</p>}
  {report.issued_document_id&&<section className="panel"><h2>Issued PDF</h2><a className="button secondary" href={`/api/w/${d.workspace.kind}/${d.workspace.scopeId}/documents/${report.issued_document_id}/download`}>Download your authorised report</a></section>}
  {payload.draft&&editor&&<Editor record={report} initial={payload.draft.content} staff={d.staff}/>}
  {staff&&payload.history&&<HistoryPanel history={payload.history}/>}
  {staff&&<section className="panel stack-sm"><h2>Evidence and quality review</h2>
    {(payload.evidence||[]).length?payload.evidence.map((e:any)=><div className="list-row" key={e.id}><div>
      <strong>Photo {e.id}</strong><p className="small muted">{e.status} · {e.area_id}{e.component_id?' / '+e.component_id:''}</p>
      <a href={`/api/w/staff/operations/reports/${report.id}/evidence/${e.id}/download`}>View private evidence</a>
    </div>
    {e.status==='pending'&&(manager||reviewer)&&<Form method="post" className="actions">
      <input type="hidden" name="intent" value="reviewEvidence"/><input type="hidden" name="evidenceId" value={e.id}/>
      <button name="decision" value="accepted" className="button secondary small">Accept evidence</button>
      <button name="decision" value="rejected" className="button secondary small">Reject</button>
    </Form>}</div>):<p className="muted">No photographs uploaded yet.</p>}
   </section>}
  {staff&&<section className="panel stack-sm"><h2>Review and issue</h2>
    {manager&&['draft','submitted','changes_requested'].includes(report.status)&&<Form method="post" className="form">
      <input type="hidden" name="intent" value="assign"/>
      <label>Independent reviewer<select required name="reviewerId" defaultValue={report.reviewer_id||''}>
        <option value="">Select reviewer</option>
        {d.staff.filter(s=>s.id!==report.inspector_id&&s.id!==report.created_by).map(s=><option value={s.id} key={s.id}>{s.display_name||s.email}</option>)}
      </select></label><button className="button secondary">Assign reviewer</button>
    </Form>}
    {editor&&['draft','changes_requested'].includes(report.status)&&<Form method="post">
      <input type="hidden" name="intent" value="submit"/><input type="hidden" name="revision" value={report.revision}/>
      <button className="primary" disabled={nav.state!=='idle'}>Submit for QC and independent review</button>
    </Form>}
    {reviewer&&report.status==='submitted'&&<Form method="post" className="form stack-sm">
      <input type="hidden" name="intent" value="review"/><input type="hidden" name="revision" value={report.revision}/>
      <label>Review notes<textarea name="comment" maxLength={4000}/></label><div className="actions">
       <button className="primary" name="decision" value="approved">Approve report version</button>
       <button className="button secondary" name="decision" value="changes_requested">Request changes</button>
      </div>
    </Form>}
    {manager&&report.status==='approved'&&<Form method="post"><input type="hidden" name="intent" value="render"/><button className="primary">Generate approved PDF</button></Form>}
    {payload.renderReview&&<section className="panel stack-sm" aria-label="Rendered document independent review">
      <h3>Exact rendered PDF review</h3>
      <p className="small muted">Document {payload.renderReview.document_id} · SHA-256 {payload.renderReview.document_sha256}</p>
      <a className="button secondary" href={`/api/w/staff/operations/reports/${report.id}/rendered-pdf`} target="_blank" rel="noreferrer">Open PDF for independent visual review</a>
      {payload.renderReview.decision&&<p role="status">Recorded immutable decision: {payload.renderReview.decision}</p>}
      {!payload.renderReview.decision&&staff&&(reviewer||manager)&&
        payload.renderReview.rendered_by!==d.user.id&&report.created_by!==d.user.id&&report.inspector_id!==d.user.id&&
        <Form method="post" className="form stack-sm">
          <input type="hidden" name="intent" value="renderReview"/><input type="hidden" name="sha256" value={payload.renderReview.document_sha256}/>
          <label>Visual PDF review and evidence reference<input name="reviewReference" required minLength={8} maxLength={500} placeholder="Exact rendered pages and evidence inspected"/></label>
          <div className="actions"><button className="primary" name="decision" value="accepted">Approve exact PDF</button>
          <button className="button secondary" name="decision" value="rejected">Reject PDF</button></div>
        </Form>}
      {manager&&payload.renderReview.decision==='rejected'&&report.status==='approved'&&<Form method="post" className="form stack-sm">
        <input type="hidden" name="intent" value="renderRevise"/><input type="hidden" name="revision" value={report.revision}/>
        <label>Required corrections<input name="reason" minLength={8} maxLength={500} required/></label>
        <button className="button secondary">Reopen draft and create a new version</button>
      </Form>}
    </section>}
    {manager&&payload.renderReview?.decision==='accepted'&&['approved','issued'].includes(report.status)&&<Form method="post" className="form stack-sm">
      <input type="hidden" name="intent" value="issue"/>
      <label>Recipient audience<select name="audience" defaultValue={defaultAudience}>
       <option value="client">Commissioning client</option>
       {report.tenancy_id&&<option value="tenancy">Named tenancy</option>}
       {report.scheme_id&&<><option value="scheme_council">Scheme council</option><option value="scheme_resident">Scheme residents</option><option value="scheme_owner">Scheme owners</option></>}
      </select></label>
      <label>Authorised recipient ID<input name="recipientId" defaultValue={defaultRecipient||''} required/></label>
      <label>Approval reference<input name="reviewReference" placeholder="Reviewed report issue authorisation" required/></label>
      <button className="primary">Issue approved version</button>
    </Form>}
    {manager&&['approved','issued'].includes(report.status)&&<Form method="post"><input type="hidden" name="intent" value="maintenance"/><button className="button secondary">Prepare reviewable maintenance candidates</button></Form>}
  </section>}
  {staff&&(manager||reviewer)&&payload.responses?.length>0&&<section className="panel stack-sm">
    <h2>Recipient responses (separate from issued PDF)</h2>
    {payload.responses.map((response:any)=><article key={response.id} className="panel stack-sm">
      <p className="small muted">Response {response.id} · {response.status}</p>
      <p>{response.content.generalNote}</p>
      {response.content.entries?.map((entry:any,i:number)=><p key={i} className="small">
        Area {entry.areaId}{entry.componentId?' / component '+entry.componentId:''}: {entry.comment}
      </p>)}
      {response.status!=='resolved'&&<Form method="post" className="form stack-sm">
       <input type="hidden" name="intent" value="resolveResponse"/>
       <input type="hidden" name="responseId" value={response.id}/>
       <label>Review note<input name="resolutionNote" required minLength={4} maxLength={3000}/></label>
       <button className="button secondary" name="status" value="under_review">Mark under review</button>
       <button className="primary" name="status" value="resolved">Record resolution</button>
      </Form>}
    </article>)}
  </section>}
  {manager&&payload.maintenanceCandidates?.length>0&&<section className="panel stack-sm">
    <h2>Maintenance candidates</h2>
    <p className="small muted">Reviewed findings create separate requests for operational triage. They do not authorise contractor expenditure.</p>
    {payload.maintenanceCandidates.map((candidate:any)=><div className="list-row" key={candidate.id}>
      <div><p>{candidate.finding}</p><p className="small muted">{candidate.request_id?'Request '+candidate.request_id:'Not instructed'}</p></div>
      {!candidate.request_id&&<Form method="post">
       <input type="hidden" name="intent" value="createMaintenanceRequest"/>
       <input type="hidden" name="candidateId" value={candidate.id}/>
       <button className="button secondary small">Send for maintenance triage</button>
      </Form>}
    </div>)}
  </section>}
  {!staff&&d.workspace.kind==='tenant'&&report.issued_document_id&&<section className="panel stack-sm">
   <h2>Respond to the issued report</h2><p className="small muted">Your response is stored separately and does not change the issued report.</p>
   <Form method="post" className="form"><input type="hidden" name="intent" value="respond"/>
    <label>General comments or differences<textarea name="generalNote" rows={5} minLength={2} maxLength={6000} required/></label>
    {payload.responseTargets?.map((area:any)=><div className="stack-sm" key={area.id}>
       <h3>{area.name}</h3>
       {area.components?.map((component:any)=><label key={component.id}>
         {component.name} — optional specific comment
         <textarea name={`finding:${area.id}:${component.id}`} maxLength={1500} rows={2}/>
       </label>)}
    </div>)}
    <button className="primary">Submit response</button>
   </Form>
  </section>}
 </div>;
}
