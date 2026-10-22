import { useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace } from '../lib/workspace';
import { PageHeading } from '../../../../packages/ui/components';
import { Panel } from '../components/OperationForm';
const money=(c:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c/100);
export async function loader({request,context,params}:LoaderFunctionArgs){
 return await loadApi(request,context,'/api/w/'+params.kind+'/'+params.scopeId+'/v2-account') as any;
}
export default function V2Agreements(){
 const d=useLoaderData<typeof loader>();
 const current=useWorkspace();
 return <>
 <PageHeading title="Service agreements and included work"
   description="Review ProInspect's approved operational scope and recorded subscription consumption. A service request is not an instruction to undertake work beyond the signed agreement."/>
 <div className="stack">
  {d.engagements.length===0&&<Panel title="No active service arrangement">
   <p>Any confirmed one-off bookings and existing inspection plans remain available under your normal portal. New service agreements appear here after ProInspect verifies the signed scope.</p>
  </Panel>}
  {d.engagements.map((e:any)=>{
    const periods=d.subscriptions.filter((s:any)=>s.engagement_id===e.id);
    return <Panel key={e.id} title={'Agreement '+e.reference} description={e.market_code+' · '+e.status}>
      <p><strong>Operational scope:</strong> {e.scope_summary}</p>
      <p><strong>Effective from:</strong> {e.starts_at?.slice(0,10)}{e.ends_at?' · Ends '+e.ends_at.slice(0,10):''}</p>
      {periods.map((s:any)=>{
        const usage=d.usage.filter((x:any)=>x.subscription_id===s.id);
        const totals=(metric:string)=>usage.filter((x:any)=>x.metric===metric).reduce((sum:number,x:any)=>sum+Number(x.consumed),0);
        return <div className="stack" key={s.id}>
          <h3>{s.plan_code?.replaceAll('_',' ')} package · {s.status}</h3>
          <p>{s.period_start?.slice(0,10)} – {s.period_end?.slice(0,10)} · Agreed fee {money(s.agreed_monthly_cents)} / month excluding GST</p>
          <div className="grid-4">
           {[
             ['Hours',s.included_hours_milli,totals('hours_milli'),1000],
             ['Visits',s.included_visits,totals('visits'),1],
             ['Tickets',s.included_tickets,totals('tickets'),1],
             ['Reports',s.included_reports,totals('reports'),1]
           ].map(([label,limit,spent,divider]:any)=>
             <div className="panel" key={label}>
              <strong>{label}</strong><p>{Number(spent)/Number(divider)} used of {Number(limit)/Number(divider)}</p>
              <p className="small">{Math.max(0,Number(limit)-Number(spent))/Number(divider)} remaining</p>
             </div>)}
          </div>
          <p className="small">These figures are based on recorded usage, not unverified completed tasks. Services outside the contract may require separate approval and quotation.</p>
        </div>;
      })}
    </Panel>;
  })}
  <p className="small">View bookings and reports from the {current.workspace.name} workspace. This page does not authorise third-party expenditure or replace your signed contract.</p>
 </div>
 </>;
}