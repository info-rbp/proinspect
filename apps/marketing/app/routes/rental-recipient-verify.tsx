import { Form, useActionData,type ActionFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
import type { Env } from '../../../../packages/database/types';
import { verifyRecipient } from '../../../platform/worker/features/rental-governance.server';
export const meta=()=>[{title:'Verify application recipient | ProInspect'},{name:'robots',content:'noindex,nofollow'},{name:'referrer',content:'no-referrer'}];
export async function action({request,context,params}:ActionFunctionArgs){
 const env=context.get(runtimeContext).env as Env;
 if(request.headers.get('Origin')!==new URL(request.url).origin)return {verified:false};
 try{return await verifyRecipient(env,params.token??'');}catch{return {verified:false};}
}
export default function RecipientVerify(){
 const result=useActionData<typeof action>();
 return <main className="site-container section"><h1>Verify application recipient</h1>
 <p>Confirm that you control the nominated recipient email address. Verification does not grant access to applicant records or approve processing authority.</p>
 {result?<p role="status">{result.verified?'Recipient verified. Administrator approval is still required.':'The verification link is invalid, expired or used.'}</p>:
 <Form method="post"><button className="button" type="submit">Verify my email address</button></Form>}
 </main>;
}
