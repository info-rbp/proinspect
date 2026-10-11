import {useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
import {PageHeading,Badge} from '../../../../packages/ui/components';
import {OperationForm,Panel,Input,TextArea,Select,options,choices} from '../components/OperationForm';
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId+'/v2-estates') as any;
}
const dollars=(c:number|null|undefined)=>c==null?'Unrecorded':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c/100);
const today=()=>new Date().toISOString().slice(0,10);
export default function V2Estates(){
 const d=useLoaderData<typeof loader>();
 const w=useWorkspace(),base=workspaceApi(w.workspace.kind,w.workspace.scopeId)+'/v2-estates';
 const assets=options(d.assets),engagements=d.engagements.map((e:any)=>({value:e.id,label:e.reference+' / '+e.market_code})),
  services=d.approvedServices.map((s:any)=>({value:s.code,label:s.code+' '+s.name})),
  staff=options(d.staff,'display_name'),plans=options(d.preventivePlans,'title'),obligations=options(d.obligations,'title');
 const draftConditions=d.conditions.filter((x:any)=>x.status==='submitted'),draftEvidence=d.complianceEvidence.filter((x:any)=>x.status==='submitted');
 const overdue=d.obligations.filter((x:any)=>x.status==='tracked'&&x.next_review_on<today());
 const duePm=d.preventivePlans.filter((x:any)=>x.status==='active'&&x.next_due<=today());
 const profilesToCreate=d.assets.filter((x:any)=>!x.asset_code);
 const plansIssue=d.preventivePlans.filter((x:any)=>x.status==='active');
 return <>
  <PageHeading eyebrow="ProInspect V2 · Asset assurance" title="Asset registers, preventive maintenance and compliance"
   description="Track asset condition and replacement exposure, generate planned work orders, and coordinate evidence-backed obligations. This system does not issue statutory compliance certificates."/>
  <div className="stack">
   <div className="grid-4">
    <Panel title="Assets">{d.assets.length}</Panel>
    <Panel title="Plans due now">{duePm.length}</Panel>
    <Panel title="Compliance reviews overdue">{overdue.length}</Panel>
    <Panel title="Open asset risks">{d.risks.filter((x:any)=>x.status==='open').length}</Panel>
   </div>
   <Panel title="Asset condition and replacement register" description="Each component belongs to the existing canonical property or scheme. Verified assessments update the latest condition score; historical assessments remain immutable.">
    <div className="table-wrap"><table><thead><tr><th>Asset</th><th>Type</th><th>Condition (1–5)</th><th>Priority</th><th>Replacement exposure</th></tr></thead><tbody>
     {d.assets.map((a:any)=><tr key={a.id}><td><strong>{a.name}</strong><p className="small">{a.asset_code||a.id}</p></td><td>{a.kind}</td><td>{a.last_condition_score??'Not assessed'}</td><td>{a.criticality||'Not reviewed'}</td><td>{dollars(a.replacement_cost_cents)}</td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
     <OperationForm endpoint={base+'/profiles'} label="Register asset lifecycle profile">
      <Select name="assetId" label="Unregistered asset" options={options(profilesToCreate)} />
      <Input name="assetCode" label="Unique asset reference"/>
      <Input name="manufacturer" label="Manufacturer" required={false}/>
      <Input name="model" label="Model" required={false}/>
      <Input name="serialNumber" label="Serial number (optional)" required={false}/>
      <Input name="commissionedOn" label="Commissioned date" type="date" required={false}/>
      <Input name="designLifeMonths" label="Expected life in months" type="number" required={false}/>
      <Input name="replacementCostCents" label="Estimated replacement amount, AUD cents" type="number" required={false}/>
      <Select name="criticality" label="Operational importance" options={choices(['low','normal','high','critical'])}/>
      <Select name="lifecycleStatus" label="Operating condition" options={choices(['operational','restricted','out_of_service','retired'])}/>
      <TextArea name="notes" label="Maintenance context" required={false}/>
     </OperationForm>
     <div className="stack">
      <OperationForm endpoint={base+'/conditions'} label="Record condition assessment">
       <Select name="assetId" label="Asset" options={assets}/>
       <Select name="score" label="Condition score (1 poor – 5 good)" options={Array.from({length:5},(_,i)=>({value:String(i+1),label:String(i+1)}))}/>
       <Input name="observedOn" label="Observed date" type="date"/>
       <Select name="method" label="Evidence method" options={choices(['visual','functional','professional_report'])}/>
       <Input name="summary" label="Inspection / observation summary"/>
       <Input name="evidenceDocumentId" label="Issued document ID (optional)" required={false}/>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/conditions/'+encodeURIComponent(String(f.get('conditionId')) )+'/review'} label="Review and verify condition">
       <Select name="conditionId" label="Unreviewed assessment" options={draftConditions.map((r:any)=>({value:r.id,label:r.asset_id+' score '+r.score}))}/>
       <Select name="status" label="Review result" options={choices(['verified','rejected'])}/>
       <Input name="verificationReference" label="Independent condition review reference"/>
      </OperationForm>
     </div>
    </div>
    {d.assets.filter((a:any)=>a.asset_code).slice(0,20).map((a:any)=><details key={a.id}>
      <summary>Update {a.name} — profile version {a.profile_version}</summary>
      <OperationForm endpoint={base+'/profiles'} defaults={{assetId:a.id,assetCode:a.asset_code,version:a.profile_version}} label="Save revised asset profile">
       <Input name="manufacturer" label="Manufacturer" value={a.manufacturer??''} required={false}/>
       <Input name="model" label="Model" value={a.model??''} required={false}/>
       <Input name="serialNumber" label="Serial number" value={a.serial_number??''} required={false}/>
       <Input name="commissionedOn" label="Commissioning date" type="date" value={a.commissioned_on??''} required={false}/>
       <Input name="designLifeMonths" label="Expected life (months)" type="number" value={a.design_life_months??''} required={false}/>
       <Input name="replacementCostCents" label="Replacement estimate AUD cents" type="number" value={a.replacement_cost_cents??''} required={false}/>
       <Select name="criticality" label="Criticality" value={a.criticality} options={choices(['low','normal','high','critical'])}/>
       <Select name="lifecycleStatus" label="Operating status" value={a.lifecycle_status} options={choices(['operational','restricted','out_of_service','retired'])}/>
       <Input name="notes" label="Updated inspection context" required={false}/>
      </OperationForm>
    </details>)}
    <OperationForm endpoint={base+'/warranties'} label="Record verified warranty">
     <Select name="assetId" label="Covered asset" options={assets}/>
     <Input name="provider" label="Warranty provider"/>
     <Input name="warrantyReference" label="Warranty or service agreement reference"/>
     <Input name="startsOn" label="Warranty start" type="date" required={false}/>
     <Input name="expiresOn" label="Warranty expires" type="date"/>
     <Input name="evidenceDocumentId" label="Issued document ID (optional)" required={false}/>
     <Input name="verificationReference" label="Review / warranty evidence reference"/>
    </OperationForm>
   </Panel>
   <Panel title="Preventive maintenance scheduling" description="An approved market service and signed active operations engagement are required. Issuing a due occurrence creates a scoped work order and maintenance task; it does not reserve people or instruct a supplier.">
    <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Next due</th><th>Frequency</th><th>Status</th></tr></thead><tbody>
     {d.preventivePlans.map((p:any)=><tr key={p.id}><td>{p.title}</td><td>{p.next_due}</td><td>Every {p.cadence_months} months</td><td><Badge status={p.status}/></td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
     <OperationForm endpoint={base+'/plans'} label="Create draft preventive plan">
      <Select name="engagementId" label="Active service appointment" options={engagements}/>
      <Select name="assetId" label="Asset in matching appointment" options={assets}/>
      <Select name="serviceCode" label="Approved service" options={services}/>
      <Input name="title" label="Maintenance programme"/>
      <Input name="instructions" label="Trade instructions and maintenance scope"/>
      <Input name="cadenceMonths" label="Frequency in months" type="number" value={3}/>
      <Input name="leadDays" label="Days before due date when work may be issued" type="number" value={14}/>
      <Input name="nextDue" label="Initial next due" type="date"/>
     </OperationForm>
     <div className="stack">
      {d.preventivePlans.filter((p:any)=>p.status!=='retired').slice(0,25).map((p:any)=><details key={p.id}>
       <summary>{p.title} — {p.status} — v{p.version}</summary>
       <OperationForm endpoint={base+'/plans/'+p.id+'/state'} defaults={{version:p.version}} label="Approve/change plan state">
        <Select name="status" label="State" options={choices(['active','paused','retired'])}/>
        <Input name="authorityReference" label="Signed maintenance authority / suspension reference"/>
       </OperationForm>
      </details>)}
      <OperationForm endpoint={(f)=>base+'/plans/'+encodeURIComponent(String(f.get('planId')) )+'/issue'} label="Issue next planned work order">
       <Select name="planId" label="Active due programme" options={options(plansIssue,'title')}/>
       <Input name="authorityReference" label="Planned work authority / instruction reference"/>
       <p className="small">Only one occurrence per plan and due date. Existing booking, approval, task and contractor controls still apply.</p>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/plans/'+encodeURIComponent(String(f.get('planId')) )+'/skip'} label="Record authorised skipped visit">
       <Select name="planId" label="Active plan" options={options(plansIssue,'title')}/>
       <Input name="authorityReference" label="Authorised waiver reference"/>
       <Input name="reason" label="Why this cycle is deferred or skipped"/>
      </OperationForm>
     </div>
    </div>
   </Panel>
   <Panel title="Compliance obligations and external evidence" description="Track accountable parties, review dates, inspection and contractor certificates. A verified document does not by itself establish statutory compliance.">
    <div className="table-wrap"><table><thead><tr><th>Obligation</th><th>Accountable role</th><th>Review due</th><th>Evidence expiry</th><th>Status</th></tr></thead><tbody>
     {d.obligations.map((o:any)=><tr key={o.id}><td>{o.title}<p className="small">{o.category}</p></td><td>{o.accountable_party}</td><td>{o.next_review_on}</td><td>{o.evidence_expires_on||'No current verified expiry'}</td><td><Badge status={o.status}/></td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/obligations'} label="Draft compliance obligation">
       <Select name="engagementId" label="Service engagement" options={engagements}/>
       <Select name="assetId" label="Asset at this site" options={assets}/>
       <Input name="title" label="Tracked obligation"/>
       <Select name="category" label="System category" options={choices(['fire','electrical','water','lift','accessibility','environment','essential_services','safety','other'])}/>
       <Input name="jurisdiction" label="Jurisdiction" value="Western Australia"/>
       <Input name="sourceReference" label="Statutory/contractual source reference"/>
       <Input name="requirementSummary" label="Required professional activity or evidence"/>
       <Select name="accountableParty" label="Legally responsible party" options={choices(['owner','appointed_manager','operator','qualified_provider','government_authority'])}/>
       <Input name="recurrenceMonths" label="Review interval (months)" type="number" required={false}/>
       <Input name="nextReviewOn" label="Next independent review due" type="date"/>
      </OperationForm>
      <div className="stack">
       {d.obligations.filter((o:any)=>o.status!=='retired').slice(0,25).map((o:any)=><details key={o.id}>
        <summary>{o.title} — {o.status} — version {o.version}</summary>
        <OperationForm endpoint={base+'/obligations/'+o.id+'/state'} defaults={{version:o.version}} label="Verify obligation tracking">
         <Select name="status" label="Tracking state" options={choices(['tracked','paused','retired'])}/>
         <Input name="reviewReference" label="Authority and source review reference"/>
        </OperationForm>
       </details>)}
       <OperationForm endpoint={base+'/compliance-evidence'} label="Submit external certificate or report reference">
        <Select name="obligationId" label="Compliance obligation" options={obligations}/>
        <Select name="kind" label="Document type" options={choices(['certificate','inspection','service_record','correspondence','other'])}/>
        <Input name="providerName" label="Qualified provider or issuing organisation"/>
        <Input name="evidenceReference" label="Certificate/report reference"/>
        <Input name="documentId" label="Issued private document ID (optional)" required={false}/>
        <Input name="issuedOn" label="Issued date" type="date"/>
        <Input name="expiresOn" label="Evidence expiry (optional)" type="date" required={false}/>
       </OperationForm>
       <OperationForm endpoint={(f)=>base+'/compliance-evidence/'+encodeURIComponent(String(f.get('evidenceId')) )+'/review'} label="Verify external evidence">
        <Select name="evidenceId" label="Awaiting review" options={draftEvidence.map((e:any)=>({value:e.id,label:e.evidence_reference}))}/>
        <Select name="status" label="Review" options={choices(['verified','rejected'])}/>
        <Input name="independentCheckReference" label="Independent verification reference"/>
       </OperationForm>
      </div>
    </div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/actions'} label="Assign compliance follow-up">
       <Select name="obligationId" label="Obligation" options={obligations}/>
       <Input name="actionText" label="Action required"/>
       <Input name="dueOn" label="Action due" type="date"/>
       <Select name="assigneeId" label="Staff coordinator" options={staff}/>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/actions/'+encodeURIComponent(String(f.get('actionId')) )+'/close'} label="Close compliance follow-up">
       <Select name="actionId" label="Outstanding action" options={d.actions.filter((a:any)=>a.status==='open').map((a:any)=>({value:a.id,label:a.action_text}))}/>
       <Select name="status" label="Result" options={choices(['done','cancelled'])}/>
       <Input name="completionReference" label="Evidence of completion or cancellation"/>
      </OperationForm>
    </div>
   </Panel>
   <Panel title="Asset and service risk register" description="Risk scoring prioritises actions and can inform capital project proposals, but does not replace engineering or legal assessment.">
    <div className="table-wrap"><table><thead><tr><th>Risk</th><th>Exposure (L×I)</th><th>Review date</th><th>Status</th></tr></thead><tbody>
     {d.risks.map((r:any)=><tr key={r.id}><td>{r.summary}</td><td>{r.likelihood*r.impact}/25</td><td>{r.next_review_on}</td><td><Badge status={r.status}/></td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/risks'} label="Register asset risk">
       <Select name="assetId" label="Asset" options={assets}/>
       <Select name="category" label="Risk category" options={choices(['condition','safety','failure','compliance','financial','service','other'])}/>
       <Input name="summary" label="Risk statement"/>
       <Select name="likelihood" label="Likelihood 1–5" options={Array.from({length:5},(_,i)=>({value:String(i+1),label:String(i+1)}))}/>
       <Select name="impact" label="Impact 1–5" options={Array.from({length:5},(_,i)=>({value:String(i+1),label:String(i+1)}))}/>
       <Input name="mitigation" label="Mitigation strategy"/>
       <Input name="nextReviewOn" label="Next review" type="date"/>
       <Select name="ownerStaffId" label="Risk coordinator" options={staff}/>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/risks/'+encodeURIComponent(String(f.get('riskId')) )+'/close'} label="Mitigate or formally accept risk">
       <Select name="riskId" label="Open risk" options={d.risks.filter((r:any)=>r.status==='open').map((r:any)=>({value:r.id,label:r.summary}))}/>
       <Select name="status" label="Decision" options={choices(['mitigated','accepted'])}/>
       <Input name="closureReference" label="Formal risk action / acceptance reference"/>
      </OperationForm>
    </div>
   </Panel>
  </div>
 </>;
}
