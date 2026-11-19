import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {once} from 'node:events';
import pg from 'pg';
import {applyMigrations} from '../../apps/platform/node/google/migrations.mjs';
import {createDatabase,poolOptions} from '../../apps/platform/node/google/postgres.mjs';
import {postgresQuery} from '../../apps/platform/node/google/sql.mjs';
import {applicationEnv, googleApplication} from '../../apps/platform/node/google/application.mjs';
import {privateScannerBinding} from '../../apps/platform/node/google/bindings.mjs';
import {sourceQueries} from './source-queries.mjs';

const url = new URL(process.env.PHASE2_DATABASE_URL);
if (url.hostname !== '127.0.0.1' || !/^\/proinspect_phase2(?:_verify|_fresh)?$/.test(url.pathname)) throw Error('Use a disposable loopback database');
const pool = new pg.Pool({...poolOptions,connectionString:url.href});
const db = createDatabase(pool);
const catalog = JSON.parse(readFileSync('database/postgres/source-catalog.json'));
before(async () => { await applyMigrations(pool); });
after(() => pool.end());

test('all source tables, columns, named indexes, FKs and trigger mappings match PostgreSQL', async () => {
  const columnRows = (await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
  const actual = Object.groupBy(columnRows,row=>row.table_name);
  assert.deepEqual(Object.keys(actual).sort(),Object.keys(catalog.tables).sort());
  const fks = (await pool.query("SELECT conrelid::regclass::text AS child, confrelid::regclass::text AS parent, condeferrable, condeferred, confupdtype, confdeltype, ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=conrelid AND a.attnum=k.num ORDER BY pos) AS cols, ARRAY(SELECT a.attname::text FROM unnest(confkey) WITH ORDINALITY k(num,pos) JOIN pg_attribute a ON a.attrelid=confrelid AND a.attnum=k.num ORDER BY pos) AS dest FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace")).rows;
  const actions = {'NO ACTION':'a','RESTRICT':'r','CASCADE':'c','SET NULL':'n','SET DEFAULT':'d'};
  const expectedFk = [];
  for (const [name, table] of Object.entries(catalog.tables)) {
    const cols = actual[name].map(row=>row.column_name);
    assert.deepEqual(cols, name==='approvals' ? [...table.columns,'pi_rowid'] : table.columns, name);
    for (const fk of table.foreign_keys) expectedFk.push([name,fk.parent,fk.columns.join(','),fk.references.join(','),fk.deferred,actions[fk.update],actions[fk.delete]].join('|'));
  }
  assert.deepEqual(fks.map(f=>[f.child,f.parent,f.cols.join(','),f.dest.join(','),f.condeferred,f.confupdtype,f.confdeltype].join('|')).sort(),expectedFk.sort());
  const indexes = (await pool.query("SELECT i.relname, x.indisunique, x.indpred IS NOT NULL AS partial FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid WHERE i.relnamespace='public'::regnamespace")).rows;
  for (const [name,shape] of Object.entries(catalog.indexes)) {
    const item = indexes.find(i=>i.relname===name);
    assert.ok(item,name); assert.equal(item.indisunique,shape.unique,name); assert.equal(item.partial,shape.partial,name);
  }
  const triggers = (await pool.query("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname <> 'pi_serialize_write'")).rows;
  assert.deepEqual(triggers.map(t=>t.tgname).sort(),Object.values(catalog.triggers).sort());
  const seedCounts = await pool.query(Object.keys(catalog.tables).map(name=>"SELECT '"+name+"' AS name,count(*) AS rows FROM "+name).join(' UNION ALL '));
  for (const row of seedCounts.rows) assert.equal(row.rows,catalog.tables[row.name].seed_rows,row.name);
  assert.deepEqual(await applyMigrations(pool),[]);
});

test('primary and unique keys, CHECK and NOT NULL constraints and every built-in value match SQLite',async()=>{
  const oracle=JSON.parse(execFileSync('python3',['tests/migration/sqlite-catalog-oracle.py'],{encoding:'utf8',maxBuffer:4*1024*1024}));
  const constraints=(await pool.query("SELECT conrelid::regclass::text AS tbl,contype,ARRAY(SELECT a.attname::text FROM unnest(conkey) WITH ORDINALITY k(n,i) JOIN pg_attribute a ON a.attnum=k.n AND a.attrelid=conrelid ORDER BY i) AS cols FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype IN ('p','u','c')")).rows;
  const required=(await pool.query("SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND is_nullable='NO' AND column_name<>'pi_rowid'")).rows;
  for (const [name,expected] of Object.entries(oracle)) {
    const items=constraints.filter(row=>row.tbl===name);
    assert.deepEqual(items.find(row=>row.contype==='p')?.cols ?? [],expected.pk,name+' primary key');
    assert.deepEqual(items.filter(row=>row.contype==='u' && row.cols[0]!=='pi_rowid').map(row=>row.cols.join(',')).sort(),expected.unique.map(cols=>cols.join(',')).sort(),name+' unique keys');
    assert.equal(items.filter(row=>row.contype==='c').length,expected.checks,name+' checks');
    assert.deepEqual(required.filter(row=>row.table_name===name).map(row=>row.column_name).sort(),expected.required.sort(),name+' required columns');
    if (expected.rows.length) {
      const cols=catalog.tables[name].columns;
      const actual=(await pool.query({text:'SELECT '+cols.join(',')+' FROM '+name,rowMode:'array'})).rows;
      function normalized(rows, source) {
        return rows.map(row=>JSON.stringify(row.map((value,i)=>{
          if(cols[i]!=='created_at') return value;
          if(source && ['2111-03-17 12:34:56','2111-03-17T12:34:56.789Z'].includes(value)) return value.includes('T')?'@iso-now':'@sql-now';
          if(!source && expected.rows.some(r=>r[i]==='2111-03-17 12:34:56' || r[i]==='2111-03-17T12:34:56.789Z')) {
            assert.ok(Number.isFinite(Date.parse(value)),name+' seed creation time');
            return value.includes('T')?'@iso-now':'@sql-now';
          }
          return value;
        }))).sort();
      }
      assert.deepEqual(normalized(actual,false),normalized(expected.rows,true),name+' seed data');
    }
  }
});

test('every translated trigger predicate and side effect resolves against real server types', async () => {
  const checks = execFileSync('python3',['scripts/migration/postgres-schema.py','--trigger-checks'],{encoding:'utf8',maxBuffer:5*1024*1024});
  await pool.query(checks);
});

test('the application static query corpus prepares against the PostgreSQL schema', async () => {
  const queries=sourceQueries();
  assert.ok(queries.length>1600);
  const c=await pool.connect();
  try {
    for (const [sql,n] of queries) {
      const result=postgresQuery(sql,Array(n).fill(null),1);
      try { await c.query('PREPARE source_query AS '+result.text); }
      catch (err) { throw Error(err.message+' in '+sql.slice(0,250)); }
      await c.query('DEALLOCATE source_query');
    }
    console.log('Prepared application SQL statements:',queries.length);
  } finally { c.release(); }
});

test('real SQLite domain fixtures produce equivalent PostgreSQL decisions and query results',async()=>{
  const scenarios=JSON.parse(execFileSync('python3',['tests/migration/sqlite-domain-fixtures.py'],{encoding:'utf8',maxBuffer:12*1024*1024}));
  const c=await pool.connect();
  const failures=[];
  const sorted=rows => rows.map(r=>JSON.stringify(r)).sort();
  try {
    for(const scenario of scenarios) {
      await c.query('BEGIN');
      let operation, previousChanges = 0;
      try {
        for(const step of scenario.operations) {
          operation=step.sql;
          await c.query('SAVEPOINT fixture');
          const query=postgresQuery(step.sql,step.args,previousChanges);
          let result;
          try { result=await c.query({...query,rowMode:'array'}); if (['INSERT','UPDATE','DELETE'].includes(result.command)) previousChanges=result.rowCount; }
          catch(err) {
            previousChanges=0;
            await c.query('ROLLBACK TO SAVEPOINT fixture');
            if(!step.error) throw err;
            const constraint=step.error.split(':')[0];
            const code={'UNIQUE constraint failed':'23505','FOREIGN KEY constraint failed':'23503','NOT NULL constraint failed':'23502','CHECK constraint failed':'23514'}[constraint];
            if(code) assert.equal(err.code,code);
            else assert.equal(err.message,step.error);
          }
          if(result && step.error) throw Error('Accepted a write rejected by SQLite: '+step.error);
          if(step.rows) assert.deepEqual(sorted(result.rows),sorted(step.rows));
          await c.query('RELEASE SAVEPOINT fixture');
        }
      } catch(err) { failures.push({scenario:scenario.name,sql:operation?.slice(0,150),error:err.message}); }
      finally {await c.query('ROLLBACK');}
    }
  } finally { c.release(); }
  assert.deepEqual(failures,[]);
  console.log('SQLite parity fixtures:',scenarios.length,'operations:',scenarios.reduce((n,x)=>n+x.operations.length,0));
});

test('Node invokes original React Router, API, scheduler and queue handlers with the PostgreSQL adapter',async()=>{
  const key = Buffer.alloc(32, 17).toString('base64');
  const cloud={APP_ORIGIN:'https://test.invalid',EVENTS:{async send(){throw Error('Unexpected synthetic mail');}}};
  const {handle,listener}=googleApplication({cloud,key,source:'f'.repeat(40),database:async()=>({db})});
  const server = createServer(listener).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = 'http://127.0.0.1:' + server.address().port;
    const delivered = await fetch(base+'/internal/jobs/events', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({probe:'migration-adapter-v1'})});
    assert.equal(delivered.status, 204);
    assert.equal((await fetch(base+'/api/catalogue')).status, 200);
  } finally { await new Promise(resolve => server.close(resolve)); }
  const request=(path,options)=>handle(new Request(cloud.APP_ORIGIN+path,options));
  assert.equal((await request('/about')).status,200);
  const catalogue=await request('/api/catalogue');
  assert.equal(catalogue.status,200); assert.ok(Array.isArray((await catalogue.json()).services));
  const restricted=await request('/api/workspaces');
  assert.ok([401,403,404].includes(restricted.status));
  for (const cadence of ['outbox','daily']) assert.equal((await request('/internal/jobs/'+cadence,{method:'POST'})).status,204);
  assert.equal((await request('/internal/jobs/events',{method:'POST',body:JSON.stringify({eventId:'evt_synthetic_absent'})})).status,204);
  assert.equal((await request('/internal/jobs/events',{method:'POST',body:'{}'})).status,400);
});

