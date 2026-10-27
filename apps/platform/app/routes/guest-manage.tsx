import {LegalAcceptance} from '../components/LegalAcceptance';
import {useEffect,useRef,useState} from 'react';
import {Form,useLoaderData,useActionData,useNavigation,data,type LoaderFunctionArgs,type ActionFunctionArgs} from 'react-router';
import {platformEnv} from '../../../../packages/database/context';
import {handleApi,apiError} from '../../worker/api';
export async function loader({request,context}:LoaderFunctionArgs){
 const env=platformEnv(context),token=new URL(request.url).searchParams.get('token')||'';
 try{const r=await handleApi(new Request(new URL('/api/guest/status?token='+encodeURIComponent(token),request.url)),env);
 return {order:r.ok?(await r.json() as any):null,token,checkoutAvailable:['local','staging'].includes(env.APP_ENV)&&env.STRIPE_GUEST_CHECKOUT_ENABLED==='true'&&env.STRIPE_TAX_READY==='true'};
 }catch{return {order:null,token,checkoutAvailable:false};}
}
export async function action({request,context}:ActionFunctionArgs){
 const f=await request.formData(),env=platformEnv(context);
 const number=(name:string)=>f.get(name)?Number(f.get(name)):undefined;
 try{const r=await handleApi(new Request(new URL('/api/guest/manage',request.url),{method:'POST',headers:{Origin:request.headers.get('Origin')||''},body:JSON.stringify({token:f.get('token'),legalConsent:f.get('legalConsent'),action:f.get('action'),startsAt:f.get('startsAt')||undefined,applyPcrDiscount:f.get('applyPcrDiscount')==='on',discountTotalCents:number('discountTotalCents'),appointmentTotalCents:number('appointmentTotalCents')})}),env);
 return data(await r.json(),{status:r.status});}catch(e){const r=apiError(e);return data(await r.json(),{status:r.status});}
}
const money=(n:number)=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(n/100);
type Slot={start:string;label:string;estimatedTotalCents?:number};
export default function Manage(){
 const {order,token,checkoutAvailable}=useLoaderData<typeof loader>(),result=useActionData<any>(),navigation=useNavigation();
 const [hydrated,setHydrated]=useState(false),[paymentMessage,setPaymentMessage]=useState(''),[date,setDate]=useState(''),[slots,setSlots]=useState<Slot[]>([]),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[startsAt,setStartsAt]=useState(''),[applyDiscount,setApplyDiscount]=useState(false);
 const requestSerial=useRef(0);useEffect(()=>{setHydrated(true);return()=>{requestSerial.current++;};},[]);
 const locked=!hydrated||busy||navigation.state!=='idle',campaign=order?.offerCode==='pcr100';
 const selected=slots.find(s=>s.start===startsAt),discount=order?.pcrDiscount;
 async function availability(){
  const serial=++requestSerial.current;setBusy(true);setNotice('Checking availability...');setStartsAt('');setSlots([]);
  try{const res=await fetch('/api/guest/availability?token='+encodeURIComponent(token)+'&date='+encodeURIComponent(date)),value=await res.json() as any;
   if(serial===requestSerial.current){setSlots(res.ok?value.slots||[]:[]);setNotice(res.ok?'Select a time.':value.message||'Availability unavailable.');}
  }catch{if(serial===requestSerial.current)setNotice('Availability unavailable. Try again.');}
  finally{if(serial===requestSerial.current)setBusy(false);}
 }
 async function pay(form:HTMLFormElement|null){
  if(!form?.reportValidity()||locked)return;const legalConsent=new FormData(form).get('legalConsent');setBusy(true);setPaymentMessage('Opening secure test checkout...');
  try{const response=await fetch('/api/guest/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,legalConsent})});
   const value=await response.json() as {checkoutUrl?:string;message?:string};
   if(response.ok&&value.checkoutUrl&&new URL(value.checkoutUrl).origin==='https://checkout.stripe.com')window.location.assign(value.checkoutUrl);
   else setPaymentMessage(value.message||'Payment checkout is unavailable.');
  }catch{setPaymentMessage('Payment checkout is unavailable.');}finally{setBusy(false);}
 }
 return <div className="site section"><div className="site-container"><section className="panel form-width stack">
  <h1>Manage one-off booking</h1>
  {!order?<p role="alert">Private link unavailable or expired.</p>:<>
   <p>Reference: <strong>{order.reference}</strong> - {order.status}</p>
   <p>{order.totalCents===null?'Quotation required':campaign&&!order.hasAppointment?'Starting total: '+money(order.totalCents)+' including GST. The exact total depends on your selected appointment.':'Approved service total: '+money(order.totalCents)+' including GST.'}</p>
   {result?.message&&<p role="alert">{result.message}</p>}{result?.status&&<p role="status">Current result: {result.status}</p>}
   {['verified','awaiting_appointment','confirmed'].includes(order.status)&&!(campaign&&order.hasAppointment)&&<>
    <label>Date<input type="date" value={date} disabled={locked} onChange={e=>{setDate(e.target.value);setSlots([]);setStartsAt('');}}/></label>
    <button type="button" className="button secondary" disabled={locked||!date} onClick={availability}>Check availability</button><p role="status">{notice}</p>
    <Form method="post"><fieldset disabled={locked} className="stack">
     <input type="hidden" name="token" value={token}/><input type="hidden" name="action" value={order.hasAppointment?'reschedule':'confirm'}/>
     <label>Appointment<select name="startsAt" required value={startsAt} onChange={e=>setStartsAt(e.target.value)}><option value="">Choose available time</option>{slots.map(s=><option key={s.start} value={s.start}>{s.label}{s.estimatedTotalCents!==undefined?' - '+money(s.estimatedTotalCents)+' incl GST':''}</option>)}</select></label>
     {selected?.estimatedTotalCents!==undefined&&<><input type="hidden" name="appointmentTotalCents" value={selected.estimatedTotalCents}/><p>Appointment total: <strong>{money(selected.estimatedTotalCents)}</strong> including GST.</p></>}
     {!order.hasAppointment&&discount&&<div className="panel stack"><p>You have {discount.usesRemaining} remaining discounted routine inspections for this property and verified purchaser.</p>
      <label><input type="checkbox" name="applyPcrDiscount" checked={applyDiscount} onChange={e=>setApplyDiscount(e.target.checked)}/> Apply one 20% routine-inspection benefit</label>
      {applyDiscount&&<><input type="hidden" name="discountTotalCents" value={discount.totalCents}/><p>Original total {money(discount.baseTotalCents)}; discount {money(discount.discountCents)}; amount due <strong>{money(discount.totalCents)}</strong> including GST. One benefit will be reserved with this booking.</p></>}
     </div>}
     <LegalAcceptance purpose="booking"/><button className="button" disabled={!startsAt}>{order.hasAppointment?'Reschedule':'Confirm booking'}</button>
    </fieldset></Form>
   </>}
   {campaign&&order.hasAppointment&&order.status==='confirmed'&&<p>For rescheduling, contact ProInspect so the date-specific price and any payment adjustment can be reviewed.</p>}
   {order.status==='confirmed'&&checkoutAvailable&&<form onSubmit={e=>{e.preventDefault();void pay(e.currentTarget);}}><fieldset disabled={locked} className="stack"><LegalAcceptance purpose="payment"/><button type="submit" className="button secondary">Pay for this service (sandbox)</button><p role="status">{paymentMessage}</p></fieldset></form>}
   {order.hasAppointment&&order.status==='confirmed'&&<Form method="post"><fieldset disabled={locked}><input type="hidden" name="token" value={token}/><input type="hidden" name="action" value="cancel"/><button className="button secondary">Cancel appointment</button></fieldset><p>Payment adjustments are reviewed separately. An unused discount is restored automatically only before any Checkout attempt has started.</p></Form>}
   {order.status==='quote_requested'&&<p>Awaiting a quotation. No appointment is reserved.</p>}{order.status==='review_required'&&<p>Property review required before scheduling.</p>}
  </>}
 </section></div></div>;
}
