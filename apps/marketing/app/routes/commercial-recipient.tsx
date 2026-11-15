import { Form,data,useActionData,type ActionFunctionArgs } from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { commercialPrivateHeaders } from '../../../platform/worker/features/commercial-intake.server';
import { verifyCommercialRecipient } from '../../../platform/worker/features/commercial-review.server';
export const meta=()=>[{title:'Verify authorised commercial recipient | ProInspect'},{name:'robots',content:'noindex, nofollow, noarchive'},{name:'referrer',content:'strict-origin'}];
export async function action({request,params,context}:ActionFunctionArgs){
 if(request.headers.get('Origin')!==new URL(request.url).origin)return data({error:'Reload before confirming.'},{status:403,headers:commercialPrivateHeaders});
 try{await verifyCommercialRecipient(platformEnv(context),params.token??'');return data({verified:true},{headers:commercialPrivateHeaders});}
 catch{return data({error:'Verification link unavailable or expired.'},{status:404,headers:commercialPrivateHeaders});}
}
export default function CommercialRecipient(){const r=useActionData<typeof action>();return <section className="site section"><div className="site-container panel form-width"><h1>Confirm your authorised mailbox</h1>{r&&'verified' in r?<p role="status">Mailbox verified. Intake remains subject to separate authority and release approval.</p>:<Form method="post" className="form"><p>Confirm only if you are authorised by the responsible lessor to receive commercial applications for the property identified in your invitation.</p>{r&&'error' in r&&<p role="alert">{r.error}</p>}<button className="button">Confirm authorised recipient</button></Form>}</div></section>;}
