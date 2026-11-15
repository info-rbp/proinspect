import {OperationForm,Panel,Input,Select,choices} from './OperationForm';
type Document={id:string;filename:string;category:string;size_bytes:number;sha256:string;state:string;stored_at:string|null;delete_after:string};
type Package={id:string;status:string;sent_at:string|null;expires_at:string;error_code:string|null};
export function TemporaryRentalDocuments({applicationId,documents,packages,administrator,submitted}:{applicationId:string;documents:Document[];packages:Package[];administrator:boolean;submitted:boolean}){
 const base='/api/staff/rental-applications/'+applicationId+'/temporary-documents';
 return <Panel title="Temporary supporting documents" description="Encrypted transit copies. Automatic scanning is not enabled. Quarantined files must be scanned on a managed device and approved before landlord sharing.">
  {documents.length===0?<p>No temporary files attached.</p>:documents.map(doc=><article className="panel stack" key={doc.id}>
   <h3>{doc.filename}</h3><p className="small">{doc.category.replaceAll('_',' ')} · {(doc.size_bytes/1048576).toFixed(2)} MB · {doc.state} · Expires {new Date(doc.delete_after).toLocaleString('en-AU')}</p>
   {!doc.stored_at&&<p role="status">Upload has not finished. Do not approve or share this file.</p>}
   {administrator&&submitted&&doc.stored_at&&doc.state==='quarantined'&&<>
    <form method="post" action={base+'/'+doc.id+'/security-download'} target="_blank" className="stack">
     <label><input type="checkbox" name="acknowledge" value="yes" required/> I will download this unscanned file only to a managed device for antivirus checking. I will not email it, open it in an unsafe application or submit it to a public scanning service.</label>
     <button className="button secondary" type="submit">Download quarantined file for antivirus checking</button>
    </form>
    <OperationForm endpoint={base+'/'+doc.id+'/review'} defaults={{sha256:doc.sha256}} label="Record actual antivirus result">
     <p className="small">Record the result for this exact file. A successful upload is not an antivirus result.</p>
     <Select name="decision" label="Result and sharing decision" options={choices(['approved','rejected'])}/>
     <Input name="engine" label="Antivirus product and version"/>
     <Input name="definitionsAt" type="datetime-local" label="Antivirus definitions updated"/>
     <Input name="scannedAt" type="datetime-local" label="File scanned at"/>
     <Input name="evidenceReference" label="Internal antivirus scan evidence reference"/>
     <label><input type="checkbox" name="confirmManagedDevice" value="true" required/> The check ran on a managed device without public document submission.</label>
     <label><input type="checkbox" name="confirmAntivirusResult" value="true" required/> I checked the actual antivirus result and file SHA-256 against this document.</label>
     <p className="small" style={{overflowWrap:'anywhere'}}>SHA-256: {doc.sha256}</p>
    </OperationForm>
   </>}
  </article>)}
  <h3>Landlord application package</h3><p>After security review, email a private application link to the listing’s verified landlord or representative with ProInspect copied. No files are attached. Access ends seven days after the email provider accepts sending; successful sending does not prove inbox delivery.</p>
  {packages.map(pkg=><p key={pkg.id} className="small">{pkg.status}{pkg.error_code?' · '+pkg.error_code:''} · {pkg.sent_at?'Sent '+new Date(pkg.sent_at).toLocaleString('en-AU'):'Not sent'} · Link expires {new Date(pkg.expires_at).toLocaleString('en-AU')}</p>)}
  {administrator&&packages.map(pkg=><div key={pkg.id} className="stack">{pkg.status==='failed'&&!pkg.sent_at&&<OperationForm endpoint={'/api/staff/rental-applications/'+applicationId+'/temporary-package/'+pkg.id+'/retry'} label="Retry the same private package email"><p className="small">The same provider idempotency key is retained. Older or uncertain sends require provider reconciliation.</p></OperationForm>}<OperationForm endpoint={'/api/staff/rental-applications/'+applicationId+'/temporary-package/'+pkg.id+'/revoke'} label="Revoke this package link"><p className="small">Ends link access immediately. It cannot recall a file already downloaded by a recipient.</p></OperationForm></div>)}
  {administrator&&submitted&&packages.length===0&&<OperationForm endpoint={'/api/staff/rental-applications/'+applicationId+'/temporary-package'} label="Email private package to verified landlord and copy ProInspect">
   <label><input name="confirmAuthority" type="checkbox" value="true" required/> I verified the current property-management authority and applicant sharing declarations.</label>
   <label><input name="confirmRecipients" type="checkbox" value="true" required/> I checked the listing’s verified landlord destination and the configured ProInspect copy address.</label>
   <label><input name="confirmSecurityReview" type="checkbox" value="true" required/> Every file included has a recorded current antivirus check and sharing approval.</label>
  </OperationForm>}
 </Panel>;
}
