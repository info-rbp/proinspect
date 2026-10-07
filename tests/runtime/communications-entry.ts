// Test harness only. None of these routes is exported by a production Worker.
import {handleApi} from '../../apps/platform/worker/api';
import {dispatchNotices} from '../../packages/notifications/notices';
import {deliverEvent} from '../../packages/notifications/server';
import type {Env} from '../../packages/database/types';
export {BookingScheduler} from '../../apps/platform/worker/scheduler';
export default {
 async fetch(request:Request,env:Env,ctx:ExecutionContext){
 const url=new URL(request.url);
 if(url.pathname==='/__test/dispatch'){await dispatchNotices(env);return Response.json({ok:true});}
 if(url.pathname==='/__test/deliver'){try{await deliverEvent(env,url.searchParams.get('event')!);return Response.json({ok:true});}catch{return Response.json({ok:false},{status:503});}}
 return handleApi(request,env,ctx);
 }
};
