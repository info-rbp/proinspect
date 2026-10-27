import {useState,useEffect,type ChangeEvent} from 'react';
import {useFetcher} from 'react-router';
import type {ReportDraft} from '../../../../packages/report-engine/adapter';
import {COMPONENT_CONDITION_CATEGORIES,COMPONENT_CLEANLINESS_CATEGORIES,COMPONENT_WORKING_STATUSES} from '../../../../packages/report-engine/upstream/reportModel';

type Field = ReportDraft['areas'][number]['components'][number];
type Props={draft:ReportDraft;onChange:(draft:ReportDraft)=>void;locked:boolean;dirty:boolean;busy:boolean};
const label=(value:string)=>value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
/** Resize and re-encode camera images to a clean JPEG: camera metadata is never retained. */
export async function prepareInspectionCameraJpeg(file:File):Promise<File>{
 if(file.size===0)throw new Error('The camera photo is empty.');
 const bitmap=await createImageBitmap(file);
 try{
  const scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser cannot process the photo.');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  for(const quality of [0.84,0.7,0.55,0.4]){
   const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
   if(blob && blob.size>=24 && blob.size<=5*1024*1024)
    return new File([blob],'inspection-'+Date.now()+'.jpg',{type:'image/jpeg'});
  }
  throw new Error('The image could not be compressed below the evidence limit.');
 }finally{bitmap.close();}
}
export function InspectorFieldMode({draft,onChange,locked,dirty,busy}:Props){
 const [index,setIndex]=useState(0),[message,setMessage]=useState('');
 const [preparing,setPreparing]=useState(false);
 const photo=useFetcher<{ok?:boolean;error?:string;code?:string}>();
 const targets=draft.areas.flatMap((area,ai)=>area.components.map((component,ci)=>({area,component,ai,ci})));
 const active=Math.min(index,Math.max(0,targets.length-1));
 const target=targets[active];
 const completed=targets.filter(t=>t.component.conditionCategory!=='unable_to_confirm'&&
  t.component.conditionCategory!=='not_visible'&&t.component.conditionCategory!=='partially_visible'&&
  t.component.commentary.trim().length>0).length;
 const percent=targets.length?Math.round(100*completed/targets.length):0;
 useEffect(()=>{if(index>=targets.length&&index>0)setIndex(Math.max(0,targets.length-1));},[index,targets.length]);
 function update(field:keyof Field,value:unknown){
  if(!target||locked)return;
  onChange({...draft,areas:draft.areas.map((area,ai)=>ai!==target.ai?area:{...area,components:area.components.map((component,ci)=>
    ci!==target.ci?component:{...component,[field]:value})})});
 }
 async function capture(event:ChangeEvent<HTMLInputElement>){
  const selected=event.currentTarget.files?.[0];event.currentTarget.value='';
  if(!selected||!target)return;
  if(locked||busy||preparing||photo.state!=='idle'){setMessage('Wait for the current report action to finish before selecting another photo.');return;}
  if(dirty){setMessage('Save the current draft first, then capture evidence. This keeps photo links and report versions consistent.');return;}
  if(!navigator.onLine){setMessage('Offline. Use the encrypted offline photo queue below; synchronise before review.');return;}
  setPreparing(true);
  setMessage('Compressing and uploading the selected photo…');
  try{
   const jpeg=await prepareInspectionCameraJpeg(selected);
   const form=new FormData();
   form.set('intent','upload');form.set('file',jpeg);form.set('areaId',target.area.id);form.set('componentId',target.component.id);
   photo.submit(form,{method:'post',encType:'multipart/form-data'});
   setMessage('Photo submitted for private evidence review.');
  }catch(error){setMessage(error instanceof Error?error.message:'Could not prepare the camera photo.');}finally{setPreparing(false);}
 }
 if(!target)return <p>No components available. Add an inspection area in the full editor.</p>;
 return <section className="pi-inspector-field stack-sm" aria-label="Mobile field inspection">
   <header className="pi-inspector-header">
    <div><p className="small muted">Field capture · {active+1} of {targets.length}</p><h3>{target.area.name} — {target.component.component}</h3></div>
    <div><strong>{percent}%</strong><p className="small muted">assessed</p></div>
   </header>
   <progress className="pi-inspector-progress" aria-label="Inspection assessment progress" value={completed} max={Math.max(1,targets.length)}/>
   <label>Jump to component
    <select disabled={busy||preparing} value={active} onChange={e=>setIndex(Number(e.target.value))}>
     {targets.map((t,i)=><option key={t.area.id+'-'+t.component.id} value={i}>{t.area.name} · {t.component.component}</option>)}
    </select>
   </label>
   <fieldset className="stack-sm" disabled={locked||busy}><legend>Visible condition</legend>
    <div className="pi-inspector-chips">
     {(['intact','minor_wear','repair_required','replacement_recommended','unable_to_confirm'] as const).map(v=>
      <button key={v} type="button" aria-pressed={target.component.conditionCategory===v} className="pi-inspector-chip"
       onClick={()=>update('conditionCategory',v)}>{label(v)}</button>)}
    </div>
    <label>Detailed condition<select value={target.component.conditionCategory} onChange={e=>update('conditionCategory',e.target.value)}>
     {COMPONENT_CONDITION_CATEGORIES.map(v=><option key={v} value={v}>{label(v)}</option>)}
    </select></label>
    <label>Cleanliness<select value={target.component.cleanlinessCategory} onChange={e=>update('cleanlinessCategory',e.target.value)}>
     {COMPONENT_CLEANLINESS_CATEGORIES.map(v=><option key={v} value={v}>{label(v)}</option>)}
    </select></label>
    <label>Working status<select value={target.component.workingStatus} onChange={e=>update('workingStatus',e.target.value)}>
     {COMPONENT_WORKING_STATUSES.map(v=><option key={v} value={v}>{label(v)}</option>)}
    </select></label>
    <label>Observation and context
     <textarea rows={4} maxLength={4000} value={target.component.commentary}
      placeholder="Describe what was actually observed. Device keyboard dictation may be used."
      onChange={e=>update('commentary',e.target.value)}/>
    </label>
    <label className="pi-inspector-check"><input type="checkbox" checked={target.component.maintenanceRequired}
      onChange={e=>update('maintenanceRequired',e.target.checked)}/> Recommend maintenance follow-up</label>
   </fieldset>
   <div className="pi-inspector-camera">
    <label>Take or select evidence photo
     <input type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment"
      disabled={locked||busy||dirty||preparing||photo.state!=='idle'} onChange={e=>void capture(e)}/>
    </label>
    <p className="small muted">{target.component.photoIds.length} linked photo(s). Images are compressed to JPEG and remain private until independently accepted.</p>
    {dirty&&<p role="status" className="small">Save draft changes before uploading a photo.</p>}
    {photo.data?.error&&<p role="alert">{photo.data.error}</p>}
    {photo.data?.ok&&<p role="status">Photo uploaded and awaiting review.</p>}
    {message&&<p role="status" className="small">{message}</p>}
   </div>
   <nav className="pi-inspector-nav actions" aria-label="Field inspection navigation">
    <button type="button" className="button secondary" disabled={busy||preparing||active===0} onClick={()=>setIndex(Math.max(0,active-1))}>Previous</button>
    <button type="button" className="button secondary" disabled={busy||preparing||active===targets.length-1} onClick={()=>setIndex(Math.min(targets.length-1,active+1))}>Next component</button>
   </nav>
   <p className="small muted">Progress indicates completed condition assessments and observations, not report approval. Every recorded condition remains subject to quality review.</p>
 </section>;
}
