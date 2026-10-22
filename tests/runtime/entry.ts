import { handleApi } from '../../apps/platform/worker/api';
import { dispatchBondAlerts } from '../../apps/platform/worker/features/bond-alerts.server';
import type { Env } from '../../packages/database/types';
export { BookingScheduler } from '../../apps/platform/worker/scheduler';
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if(env.APP_ENV==='local' && new URL(request.url).pathname==='/__test__/guest-disabled')
      return handleApi(new Request(new URL('/api/guest/requests',request.url),request),{...env,GUEST_BOOKINGS_ENABLED:'false'},ctx);
    if(env.APP_ENV==='local' && new URL(request.url).pathname==='/__test__/bond-deadlines/dispatch')
      return dispatchBondAlerts(env).then(result=>Response.json(result));
    return handleApi(request, env, ctx);
  },
};
