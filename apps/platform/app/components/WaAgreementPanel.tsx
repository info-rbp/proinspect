import {useWorkspace,workspaceApi} from '../lib/workspace';
import {OperationForm,Input,TextArea,Panel,Select} from './OperationForm';
export type AgreementView={
 exists:boolean;enabled:boolean;status?:string;version?:number;sourceDocumentId?:string;
 sourceSha256?:string;executedDocumentId?:string;templateVersion?:string;
 signers?:{user_id:string;role:string;display_name:string;status:string;consented_at:string|null}[];
 me?:{role:string;status:string}|null;
};
export function WaAgreementPanel({caseId,tenancyId,caseStatus,agreement,tenantMembers,issuedDocuments}:{
 caseId:string;tenancyId:string;caseStatus:string;agreement:AgreementView;
 tenantMembers:{user_id:string;display_name:string;email:string;ends_at:string|null}[];
 issuedDocuments:{id:string;title:string;tenancy_id:string;status:string}[];
}){
 const workspace=useWorkspace(),w=workspace.workspace,base=workspaceApi(w.kind,w.scopeId);
 const manager=['landlord','property-manager','staff'].includes(w.kind);
 const doc=(id:string)=>`/api/w/${w.kind}/${w.scopeId}/documents/${id}/download`;
 return <Panel title="Form 1AA — Signatures, approvals and completed agreement"
 description="Every named tenant and the authorised lessor must review the exact official document. Recorded signing intent does not itself digitally sign the PDF.">
  <div className="stack">
   {!agreement.enabled&&<p role="status"><strong>Signing disabled pending statutory approval.</strong> Official template mapping, accepted signature method, provider testing and delivery/service policy must first be approved.</p>}
   {!agreement.exists&&<div className="stack">
    <p>Prepare the official Form 1AA, obtain independent review, and issue the approved PDF to this tenancy before inviting signers.</p>
    {agreement.enabled&&manager&&w.kind!=='staff'&&caseStatus==='document_issued'&&
     <OperationForm endpoint={`${base}/wa-forms/${caseId}/agreement/start`} label="Send signing invitations">
      {tenantMembers.filter(m=>!m.ends_at).map(m=><label key={m.user_id}>
       <input type="checkbox" name="tenantUserIds" value={m.user_id} defaultChecked/>
       {m.display_name||m.email} — verified tenancy member
      </label>)}
      <input type="hidden" name="lessorUserId" value={workspace.user.id}/>
      <Input name="reviewReference" label="Reviewed official agreement and authority reference"/>
     </OperationForm>}
   </div>}
   {agreement.exists&&<div className="stack">
    <p><strong>Status: {agreement.status?.replaceAll('_',' ')}</strong> · Official edition {agreement.templateVersion}</p>
    <p className="small">Signed version binding: <code>{agreement.sourceSha256}</code></p>
    {agreement.sourceDocumentId&&<a className="button secondary" href={doc(agreement.sourceDocumentId)}>Review official agreement PDF</a>}
    {agreement.signers?.map(p=><div className="record-row" key={p.user_id}>
      <span>{p.display_name||p.role} ({p.role})</span><strong>{p.status}</strong>
    </div>)}
    {agreement.enabled&&agreement.status==='collecting'&&agreement.me?.status==='pending'&&
     <OperationForm endpoint={`${base}/wa-forms/${caseId}/agreement/consent`}
      defaults={{version:agreement.version,sha256:agreement.sourceSha256,
       intent:'I agree to sign this reviewed agreement electronically'}} label="Confirm my signing intent">
      <Input name="typedName" label="Your full legal name"/>
      <label><input type="checkbox" name="consent" value="true" required/> I have reviewed the exact official PDF and consent to this signing method.</label>
     </OperationForm>}
    {agreement.status==='all_consented'&&<p role="status">All participants have confirmed intent. Staff must verify a separately completed, genuinely signed official PDF.</p>}
    {agreement.enabled&&w.kind==='staff'&&agreement.status==='all_consented'&&
     <OperationForm endpoint={`${base}/wa-forms/${caseId}/agreement/finalise`} defaults={{version:agreement.version}} label="Verify and issue executed copy">
      <Select name="documentId" label="Completed signed tenancy PDF" options={issuedDocuments.filter(d=>d.tenancy_id===tenancyId&&d.status==='issued'&&d.id!==agreement.sourceDocumentId).map(d=>({value:d.id,label:d.title}))}/>
      <Select name="method" label="Actual signature method" options={[{value:'wet_ink',label:'Wet ink'},{value:'stylus',label:'Stylus'},{value:'external_provider',label:'Verified external signing provider'}]}/>
      <Input name="evidenceReference" label="Actual signing evidence reference"/>
      <Input name="reviewReference" label="Independent Staff completion review reference"/>
     </OperationForm>}
    {agreement.status==='executed'&&agreement.executedDocumentId&&<div>
      <p role="status">Executed copy verified and notification requests queued. Record delivery separately.</p>
      <a className="button secondary" href={doc(agreement.executedDocumentId)}>Download completed agreement</a>
    </div>}
    {agreement.enabled&&manager&&['collecting','all_consented'].includes(agreement.status??'')&&
     <OperationForm endpoint={`${base}/wa-forms/${caseId}/agreement/void`} defaults={{version:agreement.version}} label="Void pending signing">
      <TextArea name="reason" label="Reason the document must be replaced"/>
     </OperationForm>}
   </div>}
  </div>
 </Panel>;
}
