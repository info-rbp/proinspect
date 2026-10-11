/**
 * Encrypted, opt-in offline inspection drafts and JPEG queue.
 * Keys are derived from an explicit device passphrase and NEVER persisted.
 * Server permission, evidence review and optimistic revision checks remain authoritative.
 */
export interface OfflineScope {userId:string;kind:string;scopeId:string;reportId:string;}
export interface OfflineDraft {revision:number;content:unknown;operationId:string;}
interface CipherRecord {id:string;salt:Uint8Array;iv:Uint8Array;cipher:Uint8Array;savedAt:string;}
interface PhotoRecord extends CipherRecord {areaId:string;componentId:string;fileName:string;}
const encoder=new TextEncoder(),decoder=new TextDecoder();
const keyFor=(scope:OfflineScope)=>[scope.userId,scope.kind,scope.scopeId,scope.reportId].join('::');
async function derive(passphrase:string,salt:Uint8Array){
 if(passphrase.length<12)throw new Error('Use a device passphrase of at least 12 characters.');
 const material=await crypto.subtle.importKey('raw',encoder.encode(passphrase),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:180000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function encryptOffline(payload:Uint8Array,passphrase:string,aad:string):Promise<CipherRecord>{
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12)),key=await derive(passphrase,salt);
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:iv as BufferSource,additionalData:encoder.encode(aad)},key,payload as BufferSource);
 return {id:aad,salt,iv,cipher:new Uint8Array(cipher),savedAt:new Date().toISOString()};
}
export async function decryptOffline(record:CipherRecord,passphrase:string,aad:string):Promise<Uint8Array>{
 if(record.id!==aad)throw new Error('This offline record belongs to another reporting context.');
 const key=await derive(passphrase,record.salt);
 const result=await crypto.subtle.decrypt({name:'AES-GCM',iv:record.iv as BufferSource,additionalData:encoder.encode(aad)},key,record.cipher as BufferSource);
 return new Uint8Array(result);
}
function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined')return reject(new Error('Offline storage is not available in this browser.'));
  const req=indexedDB.open('proinspect-encrypted-report-drafts',1);
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('drafts'))db.createObjectStore('drafts',{keyPath:'id'});
   if(!db.objectStoreNames.contains('photos'))db.createObjectStore('photos',{keyPath:'id'});};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
}
async function tx<T>(name:'drafts'|'photos',mode:IDBTransactionMode,fn:(s:IDBObjectStore,done:(v:T)=>void)=>void):Promise<T>{
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tr=db.transaction(name,mode),store=tr.objectStore(name);let value:T;
  tr.oncomplete=()=>{db.close();resolve(value);};tr.onerror=()=>{db.close();reject(tr.error);};tr.onabort=()=>{db.close();reject(tr.error);};
  try{fn(store,v=>{value=v;});}catch(e){tr.abort();reject(e);}
 });
}
export async function saveOfflineDraft(scope:OfflineScope,passphrase:string,draft:OfflineDraft){
 const key=keyFor(scope),sealed=await encryptOffline(encoder.encode(JSON.stringify(draft)),passphrase,key);
 await tx<void>('drafts','readwrite',(store)=>{store.put(sealed);});
 return sealed.savedAt;
}
export async function restoreOfflineDraft(scope:OfflineScope,passphrase:string):Promise<OfflineDraft|null>{
 const key=keyFor(scope),record=await tx<CipherRecord|undefined>('drafts','readonly',(store,done)=>{
  const req=store.get(key);req.onsuccess=()=>done(req.result as CipherRecord|undefined);
 });
 if(!record)return null;
 return JSON.parse(decoder.decode(await decryptOffline(record,passphrase,key))) as OfflineDraft;
}
export async function removeOfflineDraft(scope:OfflineScope){
 await tx<void>('drafts','readwrite',(store)=>{store.delete(keyFor(scope));});
}
export async function queueOfflinePhoto(scope:OfflineScope,passphrase:string,file:File,areaId:string,componentId=''){
 if(file.type!=='image/jpeg'||file.size>5*1024*1024)throw new Error('Offline evidence must be a JPEG smaller than 5 MB.');
 const id='photo_'+crypto.randomUUID(),key=keyFor(scope)+'::'+id;
 const sealed=await encryptOffline(new Uint8Array(await file.arrayBuffer()),passphrase,key);
 const record:PhotoRecord={...sealed,areaId,componentId,fileName:file.name};
 await tx<void>('photos','readwrite',store=>{store.put(record);});return id;
}
export async function syncOfflineDraft(scope:OfflineScope,passphrase:string,apiBase:string):Promise<{revision:number;replayed?:boolean}|null>{
 const draft=await restoreOfflineDraft(scope,passphrase);if(!draft)return null;
 const response=await fetch(apiBase+'/reports/'+encodeURIComponent(scope.reportId)+'/sync',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});
 if(response.status===409)throw new Error('The report changed on the server. Keep your encrypted copy and reconcile before submitting.');
 if(!response.ok)throw new Error('Offline draft could not be synchronised. It remains encrypted on this device.');
 const result=await response.json() as {revision:number;replayed?:boolean};
 await removeOfflineDraft(scope);return result;
}
export async function syncOfflinePhotos(scope:OfflineScope,passphrase:string,apiBase:string):Promise<number>{
 const prefix=keyFor(scope)+'::';
 const all=await tx<PhotoRecord[]>('photos','readonly',(store,done)=>{
  const req=store.getAll();req.onsuccess=()=>done((req.result as PhotoRecord[]).filter(x=>x.id.startsWith(prefix)));
 });
 let saved=0;
 for(const photo of all){
  const raw=await decryptOffline(photo,passphrase,photo.id);
  const form=new FormData();form.set('areaId',photo.areaId);if(photo.componentId)form.set('componentId',photo.componentId);
  form.set('file',new File([raw as BlobPart],photo.fileName,{type:'image/jpeg'}));
  const response=await fetch(apiBase+'/reports/'+encodeURIComponent(scope.reportId)+'/evidence',{method:'POST',credentials:'same-origin',body:form});
  if(!response.ok)throw new Error('Evidence sync stopped. Remaining photos stay encrypted and pending; check report permissions and revision.');
  await tx<void>('photos','readwrite',store=>{store.delete(photo.id);});saved++;
 }
 return saved;
}
