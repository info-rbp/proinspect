// Rehearse the exact 0054 migration against a private Wrangler local D1 database.
// No Cloudflare API token, production database, live Worker or network is used.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const root=resolve(process.cwd());
const dir=mkdtempSync(join(tmpdir(),'proinspect-pr01-d1-'));
const mig=join(dir,'migrations'),state=join(dir,'state'),config=join(dir,'wrangler.jsonc');
const all=readdirSync(join(root,'database','migrations')).filter(f=>/^\\d{4}_.+\\.sql$/.test(f)).sort();
const evidence={kind:'isolated-wrangler-d1',productionTouched:false,productionAccepted:false,passed:false,baselineCount:53,forwardMigration:'0054_client_service_interests.sql',sourceSha:process.env.GITHUB_SHA||'local',checks:[]};
const run=(args)=>execFileSync('pnpm',['exec','wrangler',...args,'--config',config,'--local','--persist-to',state],{cwd:root,encoding:'utf8',env:{...process.env,CI:'true'},maxBuffer:16*1024*1024});
function query(sql,expectedFailure=false){
 try{
  const raw=run(['d1','execute','DB','--command',sql,'--json']);
  const parsed=JSON.parse(raw.trim());
  const entries=Array.isArray(parsed)?parsed:[parsed];
  if(entries.some(x=>x.success===false))throw Error('D1 statement failed '+JSON.stringify(entries).slice(0,300));
  if(expectedFailure)throw Error('Expected D1 to reject: '+sql);
  return entries.flatMap(x=>x.results||[]);
 }catch(error){
  if(expectedFailure){
   if(String(error).includes('Expected D1 to reject:')) throw error;
   return [];
  }
  throw error;
 }
}
function check(label,ok){assert.equal(Boolean(ok),true,label);evidence.checks.push(label);}
try{
 check('54 sequential migrations present',all.length===54&&all[52]==='0053_account_first_free_registration.sql'&&all[53]===evidence.forwardMigration);
 mkdirSync(mig,{recursive:true});
 for(const name of all.slice(0,53))copyFileSync(join(root,'database','migrations',name),join(mig,name));
 writeFileSync(config,JSON.stringify({name:'proinspect-pr01-isolated',compatibility_date:'2026-07-01',d1_databases:[{binding:'DB',database_name:'proinspect-pr01-local',database_id:'pr01-local',migrations_dir:'./migrations'}]},null,2));
 run(['d1','migrations','apply','DB']);
 check('baseline migration 0053 applied',Number(query('SELECT COUNT(*) AS n FROM d1_migrations')[0]?.n)===53);
 query("INSERT INTO users(id,email,verified_at,created_at) VALUES('pr01_rehearsal_user','pr01-rehearsal@example.invalid','2026-11-14','2026-11-14')");
 query("INSERT INTO clients(id,name,client_type,created_at) VALUES('pr01_rehearsal_client','Synthetic account','landlord','2026-11-14')");
 check('legacy synthetic client exists before migration',Number(query("SELECT COUNT(*) AS n FROM clients WHERE id='pr01_rehearsal_client'")[0]?.n)===1);
 copyFileSync(join(root,'database','migrations',all[53]),join(mig,all[53]));
 run(['d1','migrations','apply','DB']);
 check('migration 0054 applied once',Number(query('SELECT COUNT(*) AS n FROM d1_migrations')[0]?.n)===54);
 check('service interests table exists',query("SELECT name FROM sqlite_master WHERE type='table' AND name='client_service_interests'")[0]?.name==='client_service_interests');
 query("INSERT INTO client_service_interests(client_id,service_area,requested_by,requested_at,updated_at) VALUES('pr01_rehearsal_client','maintenance','pr01_rehearsal_user','2026-11-14','2026-11-14')");
 check('selected preference saved',Number(query("SELECT COUNT(*) AS n FROM client_service_interests WHERE client_id='pr01_rehearsal_client'")[0]?.n)===1);
 check('existing client preserved',Number(query("SELECT COUNT(*) AS n FROM clients WHERE id='pr01_rehearsal_client'")[0]?.n)===1);
 check('preference cannot create subscriptions',Number(query("SELECT COUNT(*) AS n FROM subscriptions WHERE client_id='pr01_rehearsal_client'")[0]?.n)===0);
 check('preference cannot create entitlements',Number(query("SELECT COUNT(*) AS n FROM client_entitlements WHERE client_id='pr01_rehearsal_client'")[0]?.n)===0);
 query("INSERT INTO client_service_interests VALUES('pr01_rehearsal_client','unknown','pr01_rehearsal_user','x','x')",true);
 check('invalid service area denied',true);
 query("INSERT INTO client_service_interests VALUES('missing_client','commercial','pr01_rehearsal_user','x','x')",true);
 check('unknown client denied',true);
 query("INSERT INTO client_service_interests VALUES('pr01_rehearsal_client','commercial','missing_user','x','x')",true);
 check('unknown user denied',true);
 check('foreign keys intact',query('PRAGMA foreign_key_check').length===0);
 check('SQLite integrity intact',query('PRAGMA integrity_check')[0]?.integrity_check==='ok');
 evidence.passed=true;
 console.log('PR-01: isolated local D1 baseline 0053 to 0054 migration rehearsal PASS ('+evidence.checks.length+' assertions)');
}catch(e){evidence.error=String(e);console.error(e);process.exitCode=1;}
finally{
 const artifact=join(root,'artifacts','pr01-isolated-d1-rehearsal.json');
 try{writeFileSync(artifact,JSON.stringify(evidence,null,2)+'\n');}catch(e){console.error('Could not write migration evidence',e);}
 rmSync(dir,{recursive:true,force:true});
}
