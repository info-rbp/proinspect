import { useState,type ReactNode,type FormEvent } from 'react';
import { useRevalidator } from 'react-router';
export function CommercialAdminForm({endpoint,label,build,children}:{endpoint:string;label:string;build:(form:FormData)=>unknown;children:ReactNode}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),revalidator=useRevalidator();
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();if(busy)return;setBusy(true);setMessage('');
  try{const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(build(new FormData(event.currentTarget)))}),result=await response.json() as {message?:string;status?:string;requiresReconciliation?:boolean};
   if(!response.ok)throw Error(result.message||'The action could not be completed.');
   setMessage(result.requiresReconciliation?'Provider acceptance is uncertain. Reconcile the receipt before any further delivery.':'Recorded'+(result.status?': '+result.status.replaceAll('_',' '):'.'));revalidator.revalidate();
  }catch(error){setMessage(error instanceof Error?error.message:'Check the updated record before retrying.');}finally{setBusy(false);}
 }
 return <form method="post" className="stack" onSubmit={submit}><fieldset disabled={busy}>{children}<button className="button" disabled={busy}>{busy?'Recording…':label}</button></fieldset>{message&&<p role="status">{message}</p>}</form>;
}
export const adminText=(form:FormData,key:string)=>String(form.get(key)??'');
export function ReviewRecord({value}:{value:unknown}){
 if(value===null||value===undefined||value==='')return <span>Not supplied</span>;
 if(typeof value==='boolean')return <span>{value?'Yes':'No'}</span>;
 if(typeof value!=='object')return <span style={{overflowWrap:'anywhere'}}>{String(value)}</span>;
 if(Array.isArray(value))return <ol>{value.map((item,index)=><li key={index}><ReviewRecord value={item}/></li>)}</ol>;
 return <dl className="detail-grid">{Object.entries(value).filter(([key])=>!['id','personId','entityId','listingId','flowId','scope_sha256','noticeHash','snapshotHash','sha256'].includes(key)).map(([key,v])=><div key={key}><dt>{key.replace(/([A-Z])/g,' $1').replaceAll('_',' ').replace(/^./,s=>s.toUpperCase())}</dt><dd style={{marginLeft:0}}><ReviewRecord value={v}/></dd></div>)}</dl>;
}
