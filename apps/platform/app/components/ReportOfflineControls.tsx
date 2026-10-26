import {useState,type ChangeEvent} from 'react';
import {useWorkspace} from '../lib/workspace';
import {
  saveOfflineDraft,restoreOfflineDraft,removeOfflineDraft,queueOfflinePhoto,
  syncOfflineDraft,syncOfflinePhotos,purgeOfflineWorkspace,type OfflineScope
} from '../lib/report-offline';
import type {ReportDraft} from '../../../../packages/report-engine/adapter';

/** Offline storage is opt-in. The passphrase is never saved or submitted to the server. */
export function ReportOfflineControls(props:{
 reportId:string;revision:number;draft:ReportDraft;onRestore:(draft:ReportDraft)=>void;
}) {
 const d=useWorkspace();
 const [phrase,setPhrase]=useState('');
 const [status,setStatus]=useState('');
 const [busy,setBusy]=useState(false);
 const [target,setTarget]=useState('');
 const scope:OfflineScope={userId:d.user.id,kind:d.workspace.kind,scopeId:d.workspace.scopeId,reportId:props.reportId};
 const base='/api/w/'+encodeURIComponent(scope.kind)+'/'+encodeURIComponent(scope.scopeId);
 const ready=phrase.length>=12&&!busy;
 async function action(fn:()=>Promise<void>){
  setBusy(true);setStatus('');
  try{await fn();}catch(e){setStatus(e instanceof Error?e.message:'The offline action could not be completed.');}
  finally{setBusy(false);}
 }
 async function restore(){
  const saved=await restoreOfflineDraft(scope,phrase);
  if(!saved){setStatus('No offline copy exists for this report and workspace.');return;}
  if(saved.revision!==props.revision){
   setStatus('The server report has a different revision. Your encrypted copy remains on this device. Review differences before applying changes.');
   return;
  }
  if(!saved.content||typeof saved.content!=='object'||!Array.isArray((saved.content as ReportDraft).areas)){
   throw new Error('The encrypted report copy has an unsupported format.');
  }
  props.onRestore(saved.content as ReportDraft);
  setStatus('Offline draft restored into the editor. Review and save it before submitting.');
 }
 const areas=props.draft.areas;
 const defaultTarget=target||areas[0]?.id||'';
 async function queueFile(event:ChangeEvent<HTMLInputElement>){
  const file=event.currentTarget.files?.[0];
  event.currentTarget.value='';
  if(!file)return;
  await action(async()=>{
   if(!ready)throw new Error('Enter a device passphrase of at least 12 characters.');
   const [areaId,componentId='']=defaultTarget.split('|');
   await queueOfflinePhoto(scope,phrase,file,areaId,componentId);
   setStatus('JPEG evidence saved encrypted on this device. Synchronise before submitting the report.');
  });
 }
 async function synchronise(){
  // Draft first: a successful photo upload increments the authoritative report revision.
  const updated=await syncOfflineDraft(scope,phrase,base);
  if(updated?.retainedNewerDraft){
   setStatus('The uploaded draft was acknowledged, but a newer encrypted copy was saved during sync. It has been retained. Reconcile that copy before synchronising photos or reloading.');
   return;
  }
  const photos=await syncOfflinePhotos(scope,phrase,base);
  setStatus((updated?'Draft synchronised. ':'')+photos+' queued photo(s) uploaded. Reloading authoritative report.');
  window.location.reload();
 }
 return <section className="panel stack-sm">
   <h3>Offline fieldwork — encrypted device copy</h3>
   <p className="small muted">Optional. Drafts and photos are encrypted in this browser using your device passphrase. ProInspect never stores the passphrase. Offline changes do not override newer server versions.</p>
   <label>Device passphrase (minimum 12 characters)
     <input type="password" autoComplete="off" minLength={12} value={phrase}
       onChange={e=>setPhrase(e.target.value)} placeholder="Passphrase for this device only"/>
   </label>
   <div className="actions">
     <button type="button" disabled={!ready} className="button secondary small" onClick={()=>action(async()=>{
       await saveOfflineDraft(scope,phrase,{revision:props.revision,content:props.draft,operationId:'offline_'+crypto.randomUUID().replaceAll('-','')});
       setStatus('Draft saved encrypted in this browser.');
     })}>Save encrypted copy</button>
     <button type="button" disabled={!ready} className="button secondary small" onClick={()=>action(restore)}>Restore offline copy</button>
     <button type="button" disabled={!ready} className="button secondary small" onClick={()=>action(synchronise)}>Synchronise</button>
   </div>
   <label>Offline photo location
    <select value={defaultTarget} onChange={e=>setTarget(e.target.value)}>
     {areas.flatMap(a=>[{id:a.id,label:a.name+' — area overview'},...a.components.map(c=>({id:a.id+'|'+c.id,label:a.name+' — '+c.component}))]).map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
    </select>
   </label>
   <label>Queue JPEG evidence while offline
     <input type="file" accept="image/jpeg" disabled={!ready} onChange={queueFile}/>
   </label>
   <div className="actions"><button type="button" className="button secondary small" disabled={busy}
     onClick={()=>action(async()=>{await purgeOfflineWorkspace(scope);setStatus('This report’s encrypted local draft and queued photos were removed from this browser.');})}>
     Remove local copies</button></div>
   {status&&<p role="status" className="small">{status}</p>}
   <p className="small muted">Do not rely on a shared or unmanaged device for sensitive inspection evidence. Always confirm successful synchronisation before review or report issue.</p>
 </section>;
}
