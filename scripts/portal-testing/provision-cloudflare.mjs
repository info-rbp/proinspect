/** One-shot GitHub-to-Cloudflare D1 provisioning, never a Worker deploy command. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const TARGET_WORKER = 'proinspect-platform';
export const TARGET_DATABASE = 'proinspect-platform-data';
export const EXPECTED_EMAIL_PORTALS = Object.freeze({
  'landlord-testing@proinspect.systems': 'landlord',
  'property-manager-testing@proinspect.systems': 'property-manager',
  'strata-manager-testing@proinspect.systems': 'strata-manager',
  'tenant-testing@proinspect.systems': 'tenant',
  'building-resident-testing@proinspect.systems': 'building',
  'building-council-testing@proinspect.systems': 'council',
  'commercial-testing@proinspect.systems': 'commercial',
  'staff-testing@proinspect.systems': 'staff',
});
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
export const TEMP_WRANGLER = path.join(repositoryRoot, 'apps/platform/wrangler.portal-provision.json');

export function cloudflareCredentials(env) {
  if (!env.CLOUDFLARE_API_TOKEN) throw new Error('GitHub secret CLOUDFLARE_API_TOKEN is unavailable to this job.');
  if (!/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? ''))
    throw new Error('GitHub variable/secret CLOUDFLARE_ACCOUNT_ID is missing or is not a 32-character account ID.');
  if (env.GITHUB_REPOSITORY !== 'info-rbp/proinspect' || env.GITHUB_REF !== 'refs/heads/main')
    throw new Error('One-time live D1 provisioning is restricted to info-rbp/proinspect main.');
  return {accountId:env.CLOUDFLARE_ACCOUNT_ID, token:env.CLOUDFLARE_API_TOKEN};
}

export function resolveLiveDatabase(settings, database) {
  const matches = (settings?.bindings ?? []).filter(x => x.name === 'DB' && x.type === 'd1');
  if (matches.length !== 1 || !/^[a-f0-9-]{36}$/.test(matches[0].database_id ?? ''))
    throw new Error('Existing proinspect-platform Worker must have exactly one real D1 DB binding.');
  const prod = (settings?.bindings ?? []).find(x => x.name === 'APP_ENV' && x.type === 'plain_text');
  if (!prod || prod.text !== 'production')
    throw new Error('The live Worker APP_ENV binding must equal production.');
  if (database?.uuid !== matches[0].database_id || database.name !== TARGET_DATABASE)
    throw new Error('The deployed Worker DB binding does not match proinspect-platform-data. Refusing to provision.');
  return matches[0].database_id;
}

export function wranglerConfig(dbId) {
  if (!/^[a-f0-9-]{36}$/.test(dbId)) throw new Error('Invalid remote D1 UUID.');
  return {
    name: 'proinspect-portal-database-maintenance',
    compatibility_date: '2026-07-01',
    d1_databases: [{binding:'DB',database_name:TARGET_DATABASE,database_id:dbId,migrations_dir:'../../database/migrations'}],
  };
}

export function validateExistingTables(names) {
  const existing = new Set(names);
  const relevant = ['users','clients','client_entitlements','services','scheme_memberships','d1_migrations'];
  if (relevant.some(x=>existing.has(x)) && !existing.has('d1_migrations'))
    throw new Error('D1 has application tables without migration history; review before automated migrations.');
  if (existing.has('d1_migrations') && !existing.has('users'))
    throw new Error('D1 has migration history but no users table; manual database review required.');
  return true;
}

export function verifyPortals(rows) {
  const expectedEntries = Object.entries(EXPECTED_EMAIL_PORTALS);
  if (!Array.isArray(rows) || rows.length !== expectedEntries.length)
    throw new Error(`Expected ${expectedEntries.length} portal verification rows, got ${rows?.length ?? 'none'}.`);
  const found = new Map();
  for (const row of rows) {
    if (found.has(row.email)) throw new Error('Duplicate verification result for a portal identity.');
    found.set(row.email,row);
  }
  for (const [email,kind] of expectedEntries) {
    const row = found.get(email);
    if (row?.expected_portal !== kind || row.portal_status !== 'ACCESS_ASSIGNED' ||
        !['EMAIL_NOT_YET_VERIFIED','EMAIL_VERIFIED'].includes(row.sign_in_status))
      throw new Error(`Portal verification failed for ${email}: ${row?.portal_status ?? 'missing'}.`);
  }
  return {count:rows.length, verified:rows.filter(r=>r.sign_in_status==='EMAIL_VERIFIED').length};
}

async function api(credentials, pathname, init = {}, fetcher = fetch) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}${pathname}`;
  const res = await fetcher(url, {
    ...init,
    headers:{Authorization:`Bearer ${credentials.token}`, ...(init.body?{'Content-Type':'application/json'}:{}),...init.headers},
  });
  // NEVER echo provider responses or headers; auth tokens or confidential bindings could be included.
  if(!res.ok)throw new Error(`Cloudflare ${init.method ?? 'GET'} ${pathname.split('?')[0]} returned HTTP ${res.status}; check token scopes and account.`);
  const json=await res.json();
  if(json.success !== true)throw new Error(`Cloudflare API rejected ${pathname.split('?')[0]}; check permissions and target.`);
  return json.result;
}

async function readDb(credentials, databaseId, sql, fetcher=fetch) {
  const result=await api(credentials, `/d1/database/${databaseId}/query`, {method:'POST',body:JSON.stringify({sql})}, fetcher);
  if(!Array.isArray(result) || result.length !== 1 || result[0].success !== true || !Array.isArray(result[0].results))
    throw new Error('Unexpected D1 query response; refusing to proceed.');
  return result[0].results;
}

export async function livePreflight(env=process.env, fetcher=fetch) {
  const credentials = cloudflareCredentials(env);
  const settings=await api(credentials, `/workers/scripts/${TARGET_WORKER}/settings`,{},fetcher);
  const bound=settings?.bindings?.filter(x=>x.name==='DB'&&x.type==='d1')??[];
  if(bound.length!==1 || !bound[0].database_id)throw new Error('Cannot identify live DB binding from Worker settings.');
  const database=await api(credentials,`/d1/database/${bound[0].database_id}`,{},fetcher);
  const databaseId=resolveLiveDatabase(settings,database);
  const objects=await readDb(credentials,databaseId,"SELECT name FROM sqlite_master WHERE type='table'",fetcher);
  validateExistingTables(objects.map(x=>x.name));
  writeFileSync(TEMP_WRANGLER, JSON.stringify(wranglerConfig(databaseId),null,2)+'\n', {mode:0o600});
  console.log(`Preflight passed: live Worker '${TARGET_WORKER}' DB matches '${TARGET_DATABASE}'. Schema contains ${objects.length} tables. No writes performed.`);
  return {databaseId};
}

export async function liveVerify(env=process.env, fetcher=fetch) {
  const credentials=cloudflareCredentials(env);
  const config=JSON.parse(readFileSync(TEMP_WRANGLER,'utf8'));
  const dbId=config?.d1_databases?.[0]?.database_id;
  const settings=await api(credentials, `/workers/scripts/${TARGET_WORKER}/settings`,{},fetcher);
  const database=await api(credentials, `/d1/database/${dbId}`,{},fetcher);
  resolveLiveDatabase(settings,database);
  const sql=readFileSync(path.join(repositoryRoot,'scripts/portal-testing/verify-google-admin-aliases.sql'),'utf8');
  const rows=await readDb(credentials,dbId,sql,fetcher);
  const counts=verifyPortals(rows);
  console.log(`Verified ${counts.count}/8 portal identities; ${counts.verified} have completed real email verification. No artificial verification or sessions created.`);
  return counts;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const phase=process.argv[2];
  if(!['preflight','verify'].includes(phase)){console.error('Usage: provision-cloudflare.mjs preflight|verify');process.exitCode=2;}
  else {
    try{await (phase==='preflight'?livePreflight():liveVerify());}
    catch(error){console.error(`Portal D1 ${phase} failed: ${error.message}`);process.exitCode=1;}
  }
}