/** Cloudflare Workers Builds deploys `main` directly. This modifies only the CI checkout. */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const path = new URL('../../apps/platform/wrangler.jsonc', import.meta.url);

export function directConfiguration(config, input = {}) {
  const live = config?.env?.connected;
  if (live?.name !== 'proinspect-platform' || live.vars?.APP_ENV !== 'production')
    throw new Error('Expected the direct proinspect-platform production configuration.');
  if (live.d1_databases?.[0]?.binding !== 'DB' || !live.r2_buckets?.length)
    throw new Error('Direct deployment requires the database and private bucket bindings.');
  if (live.d1_databases[0].database_id === 'local-proinspect')
    throw new Error('Local D1 database IDs must never deploy.');
  if (input.appOrigin) {
    const url = new URL(input.appOrigin);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/')
      throw new Error('PROINSPECT_APP_ORIGIN must be an HTTPS origin without path or credentials.');
    live.vars.APP_ORIGIN = url.origin;
  }
  if (input.sha) {
    if (!/^[a-f0-9]{40}$/.test(input.sha)) throw new Error('Invalid Cloudflare commit SHA.');
    live.vars.BUILD_SHA = input.sha;
  }
  return config;
}

export function prepareDirectBuild(env = process.env) {
  if (env.WORKERS_CI !== '1') return false;
  if (env.WORKERS_CI_BRANCH && env.WORKERS_CI_BRANCH !== 'main')
    throw new Error('This Worker deploys from main only.');
  const config = directConfiguration(JSON.parse(readFileSync(path, 'utf8')), {
    appOrigin: env.PROINSPECT_APP_ORIGIN,
    sha: env.WORKERS_CI_COMMIT_SHA,
  });
  writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
  console.log('Cloudflare direct deployment configuration prepared for proinspect-platform.');
  return true;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  prepareDirectBuild();