test('Google applies staging release gates and preserves both signed scanner transport paths',async()=>{
  const {default:ts} = await import('typescript');
  const file = 'apps/platform/wrangler.jsonc';
  const {config} = ts.parseConfigFileTextToJson(file, readFileSync(file,'utf8'));
  const env = applicationEnv(db,{APP_ORIGIN:'https://stage.invalid'},'synthetic','f'.repeat(40));
  for (const [name,value] of Object.entries(config.env.staging.vars)) {
    if (value === 'true' || value === 'false') assert.equal(env[name], value, name);
  }
  assert.equal(env.STRIPE_ACCOUNT_ID, undefined);
  assert.equal(env.PRIVATE_DOCUMENT_SCANNER, undefined);
  const origin = 'https://scanner.invalid';
  const seen = [];
  const binding = privateScannerBinding(origin, async ()=>'Bearer synthetic', async (request,options)=>{
    seen.push([request.url,request.method,request.headers.get('Authorization'),
      request.headers.get('X-ProInspect-Scan-Nonce'),await request.text(),options.redirect]);
    return new Response('synthetic-signed-reply');
  });
  const headers = {'X-ProInspect-Scan-Nonce':'synthetic-nonce'};
  await binding.fetch('https://private-scanner/health',{headers});
  const response = await binding.fetch('https://private-scanner/scan',{method:'POST',headers,body:'synthetic'});
  assert.equal(await response.text(),'synthetic-signed-reply');
  assert.deepEqual(seen,[
    [origin+'/health','GET','Bearer synthetic','synthetic-nonce','','error'],
    [origin+'/scan','POST','Bearer synthetic','synthetic-nonce','synthetic','error']
  ]);
  await assert.rejects(binding.fetch('https://elsewhere.invalid/health'));
});

