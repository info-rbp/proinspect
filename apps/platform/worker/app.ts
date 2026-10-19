import { createRequestHandler, RouterContextProvider } from 'react-router';
import { runtimeContext } from '../../../packages/database/context';
import type { Env } from '../../../packages/database/types';
import { handleApi } from './api';
import { consumeQueue, dispatchOutbox } from '../../../packages/notifications/server';
import { dispatchNotices } from '../../../packages/notifications/notices';
import { dispatchIntegrations } from './features/integrations.server';
import { shouldIndexPublicPage } from '../app/lib/public-routes';
import { readOnlyCalendarDiagnostic, shouldRunCalendarReleaseProbe } from './features/google-calendar.server';
export { BookingScheduler } from './scheduler';
export { BookingCoordinator } from './legacy-booking-coordinator';
const handle = createRequestHandler(() => import('virtual:react-router/server-build'),import.meta.env.MODE);
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const nonce = btoa(crypto.randomUUID());
    const context = new RouterContextProvider();
    context.set(runtimeContext, { env, ctx, nonce });
    const response = new URL(request.url).pathname.startsWith('/api/') ? await handleApi(request, env, ctx) : await handle(request, context);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    // Chrome sends Origin: null for native POST forms under no-referrer,
    // which React Router correctly rejects as a potential CSRF attempt.
    // strict-origin sends only the origin, never account paths or tokens.
    headers.set('Referrer-Policy', 'strict-origin');
    headers.set('X-Frame-Options', 'DENY');
    const requestUrl = new URL(request.url);
    if (response.ok && shouldIndexPublicPage(requestUrl.pathname, requestUrl.origin, env.APP_ENV))
      headers.delete('X-Robots-Tag');
    else
      headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.APP_ENV !== 'local') {
      headers.set('Strict-Transport-Security', 'max-age=31536000');
      headers.set('Content-Security-Policy',`default-src 'self'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`);
    }
    if (request.method === 'POST') ctx.waitUntil(dispatchNotices(env).then(() => dispatchOutbox(env)).catch(() => console.error('outbox.dispatch_failed')));
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchNotices(env).then(() => dispatchOutbox(env)));
    ctx.waitUntil(dispatchIntegrations(env));
    // Temporary, automatically expiring read-only release smoke test.
    // Runs without any anonymous HTTP route, calendar mutation, D1 write
    // or privileged response body. Logs contain only fixed diagnostic codes.
    if (env.APP_ENV === 'production' && shouldRunCalendarReleaseProbe(new Date())) {
      ctx.waitUntil(
        readOnlyCalendarDiagnostic(env)
          .then((check) => console.info(JSON.stringify({
            event: 'google_calendar.readonly_probe',
            ...check,
          })))
          .catch(() => console.info(JSON.stringify({
            event: 'google_calendar.readonly_probe',
            ok: false,
            phase: 'configuration',
            code: 'UNEXPECTED_DIAGNOSTIC_ERROR',
          }))),
      );
    }
  },
  async queue(batch: MessageBatch<{ eventId: string }>, env: Env) { await consumeQueue(batch, env); },
} satisfies ExportedHandler<Env, { eventId: string }>;