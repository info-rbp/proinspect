import {Link,useLoaderData,type LoaderFunctionArgs} from 'react-router';
import {loadApi} from '../lib/api.server';
import {useWorkspace,workspaceApi} from '../lib/workspace';
import {PageHeading,Badge} from '../../../../packages/ui/components';
import {OperationForm,Panel,Input,Select,TextArea,choices} from '../components/OperationForm';
import {ENQUIRY_STATES,canTransitionEnquiry} from '../../../../packages/marketing/enquiry';
export async function loader({request,context,params}:LoaderFunctionArgs) {
 return await loadApi(request,context,`/api/w/${params.kind}/${params.scopeId}/enquiries/${params.enquiryId}`) as any;
}
export default function Enquiry() {
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace,e=d.enquiry,c=d.contact;
 const api=`${workspaceApi(w.kind,w.scopeId)}/enquiries/${e.id}`;
 return <><PageHeading title={e.reference} eyebrow="Marketing enquiry" description="An enquiry is not a booking, client membership or authority to access a property."/>
 <Link to={`${w.href}/enquiries`}>Back to enquiries</Link><div className="detail-grid">
 <div className="stack"><Panel title="Customer requirements"><Badge status={e.status}/><h3>{c.name}</h3><p>{c.email}</p><p>{c.phone}</p><p>{c.organisation}</p><p>{c.suburb}</p><p>Interest: {c.kind}{c.serviceId?` / ${c.serviceId}`:''}</p><p className="preserve-lines">{c.message}</p><p className="small">Permission is limited to responding to this enquiry. No marketing subscription was created.</p></Panel>
 <Panel title="Enquiry history">{d.history.map((x:any)=><article className="record-row" key={x.id}><div><strong>{x.kind.replaceAll('_',' ')}</strong><p className="small">{x.created_at} | {x.actor_name||'Website'}</p><p className="preserve-lines">{x.message}</p>{x.delivery_status&&<p>Email delivery: {x.delivery_status}{x.error_code?` (${x.error_code})`:''}</p>}</div></article>)}</Panel></div>
 <div className="stack"><Panel title="Triage and assignment"><OperationForm key={`triage-${e.version}`} endpoint={api} defaults={{version:e.version}} label="Save enquiry status"><Select name="status" label="Status" value={e.status} options={choices(ENQUIRY_STATES.filter(s=>canTransitionEnquiry(e.status,s)))}/><Select name="assignedUserId" label="Assigned operator" optional value={e.assigned_user_id||''} options={d.staff.map((s:any)=>({value:s.id,label:s.display_name||s.email}))}/><TextArea name="note" label="Internal note"/></OperationForm></Panel>
 {!['closed','spam'].includes(e.status)&&<Panel title="Reply to the enquiry" description={`This queues an email to ${c.email}. It does not create an account or promise an appointment.`}><OperationForm key={`reply-${e.version}`} endpoint={`${api}/reply`} defaults={{version:e.version}} label="Queue email reply" result={()=><p>Reply queued. Check the history for delivery status.</p>}><TextArea name="message" label="Reply message"/></OperationForm></Panel>}
 <Panel title="Connect a verified client" description="Linking is an internal reference only. It never grants portal membership, ownership or property access."><p>Linked account: {e.linked_client_id||'None'}</p><OperationForm endpoint={`${api}/link`} defaults={{version:e.version}} label="Record verified client link"><Input name="clientId" label="Verified existing client ID"/><Input name="reference" label="Verification reference"/></OperationForm></Panel>
 </div></div></>;
}
