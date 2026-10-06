import { createRequestHandler, RouterContextProvider } from 'react-router';
import { runtimeContext } from '../../../packages/database/context';
import type { Env } from '../../../packages/database/types';
import { handleApi } from './api';
import { consumeQueue, dispatchOutbox } from '../../../packages/notifications/server';
import { dispatchIntegrations } from './features/integrations.server';
export { BookingScheduler } from './scheduler';

const handle = createRequestHandler(
  () => import('virtual:react-router/server-build'),
  import.meta.env.MODE,
);
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const nonce = btoa(crypto.randomUUID());
    const context = new RouterContextProvider();
    context.set(runtimeContext, { env, ctx, nonce });
    const response = new URL(request.url).pathname.startsWith('/api/')
      ? await handleApi(request, env, ctx)
      : await handle(request, context);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'no-referrer');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (env.APP_ENV !== 'local') {
      headers.set('Strict-Transport-Security', 'max-age=31536000');
      headers.set(
        'Content-Security-Policy',
        `default-src 'self'; script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
      );
    }
    if (request.method === 'POST') {
      ctx.waitUntil(dispatchOutbox(env).catch(() => console.error('outbox.dispatch_failed')));
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(dispatchOutbox(env));
    ctx.waitUntil(dispatchIntegrations(env));
  },
  async queue(batch: MessageBatch<{ eventId: string }>, env: Env) {
    await consumeQueue(batch, env);
  },
} satisfies ExportedHandler<Env, { eventId: string }>;
