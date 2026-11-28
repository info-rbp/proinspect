import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const name = 'proinspect-rebuild';
const origin = 'https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
const dbId = 'e66b8ebc-637d-4737-8d47-b0fbec3c082c';
const aud = '51a53ffe08ac5e0e498e72d2a9d9fa908e0f824f41db96545b971112bbb92211';
function check(c) {
  assert.equal(c.name, name);
  assert.equal(c.vars.APP_ENV, 'staging');
  for (const v of ['APP_ORIGIN','MARKETING_ORIGIN','PLATFORM_ORIGIN']) assert.equal(c.vars[v], origin);
  assert.equal(c.vars.STAGING_ACCESS_AUD, aud);
  assert.equal(c.vars.EMAIL_PROVIDER, 'local');
  for (const [key,value] of Object.entries(c.vars)) {
    if (key.endsWith('_ENABLED')) assert.equal(value,'false',key + ' must be explicitly reviewed before activation');
    assert.ok(!/(SECRET|PRIVATE_KEY|API_KEY|ACCOUNT_ID|WEBHOOK_URL)$/.test(key), 'External provider credential or endpoint is not permitted in the rebuild manifest');
  }
  assert.equal(c.d1_databases?.length, 1);
  assert.equal(c.d1_databases[0].binding, 'DB');
  assert.equal(c.d1_databases[0].database_name, 'proinspect-v3-staging-data');
  assert.equal(c.d1_databases[0].database_id, dbId);
  assert.deepEqual(c.r2_buckets?.map(x=>[x.binding,x.bucket_name]), [['DOCUMENTS','proinspect-v3-staging-documents'],['RESTRICTED_DOCUMENTS','proinspect-v3-staging-restricted']]);
  assert.deepEqual(c.services, [{binding:'PRIVATE_DOCUMENT_SCANNER',service:'proinspect-private-document-scanner-staging'}]);
  assert.deepEqual(c.durable_objects?.bindings, [{name:'SCHEDULER',class_name:'BookingScheduler',script_name:'proinspect-v3-staging'}]);
  assert.equal(c.migrations?.length ?? 0,0);
  assert.deepEqual(c.queues?.producers,[{binding:'EVENTS',queue:'proinspect-rebuild-events'}]);
  assert.equal(c.queues?.consumers?.length,1);
  assert.equal(c.queues.consumers[0].queue,'proinspect-rebuild-events');
  assert.equal(c.queues.consumers[0].dead_letter_queue,'proinspect-rebuild-events-dlq');
  assert.equal(c.triggers?.crons?.length ?? 0,0);
  assert.equal(c.routes?.length ?? 0,0);
  assert.equal(c.preview_urls,false);
  for(const s of ['dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea','proinspect-platform-data','proinspect-production-documents','proinspect-platform-restricted-documents','proinspect-platform-events','https://proinspect.systems']) assert.ok(!JSON.stringify(c).includes(s),'Production resource: '+s);
}
assert.equal(process.env.GITHUB_REPOSITORY,'info-rbp/proinspect');
assert.equal(process.env.GITHUB_REF,'refs/heads/proinspect-rebuild');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sha,process.env.GITHUB_SHA);
const source=JSON.parse(readFileSync(new URL('apps/platform/wrangler.jsonc',root),'utf8'));
check(source.env.rebuild);
const action=process.argv[2];
assert.ok(['build','dry-run','deploy'].includes(action));
const env={...process.env,WORKERS_CI:'0',CLOUDFLARE_ENV:'rebuild'};
if(action==='build') execFileSync('pnpm',['--dir','apps/platform','build'],{cwd:root,env,stdio:'inherit'});
const pointerPath=new URL('apps/platform/.wrangler/deploy/config.json',root);
const pointer=JSON.parse(readFileSync(pointerPath,'utf8'));
const path=new URL(pointer.configPath,pointerPath);
const compiled=JSON.parse(readFileSync(path,'utf8'));
check(compiled);
if(action!=='build'){
  const args=['--dir','apps/platform','exec','wrangler','deploy','--config',path.pathname,'--var','BUILD_SHA:'+sha];
  if(action==='dry-run')args.push('--dry-run');
  execFileSync('pnpm',args,{cwd:root,env:{...env,CLOUDFLARE_ENV:''},stdio:'inherit'});
}
console.log('Verified rebuild-only target, shared nonproduction staging database and separate notification queue for '+sha);
