import { Form,Link,useLoaderData,useActionData,type ActionFunctionArgs,type LoaderFunctionArgs,data } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { recoverRentalAccess } from '../../../platform/worker/features/rental-applications.server';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import '../../../../packages/ui/rental-application.css';
export const meta=()=>[{title:'Recover rental application access | ProInspect'},{name:'robots',content:'noindex,nofollow'},{name:'referrer',content:'no-referrer'}];
const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'};
export async function loader({context}:LoaderFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 return data({siteKey:env.MARKETING_TURNSTILE_SITE_KEY??''},{headers});
}
export async function action({request,context}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 if(request.headers.get('Origin')!==new URL(request.url).origin)return data({received:false,error:'Reload and try again.'},{status:403,headers});
 const raw=await request.text();
 if(raw.length>6000)return data({received:false,error:'The form is too large.'},{status:413,headers});
 const form=new URLSearchParams(raw);
 try{
  await recoverRentalAccess(env,request,{reference:form.get('reference'),email:form.get('email')},form.get('turnstile')||undefined);
  return data({received:true},{headers});
 }catch{return data({received:true},{headers});}
}
export default function RentalRecovery(){
 const {siteKey}=useLoaderData<typeof loader>(),result=useActionData<typeof action>();
 return <main className="site-container rental-shell"><section className="rental-paper" style={{maxWidth:620,margin:'2rem auto'}}>
  <p className="eyebrow">Private applicant access</p><h1>Recover rental application access</h1>
  <p>Use the application reference and the individual email address you originally provided. This service can also restore access needed to request correction or erasure after an application was submitted.</p>
  {result?.received?<p role="status" className="rental-success">If your details match an available application, a fresh private access link will be sent to that email address.</p>:
   <Form method="post" className="rental-form">
    <label className="rental-field">Application reference<input name="reference" required minLength={7} maxLength={100}/></label>
    <label className="rental-field">Your email<input type="email" name="email" required/></label>
    <Turnstile siteKey={siteKey} action="rental_application"/>
    <button className="button" type="submit">Request private access link</button>
   </Form>}
  <p><Link to="/properties-for-lease/residential">Return to residential properties</Link></p>
 </section></main>;
}
