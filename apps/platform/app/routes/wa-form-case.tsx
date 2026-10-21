import { Link,useLoaderData,type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { useWorkspace,workspaceApi } from '../lib/workspace';
import { PageHeading,Badge } from '../../../../packages/ui/components';
import { OperationForm,Input,TextArea,Panel,Select } from '../components/OperationForm';

type WaCase={
 id:string;tenancyId:string;formCode:string;version:number;status:string;
 formStage:string;formInitiatorKind:string;
 decision:string|null;receiptAt:string|null;dueAt:string|null;
 dueBasis:string|null;externalStatus:string|null;noticeInvalidatedAt:string|null;
 issuedDocumentId:string|null;issueReadiness?:{ready:boolean;missing:string[]};
 events:{id:string;action:string;created_at:string;reference?:string|null}[];
 deliveries:{id:string;outcome:string;delivery_method:string;delivery_at:string}[];
 externalEvents:{id:string;action:string;external_reference:string;effective_at:string}[];
 decisions:{id:string;decision:string;explanation:string;createdAt:string}[];
};
type Template={form_code:string;version:string;approved_at:string;release_approved_at:string|null};
export const meta=()=>[{title:'WA statutory form case | ProInspect'}];
export async function loader({request,context,params}:LoaderFunctionArgs){
 const base=`/api/w/${params.kind}/${params.scopeId}`;
 const record=await loadApi(request,context,`${base}/wa-forms/${params.caseId}`) as WaCase;
 const data=await loadApi(request,context,`${base}/tenancies/${params.tenancyId}/wa-forms`) as {
  definitions:{code:string;name:string}[];
 };
 const library=params.kind==='staff' ? await loadApi(request,context,base+'/wa-form-templates') as {templates:Template[]} : {templates:[] as Template[]};
 return {record,definitions:data.definitions,templates:library.templates};
}
const manualRequirements=[
 'verified_prior_form_21','statutory_grounds_review','legal_service_review',
 'verified_rent_ledger','verified_grounds','verified_entry_purpose',
 'service_window_review','official_signature_policy',
];
const options=(values:string[])=>values.map(v=>({value:v,label:v.replaceAll('_',' ')}));
export default function WaFormCase() {
 const d=useLoaderData<typeof loader>(),w=useWorkspace().workspace,workspace=useWorkspace();
 const c=d.record,base=workspaceApi(w.kind,w.scopeId),staff=w.kind==='staff';
 const manager=staff||['landlord','property-manager'].includes(w.kind);
 const selectedDocuments=workspace.documents.filter((doc:any)=>
  doc.tenancy_id===c.tenancyId&&doc.status==='issued');
 const templateOptions=d.templates.filter(t=>t.form_code===c.formCode&&t.release_approved_at)
   .map(t=>({value:t.version,label:`${t.version} (reviewed ${t.approved_at.slice(0,10)})`}));
 const label=d.definitions.find(f=>f.code===c.formCode)?.name??c.formCode;
 return <div className="stack">
   <PageHeading title={label}
    description="Form preparation, decisions, official document evidence and external lodgement are separate actions. None alone establishes legal validity."/>
   <div className="actions"><Link to={`${w.href}/tenancies/${c.tenancyId}/wa-forms`}>Back to WA forms</Link>
      {staff&&<Link to={`${w.href}/wa-form-templates`}>Official template library</Link>}</div>
   <Panel title="Current form status">
    <Badge status={c.status}/><p className="small">Reference: {c.id} · Version {c.version}</p>
    {c.dueAt&&<p>Advisory response date: {new Date(c.dueAt).toLocaleString('en-AU',{timeZone:'Australia/Perth'})}</p>}
    {c.noticeInvalidatedAt&&<p>Linked inspection has changed. Recheck notice date, issue and service evidence.</p>}
    {c.decision&&<p>Recorded response: {c.decision}</p>}
    {c.externalStatus&&<p>Recorded external status: {c.externalStatus}</p>}
    {c.issuedDocumentId&&<p>Issued document: {c.issuedDocumentId}</p>}
    {c.issueReadiness&&<p className="small">Issue prerequisites: {c.issueReadiness.ready?'Recorded':'Outstanding: '+c.issueReadiness.missing.join(', ')}</p>}
   </Panel>
   {c.status==='draft'&&<Panel title="Submit draft">
     <OperationForm endpoint={`${base}/wa-forms/${c.id}`} defaults={{version:c.version,status:'submitted'}}
      label="Submit request for review" />
   </Panel>}
   {w.kind==='tenant'&&c.formCode==='WA_FORM_28'&&c.status==='document_issued'&&
    <Panel title="Respond to landlord modification request">
     <OperationForm endpoint={`${base}/wa-forms/${c.id}/tenant-answer`}
       defaults={{version:c.version}} label="Record response">
      <Select name="response" label="Your response" options={[
       {value:'approved',label:'Proposed approval'},{value:'declined',label:'Decline'},
       {value:'acknowledged',label:'Acknowledged'},{value:'disputed',label:'Dispute or request clarification'}
      ]}/>
      <TextArea name="comments" label="Response details"/>
      <Input name="reference" label="Signed response / evidence reference"/>
     </OperationForm>
    </Panel>}
   {manager&&['WA_FORM_25','WA_FORM_26'].includes(c.formCode)&&!c.receiptAt
    &&['submitted','under_review','approved'].includes(c.status)&&
    <Panel title="Record actual request receipt">
      <OperationForm endpoint={`${base}/wa-forms/${c.id}/receipt`} defaults={{version:c.version}}
       label="Record verified receipt">
       <Input name="receivedAt" label="Date and time actually received" type="datetime-local"/>
       <Input name="evidenceReference" label="Source of receipt evidence"/>
      </OperationForm>
      <p className="small">Calculations are advisory and never automatically approve or refuse a request.</p>
    </Panel>}
   {manager&&c.formInitiatorKind==='tenant'&&['WA_FORM_24','WA_FORM_25','WA_FORM_26','WA_FORM_27'].includes(c.formCode)
    &&!c.decision&&['submitted','under_review','approved','document_issued'].includes(c.status)&&
    <Panel title="Landlord written decision">
     <OperationForm endpoint={`${base}/wa-forms/${c.id}/decision`} defaults={{version:c.version}} label="Record reviewed decision">
       <Select name="decision" label="Decision" options={options(['approved','approved_with_conditions','refused','information_requested'])}/>
       <TextArea name="explanation" label="Written grounds and response"/>
       <Input name="authorityReference" label="Reviewed grounds / Commissioner approval reference (where applicable)" required={false}/>
     </OperationForm>
     <p className="small">The portal decision record is not a substitute for the required written response or its lawful delivery.</p>
    </Panel>}
   {staff&&['submitted','under_review'].includes(c.status)&&<Panel title="Staff document review">
    <OperationForm endpoint={`${base}/wa-forms/${c.id}`}
      defaults={{version:c.version,status:c.status==='submitted'?'under_review':'approved'}}
      label={c.status==='submitted'?'Start Staff review':'Approve for official document preparation'}>
     <Input name="reviewReference" label="Legal/document review record"/>
    </OperationForm>
   </Panel>}
   {staff&&c.status==='approved'&&<Panel title="Issue readiness and official PDF">
     {c.issueReadiness&&!c.issueReadiness.ready&&<p>Outstanding: {c.issueReadiness.missing.join(', ')}</p>}
     {c.issueReadiness?.missing.filter(x=>manualRequirements.includes(x)).map(req=>
      <OperationForm key={req} endpoint={`${base}/wa-forms/${c.id}/verify`} defaults={{requirement:req}}
       label={'Review: '+req.replaceAll('_',' ')}>
       <Input name="evidenceReference" label="Reviewed evidence / legal basis reference"/>
      </OperationForm>)}
     <OperationForm endpoint={`${base}/wa-forms/${c.id}/issue`} label="Link issued official tenancy PDF">
       <Select name="templateVersion" label="Approved official source version" options={templateOptions}/>
       <Select name="documentId" label="Already issued tenancy PDF" options={selectedDocuments.map((doc:any)=>({
        value:doc.id,label:doc.title??doc.id
       }))}/>
       <Input name="reference" label="Authorised document review and issue reference"/>
     </OperationForm>
     <p className="small">Only uploaded, independently reviewed source templates and explicitly tenancy-issued PDFs can be used. No unofficial PDF is generated.</p>
   </Panel>}
   {staff&&['approved','document_issued','service_evidence_recorded'].includes(c.status)&&
    <Panel title="Delivery and service evidence">
     <OperationForm endpoint={`${base}/wa-forms/${c.id}/delivery`} label="Record actual delivery evidence">
      <Select name="recipientKind" label="Recipient" options={options(['tenant','landlord','authority','other'])}/>
      <Input name="recipientReference" label="Actual recipient or authority reference"/>
      <Select name="deliveryMethod" label="Delivery method" options={options(['in_person','post','email','government_portal','other'])}/>
      <Input name="deliveryAt" label="Actual dispatch / delivery evidence time" type="datetime-local"/>
      <Input name="evidenceReference" label="Independent delivery evidence reference"/>
      <Select name="outcome" label="Outcome" options={options(['attempted','delivered','rejected','unconfirmed'])}/>
     </OperationForm>
     <p className="small">Recording dispatch is not proof of lawful statutory service.</p>
    </Panel>}
   {staff&&c.issuedDocumentId&&<Panel title="Signature evidence (completed outside ProInspect)">
    <OperationForm endpoint={`${base}/wa-forms/${c.id}/signature-evidence`} label="Record verified signed-document evidence">
     <Input name="signedDocumentId" label="Already issued official signed PDF ID" value={c.issuedDocumentId}/>
     <Select name="signerKind" label="Signer identity" options={options(['tenant','landlord','staff_witness','external'])}/>
     <Select name="method" label="Verified signature method" options={options(['wet_ink','stylus','external_provider'])}/>
     <Input name="verifiedAt" label="Verification time" type="datetime-local"/>
     <Input name="evidenceReference" label="Source evidence / verification reference"/>
    </OperationForm>
    <p className="small">Manual bond release signatures require pen or stylus; ordinary e-signature software is not accepted for those forms.</p>
   </Panel>}
   {staff&&c.formStage==='bond'&&
    <Panel title="External bond authority record">
     <OperationForm endpoint={`${base}/wa-forms/${c.id}/external`} defaults={{version:c.version}}
       label="Record independently verified external event">
      <Select name="action" label="Actual external stage" options={options(['prepared','submitted','confirmed','rejected','disputed','determined','appealed','finalised'])}/>
      <Select name="provider" label="Authority / provider" options={options(['bonds_administration','magistrates_court','other'])}/>
      <Input name="externalReference" label="Bonds Administration or court transaction reference"/>
      <Input name="evidenceReference" label="Actual official confirmation/evidence reference"/>
      <Input name="effectiveAt" label="Externally recorded date and time" type="datetime-local"/>
     </OperationForm>
     <p className="small">ProInspect does not lodge or release bond money by recording this event.</p>
    </Panel>}
   {staff&&['document_issued','service_evidence_recorded','external_confirmed'].includes(c.status)&&
    <Panel title="Administrative case finalisation">
      <OperationForm endpoint={`${base}/wa-forms/${c.id}/complete`} defaults={{version:c.version}}
       label="Close recorded workflow">
       <Input name="completionReference" label="Final review and supporting evidence reference"/>
      </OperationForm>
      <p className="small">Closing a record never declares a court decision, legal notice or government transaction valid.</p>
    </Panel>}
   <Panel title="Immutable history">
    {c.events?.map(x=><div className="record-row" key={x.id}>
      <span>{x.action.replaceAll('_',' ')} · {x.created_at}</span>
    </div>)}
    {!c.events?.length&&<p>No case actions visible.</p>}
    {c.deliveries?.map(x=><div className="record-row" key={x.id}>
      <span>Delivery evidence: {x.outcome}, {x.delivery_method} · {x.delivery_at}</span>
    </div>)}
    {c.externalEvents?.map(x=><div className="record-row" key={x.id}>
      <span>External {x.action} · {x.effective_at}</span>
    </div>)}
   </Panel>
 </div>;
}
