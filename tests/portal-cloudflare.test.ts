import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TARGET_DATABASE,
  EXPECTED_EMAIL_PORTALS,
  cloudflareCredentials,
  resolveLiveDatabase,
  wranglerConfig,
  validateExistingTables,
  verifyPortals,
} from '../scripts/portal-testing/provision-cloudflare.mjs';
const uuid = 'a2b34567-89ab-4cde-8f01-234567890abc';
const bindings = [
  {type:'d1',name:'DB',database_id:uuid},
  {type:'plain_text',name:'APP_ENV',text:'production'},
];
const settings = {bindings};
const database = {uuid,name:TARGET_DATABASE};

test('live API credentials stay in GitHub secret environment and restrict execution to main',()=>{
  const base={CLOUDFLARE_API_TOKEN:'redacted',CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),GITHUB_REPOSITORY:'info-rbp/proinspect',GITHUB_REF:'refs/heads/main'};
  assert.equal(cloudflareCredentials(base).accountId,'a'.repeat(32));
  assert.throws(()=>cloudflareCredentials({...base,CLOUDFLARE_API_TOKEN:''}),/CLOUDFLARE_API_TOKEN/);
  assert.throws(()=>cloudflareCredentials({...base,CLOUDFLARE_ACCOUNT_ID:'0'}),/CLOUDFLARE_ACCOUNT_ID/);
  assert.throws(()=>cloudflareCredentials({...base,GITHUB_REF:'refs/heads/develop'}),/restricted to/);
  assert.throws(()=>cloudflareCredentials({...base,GITHUB_REPOSITORY:'example/wrong'}),/restricted to/);
});

test('preflight targets exactly the deployed D1 database and production Worker',()=>{
  assert.equal(resolveLiveDatabase(settings,database),uuid);
  assert.throws(()=>resolveLiveDatabase({bindings:[bindings[1]]},database),/exactly one/);
  assert.throws(()=>resolveLiveDatabase(settings,{uuid,name:'different'}),/does not match/);
  assert.throws(()=>resolveLiveDatabase({...settings,bindings:[bindings[0],{...bindings[1],text:'local'}]},database),/production/);
  assert.throws(()=>resolveLiveDatabase({bindings:[bindings[0],bindings[0],bindings[1]]},database),/exactly one/);
  const config=wranglerConfig(uuid);
  assert.equal(config.d1_databases[0].database_id,uuid);
  assert.equal(config.d1_databases[0].migrations_dir,'../../database/migrations');
  assert.equal(config.d1_databases[0].database_name,TARGET_DATABASE);
  assert.equal(Object.hasOwn(config,'vars'),false);
});

test('migrations refuse unrelated or damaged existing application schemas',()=>{
  assert.equal(validateExistingTables([]),true);
  assert.equal(validateExistingTables(['users','services','d1_migrations']),true);
  assert.throws(()=>validateExistingTables(['users']),/without migration history/);
  assert.throws(()=>validateExistingTables(['d1_migrations']),/no users table/);
});

test('remote verification requires exactly eight distinct scoped access results',()=>{
  const rows=Object.entries(EXPECTED_EMAIL_PORTALS).map(([email,expected_portal])=>({email,expected_portal,portal_status:'ACCESS_ASSIGNED',sign_in_status:'EMAIL_NOT_YET_VERIFIED'}));
  assert.deepEqual(verifyPortals(rows),{count:8,verified:0});
  assert.deepEqual(verifyPortals(rows.map((r,i)=>i===0?{...r,sign_in_status:'EMAIL_VERIFIED'}:r)),{count:8,verified:1});
  assert.throws(()=>verifyPortals(rows.slice(1)),/Expected 8/);
  assert.throws(()=>verifyPortals([...rows.slice(1),rows[1]]),/Duplicate/);
  assert.throws(()=>verifyPortals(rows.map((r,i)=>i===0?{...r,portal_status:'EXTRA_WORKSPACE_REVIEW'}:r)),/Portal verification failed/);
  assert.throws(()=>verifyPortals(rows.map((r,i)=>i===0?{...r,sign_in_status:'FAKED_VERIFICATION'}:r)),/Portal verification failed/);
});

test('one-time trigger does not deploy or alter Worker code and cannot run on ordinary pushes',()=>{
  const workflow=readFileSync('.github/workflows/portal-test-provision-once.yml','utf8');
  assert.match(workflow,/branches: \[main\]/);
  assert.match(workflow,/paths:.*\n\s+- scripts\/portal-testing\/provision-once-2026-10-11\.intent/);
  assert.match(workflow,/d1 migrations apply DB --remote/);
  assert.match(workflow,/d1 execute DB --remote/);
  assert.doesNotMatch(workflow,/wrangler deploy|workflow_dispatch|secrets-bulk|workers\/scripts\/.+\/secrets/);
});