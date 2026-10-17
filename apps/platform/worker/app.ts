import { createRequestHandler, RouterContextProvider } from 'react-router';
import { runtimeContext } from '../../../packages/database/context';
import type { Env } from '../../../packages/database/types';
import { handleApi } from './api';
import { consumeQueue, dispatchOutbox } from '../../../packages/notifications/server';
import { dispatchNotices } from '../../../packages/notifications/notices';
import { dispatchIntegrations } from './features/integrations.server';
import { shouldIndexPublicPage } from '../app/lib/public-routes';
import { nonceHtmlScripts } from '../../../packages/security/script-nonce';
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
    const outgoing = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    // React Router's streamed React hydration scripts are not all emitted with
    // a nonce. An HTMLRewriter adds this request's exact CSP nonce to each one.
    // This preserves strict inline-script execution rules while allowing the
    // client application (including Turnstile) to hydrate in production.
    if (env.APP_ENV !== 'local' && headers.get('Content-Type')?.includes('text/html'))
      return nonceHtmlScripts(outgoing, nonce);
    return outgoing;
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchNotices(env).then(() => dispatchOutbox(env)));
    ctx.waitUntil(dispatchIntegrations(env));
  },
  async queue(batch: MessageBatch<{ eventId: string }>, env: Env) { await consumeQueue(batch, env); },
} satisfies ExportedHandler<Env, { eventId: string }>;