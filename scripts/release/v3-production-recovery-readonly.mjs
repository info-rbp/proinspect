/**
 * Production recovery *readiness* audit: GET/SELECT/PRAGMA only.
 * Takes no D1 backup and never writes, restores, migrates or deploys.
 * A Time Travel bookmark is short-lived; re-capture immediately before release.
 */
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const token=process.env.CLOUDFLARE_API_TOKEN;
const databaseId='dd4f4bc7-cd24-433a-a9ee-d1ffbcc229ea';
const databaseName='proinspect-platform-data';
const baseline='0006_all_inclusive_subscription.sql';
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.GITHUB_REF!=='refs/heads/version-3-enhancements'||
   !/^[a-f0-9]{32}$/.test(account??'')||!token)
  throw new Error('Production recovery audit requires V3 branch and scoped Cloudflare token.');
const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+databaseId;
async function cf(path,method='GET',body){
 const response=await fetch(base+path,{
   method,headers:{Authorization:'Bearer '+token,Accept:'application/json',
       ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),
   signal:AbortSignal.timeout(25000),
 });
 const result=await response.json();
 if(!response.ok||result.success!==true)
   throw new Error('Production read-only Cloudflare audit HTTP '+response.status);
 return result.result;
}
async function query(sql){
 if(!/^(SELECT\b|PRAGMA\s+foreign_key_check\s*$)/i.test(sql.trim()))
  throw new Error('Refusing non-read-only production SQL.');
 const result=await cf('/query','POST',{sql});
 if(!Array.isArray(result))throw new Error('Unexpected D1 query shape.');
 return result[0]?.results??[];
}
const evidence={
  sourceSha:source,databaseName,databaseId,liveWrites:false,liveRestore:false,
  productionDeploymentTriggered:false,status:'FAIL',checkedAt:new Date().toISOString()
};
try{
 const details=await cf('');
 if(details.uuid!==databaseId||details.name!==databaseName)
   throw new Error('Production database UUID or name mismatch.');
 if(details.version && details.version!=='production')
   throw new Error('D1 production backend required for Time Travel; found '+details.version);
 const migrations=await query('SELECT id,name FROM d1_migrations ORDER BY id');
 if(migrations.length!==6||migrations.at(-1)?.name!==baseline)
   throw new Error('Production migration ledger changed since accepted baseline.');
 const foreignKeyViolations=await query('PRAGMA foreign_key_check');
 if(foreignKeyViolations.length)throw new Error('Production D1 foreign-key violations detected.');
 const bookmark=await cf('/time_travel/bookmark');
 if(typeof bookmark.bookmark!=='string'||bookmark.bookmark.length<16)
   throw new Error('Production D1 Time Travel bookmark missing.');
 evidence.bookmark=bookmark.bookmark; // Stored in restricted GH Actions artifact, never logged.
 evidence.bookmarkDigest=createHash('sha256').update(bookmark.bookmark).digest('hex');
 evidence.backupMechanism='Cloudflare D1 Time Travel bookmark (short-lived; re-capture before cutover)';
 evidence.productionMigrations=6;
 evidence.lastProductionMigration=baseline;
 evidence.foreignKeyViolations=0;
 evidence.status='PASS';
}catch(error){
 evidence.error=error instanceof Error?error.message:'UNKNOWN';
 throw error;
}finally{
 mkdirSync('artifacts',{recursive:true});
 writeFileSync('artifacts/v3-production-recovery-readonly.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({
   status:evidence.status,sourceSha:evidence.sourceSha,
   productionMigrations:evidence.productionMigrations??null,
   lastProductionMigration:evidence.lastProductionMigration??null,
   foreignKeyViolations:evidence.foreignKeyViolations??null,
   bookmarkAvailable:Boolean(evidence.bookmark),
   bookmarkSha256:evidence.bookmarkDigest??null,
   liveWrites:false,liveRestore:false,
   error:evidence.error??null,
 },null,2));
}
