import { paidResidentialCoverage } from '../../packages/authorization/subscription-booking';
import { handleApi } from '../../apps/platform/worker/api';
import { beginGuest } from '../../apps/platform/worker/features/guest.server';
import { dispatchBondAlerts } from '../../apps/platform/worker/features/bond-alerts.server';
import type { Env } from '../../packages/database/types';
export { BookingScheduler } from '../../apps/platform/worker/scheduler';
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if((env.APP_ENV==='local'||env.BUILD_SHA==='isolated-live-test-fixture') && new URL(request.url).pathname==='/__test__/residential-coverage'){
      const url=new URL(request.url);
      return paidResidentialCoverage(env,url.searchParams.get('client')??'',url.searchParams.get('property')??'').then(covered=>Response.json({covered}));
    }
    // Test-only historic order setup. Live POST /api/guest/requests stays retired.
    // Historical guest token management must remain independently regression-tested.
    if(env.APP_ENV==='local' && new URL(request.url).pathname==='/__test__/historical-guest-create' && request.method==='POST')
      return beginGuest(request,env).then(order=>Response.json(order,{status:201}));
    if(env.APP_ENV==='local' && new URL(request.url).pathname==='/__test__/guest-disabled')
      return handleApi(new Request(new URL('/api/guest/requests',request.url),request),{...env,GUEST_BOOKINGS_ENABLED:'false'},ctx);
    if(env.APP_ENV==='local' && new URL(request.url).pathname==='/__test__/bond-deadlines/dispatch')
      return dispatchBondAlerts(env).then(result=>Response.json(result));
    return handleApi(request, env, ctx);
  },
};
