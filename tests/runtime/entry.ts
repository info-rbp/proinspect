import { dispatchDueNotices } from '../../packages/notifications/notices';
import { deliverEvent } from '../../packages/notifications/server';
import { handleApi } from '../../apps/platform/worker/api';
import type { Env } from '../../packages/database/types';
export { BookingScheduler } from '../../apps/platform/worker/scheduler';
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (new URL(request.url).pathname === '/__test/notice-tick')
      return dispatchDueNotices(env).then(Response.json);
    if (new URL(request.url).pathname.startsWith('/__test/mail/'))
      return deliverEvent(env, new URL(request.url).pathname.split('/').pop()!).then(() =>
        Response.json({ ok: true }),
      );
    return handleApi(request, env, ctx);
  },
};
