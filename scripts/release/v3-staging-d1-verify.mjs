/** Read-only verification of the dedicated V3 staging D1 after applying remote migrations. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const data=JSON.parse(readFileSync('artifacts/v3-staging-resources.json','utf8'));
const token=process.env.CLOUDFLARE_API_TOKEN;
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!token||!/^[a-f0-9]{32}$/.test(account??'')||process.env.GITHUB_REF!=='refs/heads/version-3-enhancements')
 throw new Error('D1 staging verification denied for missing scoped release environment.');
if(data.databaseName!=='proinspect-v3-staging-data'||
 data.databaseId==='dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea')
 throw new Error('Refusing unexpected database identity');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+data.databaseId;
async function cf(path,method='GET',body){
 const response=await fetch(base+path,{
  method,headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const result=await response.json();
 if(!response.ok||!result.success)throw new Error('Cloudflare staging verification failed (HTTP '+response.status+').');
 return result.result;
}
const meta=await cf('');
if(meta.name!=='proinspect-v3-staging-data')throw new Error('Staging D1 identity changed.');
async function select(sql){
 const response=await cf('/query','POST',{sql});
 if(!Array.isArray(response))throw new Error('Unexpected D1 query result.');
 return response[0]?.results??[];
}
const applied=await select('SELECT name FROM d1_migrations ORDER BY id');
const foreignKeys=await select('PRAGMA foreign_key_check');
const tables=await select("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table'");
if(applied.length!==19 || applied[0]?.name!=='0001_core.sql'||
   applied.at(-1)?.name!=='0019_open_home_reports.sql')
 throw new Error('Staging D1 migration ledger is incomplete or differs from V3.');
if(foreignKeys.length)throw new Error('Staging D1 foreign-key check reported violations.');
mkdirSync('artifacts',{recursive:true});
const report={status:'PASS',sourceSha:data.sourceSha,databaseName:meta.name,
  migrationCount:applied.length,latestMigration:applied.at(-1).name,
  foreignKeyViolations:foreignKeys.length,tables:tables[0]?.count??null,
  productionD1Touched:false,at:new Date().toISOString()};
writeFileSync('artifacts/v3-staging-d1-verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
