import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { createRequestListener } from '@react-router/node';
import { RouterContextProvider } from 'react-router';
import * as build from '../build/server/index.js';

if (process.env.FOUNDATION_PROOF !== 'true') throw Error('FOUNDATION_PROOF=true is required');
if (!['dev', 'staging'].includes(process.env.FOUNDATION_ENV)) throw Error('Only dev/staging are allowed');
const revisionFile = new URL('../../../REVISION', import.meta.url);
const source = await readFile(revisionFile, 'utf8').then(value => value.trim()).catch(error => {
  if (error.code === 'ENOENT') return process.env.BUILD_SHA;
  throw error;
});
if (!/^[0-9a-f]{40}$/.test(source ?? '')) throw Error('An exact BUILD_SHA is required');
const clientRoot = await realpath(fileURLToPath(new URL('../build/client', import.meta.url)));
const pages = new Set(['/about', '/how-it-works', '/why-proinspect']);
const unavailable = new Proxy({}, { get() { throw Error('Operational bindings unavailable in foundation proof'); } });
const handler = createRequestListener({ build, mode: 'production', getLoadContext(request) {
  const context = new RouterContextProvider();
  context.set(build.entry.module.runtimeContext, {
    nonce: request.headers.get('x-foundation-nonce'), env: unavailable,
    ctx: { waitUntil() { throw Error('Background work is unavailable in foundation proof'); } },
  });
  return context;
}});
const stage = process.env.FOUNDATION_ENV;
let cloud, application, connectionPromise;
const withAdapters = process.env.GCP_ADAPTERS_ENABLED === 'true';
const withSql = withAdapters && process.env.GCP_SQL_ENABLED === 'true';
if (withAdapters) {
  const {cloudBindings} = await import('./google/bindings.mjs');
  const {googleApplication} = await import('./google/application.mjs');
  cloud = cloudBindings(stage);
  if (Buffer.from(process.env.DATA_ENCRYPTION_KEY ?? '', 'base64').length !== 32) throw Error('Invalid nonproduction key');
  const database = async () => {
    if (!connectionPromise) connectionPromise = import('./google/postgres.mjs').then(({connectCloudSql}) => connectCloudSql(stage))
      .catch(error => { connectionPromise = undefined; throw error; });
    return connectionPromise;
  };
  application = googleApplication({cloud, key:process.env.DATA_ENCRYPTION_KEY, source, database:withSql ? database : null});
}
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const started = Date.now();
  // Never log paths, query strings, bodies, credentials or provider responses.
  res.on('finish', () => console.info(JSON.stringify({ severity: 'INFO', event: 'foundation.request', status: res.statusCode, duration_ms: Date.now() - started })));
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  try {
    const url = new URL(req.url, 'http://foundation.invalid');
    if (url.pathname === '/internal/proof' && req.method === 'POST') {
      res.writeHead(204); res.end(); return; // IAM authenticated no-op; never dispatch application jobs.
    }
    if (application && url.pathname.startsWith('/internal/')) { application.listener(req, res); return; }
    if (!withSql && !['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
    if (['GET','HEAD'].includes(req.method) && ['/health', '/healthz'].includes(url.pathname)) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, mode: withSql ? 'google-application' : 'foundation-proof', environment: process.env.FOUNDATION_ENV, source, operationalRoutes: withSql, cloudAdapters: withAdapters })); return;
    }
    if (!withSql && url.pathname === '/') { res.writeHead(302, { Location: '/about' }); res.end(); return; }
    if (!withSql && pages.has(url.pathname) && !url.search) {
      const nonce = randomBytes(18).toString('base64');
      req.headers['x-foundation-nonce'] = nonce;
      res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`);
      handler(req, res); return;
    }
    // Assets only: realpath confines symlinks and traversal to the build/public directories.
    const extension = extname(url.pathname);
    if (['GET','HEAD'].includes(req.method) && types[extension] && !url.search && !/%2f|%5c/i.test(url.pathname)) {
      for (const root of [clientRoot]) {
        try {
          const path = await realpath(resolve(root, '.' + decodeURIComponent(url.pathname)));
          if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) continue;
          res.setHeader('Content-Type', types[extension]);
          res.end(req.method === 'HEAD' ? undefined : await readFile(path)); return;
        } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
      }
    }
    if (withSql) { application.listener(req, res); return; }
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ code: 'FOUNDATION_ROUTE_UNAVAILABLE' }));
  } catch {
    console.error(JSON.stringify({ severity: 'ERROR', event: 'foundation.request_failed' }));
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0');
process.on('SIGTERM', () => server.close(async () => {
  try { await (await connectionPromise)?.close(); await cloud?.close(); } finally { process.exit(0); }
}));
