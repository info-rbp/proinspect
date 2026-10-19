import { Form,Link,useActionData,type ActionFunctionArgs,type LoaderFunctionArgs,data } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { cancelLead } from '../../../platform/worker/features/leasing.server';
import { digest } from '../../../../packages/auth/crypto';
import { seo } from '../lib/seo';
export const meta=()=>seo('Cancel inspection registration','Cancel a registration for a ProInspect-conducted property open inspection.','/properties-for-lease');
export function loader({params}:LoaderFunctionArgs){if(!/^[a-f0-9]{64}$/.test(params.token??''))throw new Response('Not found',{status:404});return data({ok:true},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});}
export async function action({request,params,context}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 if(request.headers.get('Origin')!==new URL(request.url).origin)return data({error:'Reload and try again.'},{status:403});
 try{
  const key=await digest(env.DATA_ENCRYPTION_KEY+':cancel:'+(request.headers.get('CF-Connecting-IP')??'unknown'));
  await cancelLead(env,request,params.token!,key);
  return data({success:true},{headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}});
 }catch{return data({error:'The registration link is unavailable or has expired.'},{status:404,headers:{'Cache-Control':'no-store'}});}
}
export default function Cancel(){const result=useActionData<typeof action>();return <section className="section"><div className="site-container"><div className="panel" style={{maxWidth:580}}><h1>Cancel inspection registration</h1>{result?.success?<p role="status">Your registration has been cancelled.</p>:<><p>Use this page only if you no longer intend to attend the booked open inspection. This does not withdraw a rental application.</p>{result?.error&&<p role="alert">{result.error}</p>}<Form method="post"><button className="button">Confirm cancellation</button></Form></>}<p><Link to="/properties-for-lease">Return to property listings</Link></p></div></div></section>}
