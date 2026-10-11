import {useState} from 'react';
import {useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
import {PageHeading,Badge,Field} from '../../../../packages/ui/components';
import {OperationForm,Panel,Input,Select,options,choices} from '../components/OperationForm';
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId+'/v2-sectors') as any;
}
const checks=['governance','service_scope','pricing','insurance','credentials','privacy','workflow_acceptance'];
export default function MarketPacks(){
 const d=useLoaderData<typeof loader>(),w=useWorkspace(),base=workspaceApi(w.workspace.kind,w.workspace.scopeId)+'/v2-sectors';
 const executive=w.user.staffRole==='administrator';
 const [selectedModule,setSelectedModule]=useState('');
 const packs=d.packs.map((p:any)=>({value:p.id,label:p.market_code+' v'+p.version+' · '+p.status}));
 const draftPacks=d.packs.filter((p:any)=>p.status!=='approved'&&p.status!=='retired');
 const approvedModules=d.modules.filter((m:any)=>m.status==='approved');
 const chosen=d.modules.find((m:any)=>m.code===selectedModule);
 const moduleFields=chosen?JSON.parse(chosen.required_fields_json) as string[]:[];
 return <>
  <PageHeading eyebrow="ProInspect V2 · Sector configuration" title="Specialist market packs"
   description="Market-by-market activation with reviewed operational modules, governance and insurance checks, and deliberately scoped pilot engagements. Reserved clinical or statutory activity is never activated implicitly."/>
  <div className="stack">
   <div className="grid-4">
    <Panel title="Markets defined">{d.packs.length}</Panel>
    <Panel title="Module definitions">{d.modules.length}</Panel>
    <Panel title="Reviewed modules">{d.modules.filter((m:any)=>m.status!=='draft').length}</Panel>
    <Panel title="Pilot or live engagements">{d.rollouts.filter((r:any)=>['pilot','live'].includes(r.status)).length}</Panel>
   </div>
   <Panel title="Sector release readiness" description="All seven checks and all five module decisions must be reviewed before a pack can be approved. Reserved-provider clearance is additional.">
    <div className="table-wrap"><table><thead><tr><th>Market pack</th><th>Module decisions</th><th>Verified release checks</th><th>Gate</th></tr></thead><tbody>
      {d.packs.map((p:any)=>{
       const ms=d.modules.filter((m:any)=>m.pack_id===p.id),checks=d.checks.filter((c:any)=>c.pack_id===p.id);
       return <tr key={p.id}><td><strong>{p.label}</strong><p className="small">{p.id}</p></td>
        <td>{ms.filter((m:any)=>m.status!=='draft').length} / {ms.length}</td>
        <td>{checks.filter((c:any)=>c.status==='verified').length} / 7</td><td><Badge status={p.status}/></td></tr>;
      })}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={(f)=>base+'/modules/'+encodeURIComponent(String(f.get('moduleCode')) )+'/review'} label="Approve or exclude module">
       <Select name="moduleCode" label="Draft operational module" options={d.modules.filter((m:any)=>m.status==='draft').map((m:any)=>({value:m.code,label:m.code+' · '+m.name+' ['+m.classification+']'}))}/>
       <Select name="status" label="Decision" options={choices(['approved','excluded'])}/>
       <Input name="reviewReference" label="Scope and exclusion evidence reference"/>
       <p className="small">Reserved external duties require an independently verified provider. Exclusion is preferable when ProInspect is not authorised to perform the function.</p>
      </OperationForm>
      <OperationForm endpoint={base+'/checks'} label="Record market release evidence">
       <Select name="packId" label="Market pack to review" options={draftPacks.map((p:any)=>({value:p.id,label:p.label}))}/>
       <Select name="checkCode" label="Required gate" options={choices(checks)}/>
       <Select name="status" label="Evidence status" options={choices(['verified','rejected'])}/>
       <Input name="evidenceReference" label="Independent sign-off, document or validation reference"/>
      </OperationForm>
    </div>
    {executive&&<div className="grid-2">
      <OperationForm endpoint={base+'/clearances'} label="Record externally qualified provider clearance">
       <Select name="moduleCode" label="Reserved module" options={d.modules.filter((m:any)=>m.classification==='reserved_external').map((m:any)=>({value:m.code,label:m.code+' '+m.name}))}/>
       <Input name="qualifiedProvider" label="Appointed/licensed external provider"/>
       <Input name="credentialReference" label="Provider licence / appointment evidence"/>
       <Input name="independentCheckReference" label="Independent qualification verification reference"/>
       <Input name="validUntil" label="Clearance expires" type="datetime-local"/>
       <p className="small">Records verification only. Does not authorise ProInspect to undertake clinical, strata-governance or statutory functions.</p>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/packs/'+encodeURIComponent(String(f.get('packId')) )+'/approve'} label="Approve complete market pack">
       <Select name="packId" label="Fully reviewed pack" options={draftPacks.map((p:any)=>({value:p.id,label:p.label}))}/>
       <Input name="approvalReference" label="Final service, insurance, governance and pricing approval"/>
       <p className="small">Database checks refuse incomplete or unqualified configurations. Approval alone does not open customer bookings.</p>
      </OperationForm>
    </div>}
   </Panel>
   <Panel title="Configurable modules" description="The initial 55 definitions describe structured operational activities. Each approved module accepts controlled source and evidence references, not clinical or tenancy-case personal information.">
    <div className="table-wrap"><table><thead><tr><th>Code</th><th>Operational configuration</th><th>Duty boundary</th><th>Status</th></tr></thead><tbody>
      {d.modules.map((m:any)=><tr key={m.code}><td>{m.code}</td><td>{m.name}</td><td>{m.classification.replaceAll('_',' ')}</td><td><Badge status={m.status}/></td></tr>)}
    </tbody></table></div>
   </Panel>
   <Panel title="Progressive client and property-market pilots" description="Approve one market pack, confirm the existing customer appointment and asset classification, then start a limited pilot. Live use follows pilot review.">
    <div className="table-wrap"><table><thead><tr><th>Engagement</th><th>Pack</th><th>Rollout stage</th><th>Started</th></tr></thead><tbody>
     {d.rollouts.map((r:any)=><tr key={r.id}><td>{r.engagement_reference}</td><td>{r.pack_id}</td><td><Badge status={r.status}/></td><td>{r.pilot_started_at?.slice(0,10)||'Not started'}</td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/rollouts'} label="Propose scoped pilot">
       <Select name="packId" label="Market pack" options={packs}/>
       <Select name="engagementId" label="Verified client service engagement" options={d.engagements.map((e:any)=>({value:e.id,label:e.reference+' '+e.market_code}))}/>
      </OperationForm>
      {executive&&<OperationForm endpoint={(f)=>base+'/rollouts/'+encodeURIComponent(String(f.get('rolloutId')) )+'/state'} label="Activate pilot / live or pause">
       <Select name="rolloutId" label="Scoped rollout" options={d.rollouts.filter((r:any)=>r.status!=='ended').map((r:any)=>({value:r.id,label:r.engagement_reference+' ['+r.status+']'}))}/>
       <Select name="status" label="New stage" options={choices(['pilot','live','paused','ended'])}/>
       <Input name="authorityReference" label="Contract-authorised rollout decision and signoff reference"/>
       <p className="small">Pilot-to-live is sequential. A change does not override market availability, supplier clearance or client permissions.</p>
      </OperationForm>}
    </div>
   </Panel>
   <Panel title="Specialist operational records" description="Structured module records are tied to an explicitly active rollout; their evidence references and stage decisions are retained with independent review.">
    <div className="table-wrap"><table><thead><tr><th>Module</th><th>Source reference</th><th>Status</th></tr></thead><tbody>
      {d.records.map((r:any)=><tr key={r.id}><td>{r.module_code}</td><td>{r.source_key}</td><td><Badge status={r.status}/></td></tr>)}
    </tbody></table></div>
    <div className="grid-2">
      <OperationForm endpoint={base+'/records'} label="Submit approved module evidence">
       <Select name="rolloutId" label="Active scoped pilot/live engagement" options={d.rollouts.filter((r:any)=>['pilot','live'].includes(r.status)).map((r:any)=>({value:r.id,label:r.engagement_reference+' · '+r.pack_id}))}/>
       <Field label="Approved module">
         <select name="moduleCode" value={selectedModule} onChange={e=>setSelectedModule(e.target.value)} required>
           <option value="">Select approved module</option>
           {approvedModules.map((m:any)=><option value={m.code} key={m.code}>{m.code} · {m.name}</option>)}
         </select>
       </Field>
       <Input name="assetId" label="Matching asset ID (optional)" required={false}/>
       <Input name="sourceKey" label="Unique site evidence source key"/>
       {moduleFields.map(f=><Input key={f} name={'facts.'+f} label={f.replaceAll(/([A-Z])/g,' $1')} />)}
       {selectedModule&&<Input name="facts.notes" label="Non-sensitive operations note" required={false}/>}
       <p className="small">Patient, resident case-management, NDIS clinical and other sensitive records must remain in their authorised provider systems.</p>
      </OperationForm>
      <OperationForm endpoint={(f)=>base+'/records/'+encodeURIComponent(String(f.get('recordId')) )+'/review'} label="Independently review module record">
       <Select name="recordId" label="Pending record" options={d.records.filter((r:any)=>r.status==='submitted').map((r:any)=>({value:r.id,label:r.module_code+' · '+r.source_key}))}/>
       <Select name="status" label="Decision" options={choices(['accepted','rejected'])}/>
       <Input name="reviewReference" label="Independent review evidence and comments reference"/>
      </OperationForm>
    </div>
   </Panel>
  </div>
 </>;
}
