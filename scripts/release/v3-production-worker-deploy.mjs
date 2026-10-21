/**
 * One-time guarded manual production Worker deployment.
 * Runs only in the V3 release Actions job; no migration, backup restore, data export,
 * real email send, feature activation or secret-value inspection.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const mode=process.argv[2];
if(!['prepare','build-check','verify'].includes(mode))throw new Error('Expected phase prepare/build-check/verify');
const worker='proinspect-platform';
const wanted='5c7034262bc29c99be6144bc09c198c0033838b6';
const prior='e819659dba660e85b88a013257806e6462f4c38e';
const dbid='dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea';
const docs='proinspect-production-documents';
const restricted='proinspect-platform-restricted-documents';
const queue='proinspect-platform-events';
const endpoint='https://proinspect-platform.delicate-dream-e4c9.workers.dev';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const ref=process.env.GITHUB_REF;
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(ref!=='refs/heads/version-3-enhancements'||sha!==wanted||
 process.env.V3_ONE_TIME_PRODUCTION_DEPLOY!=='verified-manual-fallback-2026-10-21'||
 !/^[a-f0-9]{32}$/.test(account??'')||!token)
 throw new Error('Refusing production Worker access outside pinned, authenticated release context');
const cfbase='https://api.cloudflare.com/client/v4/accounts/'+account;
async function cf(path,method='GET',body){
 const response=await fetch(cfbase+path,{method,headers:{
  Authorization:'Bearer '+token,Accept:'application/json',
  ...(body?{'Content-Type':'application/json'}:{})
 },...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const result=await response.json();
 if(!response.ok||result.success!==true)
  throw new Error('Cloudflare release read-only check returned HTTP '+response.status);
 return result.result;
}
async function currentHealth(){
 const response=await fetch(endpoint+'/api/health',{headers:{'Cache-Control':'no-cache'},
  signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error('Production Worker health HTTP '+response.status);
 return response.json();
}
async function dbQuery(sql){
 if(!/^(SELECT\b|PRAGMA\s+foreign_key_check\s*$)/i.test(sql.trim()))
  throw new Error('Refusing mutating SQL in production deploy verifier');
 const rows=await cf('/d1/database/'+dbid+'/query','POST',{sql});
 if(!Array.isArray(rows))throw new Error('Unexpected D1 result');
 return rows[0]?.results??[];
}
async function validateDb(){
 const d=await cf('/d1/database/'+dbid);
 if(d.uuid!==dbid||d.name!=='proinspect-platform-data')
  throw new Error('Unexpected production D1 identity');
 const migrations=await dbQuery('SELECT name FROM d1_migrations ORDER BY id');
 if(migrations.length!==19||migrations.at(-1)?.name!=='0019_open_home_reports.sql')
  throw new Error('Production D1 19-migration release not verified');
 if((await dbQuery('PRAGMA foreign_key_check')).length)
  throw new Error('Production D1 foreign keys invalid');
}
async function bindings(){
 const settings=await cf('/workers/scripts/'+worker+'/settings');
 if(!Array.isArray(settings?.bindings))
  throw new Error('Worker settings bindings missing');
 const map=new Map(settings.bindings.map(b=>[b.name,b]));
 function requireBinding(name,type){
  const value=map.get(name);
  if(!value||value.type!==type)throw new Error('Missing or changed '+name+' Worker binding');
  return value;
 }
 if(requireBinding('DB','d1').id!==dbid)throw new Error('Wrong bound production D1');
 if(requireBinding('DOCUMENTS','r2_bucket').bucket_name!==docs)
  throw new Error('Wrong ordinary customer document bucket');
 if(requireBinding('RESTRICTED_DOCUMENTS','r2_bucket').bucket_name!==restricted)
  throw new Error('Wrong restricted customer document bucket');
 if(requireBinding('EVENTS','queue').queue_name!==queue)
  throw new Error('Wrong production Queue');
 if(requireBinding('SCHEDULER','durable_object_namespace').class_name!=='BookingScheduler')
  throw new Error('Wrong Scheduler Durable Object');
 const secretNames=settings.bindings.filter(b=>b.type==='secret_text').map(b=>b.name).sort();
 for(const name of ['DATA_ENCRYPTION_KEY','RESEND_API_KEY','TURNSTILE_SECRET_KEY'])
  if(!secretNames.includes(name))throw new Error('Production secret binding missing: '+name);
 return {secretNames,resourcesVerified:true};
}
mkdirSync('artifacts',{recursive:true});
const path='artifacts/v3-worker-production-before.json';
if(mode==='prepare'){
 await validateDb();
 const snapshot=await bindings();
 const health=await currentHealth();
 if(health.ok!==true||health.environment!=='production'||
    !health.bindings?.database||!health.bindings?.documents||
    !health.bindings?.scheduler||!health.bindings?.queue||
    ![wanted,prior].includes(health.source))
  throw new Error('Production Worker runtime differs from approved baseline');
 const alreadyLive=health.source===wanted;
 writeFileSync('artifacts/v3-worker-deploy-needed.txt',alreadyLive?'0\n':'1\n');
 writeFileSync(path,JSON.stringify({
  sourceBefore:health.source,sourceWanted:wanted,
  databaseId:dbid,ordinaryBucket:docs,restrictedBucket:restricted,queue,
  secretNames:snapshot.secretNames,alreadyLive,at:new Date().toISOString()
 },null,2)+'\n',{mode:0o600});
 const file='apps/platform/wrangler.jsonc';
 const manifest=JSON.parse(readFileSync(file,'utf8'));
 const production=manifest.env?.connected;
 if(manifest.keep_vars!==true||production?.name!==worker||
    production.vars?.APP_ENV!=='production'||production.vars?.EMAIL_PROVIDER!=='resend')
  throw new Error('Production Wrangler source manifest drifted');
 const flags=['RESTRICTED_WORKFLOWS_ENABLED','GOOGLE_CALENDAR_BOOKINGS_ENABLED',
  'GUEST_BOOKINGS_ENABLED','RENTAL_APPLICATIONS_ENABLED','OPEN_HOME_REPORTS_ENABLED',
  'OPEN_HOME_SHEET_SYNC_ENABLED','RENTAL_RETENTION_AUTOPURGE_ENABLED'];
 for(const flag of flags)if(production.vars[flag]!=='false')
  throw new Error('Unsafe active production release flag '+flag);
 production.vars.WA_BONDS_ENABLED='false';
 production.vars.BUILD_SHA=wanted;
 const d1=production.d1_databases?.find(x=>x.binding==='DB');
 if(!d1||d1.database_name!=='proinspect-platform-data')throw new Error('Wrong DB manifest');
 d1.database_id=dbid;
 const ordinary=production.r2_buckets?.find(x=>x.binding==='DOCUMENTS');
 const protectedBucket=production.r2_buckets?.find(x=>x.binding==='RESTRICTED_DOCUMENTS');
 if(!ordinary||!protectedBucket||protectedBucket.bucket_name!==restricted)
  throw new Error('Wrong document manifest');
 ordinary.bucket_name=docs;
 if(!production.queues?.producers?.some(x=>x.binding==='EVENTS'&&x.queue===queue))
  throw new Error('Wrong Queue manifest');
 if(!production.migrations?.some(x=>x.tag==='cf-v1')||
    !production.migrations?.some(x=>x.tag==='v1'))
  throw new Error('Legacy Durable Object migration history not retained');
 writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
 console.log('PASS production preflight; existing bindings and secrets preserved; Worker deploy needed: '+!alreadyLive);
}else if(mode==='build-check'){
 const pointerFile=new URL('../../apps/platform/.wrangler/deploy/config.json',import.meta.url);
 const pointer=JSON.parse(readFileSync(pointerFile,'utf8'));
 if(typeof pointer.configPath!=='string')throw new Error('Missing Worker deploy config pointer');
 const config=JSON.parse(readFileSync(new URL(pointer.configPath,pointerFile),'utf8'));
 if(config.name!==worker||config.keep_vars!==true||
  config.vars?.APP_ENV!=='production'||config.vars?.BUILD_SHA!==wanted)
  throw new Error('Wrong Worker name/source/environment or keep_vars in generated deploy config');
 const d1=config.d1_databases?.find(x=>x.binding==='DB');
 if(d1?.database_id!==dbid)throw new Error('Compiled Worker bound to wrong D1');
 for(const [binding,bucket] of [['DOCUMENTS',docs],['RESTRICTED_DOCUMENTS',restricted]])
  if(!config.r2_buckets?.some(x=>x.binding===binding&&x.bucket_name===bucket))
   throw new Error('Compiled Worker bound to wrong R2 '+binding);
 if(!config.queues?.producers?.some(x=>x.binding==='EVENTS'&&x.queue===queue))
  throw new Error('Compiled Worker bound to wrong Queue');
 if(!config.durable_objects?.bindings?.some(x=>x.name==='SCHEDULER'&&x.class_name==='BookingScheduler'))
  throw new Error('Compiled Worker missing scheduler');
 if(!config.migrations?.some(x=>x.tag==='cf-v1')||!config.migrations?.some(x=>x.tag==='v1'))
  throw new Error('Compiled Worker dropped legacy DO migration history');
 for(const name of ['GOOGLE_CALENDAR_BOOKINGS_ENABLED','GUEST_BOOKINGS_ENABLED',
  'RENTAL_APPLICATIONS_ENABLED','OPEN_HOME_REPORTS_ENABLED','RESTRICTED_WORKFLOWS_ENABLED',
  'WA_BONDS_ENABLED']){
  if(config.vars?.[name]!=='false')throw new Error('Compiled Worker release flag is not OFF: '+name);
 }
 console.log('PASS generated production Worker config; pinned DB/R2/Queue/DO, legacy migrations and flags OFF');
}else{
 const before=JSON.parse(readFileSync(path,'utf8'));
 let health,success=false;
 for(let attempt=0;attempt<15;attempt++){
  try{
   health=await currentHealth();
   if(health.ok===true&&health.environment==='production'&&health.source===wanted&&
     health.bindings?.database&&health.bindings?.documents&&
     health.bindings?.scheduler&&health.bindings?.queue){success=true;break;}
  }catch{}
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 if(!success)throw new Error('Live Worker does not expose merged production source after deploy');
 await validateDb();
 const after=await bindings();
 for(const name of before.secretNames)if(!after.secretNames.includes(name))
  throw new Error('Deployed Worker lost existing secret binding '+name);
 const report={status:'PASS',worker,sourceWanted:wanted,sourceLive:health.source,
  productionMigrationCount:19,foreignKeyViolations:0,
  allPriorSecretBindingsRetained:true,criticalResourceBindingsRetained:true,
  featureFlagsOff:true,at:new Date().toISOString()};
 writeFileSync('artifacts/v3-worker-production-after.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report,null,2));
}
