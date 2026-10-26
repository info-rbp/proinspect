import {useEffect,useState} from 'react';
import type {LegalPurpose} from '../../../../packages/legal-policy';
type Requirement={enabled:boolean;ready:boolean;documents:Array<{id:string;title:string;version_label:string;content_sha256:string;href:string;acknowledgement:string}>};
/** Server validates the same exact versions again and binds receipts to the transaction. */
export function LegalAcceptance({purpose}:{purpose:LegalPurpose}){
 const [data,setData]=useState<Requirement|null>(null),[checked,setChecked]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{const c=new AbortController();setData(null);setChecked(false);setError(false);fetch('/api/legal/requirements?purpose='+encodeURIComponent(purpose),{credentials:'same-origin',signal:c.signal}).then(async r=>{if(!r.ok)throw Error();return r.json() as Promise<Requirement>;}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(true)});return()=>c.abort();},[purpose]);
 if(data&&!data.enabled)return null;
 const ready=data?.ready===true;
 return <section className="stack legal-acceptance" aria-label="Applicable terms and privacy notice">
 <h3>Review the applicable documents</h3>
 {data?.documents.map(d=><p key={d.id}><a href={d.href} target="_blank" rel="noopener noreferrer">{d.title}</a> <small>Version {d.version_label}</small></p>)}
 {!ready&&<p role="status">{error?'Documents could not be loaded. Reload before submitting.':data?'The required approved documents are not yet available.':'Loading current document versions...'}</p>}
 <label className="checkbox"><input type="checkbox" required checked={checked} disabled={!ready} onChange={e=>setChecked(e.target.checked)}/><span>I acknowledge the privacy notice and accept the applicable service and platform terms shown above. This does not enrol me in marketing.</span></label>
 <input type="hidden" name="legalConsent" value={JSON.stringify({acknowledged:checked,documents:data?.documents.map(d=>({id:d.id,sha256:d.content_sha256}))??[]})}/>
 </section>;
}
