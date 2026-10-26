import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const SHA=process.env.SOURCE_SHA,account='8ca23ac6d2cc906d4dd13b8da5ea2b25',db='e66b8ebc-637d-4737-8d47-b0fbec3c082c',worker='proinspect-v3-staging',origin='https://proinspect-v3-staging.delicate-dream-e4c9.workers.dev';
assert.match(SHA??'',/^[a-f0-9]{40}$/);assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),SHA);
const mode=process.argv[2];mkdirSync('artifacts',{recursive:true});
const files=readdirSync('database/migrations').filter(x=>x.endsWith('.sql')).sort();assert.equal(files.length,44);
const core=['users','clients','properties','client_memberships','tenancies','bookings','work_orders','subscriptions','documents'];
const save=(name,value)=>writeFileSync('artifacts/'+name+'.json',JSON.stringify(value,null,2)+'\n');
async function cf(path,method='GET',body){const token=process.env.CLOUDFLARE_API_TOKEN;assert.ok(token);const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+path,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const j=await r.json();assert.ok(r.ok&&j.success,`${method} ${path}: HTTP ${r.status}, codes ${(j.errors||[]).map(e=>e.code).join(',')}`);return j.result;}
async function query(sql){const r=await cf('/d1/database/'+db+'/query','POST',{sql});assert.ok(r.every(x=>x.success));return r.map(x=>x.results);}
async function snapshot(){const r=await query('SELECT name FROM d1_migrations ORDER BY name; PRAGMA foreign_key_check; '+core.map(t=>`SELECT '${t}' AS name,count(*) AS n FROM ${t};`).join(' '));assert.deepEqual(r[1],[]);return {source:SHA,migrations:r[0].map(x=>x.name),foreignKeyViolations:0,counts:Object.fromEntries(r.slice(2).flat().map(x=>[x.name,x.n]))};}
async function settings(){const s=await cf('/workers/scripts/'+worker+'/settings'),b=s.bindings||[];assert.equal(b.find(x=>x.name==='DB')?.id,db);assert.equal(b.find(x=>x.name==='DOCUMENTS')?.bucket_name,'proinspect-v3-staging-documents');assert.equal(b.find(x=>x.name==='RESTRICTED_DOCUMENTS')?.bucket_name,'proinspect-v3-staging-restricted');assert.equal(b.find(x=>x.name==='EVENTS')?.queue_name,'proinspect-v3-staging-events');assert.equal(b.find(x=>x.name==='SCHEDULER')?.namespace_id,'f6addbfad170409b8fffc0059e845604');return {vars:Object.fromEntries(b.filter(x=>x.type==='plain_text').map(x=>[x.name,x.text])),secretNames:b.filter(x=>x.type==='secret_text').map(x=>x.name).sort(),bindingNames:b.map(x=>x.name).sort()};}
if(mode==='prepare'){
 const path='apps/platform/wrangler.jsonc',c=JSON.parse(readFileSync(path,'utf8')),s=c.env.staging;
 assert.equal(s.name,worker);assert.equal(s.vars.APP_ORIGIN,origin);assert.equal(s.vars.APP_ENV,'staging');assert.equal(s.triggers.crons.length,0);
 assert.ok(Object.entries(s.vars).filter(([k])=>k.endsWith('_ENABLED')||k.endsWith('_APPROVED')||k.endsWith('_READY')).every(([,v])=>v==='false'));
 s.d1_databases[0].database_id=db;s.vars.BUILD_SHA=SHA;
 const build={...c,...s,assets:{...(c.assets||{}),run_worker_first:['/*','!/assets/*','!/favicon.ico']}};delete build.env;
 writeFileSync(path,JSON.stringify(build,null,2)+'\n');
 writeFileSync('wrangler.final-staging-migration.json',JSON.stringify({name:'proinspect-final-staging-migration',compatibility_date:c.compatibility_date,d1_databases:[{binding:'DB',database_name:'proinspect-v3-staging-data',database_id:db,migrations_dir:'database/migrations'}]},null,2));
 save('staging-target',{source:SHA,worker,origin,database:db,flagsAllOff:true,productionResourcesTouched:false});
}else if(mode==='before'){
 const meta=await cf('/d1/database/'+db);assert.equal(meta.name,'proinspect-v3-staging-data');
 const s=await settings();save('staging-settings-before',s);
 const snap=await snapshot();assert.ok([19,44].includes(snap.migrations.length),'Unexpected staging baseline');assert.deepEqual(snap.migrations,files.slice(0,snap.migrations.length));
 const bookmark=await cf('/d1/database/'+db+'/time_travel/bookmark');assert.ok(bookmark);save('staging-recovery-bookmark',bookmark);save('staging-schema-before',snap);console.log('Staging identity and recovery point verified; no production resource selected.');
}else if(mode==='after-schema'){
 const snap=await snapshot(),before=JSON.parse(readFileSync('artifacts/staging-schema-before.json','utf8'));assert.deepEqual(snap.migrations,files);assert.deepEqual(snap.counts,before.counts);save('staging-schema-after',snap);console.log('All 44 migrations applied; zero FK violations; core counts unchanged.');
}else if(mode==='after-deploy'){
 const s=await settings(),before=JSON.parse(readFileSync('artifacts/staging-settings-before.json','utf8'));assert.equal(s.vars.BUILD_SHA,SHA);assert.equal(s.vars.APP_ENV,'staging');assert.equal(s.vars.APP_ORIGIN,origin);assert.deepEqual(s.secretNames,before.secretNames);
 assert.ok(Object.entries(s.vars).filter(([k])=>k.endsWith('_ENABLED')||k.endsWith('_APPROVED')||k.endsWith('_READY')).every(([,v])=>v==='false'));
 const checks=[];for(const path of ['/api/health','/','/services','/book','/guest/book','/properties-for-lease','/signin','/privacy','/legal/platform-terms']){const r=await fetch(origin+path,{redirect:'manual'});const text=await r.text();assert.ok(r.status<500,`${path}: ${r.status}`);if(path==='/api/health'){const h=JSON.parse(text);assert.equal(h.source,SHA);}checks.push({path,status:r.status});}
 for(const workspace of ['landlord','property-manager','commercial','strata-manager','tenant','building','strata-council','staff','building-manager']){const path='/api/w/'+workspace+'/not-authorized/overview',r=await fetch(origin+path,{redirect:'manual'});assert.ok([401,403,404].includes(r.status),path+' must deny anonymous access');checks.push({path,status:r.status});}
 save('staging-hosted-observation',{source:SHA,worker,settings:s,checks,authenticatedAcceptance:false,providerAcceptance:false,productionResourcesTouched:false});console.log('Deployed source, preserved secrets, disabled gates and anonymous portal checks verified.');
}else throw Error('Unknown operation');
