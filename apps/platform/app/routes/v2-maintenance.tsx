import {useLoaderData, type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
import {PageHeading,Badge} from '../../../../packages/ui/components';
import {OperationForm,Panel,Select,Input,TextArea,choices,options} from '../components/OperationForm';
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId+'/v2-maintenance') as any;
}
const tradeCodes=['general','inspections','cleaning','grounds','carpentry','electrical','plumbing','fire','hvac','access','compliance'];
const money=(v:number|null)=>v==null?'Unapproved':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(v/100);
export default function Maintenance(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace(),api=workspaceApi(w.workspace.kind,w.workspace.scopeId)+'/v2-maintenance';
 const canReview=['administrator','operations_manager'].includes(w.user.staffRole||'');
 const tasks=options(d.tasks,'title'),staff=options(d.staff,'display_name'),contractors=options(d.contractors);
 const taskById=(id:string)=>d.tasks.find((t:any)=>t.id===id);
 const draftRates=d.rates.filter((r:any)=>r.status==='draft'),submittedTime=d.time.filter((t:any)=>t.status==='submitted'),
  submittedEvidence=d.evidence.filter((e:any)=>e.status==='submitted'),submittedCosts=d.cost.filter((c:any)=>c.status==='submitted');
 const resources=options(d.resources),openTasks=d.tasks.filter((t:any)=>!['completed','cancelled'].includes(t.status));
 const workOptions=d.orders.map((o:any)=>({value:o.id,label:o.reference+' — '+o.title}));
 return <>
  <PageHeading eyebrow="ProInspect V2 · Work Package 2" title="Maintenance delivery and workforce"
    description="Deliver scoped tasks, verify contractor credentials, plan capacity, review labour and cost evidence, and record work completion. Legacy customer bookings remain on their existing calendar."/>
  <div className="stack">
   <div className="grid-4">
     <Panel title="Open tasks">{openTasks.length}</Panel>
     <Panel title="Confirmed allocations">{d.allocations.filter((a:any)=>a.status==='confirmed').length}</Panel>
     <Panel title="Time awaiting review">{submittedTime.length}</Panel>
     <Panel title="Costs awaiting review">{submittedCosts.length}</Panel>
   </div>
   <Panel title="Task board" description="Each task inherits its parent work-order, property and scheme permissions. A parent work order cannot close with open maintenance tasks.">
     <div className="table-wrap"><table><thead><tr><th>Task</th><th>Trade / work order</th><th>Status</th><th>Budget</th><th>Approved costs</th></tr></thead><tbody>
      {d.tasks.map((t:any)=>{
       const approvedLabour=d.time.filter((e:any)=>e.task_id===t.id&&e.status==='approved').reduce((s:number,e:any)=>s+(e.cost_cents||0),0);
       const approvedOther=d.cost.filter((e:any)=>e.task_id===t.id&&e.status==='approved').reduce((s:number,e:any)=>s+e.amount_cents,0);
       return <tr key={t.id}><td><strong>{t.title}</strong><p className="small">{t.id}</p></td><td>{t.trade}<p className="small">{t.work_reference}</p></td><td><Badge status={t.status}/></td><td>{money(t.budget_ceiling_cents)}</td><td>{money(approvedLabour+approvedOther)}</td></tr>;
      })}
     </tbody></table></div>
     {canReview&&<div className="grid-2">
      <OperationForm endpoint={api+'/tasks'} label="Create maintenance task">
        <Select name="workOrderId" label="Existing work order" options={workOptions}/>
        <Select name="assetId" label="Asset (same property/scheme)" options={options(d.assets)} optional/>
        <Input name="title" label="Task / work item"/>
        <Select name="trade" label="Trade" options={choices(tradeCodes)}/>
        <Select name="priority" label="Priority" options={choices(['routine','urgent','emergency'])}/>
        <Select name="approvalRequired" label="Customer approval required" options={[{value:'true',label:'Yes'},{value:'false',label:'No'}]}/>
        <Input name="budgetCeilingCents" label="Approved task budget limit (AUD cents)" type="number"/>
        <Select name="evidenceKind" label="Required closeout evidence" options={choices(['note','photo','report','certificate'])}/>
        <TextArea name="instructions" label="Internal scope and instructions" required={false}/>
        <Input name="publicSummary" label="Optional customer-safe summary" required={false}/>
      </OperationForm>
      <div className="stack">
        <OperationForm endpoint={(f)=>api+'/tasks/'+encodeURIComponent(String(f.get('taskId')) )+'/requirement'} label="Require contractor credential">
          <Select name="taskId" label="Scoped task" options={d.tasks.filter((t:any)=>t.status==='scoped').map((t:any)=>({value:t.id,label:t.title}))}/>
          <Select name="credentialType" label="Required evidence" options={choices(['insurance','licence','competency','site_induction'])}/>
        </OperationForm>
        <OperationForm endpoint={(f)=>api+'/tasks/'+encodeURIComponent(String(f.get('taskId')) )+'/status'}
          label="Change task status">
          <Select name="taskId" label="Task" options={tasks}/>
          <Select name="status" label="New stage" options={choices(['awaiting_approval','approved','assigned','scheduled','in_progress','evidence_pending','completed','cancelled'])}/>
          <Input name="version" label="Current task version (from board)" type="number" value={1}/>
          <Input name="completionNotes" label="Verified completion reference (when closing)" required={false}/>
          <p className="small">Completion requires verified evidence, accepted costs and no pending time review. Reload and use the current version.</p>
        </OperationForm>
      </div>
     </div>}
   </Panel>
   <Panel title="Verified suppliers and task assignments">
     {canReview&&<div className="grid-2">
       <OperationForm endpoint={api+'/credentials'} label="Record verified contractor credential">
         <Select name="contractorId" label="Contractor" options={contractors}/>
         <Select name="credentialType" label="Evidence type" options={choices(['insurance','licence','competency','site_induction'])}/>
         <Select name="trade" label="Applicable trade" options={choices(tradeCodes)}/>
         <Input name="credentialReference" label="Credential/policy number"/>
         <Input name="verificationReference" label="Independent verification reference"/>
         <Input name="validUntil" label="Credential expires" type="datetime-local"/>
       </OperationForm>
       <OperationForm endpoint={api+'/assignments'} label="Confirm task instruction">
         <Select name="taskId" label="Maintenance task" options={tasks}/>
         <Select name="staffUserId" label="Staff member (or contractor)" options={staff} optional/>
         <Select name="contractorId" label="Contractor (or staff member)" options={contractors} optional/>
         <Input name="instructionReference" label="Authorised instruction reference"/>
         <p className="small">Contractor insurance and any trade licence or mandated site induction must remain valid. This register does not send a contractor instruction automatically.</p>
       </OperationForm>
     </div>}
     <p className="small">Active verified credentials: {d.credentials.filter((x:any)=>x.status==='verified').length}. Confirmed assignments: {d.assignments.filter((x:any)=>x.status==='confirmed').length}.</p>
   </Panel>
   <Panel title="Resource capacity and scheduling" description="Staff, supplier, vehicle, equipment and site resources use separate calendars, rostering windows and database-enforced overlap checks.">
     <div className="table-wrap"><table><thead><tr><th>Resource</th><th>Type</th><th>Skills</th><th>Location</th></tr></thead><tbody>
       {d.resources.map((r:any)=><tr key={r.id}><td>{r.name}</td><td>{r.kind}</td><td>{d.skills.filter((s:any)=>s.resource_id===r.id).map((s:any)=>s.trade).join(', ')||'Not verified'}</td><td>{r.region}</td></tr>)}
     </tbody></table></div>
     {canReview&&<div className="grid-2">
       <OperationForm endpoint={api+'/resources'} label="Register capacity resource">
         <Input name="name" label="Resource label"/>
         <Select name="kind" label="Resource type" options={choices(['staff','contractor','equipment','vehicle','space'])}/>
         <Select name="staffUserId" label="Staff (only for staff resource)" options={staff} optional/>
         <Select name="contractorId" label="Contractor (only for supplier resource)" options={contractors} optional/>
         <Input name="region" label="Coverage area" value="Perth WA"/>
       </OperationForm>
       <OperationForm endpoint={(f)=>api+'/resources/'+encodeURIComponent(String(f.get('resourceId')) )+'/skill'} label="Record verified resource skill">
         <Select name="resourceId" label="Resource" options={resources}/>
         <Select name="trade" label="Trade / service skill" options={choices(tradeCodes)}/>
       </OperationForm>
       <OperationForm endpoint={(f)=>api+'/resources/'+encodeURIComponent(String(f.get('resourceId')) )+'/roster'} label="Add recurring roster window">
         <Select name="resourceId" label="Resource" options={resources}/>
         <Select name="weekday" label="Weekday (Mon=1, Sun=7)" options={Array.from({length:7},(_,i)=>({value:String(i+1),label:['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'][i]}))}/>
         <Input name="startsMinute" label="AWST minutes since midnight, e.g. 480 for 8am" type="number"/>
         <Input name="endsMinute" label="End minute, e.g. 1020 for 5pm" type="number"/>
       </OperationForm>
       <OperationForm endpoint={api+'/allocations'} label="Allocate task capacity">
         <Select name="taskId" label="Assigned task" options={tasks}/>
         <Select name="resourceId" label="Available resource" options={resources}/>
         <Input name="startsAt" label="Start time" type="datetime-local"/>
         <Input name="endsAt" label="End time" type="datetime-local"/>
         <Input name="allocationReference" label="Scheduling authority reference"/>
       </OperationForm>
       <OperationForm endpoint={api+'/blocks'} label="Block unavailable resource time">
         <Select name="resourceId" label="Resource" options={resources}/>
         <Input name="startsAt" label="Unavailable from" type="datetime-local"/>
         <Input name="endsAt" label="Unavailable until" type="datetime-local"/>
         <Input name="reason" label="Absence, servicing or access block"/>
       </OperationForm>
       <OperationForm endpoint={(f)=>api+'/allocations/'+encodeURIComponent(String(f.get('allocationId')) )+'/release'} label="Release or complete allocation">
         <Select name="allocationId" label="Confirmed allocation" options={d.allocations.filter((a:any)=>a.status==='confirmed').map((a:any)=>({value:a.id,label:a.resource_id+' '+a.starts_at}))}/>
         <Select name="status" label="Outcome" options={choices(['released','completed'])}/>
       </OperationForm>
     </div>}
   </Panel>
   <Panel title="Evidence, labour and reviewed expenditure">
     <div className="grid-2">
      <OperationForm endpoint={api+'/evidence'} label="Submit completion evidence">
       <Select name="taskId" label="Task" options={tasks}/>
       <Select name="kind" label="Evidence category" options={choices(['note','photo','report','certificate','invoice'])}/>
       <Input name="documentId" label="Issued document ID for non-note evidence" required={false}/>
       <Input name="reference" label="Evidence / review description"/>
      </OperationForm>
      <OperationForm endpoint={api+'/time'} label="Submit completed work time">
       <Select name="taskId" label="Assigned maintenance task" options={tasks}/>
       <Select name="staffUserId" label="Recording staff member" options={staff}/>
       <Input name="startedAt" label="Actual start" type="datetime-local"/>
       <Input name="endedAt" label="Actual end" type="datetime-local"/>
       <Select name="activityKind" label="Activity category" options={choices(['on_site','travel','inspection','coordination','administration'])}/>
       <Input name="sourceKey" label="Unique timesheet source reference"/>
       <TextArea name="note" label="Timesheet work summary" required={false}/>
       <p className="small">Time is reviewed at a historically approved staff cost rate. Duplicate intervals and double-charging are rejected.</p>
      </OperationForm>
     </div>
     {canReview&&<div className="grid-2">
      <OperationForm endpoint={api+'/rates'} label="Draft staff cost rate">
       <Select name="staffUserId" label="Staff member" options={staff}/>
       <Input name="effectiveFrom" label="Rate effective from" type="datetime-local"/>
       <Input name="hourlyCostCents" label="Internal hourly cost, AUD cents" type="number"/>
      </OperationForm>
      <OperationForm endpoint={(f)=>api+'/rates/'+encodeURIComponent(String(f.get('rateId')) )+'/approve'} label="Approve historical staff rate">
       <Select name="rateId" label="Draft rate" options={draftRates.map((r:any)=>({value:r.id,label:r.staff_user_id+' · '+money(r.hourly_cost_cents)}))}/>
       <Input name="approvalReference" label="Cost-rate approval authority"/>
      </OperationForm>
      <OperationForm endpoint={(f)=>api+'/evidence/'+encodeURIComponent(String(f.get('evidenceId')) )+'/review'} label="Review task evidence">
       <Select name="evidenceId" label="Submitted evidence" options={submittedEvidence.map((e:any)=>({value:e.id,label:e.reference}))}/>
       <Select name="status" label="Outcome" options={choices(['verified','rejected'])}/>
      </OperationForm>
      <OperationForm endpoint={(f)=>api+'/time/'+encodeURIComponent(String(f.get('timeId')) )+'/review'} label="Approve / reject time">
       <Select name="timeId" label="Submitted time" options={submittedTime.map((e:any)=>({value:e.id,label:e.staff_user_id+' · '+e.minutes+' min'}))}/>
       <Select name="status" label="Decision" options={choices(['approved','rejected'])}/>
      </OperationForm>
      <OperationForm endpoint={api+'/costs'} label="Record supplier, material or equipment cost">
       <Select name="taskId" label="Task" options={tasks}/>
       <Select name="contractorId" label="Authorised supplier (optional)" options={contractors} optional/>
       <Select name="category" label="Expense category" options={choices(['contractor','materials','equipment','travel','other'])}/>
       <Input name="amountCents" label="Cost amount, AUD cents" type="number"/>
       <Input name="invoiceReference" label="Invoice / purchase reference"/>
       <Input name="sourceKey" label="Unique cost source key"/>
      </OperationForm>
      <OperationForm endpoint={(f)=>api+'/costs/'+encodeURIComponent(String(f.get('costId')) )+'/review'} label="Review external cost">
       <Select name="costId" label="Submitted cost" options={submittedCosts.map((c:any)=>({value:c.id,label:c.invoice_reference+' · '+money(c.amount_cents)}))}/>
       <Select name="status" label="Decision" options={choices(['approved','rejected'])}/>
      </OperationForm>
      <OperationForm endpoint={api+'/entitlements'} label="Link work to an approved subscription">
       <Select name="taskId" label="Work task" options={tasks}/>
       <Select name="subscriptionId" label="Current agreed subscription" options={d.subscriptions.map((s:any)=>({value:s.id,label:s.engagement_reference+' '+s.market_code}))}/>
       <Input name="serviceCode" label="Approved included service code (e.g. V2-001)"/>
       <p className="small">Approved time will post once to the immutable hours allowance only when linked to a matching client, property, service and active period.</p>
      </OperationForm>
     </div>}
   </Panel>
   <p className="small">Maintenance authority and statutory certifications remain with the appointed owner/manager and qualified contractor. This system tracks the commissioned operations work; it does not confer trade licences or statutory appointment.</p>
  </div>
 </>;
}