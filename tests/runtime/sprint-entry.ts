import { handleApi,apiError } from '../../apps/platform/worker/api';
import { requireReleaseApproval } from '../../apps/platform/worker/features/release-governance.server';
import type { Env } from '../../packages/database/types';
export { BookingScheduler } from '../../apps/platform/worker/scheduler';
// Isolated test entry only. Neither production build imports this file.
export default { async fetch(request:Request,env:Env,ctx:ExecutionContext){
 const url=new URL(request.url);
 if(env.APP_ENV==='local'&&url.pathname==='/__test__/release-check'){
  try{await requireReleaseApproval({...env,APP_ENV:'staging',BUILD_SHA:'a'.repeat(40)},'building');return Response.json({allowed:true});}catch(e){return apiError(e);}
 }
 if(env.APP_ENV==='local'&&url.pathname.startsWith('/__test__/legal/')){
  url.pathname=url.pathname.replace('/__test__/legal','');return handleApi(new Request(url,request),{...env,LEGAL_ACCEPTANCE_ENABLED:'true'},ctx);
 }
 return handleApi(request,env,ctx);
}};
