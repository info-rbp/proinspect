import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

export type ListingPhoto={id:string;alt_text?:string|null};
export function PhotoPlaceholder({text='Property photos not yet available'}:{text?:string}){
 return <div className="pi-leasing-photo-placeholder">
  <svg viewBox="0 0 48 40" width="48" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="2" y="2" width="44" height="36" rx="3"/><circle cx="34" cy="12" r="4"/><path d="M3 34 16 19l10 10 7-8 12 13"/></svg>
  <span>{text}</span>
 </div>;
}
export function ListingPhotoMedia({src,alt,priority=false}:{src:string;alt:string;priority?:boolean}){
 const [failed,setFailed]=useState(false);
 return failed?<PhotoPlaceholder text="Property photo currently unavailable"/>:
   <img src={src} alt={alt} width={900} height={600} loading={priority?'eager':'lazy'} fetchPriority={priority?'high':'auto'} decoding="async" onError={()=>setFailed(true)}/>;
}
const source=(id:string)=>'/api/public/leasing/photos/'+encodeURIComponent(id);
const alternative=(photo:ListingPhoto,index:number)=>photo.alt_text?.trim()||'Property photograph '+(index+1);

export function LeasingGallery({photos}:{photos:ListingPhoto[]}){
 const [active,setActive]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLElement|null>(null);
 const closeButton=useRef<HTMLButtonElement>(null);
 const count=photos.length;
 function open(index:number,button:HTMLElement){
   setActive(index);trigger.current=button;
   dialog.current?.showModal();
   closeButton.current?.focus();
 }
 function move(direction:number){setActive(i=>(i+direction+count)%count);}
 function keys(event:KeyboardEvent<HTMLDialogElement>){
   if(count<2)return;
   if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
     event.preventDefault();move(event.key==='ArrowLeft'?-1:1);
   }
 }
 if(!count)return <section id="leasing-gallery" className="leasing-showcase" aria-labelledby="leasing-gallery-heading"><div className="site-container">
  <h2 id="leasing-gallery-heading">Property photographs</h2>
  <div className="pi-leasing-gallery-empty"><PhotoPlaceholder/></div>
 </div></section>;
 const photo=photos[Math.min(active,count-1)];
 return <section id="leasing-gallery" className="leasing-showcase" aria-labelledby="leasing-gallery-heading"><div className="site-container">
  <div className="leasing-showcase-heading"><h2 id="leasing-gallery-heading">Property photographs</h2><span>{count} {count===1?'photo':'photos'}</span></div>
  <div className={'pi-leasing-gallery-grid'+(count===1?' single':count===2?' pair':'')}>
   {photos.slice(0,5).map((p,i)=><button key={p.id} type="button" className="pi-leasing-gallery-thumb" aria-label={'View photo '+(i+1)+' of '+count+': '+alternative(p,i)} onClick={e=>open(i,e.currentTarget)}>
    <ListingPhotoMedia key={p.id} src={source(p.id)} alt={alternative(p,i)} priority={i===0}/>
   </button>)}
  </div>
  <div className="pi-leasing-gallery-footer">
   <p className="small">Photographs supplied for this listing.</p>
   <button type="button" className="button secondary" onClick={e=>open(0,e.currentTarget)}>{count===1?'Enlarge photograph':'View all '+count+' photos'}</button>
  </div>
  <dialog ref={dialog} className="pi-leasing-lightbox" aria-labelledby="leasing-photo-viewer-title" onKeyDown={keys} onClose={()=>trigger.current?.focus()} onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}>
   <div className="pi-leasing-lightbox-content">
    <div className="pi-leasing-lightbox-top"><h2 id="leasing-photo-viewer-title">Property photographs</h2><button type="button" ref={closeButton} className="button secondary" onClick={()=>dialog.current?.close()}>Close</button></div>
    <div className="pi-leasing-lightbox-image">{photo&&<ListingPhotoMedia key={photo.id} src={source(photo.id)} alt={alternative(photo,active)}/>}</div>
    <div className="pi-leasing-lightbox-controls">
     <button type="button" className="button secondary" disabled={count<2} onClick={()=>move(-1)}>Previous photo</button>
     <p role="status" aria-live="polite">Photo {active+1} of {count}</p>
     <button type="button" className="button secondary" disabled={count<2} onClick={()=>move(1)}>Next photo</button>
    </div>
   </div>
  </dialog>
 </div></section>;
}
