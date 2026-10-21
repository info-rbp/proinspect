/**
 * V3 staging-only Cloudflare resource bootstrap.
 * Idempotent resource lookup/provision; NEVER acts on the production resource names.
 * It does not read/copy customer records and does not deploy to the live Worker.
 * Runs only on the explicit v3-staging GitHub Actions job.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const PREFIX='proinspect-v3-staging';
const NAMES={
  worker:PREFIX,
  db:PREFIX+'-data',
  documents:PREFIX+'-documents',
  restricted:PREFIX+'-restricted',
  queue:PREFIX+'-events',
  dlq:PREFIX+'-events-dlq',
};
const PRODUCTION_DB_UUID='dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
if(process.env.V3_STAGING_PROVISION!=='1')
  throw new Error('Explicit staging-only execution flag required.');
if(!/^[a-f0-9]{32}$/.test(account??'')||!token)
  throw new Error('Stage access blocked: missing Cloudflare account identifier or scoped API token.');
const ref=process.env.GITHUB_REF;
if(ref!=='refs/heads/version-3-enhancements')
  throw new Error('Stage provisioning only permits version-3-enhancements branch.');
const root=new URL('../../',import.meta.url);
const wranglerFile=new URL('../../apps/platform/wrangler.jsonc',import.meta.url);
const config=JSON.parse(readFileSync(wranglerFile,'utf8'));
const stage=config.env?.staging;
if(stage?.name!==NAMES.worker||stage.vars?.APP_ENV!=='staging'
  ||stage.d1_databases?.[0]?.database_name!==NAMES.db
  ||stage.triggers?.crons?.length!==0
  ||stage.r2_buckets?.find(b=>b.binding==='DOCUMENTS')?.bucket_name!==NAMES.documents
  ||stage.r2_buckets?.find(b=>b.binding==='RESTRICTED_DOCUMENTS')?.bucket_name!==NAMES.restricted
  ||stage.queues?.producers?.[0]?.queue!==NAMES.queue)
  throw new Error('Staging manifest isolation validation failed.');
if(Object.entries(stage.vars).some(([key,value])=>key.endsWith('_ENABLED')&&value!=='false'))
  throw new Error('Staging must keep every release flag disabled.');
const base='https://api.cloudflare.com/client/v4/accounts/'+account;
async function cloudflare(path,method='GET',body){
  const response=await fetch(base+path,{
    method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
    ...(body?{body:JSON.stringify(body)}:{}),
    signal:AbortSignal.timeout(25000),
  });
  const result=await response.json().catch(()=>({success:false,errors:[]}));
  if(!response.ok||result.success!==true){
    const codes=(result.errors??[]).map(e=>e.code).join(',');
    throw new Error('Cloudflare staging-only API operation '+method+' '+path+
      ' failed (HTTP '+response.status+'; code '+codes+'). Check token permissions.');
  }
  return result;
}
async function listed(path,parse){
  const all=[];
  for(let page=1;page<=15;page++){
    const sep=path.includes('?')?'&':'?';
    const response=await cloudflare(path+sep+'page='+page+'&per_page=100');
    const items=parse(response.result);
    all.push(...items);
    const more=response.result_info?.total_pages;
    if(!more||page>=more)break;
  }
  return all;
}
async function d1(){
  const existing=await listed('/d1/database',r=>Array.isArray(r)?r:(r?.databases??[]));
  const found=existing.filter(db=>db.name===NAMES.db);
  if(found.length>1)throw new Error('Nonunique staging D1 database name.');
  const entry=found[0]??(await cloudflare('/d1/database','POST',{name:NAMES.db,primary_location_hint:'oc'})).result;
  if(entry.name!==NAMES.db||!/^[a-f0-9-]{36}$/.test(entry.uuid??'')||entry.uuid===PRODUCTION_DB_UUID)
    throw new Error('Refused unsafe or unverified staging D1 binding.');
  return entry.uuid;
}
async function bucket(name){
  const response=await cloudflare('/r2/buckets?name_contains='+encodeURIComponent(name));
  const buckets=Array.isArray(response.result)?response.result:(response.result?.buckets??[]);
  if(!buckets.some(b=>b.name===name)){
    const result=(await cloudflare('/r2/buckets','POST',{name,locationHint:'oc'})).result;
    if(result?.name!==name)throw new Error('Staging R2 creation did not confirm expected bucket.');
  }
}
async function queue(name){
  const existing=await listed('/queues',r=>Array.isArray(r)?r:(r?.queues??[]));
  if(!existing.some(q=>q.queue_name===name)){
    const result=(await cloudflare('/queues','POST',{queue_name:name})).result;
    if(result?.queue_name!==name)throw new Error('Staging queue creation did not confirm expected queue.');
  }
}
const uuid=await d1();
await bucket(NAMES.documents);
await bucket(NAMES.restricted);
await queue(NAMES.dlq);
await queue(NAMES.queue);
// Mutates only the ephemeral CI checkout. The committed V3 config has no actual D1 ID.
stage.d1_databases[0].database_id=uuid;
stage.vars.BUILD_SHA=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
writeFileSync(wranglerFile,JSON.stringify(config,null,2)+'\n');
writeFileSync(new URL('../../wrangler.v3-staging-migration.json',import.meta.url),
 JSON.stringify({
   name:'proinspect-v3-staging-migrations-only',compatibility_date:'2026-07-01',
   d1_databases:[{
     binding:'DB',database_name:NAMES.db,database_id:uuid,migrations_dir:'database/migrations',
   }],
 },null,2)+'\n');
mkdirSync(new URL('../../artifacts/',import.meta.url),{recursive:true});
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const evidence={sourceSha:sha,cloudflareWorker:NAMES.worker,databaseName:NAMES.db,
  databaseId:uuid,ordinaryBucket:NAMES.documents,restrictedBucket:NAMES.restricted,
  queue:NAMES.queue,deadLetterQueue:NAMES.dlq,productionResourcesTouched:false,
  customerDataCopied:false,releaseFlagsAllDisabled:true,
  reportedAt:new Date().toISOString()};
writeFileSync(new URL('../../artifacts/v3-staging-resources.json',import.meta.url),
 JSON.stringify(evidence,null,2)+'\n');
console.log('V3 dedicated Cloudflare staging resources verified for exact source '+sha+
 ' (no live Worker/database bindings).');
