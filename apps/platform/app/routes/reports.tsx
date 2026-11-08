import {data,redirect,Form,Link,useLoaderData,useNavigation,useActionData,useSearchParams,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {loadApi,callApi} from '../lib/api.server';
import {useWorkspace} from '../lib/workspace';
import {PageHeading,Badge,EmptyState} from '../../../../packages/ui/components';
import {REPORT_TEMPLATE_PARITY,reportTemplateParitySummary} from '../../../../packages/report-engine/parity';
export async function loader({request,context,params}:LoaderFunctionArgs) {
 return loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/reports`);
}
export async function action({request,context,params}:ActionFunctionArgs) {
 const form=await request.formData();
 const path=`/api/w/${params.kind}/${params.scopeId}/reports/create`;
 const response=await callApi(request,context,path,{method:'POST',body:{
  workOrderId:String(form.get('workOrderId')||''),
  ...(form.get('tenancyId')?{tenancyId:String(form.get('tenancyId'))}:{}),
  ...(form.get('baselineVersionId')?{baselineVersionId:String(form.get('baselineVersionId'))}:{}),
  ...(form.get('reportType')?{reportType:String(form.get('reportType'))}:{})
 }});
 const result=await response.json() as any;
 if(response.ok)return redirect(`/w/${params.kind}/${params.scopeId}/reports/${result.id}`);
 return data({error:result.message??'Could not create report.'},{status:response.status});
}
export default function ReportsRegister(){
 const d=useWorkspace(),result=useLoaderData<typeof loader>() as any,nav=useNavigation(),feedback=useActionData<any>(),[search]=useSearchParams();
 const isStaff=d.workspace.kind==='staff',canCreate=isStaff&&d.user.staffRole!=='read_only';
 const orders=d.workOrders.filter(o=>!['completed','cancelled'].includes(o.status));
 const start=search.get('workOrderId')||'';
 return <div className="stack">
  <PageHeading eyebrow="ProInspect reporting" title={isStaff?'Inspection reporting':'Issued inspection reports'}
    description={isStaff?'Work Order-linked drafts, independent QC, PDF issue and approved evidence.':'Documents issued to this specific authorised workspace. Drafts and internal evidence are not available.'}/>
  {feedback?.error&&<p role="alert" className="notice">{feedback.error}</p>}
  {canCreate&&<section className="panel">
   <h2>Start a Work Order report</h2>
   <p className="muted small">The booked service determines the inspection type and template. A report cannot be issued until a separate authorised reviewer approves it.</p>
   <Form method="post" className="form stack-sm">
    <label>Work Order
      <select name="workOrderId" required defaultValue={start||orders[0]?.id||''}>
       {!orders.length&&<option value="">No assigned Work Orders available</option>}
       {orders.map(o=><option key={o.id} value={o.id}>{o.reference} — {o.title}</option>)}
      </select>
    </label>
    <label>Tenancy ID (Entry/Exit PCR only, when applicable)<input name="tenancyId" placeholder="Select the tenancy linked to this property"/></label>
    <label>Issued Entry baseline version ID (required for Exit/Comparison)
      <input name="baselineVersionId" placeholder="Copy the immutable version ID from an issued Entry report"/>
    </label>
    <button className="primary" disabled={nav.state!=='idle'||!orders.length}>Create report</button>
   </Form>
  </section>}
  {isStaff&&<section className="panel stack-sm" aria-label="Report template parity">
   <h2>Retained report template coverage</h2>
   <p className="small muted">{reportTemplateParitySummary().routedServices} of {reportTemplateParitySummary().totalServices} services have a Report Tool template mapping across {reportTemplateParitySummary().retainedTemplates} retained templates. Template selection is not proof of layout, photo, Unicode or PDF fidelity. Independent sample-by-sample review is still required.</p>
   <details><summary>Inspect all retained template mappings</summary>
    <div className="table-scroll"><table>
     <thead><tr><th scope="col">Retained template</th><th scope="col">Mapped services</th><th scope="col">Native report families</th><th scope="col">Fidelity status</th></tr></thead>
     <tbody>{REPORT_TEMPLATE_PARITY.map(item=><tr key={item.template}>
      <th scope="row">{item.template}</th>
      <td>{item.serviceIds.length?item.serviceIds.join(', '):'Not mapped to a current service'}</td>
      <td>{item.nativeFamilies.join(', ')||'Not assigned'}</td>
      <td>Requires visual acceptance</td>
     </tr>)}</tbody>
    </table></div>
   </details>
  </section>}
  <section className="panel">
   <h2>{isStaff?'Reporting register':'Available reports'}</h2>
   {result.reports?.length?<div className="stack-sm">{result.reports.map((r:any)=><div className="list-row" key={r.id}>
    <div><p><strong>{r.work_order_reference}</strong> — {r.report_type} ({r.profile})</p><p className="small muted">Status: {r.status}</p></div>
    <div className="actions"><Link to={`${d.workspace.href}/reports/${r.id}`} className="button secondary small">{isStaff?'Open report':'View report'}</Link>
    {r.issued_document_id&&<a className="button secondary small" href={`/api/w/${d.workspace.kind}/${d.workspace.scopeId}/documents/${r.issued_document_id}/download`}>Download issued PDF</a>}</div>
   </div>)}</div>:<EmptyState title="No reports yet" description="Reports will appear after creation or authorised issuance."/>}
  </section>
 </div>;
}