test('PostgreSQL batches roll back stale writes and preserve null-safe and parameter semantics',async()=>{
  const sql=(text,...args)=>db.prepare(text).bind(...args);
  const id='pi_fixture';
  try {
    await db.batch([sql("INSERT INTO users(id,email,created_at) VALUES(?,?,?)",id,'Case@fixture.invalid','2030'),sql("INSERT INTO mutation_guards(changed_rows) VALUES(changes())"),sql("DELETE FROM mutation_guards")]);
    await assert.rejects(db.batch([sql("UPDATE users SET display_name='should rollback' WHERE id=?",id),sql('UPDATE users SET active=0 WHERE id=?','missing'),sql("INSERT INTO mutation_guards(changed_rows) VALUES(changes())")]));
    assert.equal((await sql("SELECT display_name AS displayName FROM users WHERE email=? COLLATE NOCASE",'CASE@fixture.invalid').first()).displayName,'');
    assert.equal(await sql("SELECT '?' AS literal, ? AS bound", "a'b").first('bound'),"a'b");
    assert.equal(await sql('SELECT ? IS ? AS equal',null,null).first('equal'),1);
    assert.equal(await sql("SELECT MIN(CAST(NULL AS INTEGER), CAST(1 AS INTEGER)) AS val").first('val'),null);
  } finally {await sql('DELETE FROM users WHERE id=?',id).run();}
});

test('the registered-owner booking and signed settlement journey runs on real PostgreSQL under concurrent retries',async()=>{
  // Use a separate disposable database: this fixture commits actual requests from several sessions.
  const name='pi_journey_'+process.pid+'_'+Date.now();
  await pool.query('CREATE DATABASE '+name+" WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
  const isolated=new pg.Pool({...poolOptions,connectionString:url.href.replace(url.pathname,'/'+name)});
  try {
    await applyMigrations(isolated);
    const {platform}=await import('../../apps/platform/build/google/domain.mjs');
    const {registeredBookingJourney,secret}=await import('../runtime/registered-booking-journey.mjs');
    const env=applicationEnv(createDatabase(isolated),{APP_ORIGIN:'http://localhost'},Buffer.alloc(32,9).toString('base64'),'3'.repeat(40));
    // Local fixture identities and a test webhook secret exist only inside this disposable process.
    Object.assign(env,{APP_ENV:'local',EMAIL_PROVIDER:'local',STRIPE_WEBHOOK_SECRET:secret,OPERATIONS_EMAIL:'operator@example.invalid'});
    await registeredBookingJourney({db:env.DB,concurrency:6,async dispatchFetch(address,init) {
      const pending=[];
      const response=await platform.fetch(new Request(address,init),env,{waitUntil(promise){pending.push(promise);}});
      await Promise.all(pending);
      return response;
    }});
  } finally { await isolated.end(); await pool.query('DROP DATABASE '+name); }
});
