// Existing project-local Wrangler, LOCAL D1 ONLY. Never creates a hosted resource.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readdirSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,relative,basename} from 'node:path';
const root=process.cwd(),dir=mkdtempSync(join(tmpdir(),'proinspect-commercial55-')),migrations=join(dir,'migrations'),state=join(dir,'state'),restored=join(dir,'restored'),config=join(dir,'wrangler.jsonc');
const files=readdirSync('database/migrations').filter(f=>/^\d{4}_.+\.sql$/.test(f)).sort(),checks=[];
const environment={...process.env,CI:'true'};delete environment.CLOUDFLARE_API_TOKEN;delete environment.CLOUDFLARE_ENV;
const run=(args,target=state)=>execFileSync('pnpm',['exec','wrangler',...args,'--config',config,'--local','--persist-to',target],{cwd:root,encoding:'utf8',env:environment,maxBuffer:16*1024*1024});
function query(sql,target=state){const result=JSON.parse(run(['d1','execute','DB','--command',sql,'--json'],target));assert(result.every(r=>r.success!==false));return result.flatMap(r=>r.results||[]);}
const check=(label,value)=>{assert(value,label);checks.push(label);};
const report={sourceSha:process.env.GITHUB_SHA||'local',productionTouched:false,newHostedDatabaseCreated:false,baseline:54,migration:'0055_commercial_applications.sql',checks,status:'FAIL'};
try{
 check('55 sequential migrations',files.length===55&&files.every((f,i)=>f.startsWith(String(i+1).padStart(4,'0')+'_'))&&files[54]===report.migration);
 mkdirSync(migrations,{recursive:true});for(const f of files.slice(0,54))copyFileSync(join(root,'database/migrations',f),join(migrations,f));
 writeFileSync(config,JSON.stringify({name:'proinspect-commercial-local-rehearsal',compatibility_date:'2026-07-01',d1_databases:[{binding:'DB',database_name:'commercial55-local',database_id:'commercial55-local',migrations_dir:'./migrations'}]}));
 run(['d1','migrations','apply','DB']);
 query("INSERT INTO users(id,email,verified_at,created_at) VALUES('usr_commercial_rehearsal','rehearsal@example.invalid','2026-11-15','2026-11-15')");
 query("INSERT INTO clients(id,name,client_type,created_at) VALUES('cli_commercial_rehearsal','Synthetic preserved client','other','2026-11-15')");
 const beforeSchema=query("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name"),beforeUsers=query('SELECT COUNT(*) AS n FROM users')[0].n;
 const sqlite=readdirSync(state,{recursive:true}).find(f=>f.endsWith('.sqlite')&&basename(f)!=='metadata.sqlite');check('one local SQLite backing file found',Boolean(sqlite));
 const backup=join(dir,'baseline54.sqlite');
 execFileSync('python3',['-c','import sqlite3,sys; source=sqlite3.connect(sys.argv[1]); target=sqlite3.connect(sys.argv[2]); source.backup(target); target.close(); source.close()',join(state,sqlite),backup]);
 copyFileSync(join(root,'database/migrations',files[54]),join(migrations,files[54]));run(['d1','migrations','apply','DB']);
 check('0055 applied exactly once',Number(query('SELECT COUNT(*) AS n FROM d1_migrations')[0].n)===55);
 const afterSchema=new Map(query("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name").map(row=>[row.type+':'+row.name,row.sql]));
 check('all pre-existing schema objects unchanged',beforeSchema.every(old=>afterSchema.get(old.type+':'+old.name)===old.sql));
 check('existing users preserved',query('SELECT COUNT(*) AS n FROM users')[0].n===beforeUsers);
 check('existing client preserved',query("SELECT name FROM clients WHERE id='cli_commercial_rehearsal'")[0].name==='Synthetic preserved client');
 check('commercial records begin empty',query('SELECT COUNT(*) AS n FROM commercial_applications')[0].n===0);
 check('commercial permissions begin empty',query('SELECT COUNT(*) AS n FROM commercial_application_permissions')[0].n===0);
 check('no subscription created',query("SELECT COUNT(*) AS n FROM subscriptions WHERE client_id='cli_commercial_rehearsal'")[0].n===0);
 check('foreign keys remain intact',query('PRAGMA foreign_key_check').length===0);
 const integrity=execFileSync('python3',['-c',"import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); print(db.execute('PRAGMA integrity_check').fetchone()[0]); db.close()",join(state,sqlite)],{encoding:'utf8'}).trim();
 check('integrity remains intact',integrity==='ok');
 const restoredFile=join(restored,relative(state,join(state,sqlite)));mkdirSync(dirname(restoredFile),{recursive:true});copyFileSync(backup,restoredFile);
 check('isolated backup restores baseline ledger',Number(query('SELECT COUNT(*) AS n FROM d1_migrations',restored)[0].n)===54);
 check('isolated recovery has no new commercial table',query("SELECT name FROM sqlite_master WHERE name='commercial_applications'",restored).length===0);
 check('isolated recovery preserves existing records',query("SELECT name FROM clients WHERE id='cli_commercial_rehearsal'",restored)[0].name==='Synthetic preserved client');
 report.status='PASS';console.log('Commercial 0054 → 0055 isolated D1 and backup recovery rehearsal PASS ('+checks.length+' checks)');
}catch(error){report.error=String(error);process.exitCode=1;console.error(error);}
finally{mkdirSync('artifacts',{recursive:true});writeFileSync(resolve('artifacts/commercial-isolated-d1.json'),JSON.stringify(report,null,2)+'\n');rmSync(dir,{recursive:true,force:true});}
