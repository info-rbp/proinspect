/**
 * PR #107: non-production Cloudflare D1 0057 -> 0058 forward migration,
 * historical-row preservation and isolated pre-migration recovery rehearsal.
 * Only Wrangler --local is permitted; source worker/remote D1 are never modified.
 */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readdirSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';

const root=resolve(process.cwd()),tmp=mkdtempSync(join(tmpdir(),'proinspect-coliving-0058-'));
const migrations=join(tmp,'migrations'),persist=join(tmp,'local-d1'),config=join(tmp,'wrangler.jsonc');
const names=readdirSync(join(root,'database','migrations')).filter(s=>/^\d{4}_.+\.sql$/.test(s)).sort();
const evidence={kind:'local-cloudflare-d1-0058',productionTouched:false,independentHostedAccepted:false,
  sourceSha:process.env.GITHUB_SHA||'local',baseline:57,final:58,checks:[],passed:false};
const check=(description,condition)=>{assert.ok(condition,description);evidence.checks.push(description);};
function wrangler(args){
  return execFileSync('pnpm',['exec','wrangler',...args,'--config',config,'--local','--persist-to',persist],{
    cwd:root,encoding:'utf8',env:{...process.env,CI:'true'},maxBuffer:16*1024*1024});
}
function query(statement){
  const raw=wrangler(['d1','execute','DB','--command',statement,'--json']);
  const parsed=JSON.parse(raw.trim());
  const results=Array.isArray(parsed)?parsed:[parsed];
  assert.ok(results.every(item=>item.success!==false),'D1 SQL failure');
  return results.flatMap(item=>item.results??[]);
}
function dbFile(){
  const items=readdirSync(persist,{recursive:true}).filter(name=>name.endsWith('.sqlite')&&basename(name)!=='metadata.sqlite');
  check('one isolated persistent D1 file',items.length===1);
  return join(persist,items[0]);
}
try{
  check('migrations have complete 0001-0058 sequence',names.length===58&&
    names.every((name,i)=>name.startsWith(String(i+1).padStart(4,'0')+'_'))&&
    names[57]==='0058_portal_experience_coliving.sql');
  mkdirSync(migrations,{recursive:true});
  for(const name of names.slice(0,57))copyFileSync(join(root,'database','migrations',name),join(migrations,name));
  writeFileSync(config,JSON.stringify({name:'proinspect-coliving-local',compatibility_date:'2026-07-01',
    d1_databases:[{binding:'DB',database_name:'co-living-local-only',database_id:'co-living-local',migrations_dir:'./migrations'}]},null,2));
  wrangler(['d1','migrations','apply','DB']);
  check('baseline D1 migration ledger at 0057',Number(query('SELECT COUNT(*) AS n FROM d1_migrations')[0].n)===57);
  query("INSERT INTO users(id,email,verified_at,created_at) VALUES('u_0058','local0058@example.invalid','2026-11-01','2026-11-01')");
  query("INSERT INTO clients(id,name,client_type,created_at) VALUES('c_0058','Synthetic owner','landlord','2026-11-01')");
  query("INSERT INTO properties(id,address,suburb,postcode,address_key,sector,created_at) VALUES('p_0058','1 Synthetic Street','Perth','6000','synthetic-coliving-0058','residential','2026-11-01')");
  query("INSERT INTO tenancies(id,property_id,status,starts_at) VALUES('t_0058','p_0058','active','2026-11-01')");
  const snapshot={user:query("SELECT id,email FROM users WHERE id='u_0058'"),
    client:query("SELECT id,name FROM clients WHERE id='c_0058'"),
    property:query("SELECT id,address FROM properties WHERE id='p_0058'"),
    tenancy:query("SELECT id,status FROM tenancies WHERE id='t_0058'")};
  const original=dbFile(),recovery=join(tmp,'pre-0058-backup.sqlite');
  copyFileSync(original,recovery);
  copyFileSync(join(root,'database','migrations',names[57]),join(migrations,names[57]));
  wrangler(['d1','migrations','apply','DB']);
  check('migration 0058 applied exactly once',Number(query('SELECT COUNT(*) AS n FROM d1_migrations')[0].n)===58);
  for(const [table,expected] of [
    ['users',snapshot.user],['clients',snapshot.client],
    ['properties',snapshot.property],['tenancies',snapshot.tenancy]
  ]){
    const selected=table==='users'?'id,email':table==='clients'?'id,name':table==='properties'?'id,address':'id,status';
    const id=table==='users'?'u_0058':table==='clients'?'c_0058':table==='properties'?'p_0058':'t_0058';
    check('historical '+table+' records unchanged',JSON.stringify(query(`SELECT ${selected} FROM ${table} WHERE id='${id}'`))===JSON.stringify(expected));
  }
  check('account tags, sites and spaces exist',query("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'co_living_%'").length===3 &&
    query("SELECT name FROM sqlite_master WHERE name='account_experience_tags'").length===1);
  check('old tenancy request rows remain nullable',query("SELECT name FROM pragma_table_info('requests') WHERE name='co_living_space_id'").length===1);
  query("INSERT INTO co_living_sites(property_id,allocation_mode,created_by,created_at) VALUES('p_0058','room','u_0058','2026-11-01')");
  query("INSERT INTO co_living_spaces(id,property_id,label,space_type,created_by,created_at) VALUES('space_0058','p_0058','Room A','room','u_0058','2026-11-01')");
  query("INSERT INTO co_living_occupancies(tenancy_id,space_id,created_by,created_at) VALUES('t_0058','space_0058','u_0058','2026-11-01')");
  check('D1 co-living row relationship persists',query("SELECT tenancy_id FROM co_living_occupancies WHERE space_id='space_0058'").length===1);
  check('foreign keys remain clean',query('PRAGMA foreign_key_check').length===0);
  const restored=new DatabaseSync(recovery,{readOnly:true});
  try{
    check('pre-migration backup has 0057 ledger',Number(restored.prepare('SELECT COUNT(*) AS n FROM d1_migrations').get().n)===57);
    check('backup preserves historical tenancy',restored.prepare("SELECT id FROM tenancies WHERE id='t_0058'").get()?.id==='t_0058');
    check('backup has no new co-living table',restored.prepare("SELECT name FROM sqlite_master WHERE name='co_living_sites'").get()===undefined);
    check('backup integrity',restored.prepare('PRAGMA integrity_check').get().integrity_check==='ok');
  }finally{restored.close();}
  check('forward D1 integrity',query('PRAGMA integrity_check')[0]?.integrity_check==='ok');
  evidence.passed=true;
  console.log('PASS: 0057 to 0058 local D1 migration, co-living links and separate baseline recovery');
}catch(error){evidence.error=String(error);console.error(error);process.exitCode=1;
}finally{
  mkdirSync(join(root,'artifacts'),{recursive:true});
  writeFileSync(join(root,'artifacts','co-living-0058-isolated-d1.json'),JSON.stringify(evidence,null,2)+'\n');
  rmSync(tmp,{recursive:true,force:true});
}
