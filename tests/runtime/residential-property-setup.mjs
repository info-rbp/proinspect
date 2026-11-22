/** Isolated Worker/D1 acceptance for four-step property onboarding and scoped dashboards. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

await build({entryPoints:['tests/runtime/entry.ts'],
  outfile:'artifacts/residential-property-setup-worker.mjs',
  bundle:true,format:'esm',platform:'browser',target:'es2022',
  external:['cloudflare:workers','node:*']});
const key=randomBytes(32).toString('base64');
const mf=new Miniflare({
 modules:true,scriptPath:'artifacts/residential-property-setup-worker.mjs',
 compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
 d1Databases:{DB:'property-setup-isolated'},
 r2Buckets:{DOCUMENTS:'property-setup-docs',RESTRICTED_DOCUMENTS:'property-setup-restricted'},
 durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
 bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',
  DATA_ENCRYPTION_KEY:key,EMAIL_PROVIDER:'local',OPERATIONS_EMAIL:'operator@example.invalid'},
});
const db=await mf.getD1Database('DB'),sql=(query,...values)=>db.prepare(query).bind(...values);
async function api(path,options={}){
 const response=await mf.dispatchFetch('http://localhost'+path,{
  method:options.method??(options.body===undefined?'GET':'POST'),
  headers:{Origin:'http://localhost',...(options.cookie?{Cookie:options.cookie}:{}),
    ...(options.body===undefined?{}:{'Content-Type':'application/json'})},
  body:options.body===undefined?undefined:JSON.stringify(options.body),
 });
 const value=await response.text();
 return {status:response.status,data:value?JSON.parse(value):null,
  cookie:response.headers.get('set-cookie')};
}
async function login(email){
 const started=await api('/api/auth/start',{body:{email}});
 assert.equal(started.status,200,JSON.stringify(started.data));
 const token=new URL(started.data.localSignInUrl).searchParams.get('token');
 const done=await api('/api/auth/complete',{body:{email,token}});
 assert.equal(done.status,200,JSON.stringify(done.data));
 return {id:(await sql('SELECT id FROM users WHERE email=?',email).first()).id,
  cookie:done.cookie.split(';')[0]};
}
const profile={bedrooms:4,bathrooms:2,ensuites:1,separateToilets:1,
 carSpaces:2,furnishing:'part_furnished'};
const tenancy={occupancyStatus:'tenanted',leaseType:'fixed',
 startsOn:'2026-12-01',endsOn:'2027-11-30',
 tenants:[{name:'Alex Example',email:'alex@example.test',phone:'0400 111 222'},
  {name:'Taylor Example',email:'taylor@example.test'}]};
try {
 for(const statement of JSON.parse(execFileSync('python3',
  ['scripts/schema-statements.py'],{encoding:'utf8'})))
  await db.prepare(statement).run();
 for(const statement of catalogueSql().split('\n'))
  await db.prepare(statement).run();
 const owner=await login('property-owner@example.invalid');
 const outsider=await login('property-outsider@example.invalid');
 const viewer=await login('property-viewer@example.invalid');
 const signup=await api('/api/onboarding',{cookie:owner.cookie,
   body:{displayName:'Property Owner',clientName:'Owner Account',landlordType:'residential'}});
 assert.equal(signup.status,201,JSON.stringify(signup.data));
 const clientId=signup.data.clientId,base='/api/w/landlord/'+clientId;
 const input={address:'18 Synthetic Test Crescent',suburb:'Ashby',postcode:'6065',
  propertyType:'House',selfManaged:true,profile,tenancy,
  notes:'Private synthetic property notes for returning owners'};
 const added=await api(base+'/properties',{cookie:owner.cookie,body:input});
 assert.equal(added.status,201,JSON.stringify(added.data));
 const propertyId=added.data.propertyId;
 const latest=await api(base+'/properties/'+propertyId+'/setup',{cookie:owner.cookie});
 assert.equal(latest.status,200,JSON.stringify(latest.data));
 assert.equal(latest.data.profile.carSpaces,2);
 assert.equal(latest.data.profile.ensuites,1);
 assert.equal(latest.data.profile.version,1);
 assert.equal(latest.data.tenancy.tenants.length,2);
 assert.equal(latest.data.tenancy.tenants[0].name,'Alex Example');
 assert.equal(latest.data.historyCount,1);
 const secrets=await sql(`SELECT p.notes_envelope AS note,t.tenants_envelope AS tenants
   FROM residential_property_profiles p JOIN residential_property_tenancy_snapshots t
   ON t.property_id=p.property_id WHERE p.property_id=?`,propertyId).first();
 assert.ok(secrets.note && secrets.tenants);
 assert.ok(!secrets.note.includes('Private synthetic'));
 assert.ok(!secrets.tenants.includes('Alex Example'));
 assert.ok(!secrets.tenants.includes('alex@example.test'));
 const dashboard=await api(base+'/data',{cookie:owner.cookie});
 assert.equal(dashboard.status,200,JSON.stringify(dashboard.data));
 assert.equal(dashboard.data.properties.find(p=>p.id===propertyId).property_type,'House');
 assert.ok(!JSON.stringify(dashboard.data).includes('alex@example.test'),
  'Tenant contacts must not leak into general workspace data.');
 const duplicate=await api(base+'/properties',{cookie:owner.cookie,body:input});
 assert.equal(duplicate.status,201);
 assert.equal(duplicate.data.propertyId,propertyId);
 assert.equal(duplicate.data.alreadyExists,true);
 assert.equal((await sql('SELECT count(*) AS n FROM properties WHERE id=?',propertyId).first()).n,1);
 assert.equal((await sql('SELECT count(*) AS n FROM residential_property_tenancy_snapshots WHERE property_id=?',propertyId).first()).n,1);
 assert.equal((await sql('SELECT count(*) AS n FROM invitations').first()).n,0);
 assert.equal((await sql('SELECT count(*) AS n FROM tenancy_memberships').first()).n,0);
 assert.equal((await sql('SELECT count(*) AS n FROM tenancies').first()).n,0);
 assert.equal((await sql('SELECT subscription_intent FROM account_subscription_preferences WHERE client_id=?',
   clientId).first()).subscription_intent,'none');
 const outsiderRead=await api(base+'/properties/'+propertyId+'/setup',{cookie:outsider.cookie});
 assert.ok([403,404].includes(outsiderRead.status));
 await sql(`INSERT INTO client_memberships(id,client_id,user_id,role,created_at)
   VALUES('viewer-synthetic',?,?,'viewer',?)`,clientId,viewer.id,new Date().toISOString()).run();
 const viewerRead=await api(base+'/properties/'+propertyId+'/setup',{cookie:viewer.cookie});
 assert.equal(viewerRead.status,200);
 assert.equal(viewerRead.data.canEdit,false);
 assert.equal(viewerRead.data.tenancy,null);
 assert.equal(viewerRead.data.profile.notes,'');
 const update={expectedVersion:1,
  profile:{...profile,bedrooms:5,carSpaces:3},notes:'Updated private owner notes',
  tenancy:{...tenancy,leaseType:'periodic',endsOn:null}};
 assert.equal((await api(base+'/properties/'+propertyId+'/setup',
  {cookie:viewer.cookie,body:update})).status,403);
 const saved=await api(base+'/properties/'+propertyId+'/setup',{cookie:owner.cookie,body:update});
 assert.equal(saved.status,200,JSON.stringify(saved.data));
 assert.equal(saved.data.version,2);
 assert.equal(saved.data.occupancyUpdated,true);
 const current=await api(base+'/properties/'+propertyId+'/setup',{cookie:owner.cookie});
 assert.equal(current.data.profile.bedrooms,5);
 assert.equal(current.data.profile.carSpaces,3);
 assert.equal(current.data.tenancy.leaseType,'periodic');
 assert.equal(current.data.historyCount,2);
 assert.equal((await api(base+'/properties/'+propertyId+'/setup',
  {cookie:owner.cookie,body:update})).status,409);
 const same=await api(base+'/properties/'+propertyId+'/setup',{cookie:owner.cookie,
  body:{...update,expectedVersion:2}});
 assert.equal(same.status,200,JSON.stringify(same.data));
 assert.equal(same.data.occupancyUpdated,false);
 const changed=await api(base+'/properties/'+propertyId+'/setup',{cookie:owner.cookie,
  body:{...update,expectedVersion:3,
   tenancy:{occupancyStatus:'vacant',leaseType:null,startsOn:null,endsOn:null,tenants:[]}}});
 assert.equal(changed.status,200,JSON.stringify(changed.data));
 assert.equal((await api(base+'/properties/'+propertyId+'/setup',{cookie:owner.cookie})).data.historyCount,3);
 assert.equal((await sql('SELECT count(*) AS n FROM residential_property_tenancy_snapshots WHERE property_id=? AND is_current=1',
   propertyId).first()).n,1);
 assert.equal((await sql('SELECT count(*) AS n FROM invitations').first()).n,0);
 assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
 console.log('PASS: property wizard atomic creation, encryption, no invitations/subscriptions, history, owner/viewer isolation and version guards');
} finally { await mf.dispose(); }
