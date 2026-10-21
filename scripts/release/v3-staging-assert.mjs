/** Fail closed if a Vite/Wrangler build is not bound to the V3 staging resources. */
import {readFileSync} from 'node:fs';

const config=JSON.parse(readFileSync(
 new URL('../../apps/platform/.wrangler/deploy/config.json',import.meta.url),'utf8'));
const input=JSON.parse(readFileSync(
 new URL('../../apps/platform/wrangler.jsonc',import.meta.url),'utf8'));
const stage=input.env?.staging;
const expected='proinspect-v3-staging';
const db=stage?.d1_databases?.[0];
function requireSafe(value,message){if(!value)throw new Error('Staging deployment BLOCKED: '+message);}
requireSafe(process.env.GITHUB_REF==='refs/heads/version-3-enhancements','wrong GitHub branch');
requireSafe(process.env.CLOUDFLARE_ENV==='staging','CLOUDFLARE_ENV must be staging at BUILD time');
requireSafe(config.name===expected,'flattened Worker target is not '+expected);
requireSafe(config.vars?.APP_ENV==='staging','flattened APP_ENV not staging');
requireSafe(config.vars?.APP_ORIGIN==='https://'+expected+'.delicate-dream-e4c9.workers.dev',
  'unexpected Worker origin');
requireSafe(db?.database_name==='proinspect-v3-staging-data'&&/^[a-f0-9-]{36}$/.test(db?.database_id??''),
  'source configuration not bound to dedicated staging D1');
requireSafe(config.d1_databases?.some(r=>r.binding==='DB'&&r.database_id===db.database_id),
  'flattened D1 binding differs from provisioned staging D1');
requireSafe(db.database_id!=='dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea',
  'refused production D1 UUID');
for(const [name,bucket] of [['DOCUMENTS','proinspect-v3-staging-documents'],
                           ['RESTRICTED_DOCUMENTS','proinspect-v3-staging-restricted']]){
 requireSafe(config.r2_buckets?.some(r=>r.binding===name&&r.bucket_name===bucket),
  'unexpected R2 '+name+' bucket binding');
}
requireSafe(config.queues?.producers?.some(r=>r.binding==='EVENTS'&&r.queue==='proinspect-v3-staging-events'),
  'queue binding not isolated');
requireSafe((config.triggers?.crons??[]).length===0,'Cron must be disabled in staging');
for(const name of ['GUEST_BOOKINGS_ENABLED','RENTAL_APPLICATIONS_ENABLED',
  'GOOGLE_CALENDAR_BOOKINGS_ENABLED','OPEN_HOME_REPORTS_ENABLED','WA_BONDS_ENABLED',
  'RESTRICTED_WORKFLOWS_ENABLED']){
 requireSafe(config.vars?.[name]==='false',name+' is not fail-closed');
}
const all=JSON.stringify(config);
for(const forbidden of ['proinspect-platform-data','proinspect-platform-restricted-documents',
  'proinspect-platform-events','"APP_ENV":"production"',
  'dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea']){
 requireSafe(!all.includes(forbidden),'production resource present: '+forbidden);
}
console.log('Safe staging-only flattened Worker configuration verified (no live resources).');
