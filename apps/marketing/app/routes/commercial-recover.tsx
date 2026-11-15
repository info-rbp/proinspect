import { Form,Link,data,useLoaderData,useActionData,type LoaderFunctionArgs,type ActionFunctionArgs } from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { commercialReady,commercialRecover,commercialPrivateHeaders } from '../../../platform/worker/features/commercial-intake.server';
import { Turnstile } from '../../../../packages/ui/Turnstile';
import { boundedText } from '../../../../packages/http-bodies';
import '../../../../packages/ui/rental-application.css';
export const meta=()=>[{title:'Recover private commercial application access | ProInspect'},{name:'robots',content:'noindex, nofollow, noarchive'}];
export async function loader({context}:LoaderFunctionArgs){const env=platformEnv(context);return data({enabled:await commercialReady(env),siteKey:env.MARKETING_TURNSTILE_SITE_KEY},{headers:commercialPrivateHeaders});}
export async function action({request,context}:ActionFunctionArgs){
 const env=platformEnv(context);
 if(request.headers.get('Origin')!==new URL(request.url).origin)return data({error:'Reload before submitting.'},{status:403,headers:commercialPrivateHeaders});
 try{const f=new URLSearchParams(await boundedText(request,12000));await commercialRecover(env,request,{reference:f.get('reference'),email:f.get('email')},String(f.get('turnstile')??''));return data({sent:true},{headers:commercialPrivateHeaders});}
 catch{return data({error:'Access recovery is unavailable. Check your details or contact info@proinspect.systems.'},{status:422,headers:commercialPrivateHeaders});}
}
export default function CommercialRecover(){const d=useLoaderData<typeof loader>(),r=useActionData<typeof action>();
 return <div className="rental-shell"><div className="site-container"><section className="rental-paper"><h1>Recover your private application access</h1><p>Enter your commercial application reference and the email address used for your own participant record. A new link revokes earlier links and sessions.</p>
  {!d.enabled?<p role="status">Online access is unavailable. Contact info@proinspect.systems for a private access or correction request.</p>:r&&'sent' in r?<p role="status">If a matching eligible record exists, a new private link has been sent. This message does not confirm an application record.</p>:<Form method="post" className="rental-form"><label>Application reference<input name="reference" required minLength={7} maxLength={100}/></label><label>Your private email<input type="email" name="email" required maxLength={254}/></label><Turnstile siteKey={d.siteKey} action="commercial_application"/>{r&&'error' in r&&<p role="alert">{r.error}</p>}<button className="button">Request new access</button></Form>}<Link to="/leasing">Return to leasing</Link>
 </section></div></div>;
}
