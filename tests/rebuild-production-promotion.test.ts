import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { residentialPublicResponse } from '../packages/domain/residential-policy.ts';
import { shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';
test('production promotion does not bind staging resources or staging authentication',()=>{
 const config=JSON.parse(readFileSync('apps/platform/wrangler.jsonc','utf8'));
 assert.equal(config.env.connected.name,'proinspect-platform');
 assert.equal(config.env.connected.vars.APP_ENV,'production');
 assert.equal(config.env.connected.vars.APP_ORIGIN,'https://proinspect.systems');
 assert.equal(config.env.connected.d1_databases[0].database_name,'proinspect-platform-data');
 assert.equal(config.env.connected.vars.STRIPE_BILLING_ENABLED,'false');
 assert.equal(config.env.connected.vars.COMMERCIAL_APPLICATIONS_ENABLED,'false');
 assert.ok(!config.env.rebuild);
 const auth=readFileSync('packages/auth/staging-access.ts','utf8');
 assert.ok(!auth.includes('proinspect-rebuild.delicate-dream-e4c9.workers.dev'));
});
test('approved editorial pages remain unindexed and cannot accept POSTs',()=>{
 for(const path of ['/commercial','/construction']){
  const url='https://proinspect.systems'+path;
  assert.equal(residentialPublicResponse(new Request(url)),null);
  assert.equal(residentialPublicResponse(new Request(url,{method:'POST'}))?.status,410);
  assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false);
 }
 for(const path of ['/properties-for-lease/commercial','/commercial-application/session','/services/commercial-property-inspection','/construction/new']){
  assert.equal(residentialPublicResponse(new Request('https://proinspect.systems'+path))?.status,410);
 }
});
