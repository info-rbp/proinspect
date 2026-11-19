import {createRequestListener} from '@remix-run/node-fetch-server';
import {platform, reserveBookingRequest} from '../../build/google/domain.mjs';
import stagingFlags from '../../build/google/staging-flags.json' with {type:'json'};
import {checkBindings, eventIdValid} from './bindings.mjs';

function execution() {
  const pending = [];
  return {
    waitUntil(work) { const promise = Promise.resolve(work); promise.catch(() => {}); pending.push(promise); },
    async drain() { while (pending.length) await Promise.all(pending.splice(0)); }
  };
}
export function applicationEnv(db, cloud, key, source) {
  const env = {...stagingFlags, APP_ENV:'staging', APP_ORIGIN:cloud.APP_ORIGIN, MARKETING_ORIGIN:cloud.APP_ORIGIN,
    BUILD_SHA:source, DB:db, DATA_ENCRYPTION_KEY:key,
    DOCUMENTS:cloud.DOCUMENTS, RESTRICTED_DOCUMENTS:cloud.RESTRICTED_DOCUMENTS, EVENTS:cloud.EVENTS};
  if (process.env.GCP_PRIVATE_SCANNER_ENABLED === 'true') env.PRIVATE_DOCUMENT_SCANNER = cloud.privateScanner;
  env.SCHEDULER = {
    idFromName(name) { if (name !== 'default') throw Error('Unknown booking resource'); return name; },
    get(id) {
      if (id !== 'default') throw Error('Unknown scheduler');
      return {fetch: request => db.schedule(transaction => reserveBookingRequest({...env, DB:transaction}, request))};
    }
  };
  return env;
}

export function googleApplication({cloud, key, source, database}) {
  const env = async () => applicationEnv((await database()).db, cloud, key, source);
  async function handle(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith('/internal/')) {
      if (request.method !== 'POST') return new Response(null,{status:405});
      if (path === '/internal/adapters/check') {
        await checkBindings(cloud, key);
        return Response.json({storage:true, restrictedStorage:true, multipart:true, secret:true, taskSubmitted:true});
      }
      if (path === '/internal/jobs/events') {
        const text = await request.text();
        if (Buffer.byteLength(text) > 2048) return new Response(null,{status:413});
        let body;
        try { body = JSON.parse(text); } catch { return new Response(null,{status:400}); }
        if (body?.probe === 'migration-adapter-v1' && Object.keys(body).length === 1) {
          console.info(JSON.stringify({event:'migration.task.probe'}));
          return new Response(null,{status:204});
        }
        if (!eventIdValid(body?.eventId)) return new Response(null,{status:400});
        if (!database) return new Response(null,{status:503});
        let acked = false;
        const message = {body:{eventId:body.eventId}, ack() { acked = true; }, retry() { acked = false; }};
        await platform.queue({messages:[message]}, await env());
        return new Response(null,{status:acked ? 204 : 503});
      }
      if (['/internal/jobs/outbox','/internal/jobs/daily'].includes(path)) {
        if (!database) return new Response(null,{status:503});
        const ctx = execution();
        const stamp = request.headers.get('X-CloudScheduler-ScheduleTime');
        const scheduledTime = stamp ? Date.parse(stamp) : Date.now();
        if (!Number.isFinite(scheduledTime)) return new Response(null,{status:400});
        await platform.scheduled({cron:path.endsWith('/daily') ? '0 1 * * *' : '*/2 * * * *', scheduledTime}, await env(), ctx);
        await ctx.drain();
        return new Response(null,{status:204});
      }
      return new Response(null,{status:404});
    }
    if (!database) return new Response(null,{status:503});
    // Google IAM protects this service, but does not supply a Cloudflare client address.
    if (request.headers.has('CF-Connecting-IP')) {
      const headers = new Headers(request.headers);
      headers.delete('CF-Connecting-IP');
      request = new Request(request, {headers});
    }
    const ctx=execution();
    const response=await platform.fetch(request, await env(), ctx);
    await ctx.drain();
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag','noindex, nofollow');
    return new Response(response.body, {status:response.status, statusText:response.statusText, headers});
  }
  const origin = new URL(cloud.APP_ORIGIN);
  return {handle, listener:createRequestListener(handle, {host:origin.host, protocol:origin.protocol,
    onError() { console.error(JSON.stringify({severity:'ERROR',event:'google.application.error'})); return new Response(null,{status:503}); }})};
}
