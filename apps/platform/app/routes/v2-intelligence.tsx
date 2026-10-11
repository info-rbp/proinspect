import {useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
import {PageHeading,Badge} from '../../../../packages/ui/components';
import {OperationForm,Panel,Input,TextArea,Select,options,choices} from '../components/OperationForm';
export async function loader({request,context,params}:LoaderFunctionArgs){
 const q=new URL(request.url).searchParams;
 return await loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId+'/v2-intelligence?days='+encodeURIComponent(q.get('days')||'90')) as any;
}
const aud=(n:number|null|undefined)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((n??0)/100);
export default function EnterpriseIntelligence(){
 const d=useLoaderData<typeof loader>(),m=d.summary,w=useWorkspace(),base=workspaceApi(w.workspace.kind,w.workspace.scopeId)+'/v2-intelligence';
 const executive=w.user.staffRole==='administrator';
 const programmes=options(d.programmes,'title'),projects=options(d.projects,'title'),portfolios=options(d.portfolios),
  clients=options(d.clients),engagements=d.engagements.map((e:any)=>({value:e.id,label:e.reference+' · '+e.market_code}));
 const approvedProgrammes=d.programmes.filter((g:any)=>['approved','active'].includes(g.status));
 const budgetCommitted=d.commitments.filter((c:any)=>c.status==='approved').reduce((sum:number,c:any)=>sum+c.proposed_cents,0);
 return <>
  <PageHeading eyebrow="ProInspect V2 · Management intelligence" title="Enterprise operations and capital works"
   description="Operational performance, asset condition, compliance follow-up, labour cost and capital expenditure commitments are reported from accepted records. No sample business results or unverified financial figures are presented."/>
  <div className="stack">
   <div className="grid-4">
    <Panel title="Recorded asset base">{m.assets.assets??0}<p className="small">High criticality: {m.assets.high_critical??0}</p></Panel>
    <Panel title="Preventive plans overdue">{m.preventive.overdue??0}<p className="small">Due within 30 days: {m.preventive.due_soon??0}</p></Panel>
    <Panel title="Compliance reviews overdue">{m.compliance.review_overdue??0}<p className="small">Evidence missing / expired: {m.compliance.evidence_unverified_or_expired??0}</p></Panel>
    <Panel title="Verified labour cost">{aud(m.labour.cost_cents)}<p className="small">{m.labour.minutes??0} recorded minutes</p></Panel>
   </div>
   <Panel title="Operational executive summary" description={m.basis}>
     <div className="grid-4">
      <div><strong>Approved external costs</strong><p>{aud(m.externalCosts.cost_cents)}</p></div>
      <div><strong>Estimated replacement exposure</strong><p>{aud(m.assets.replacement_cents)}</p></div>
      <div><strong>Capital approved baseline</strong><p>{aud(m.capital.baseline_cents)}</p></div>
      <div><strong>Approved capital commitments</strong><p>{aud(m.capital.committed_cents)}</p></div>
     </div>
     <p className="small">Window: {m.periodStart.slice(0,10)} to {m.periodEnd.slice(0,10)}. Capital commitments are planning authorisations and are not payments or accounting balances.</p>
     <div className="grid-2">
      <div><h3>Work-order pipeline</h3>{m.workOrders.map((r:any)=><div className="record-row" key={r.status}><Badge status={r.status}/><strong>{r.count}</strong></div>)}</div>
      <div><h3>Maintenance execution</h3>{m.taskStatuses.map((r:any)=><div className="record-row" key={r.status}><Badge status={r.status}/><strong>{r.count}</strong></div>)}</div>
      <div><h3>Monthly work-order trend</h3>
       {m.monthlyWorkOrders.length?m.monthlyWorkOrders.map((r:any)=><div className="record-row" key={r.month}><span>{r.month}</span><strong>{r.work_orders}</strong></div>):<p className="small">No recorded work orders in the selected period.</p>}
      </div>
      <div><h3>Specialist sector rollout</h3>{m.sectorRollouts.length?m.sectorRollouts.map((r:any)=><div className="record-row" key={r.market_code+r.status}><span>{r.market_code} · {r.status}</span><strong>{r.count}</strong></div>):<p className="small">All specialist market packs remain gated until approved.</p>}</div>
     </div>
     <p>Allocated workforce time: {Math.round(Number(m.capacity.allocated_minutes??0)/60*10)/10} hours across {m.capacity.confirmed_allocations??0} confirmed future resource allocations.</p>
     <p><a className="button secondary" href={base+'/export?days=90'}>Export staff-only aggregated CSV</a></p>
   </Panel>
   <Panel title="Enterprise portfolio groupings" description="Group verified client properties and schemes for consolidated reporting. These associations do not grant new tenancy, owner, scheme or document permissions.">
    <div className="table-wrap"><table><thead><tr><th>Group</th><th>Client</th><th>Scoped properties/schemes</th><th>Status</th></tr></thead><tbody>
     {d.portfolios.map((p:any)=><tr key={p.id}><td>{p.name}</td><td>{p.client_id}</td><td>{d.members.filter((a:any)=>a.portfolio_id===p.id).length}</td><td><Badge status={p.status}/></td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/portfolios'} label="Create authorised portfolio group">
       <Select name="clientId" label="Responsible customer organisation" options={clients}/>
       <Input name="name" label="Portfolio group name"/>
       <Input name="purpose" label="Operational reporting purpose"/>
       <Input name="authorityReference" label="Verified data-sharing / relationship authority"/>
      </OperationForm>
      <OperationForm endpoint={base+'/portfolio-members'} label="Link authorised asset context">
       <Select name="portfolioId" label="Existing group" options={portfolios}/>
       <Select name="propertyId" label="Property (or scheme)" options={options(d.properties,'address')} optional/>
       <Select name="schemeId" label="Scheme (or property)" options={options(d.schemes)} optional/>
       <Input name="authorityReference" label="Current client relationship reference"/>
      </OperationForm>
    </div>
   </Panel>
   <Panel title="Capital works programme and budget control" description="An authorised second approver is required before a programme or supplier commitment progresses. Approved commitments cannot exceed the programme's budget. No contractor order or payment is transmitted.">
    <div className="table-wrap"><table><thead><tr><th>Programme</th><th>Market</th><th>Baseline</th><th>Approved committed</th><th>Stage</th></tr></thead><tbody>
      {d.programmes.map((p:any)=>{
       const associated=d.projects.filter((j:any)=>j.programme_id===p.id).map((j:any)=>j.id);
       const committed=d.commitments.filter((c:any)=>associated.includes(c.project_id)&&c.status==='approved').reduce((s:number,c:any)=>s+c.proposed_cents,0);
       return <tr key={p.id}><td>{p.title}</td><td>{p.market_code}</td><td>{aud(p.baseline_budget_cents)}</td><td>{aud(committed)}</td><td><Badge status={p.status}/></td></tr>;
      })}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/programmes'} label="Draft controlled capital programme">
       <Select name="engagementId" label="Verified operational client engagement" options={engagements}/>
       <Input name="title" label="Programme"/>
       <TextArea name="purpose" label="Scope and value case"/>
       <Input name="baselineBudgetCents" label="Budget baseline in AUD cents" type="number"/>
       <Input name="plannedStart" label="Planned start" type="date" required={false}/>
       <Input name="plannedFinish" label="Planned completion" type="date" required={false}/>
      </OperationForm>
      {executive&&<div className="stack">
       {d.programmes.filter((p:any)=>!['completed','cancelled'].includes(p.status)).map((p:any)=><details key={p.id}>
         <summary>{p.title} · {p.status} · version {p.version}</summary>
         <OperationForm endpoint={base+'/programmes/'+p.id+'/state'} defaults={{version:p.version}} label="Independently approve/change programme">
           <Select name="status" label="Stage" options={choices(['approved','active','completed','cancelled'])}/>
           <Input name="authorityReference" label="Approving customer's spending / governance authority"/>
         </OperationForm>
       </details>)}
      </div>}
      <OperationForm endpoint={base+'/projects'} label="Define capital project and asset scope">
       <Select name="programmeId" label="Approved capital programme" options={options(approvedProgrammes,'title')}/>
       <Select name="assetId" label="Related asset" options={options(d.assets)} optional/>
       <Input name="workOrderId" label="Related scoped work-order reference (optional)" required={false}/>
       <Input name="title" label="Project title"/>
       <TextArea name="scopeSummary" label="Works, exclusions and deliverables"/>
       <Input name="estimatedCents" label="Preliminary project estimate in AUD cents" type="number"/>
      </OperationForm>
      {executive&&<OperationForm endpoint={(f)=>base+'/projects/'+encodeURIComponent(String(f.get('projectId')) )+'/state'} label="Approve and manage project stage">
       <Select name="projectId" label="Project" options={projects}/>
       <Select name="status" label="New stage" options={choices(['approved','active','completed','cancelled'])}/>
       <Input name="authorityReference" label="Authorised project approval / completion reference"/>
      </OperationForm>}
      <OperationForm endpoint={base+'/milestones'} label="Define capital project milestone">
       <Select name="projectId" label="Project" options={projects}/>
       <Input name="title" label="Milestone / delivery gate"/>
       <Input name="dueOn" label="Milestone due" type="date"/>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/milestones/'+encodeURIComponent(String(f.get('milestoneId')) )+'/review'} label="Review delivery milestone">
       <Select name="milestoneId" label="Outstanding milestone" options={d.milestones.filter((x:any)=>x.status==='planned').map((x:any)=>({value:x.id,label:x.title}))}/>
       <Select name="status" label="Outcome" options={choices(['completed','deferred'])}/>
       <Input name="evidenceReference" label="Verified completion or deferral evidence"/>
      </OperationForm>
      <OperationForm endpoint={base+'/commitments'} label="Propose supplier / capital commitment">
       <Select name="projectId" label="Capital project" options={projects}/>
       <Select name="contractorId" label="Verified contractor (optional)" options={options(d.contractors)} optional/>
       <Select name="category" label="Commitment category" options={choices(['works','materials','professional','contingency','other'])}/>
       <Input name="proposedCents" label="Proposed amount AUD cents" type="number"/>
       <Input name="quotationReference" label="Quotation / tender record"/>
      </OperationForm>
      {executive&&<OperationForm endpoint={(f)=>base+'/commitments/'+encodeURIComponent(String(f.get('commitmentId')) )+'/review'} label="Approve / reject capital commitment">
       <Select name="commitmentId" label="Proposed supplier commitment" options={d.commitments.filter((c:any)=>c.status==='proposed').map((c:any)=>({value:c.id,label:c.quotation_reference+' '+aud(c.proposed_cents)}))}/>
       <Select name="status" label="Decision" options={choices(['approved','cancelled'])}/>
       <Input name="authorityReference" label="Independent client expenditure approval"/>
       <p className="small">Budget enforcement is transactional. Approving this record does not instruct a contractor or release money.</p>
      </OperationForm>}
      <OperationForm endpoint={base+'/forecasts'} label="Record immutable forecast revision">
       <Select name="projectId" label="Capital project" options={projects}/>
       <Input name="revision" label="Forecast revision" type="number" value={1}/>
       <Input name="forecastTotalCents" label="Current total forecast AUD cents" type="number"/>
       <Input name="rationale" label="Variance drivers and proposed actions"/>
       <Input name="sourceReference" label="Review / project evidence reference"/>
      </OperationForm>
    </div>
    <p className="small">Total approved commitments in displayed programmes: {aud(budgetCommitted)}. Financial settlement and statutory governance stay outside this planning system.</p>
   </Panel>
   <Panel title="Saved reports and immutable reporting snapshots" description="Versioned management reporting derives figures from actual scoped source records. Snapshot histories cannot be edited and are suitable for governed review.">
    <div className="table-wrap"><table><thead><tr><th>Report</th><th>Category</th><th>Review window</th><th>Saved snapshots</th></tr></thead><tbody>
     {d.reports.map((r:any)=><tr key={r.id}><td>{r.title}</td><td>{r.report_kind}</td><td>{r.window_days} days</td><td>{d.snapshots.filter((s:any)=>s.definition_id===r.id).length}</td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
     <OperationForm endpoint={base+'/reports'} label="Create governed management report">
       <Input name="title" label="Report name"/>
       <Select name="reportKind" label="Report category" options={choices(['operations','assets','compliance','maintenance','sectors','capital'])}/>
       <Select name="clientId" label="Client filter (optional)" options={clients} optional/>
       <Select name="marketCode" label="Market filter (optional)" options={choices(['RES','COM','STR','CTS','STA','SOC','SDA','RET','AGE','RUR','INS'])} optional/>
       <Select name="portfolioId" label="Portfolio filter (requires client)" options={portfolios} optional/>
       <Input name="windowDays" label="Reporting lookback days (1–366)" type="number" value={90}/>
     </OperationForm>
     <OperationForm endpoint={(f)=>base+'/reports/'+encodeURIComponent(String(f.get('reportId')) )+'/snapshot'} label="Generate immutable report snapshot">
       <Select name="reportId" label="Saved active definition" options={d.reports.filter((r:any)=>r.status==='active').map((r:any)=>({value:r.id,label:r.title}))}/>
       <p className="small">Includes generated-at timestamp, report filter, monthly work pipeline, approved operating costs, asset condition and capital commitment exposure.</p>
     </OperationForm>
    </div>
   </Panel>
   <Panel title="Management escalations and follow-up" description="Alerts are owned by operations staff and evidence-backed when resolved; they do not silently discharge an external accountable party's obligation.">
    <div className="table-wrap"><table><thead><tr><th>Source</th><th>Severity</th><th>Alert</th><th>Status</th></tr></thead><tbody>
     {d.alerts.map((a:any)=><tr key={a.id}><td>{a.source_kind} · {a.source_id}</td><td>{a.severity}</td><td>{a.summary}</td><td><Badge status={a.status}/></td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
     <OperationForm endpoint={base+'/alerts'} label="Record management escalation">
       <Select name="sourceKind" label="Linked source category" options={choices(['asset','preventive','compliance','maintenance','capital','sector'])}/>
       <Input name="sourceId" label="Source record ID"/>
       <Input name="alertCode" label="Unique alert type/reference"/>
       <Select name="severity" label="Severity" options={choices(['info','warning','critical'])}/>
       <Input name="summary" label="Actionable operations summary"/>
       <Input name="dueOn" label="Due date" type="date" required={false}/>
     </OperationForm>
     <OperationForm endpoint={(f)=>base+'/alerts/'+encodeURIComponent(String(f.get('alertId')) )+'/state'} label="Acknowledge or close escalation">
       <Select name="alertId" label="Open alert" options={d.alerts.filter((a:any)=>a.status!=='resolved').map((a:any)=>({value:a.id,label:a.summary}))}/>
       <Select name="status" label="Response" options={choices(['acknowledged','resolved'])}/>
       <Input name="resolutionReference" label="Resolution evidence (required when closing)" required={false}/>
     </OperationForm>
    </div>
   </Panel>
  </div>
 </>;
}
