// Test harness only: synthetic D1, fake Resend HTTP and a deterministic Cron event.
// There is no production route corresponding to these endpoints.
import { dispatchNextDayOpenHomeReports } from '../../apps/platform/worker/features/open-home-reports.server';
import { deliverEvent } from '../../packages/notifications/server';
import type { Env } from '../../packages/database/types';

export default {
 async fetch(request:Request,env:Env){
  const url=new URL(request.url);
  if(url.pathname==='/__test/cron'){
   try {
    const when=Number(url.searchParams.get('scheduledTime'));
    const value=await dispatchNextDayOpenHomeReports(env,when);
    return Response.json(value);
   }catch(e){
    return Response.json({error:e instanceof Error?e.message:'UNKNOWN_CRON_ERROR'},{status:503});
   }
  }
  if(url.pathname==='/__test/deliver'){
   try {
    await deliverEvent(env,url.searchParams.get('event')??'');
    return Response.json({ok:true});
   }catch(e){
    return Response.json({error:e instanceof Error?e.message:'UNKNOWN_DELIVERY_ERROR'},{status:503});
   }
  }
  return new Response('Not found',{status:404});
 }
};
