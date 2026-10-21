/**
 * V3 release gate: read-only D1 checks of the live production database.
 * No customer rows or secrets are logged or written to GitHub artifacts.
 * The mutation step belongs exclusively to Wrangler D1 migrations.
 */
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const phase=process.argv[2];
if(!['before','after'].includes(phase))throw new Error('Expected before/after phase');
const account=process.env.CLOUDFLARE_ACCOUNT_ID, token=process.env.CLOUDFLARE_API_TOKEN;
const databaseId='dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea';
const databaseName='proinspect-platform-data';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GITHUB_REF!=='refs/heads/version-3-enhancements'||
   process.env.V3_PRODUCTION_MIGRATION!=='explicit-user-approved-2026-10-21'||
   !/^[a-f0-9]{32}$/.test(account??'')||!token)
 throw new Error('Refusing production D1 access without exact scoped release environment');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+databaseId;
async function cf(path,method='GET',body){
 const response=await fetch(base+path,{method,headers:{
  Authorization:'Bearer '+token,Accept:'application/json',
  ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();
 if(!response.ok||result.success!==true)throw new Error('Production D1 read-only audit HTTP '+response.status);
 return result.result;
}
async function query(sql){
 if(!/^(SELECT\b|PRAGMA\s+foreign_key_check\s*$)/i.test(sql.trim()))
   throw new Error('Mutation blocked by D1 read-only audit');
 const response=await cf('/query','POST',{sql});
 if(!Array.isArray(response))throw new Error('Unexpected D1 query result');
 return response[0]?.results??[];
}
const meta=await cf('');
if(meta.uuid!==databaseId||meta.name!==databaseName||
   (meta.version&&meta.version!=='production'))
 throw new Error('Production D1 identity mismatch');
const migrations=await query('SELECT name FROM d1_migrations ORDER BY id');
const actual=migrations.map(x=>x.name);
const expected=readdirSync('database/migrations').filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();
if(expected.length!==19||expected[0]!=='0001_core.sql'||expected.at(-1)!=='0019_open_home_reports.sql')
 throw new Error('Unexpected V3 migration files');
const expectedCount=phase==='before'?6:19;
if(actual.length!==expectedCount||actual.some((name,i)=>name!==expected[i]))
 throw new Error('Production migration ledger differs from approved '+phase+' state');
const foreignKeyViolations=await query('PRAGMA foreign_key_check');
if(foreignKeyViolations.length)throw new Error('Live D1 foreign-key violations');
const tables=['users','clients','client_memberships','properties','tenancies','bookings',
              'work_orders','subscriptions','documents','outbox_events'];
const counts={};
for(const table of tables){
 const present=await query("SELECT name FROM sqlite_master WHERE type='table' AND name='"+table+"'");
 if(present.length!==1)throw new Error('Required baseline table missing: '+table);
 const rows=await query('SELECT COUNT(*) AS c FROM '+table);
 const count=rows[0]?.c;
 if(!Number.isInteger(count)||count<0)throw new Error('Invalid table count for '+table);
 counts[table]=count;
}
mkdirSync('artifacts',{recursive:true});
const report={phase,sourceSha:sha,productionDatabase:databaseName,migrationCount:actual.length,
 lastMigration:actual.at(-1),foreignKeyViolations:0,counts,checkedAt:new Date().toISOString(),
 mutationsByVerifier:false};
if(phase==='before'){
 const evidence=JSON.parse(readFileSync('artifacts/v3-production-recovery-readonly.json','utf8'));
 if(evidence.status!=='PASS'||!evidence.bookmark||evidence.productionMigrations!==6||
    evidence.databaseId!==databaseId||evidence.sourceSha!==sha)
  throw new Error('Fresh matching recovery bookmark not captured in this job');
}else{
 const before=JSON.parse(readFileSync('artifacts/v3-production-d1-before.json','utf8'));
 if(before.phase!=='before'||before.sourceSha!==sha||before.migrationCount!==6)
  throw new Error('No matching pre-migration production snapshot');
 for(const table of tables)if(counts[table]<before.counts[table])
  throw new Error('Core production record count decreased: '+table);
}
writeFileSync('artifacts/v3-production-d1-'+phase+'.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({status:'PASS',phase,sourceSha:sha,migrationCount:actual.length,
 lastMigration:actual.at(-1),foreignKeyViolations:0,coreCountsPreserved:phase==='after'?true:null,
 recoveryBookmarkCaptured:phase==='before'?true:null},null,2));
