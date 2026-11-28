import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_NAVIGATION } from '../packages/marketing/public-navigation.ts';
import { residentialPublicResponse } from '../packages/domain/residential-policy.ts';
import { isMarketingStylePath, shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';

const origin = 'https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
test('all ten top-level menu destinations match the approved order', () => {
  assert.deepEqual(PUBLIC_NAVIGATION.map(x=>[x.label,x.href]), [
    ['Residential','/residential'],['Commercial','/commercial'],['Co-Spaces','/co-spaces'],
    ['Maintenance','/maintenance'],['Modular','/modular'],['Tenants','/tenants'],
    ['Leasing','/leasing'],['Subscriptions','/subscriptions'],['Information','/information'],
    ['Sign Up / Sign In','/client'],
  ]);
  for (const item of PUBLIC_NAVIGATION.filter(x=>x.href!=='/client')) {
    assert.ok(isMarketingStylePath(item.href), item.href);
    assert.equal(shouldIndexPublicPage(item.href,origin,'staging'),false);
    for (const file of ['apps/platform/app/routes.ts','apps/marketing/app/routes.ts'])
      assert.ok(readFileSync(file,'utf8').includes("route('"+item.href.slice(1)+"',"), item.href+' '+file);
  }
});
test('commercial landing exception is rebuild-only and does not reactivate commercial workflows', () => {
  for (const path of ['/commercial','/commercial.data','/commercial/'])
    assert.equal(residentialPublicResponse(new Request(origin+path)),null);
  for (const path of ['/commercial/new','/commercial-applications','/properties-for-lease/commercial','/strata','/construction'])
    assert.equal(residentialPublicResponse(new Request(origin+path))?.status,410);
  assert.equal(residentialPublicResponse(new Request('https://proinspect.systems/commercial'))?.status,410);
});
test('new editorial landings remain excluded from indexing until reviewed', () => {
  for (const path of ['/commercial','/co-spaces','/modular','/subscriptions','/information'])
    assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false);
});
