import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
import {catalogueSql} from '../../scripts/catalogue-sql.mjs';

mkdirSync('artifacts',{recursive:true});
await build({entryPoints:['tests/runtime/entry.ts'],outfile:'artifacts/co-living-worker.mjs',
  bundle:true,format:'esm',platform:'browser',target:'es2022',external:['cloudflare:workers','node:*']});
const mf=new Miniflare({
  modules:true,scriptPath:'artifacts/co-living-worker.mjs',
  compatibilityDate:'2026-07-01',compatibilityFlags:['nodejs_compat'],
  d1Databases:{DB:'co-living-fixture'},
  r2Buckets:{DOCUMENTS:'co-living-docs',RESTRICTED_DOCUMENTS:'co-living-restricted'},
  durableObjects:{SCHEDULER:{className:'BookingScheduler',useSQLite:true}},
  bindings:{APP_ENV:'local',APP_ORIGIN:'http://localhost',
    DATA_ENCRYPTION_KEY:randomBytes(32).toString('base64'),EMAIL_PROVIDER:'local',
    OPERATIONS_EMAIL:'operations@example.test'},
});
const db=await mf.getD1Database('DB');
const sql=(q,...args)=>db.prepare(q).bind(...args);
async function api(path,{cookie,body,method,origin='http://localhost'}={}){
  const headers=new Headers({Origin:origin});
  if(cookie)headers.set('Cookie',cookie);
  let payload;
  if(body!==undefined){headers.set('Content-Type','application/json');payload=JSON.stringify(body);}
  const res=await mf.dispatchFetch('http://localhost'+path,{
    method:method??(payload?'POST':'GET'),headers:Object.fromEntries(headers),body:payload});
  return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():null,
    cookie:res.headers.get('set-cookie')};
}
async function login(email){
  const start=await api('/api/auth/start',{body:{email}});
  assert.equal(start.status,200,JSON.stringify(start.data));
  const token=new URL(start.data.localSignInUrl).searchParams.get('token');
  const response=await api('/api/auth/complete',{body:{email,token}});
  assert.equal(response.status,200,JSON.stringify(response.data));
  return {cookie:response.cookie.split(';')[0],email};
}
try{
  const statements=JSON.parse(execFileSync('python3',['scripts/schema-statements.py'],{encoding:'utf8'}));
  for(const item of statements)await db.prepare(item).run();
  for(const item of catalogueSql().split('\n'))await db.prepare(item).run();
  const owner=await login('coliving-owner@example.test');
  const other=await login('coliving-unrelated@example.test');
  const resident=await login('coliving-resident@example.test');
  const secondResident=await login('coliving-second@example.test');
  const manager=await login('coliving-operator@example.test');
  const inspector=await login('coliving-inspector@example.test');
  const op=await sql('SELECT id FROM users WHERE email=?',manager.email).first();
  const insp=await sql('SELECT id FROM users WHERE email=?',inspector.email).first();
  await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'operations_manager',1)",op.id).run();
  await sql("INSERT INTO staff_profiles(user_id,role,active) VALUES(?,'inspector',1)",insp.id).run();
  const registered=await api('/api/onboarding',{cookie:owner.cookie,
    body:{displayName:'Co Living Owner',clientName:'Synthetic Co Living Homes',landlordType:'residential'}});
  assert.equal(registered.status,201,JSON.stringify(registered.data));
  const clientId=registered.data.clientId,base='/api/w/landlord/'+clientId;
  const created=await api(base+'/properties',{cookie:owner.cookie,
    body:{address:'Unit 47, 87 Example Street',suburb:'Perth',postcode:'6000',propertyType:'House',selfManaged:true}});
  assert.equal(created.status,201,JSON.stringify(created.data));
  const prop=created.data.propertyId,route=base+'/properties/'+prop+'/co-living';

  assert.equal((await api('/api/session',{cookie:resident.cookie})).data.workspaces.some(w=>w.kind==='tenant'),false);
  assert.equal((await api('/api/w/tenant/missing/my-room',{cookie:resident.cookie})).status,403);
  assert.equal((await api(route,{cookie:other.cookie})).status,403);
  assert.equal((await api(route,{cookie:inspector.cookie})).status,403);
  assert.equal((await api(route,{cookie:owner.cookie})).status,200);
  assert.equal((await api(route,{cookie:owner.cookie,body:{action:'configure',allocationMode:'room'},
    origin:'https://untrusted.invalid'})).status,403);
  const configured=await api(route,{cookie:owner.cookie,body:{action:'configure',allocationMode:'room'}});
  assert.equal(configured.status,200,JSON.stringify(configured.data));
  const rooms={};
  for(const label of ['Room Alpha','Room Beta','Shared kitchen']){
    const createdSpace=await api(route,{cookie:owner.cookie,body:{action:'add_space',label,
      spaceType:label.startsWith('Shared')?'shared_area':'room'}});
    assert.equal(createdSpace.status,200,JSON.stringify(createdSpace.data));
    rooms[label]=createdSpace.data.spaceId;
  }
  assert.equal((await api(route,{cookie:owner.cookie,body:{action:'add_space',label:'Bed invalid',
    spaceType:'bed'}})).status,422);
  const tag=await sql("SELECT tag FROM account_experience_tags WHERE client_id=?",clientId).first();
  assert.equal(tag.tag,'co_living');
  const outsiderWorkspace=await api('/api/session',{cookie:other.cookie});
  assert.equal(outsiderWorkspace.data.workspaces.some(w=>w.scopeId===clientId),false);
  const invitationsBefore=await sql('SELECT COUNT(*) AS n FROM invitations').first();
  const start=new Date(Date.now()-86400000).toISOString();
  const end=new Date(Date.now()+95*86400000).toISOString();
  // Creating separate overlapping room tenancies is permitted across rooms, not within a room.
  const invite=await api(base+'/tenancies',{cookie:owner.cookie,
    body:{propertyId:prop,email:resident.email,spaceId:rooms['Room Alpha'],startsAt:start,endsAt:end}});
  assert.equal(invite.status,201,JSON.stringify(invite.data));
  const second=await api(base+'/tenancies',{cookie:owner.cookie,
    body:{propertyId:prop,email:secondResident.email,spaceId:rooms['Room Beta'],startsAt:start,endsAt:end}});
  assert.equal(second.status,201,JSON.stringify(second.data));
  assert.equal((await api(base+'/tenancies',{cookie:owner.cookie,
    body:{propertyId:prop,email:'duplicate@example.test',spaceId:rooms['Room Alpha'],startsAt:start,endsAt:end}})).status,409);
  assert.equal((await api(base+'/tenancies',{cookie:owner.cookie,
    body:{propertyId:prop,email:'unassigned@example.test',startsAt:start,endsAt:end}})).status,422);
  assert.equal((await sql('SELECT COUNT(*) AS n FROM invitations').first()).n,invitationsBefore.n+2);
  // Tenant cannot self-register or access another room before the verified invitation.
  assert.equal((await api('/api/w/tenant/'+invite.data.id+'/my-room',{cookie:resident.cookie})).status,403);
  const firstInvitation=await sql('SELECT token_hash FROM invitations WHERE tenancy_id=?',invite.data.id).first();
  assert.ok(firstInvitation?.token_hash);
  // Existing tenancy invitation implementation is covered by the full Worker fixture;
  // simulate an approved membership only after a recorded tenancy invitation exists.
  const residentId=(await sql('SELECT id FROM users WHERE email=?',resident.email).first()).id;
  const secondId=(await sql('SELECT id FROM users WHERE email=?',secondResident.email).first()).id;
  await sql('INSERT INTO tenancy_memberships(id,tenancy_id,user_id,starts_at) VALUES(?,?,?,?)',
    'cl_member_alpha',invite.data.id,residentId,'2026-11-01T00:00:00.000Z').run();
  await sql('INSERT INTO tenancy_memberships(id,tenancy_id,user_id,starts_at) VALUES(?,?,?,?)',
    'cl_member_beta',second.data.id,secondId,'2026-11-01T00:00:00.000Z').run();
  const residentRoom=await api('/api/w/tenant/'+invite.data.id+'/my-room',{cookie:resident.cookie});
  assert.equal(residentRoom.status,200,JSON.stringify(residentRoom.data));
  assert.equal(residentRoom.data.space.id,rooms['Room Alpha']);
  assert.deepEqual(residentRoom.data.sharedAreas.map(a=>a.id),[rooms['Shared kitchen']]);
  assert.equal((await api('/api/w/tenant/'+second.data.id+'/my-room',{cookie:resident.cookie})).status,403);
  const badRequest=await api('/api/w/tenant/'+invite.data.id+'/requests',{cookie:resident.cookie,
    body:{category:'maintenance',title:'Other resident door',details:'Only own room may be selected',priority:'routine',
      spaceId:rooms['Room Beta']}});
  assert.equal(badRequest.status,404,JSON.stringify(badRequest.data));
  const goodRequest=await api('/api/w/tenant/'+invite.data.id+'/requests',{cookie:resident.cookie,
    body:{category:'maintenance',title:'Shared kitchen tap',details:'Synthetic shared area repair request',priority:'routine',
      spaceId:rooms['Shared kitchen']}});
  assert.equal(goodRequest.status,201,JSON.stringify(goodRequest.data));
  await sql('UPDATE tenancy_memberships SET ends_at=? WHERE id=?','2026-11-01T00:00:00.000Z','cl_member_alpha').run();
  assert.equal((await api('/api/w/tenant/'+invite.data.id+'/my-room',{cookie:resident.cookie})).status,403);
  assert.equal((await api('/api/w/tenant/'+invite.data.id+'/requests',{cookie:resident.cookie,
    body:{category:'maintenance',title:'Old occupant test',details:'Do not permit expired access',priority:'routine'}})).status,403);
  assert.deepEqual((await db.prepare('PRAGMA foreign_key_check').all()).results,[]);
  console.log('PASS: invited Residential co-living roles, overlapping space denials, revocation and isolated request scope');
}finally{await mf.dispose();}
