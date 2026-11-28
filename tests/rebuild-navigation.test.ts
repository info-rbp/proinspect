import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PUBLIC_NAVIGATION } from '../packages/marketing/public-navigation.ts';
import { residentialPublicResponse } from '../packages/domain/residential-policy.ts';
import { isMarketingStylePath, shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';

const origin = 'https://proinspect-rebuild.delicate-dream-e4c9.workers.dev';
test('all eleven top-level menu destinations match the approved order', () => {
  assert.deepEqual(PUBLIC_NAVIGATION.map(x=>[x.label,x.href]), [
    ['Residential','/residential'],['Commercial','/commercial'],['Co-Spaces','/co-spaces'],
    ['Maintenance','/maintenance'],['Modular','/modular'],['Construction','/construction'],['Tenants','/tenants'],
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
test('commercial and construction landing exceptions are rebuild-only and do not reactivate retired workflows', () => {
  for (const path of ['/commercial','/commercial.data','/commercial/','/construction','/construction.data','/construction/'])
    assert.equal(residentialPublicResponse(new Request(origin+path)),null);
  for (const path of ['/commercial/new','/commercial-applications','/properties-for-lease/commercial','/strata','/construction/new','/construction-services','/sectors/construction'])
    assert.equal(residentialPublicResponse(new Request(origin+path))?.status,410);
  for (const path of ['/commercial','/construction'])
    assert.equal(residentialPublicResponse(new Request('https://proinspect.systems'+path))?.status,410);
});
test('new editorial landings remain excluded from indexing until reviewed', () => {
  for (const path of ['/commercial','/co-spaces','/modular','/construction','/subscriptions','/information'])
    assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false);
});

test('footer contains only the requested support navigation and retains company details', () => {
  const chrome=readFileSync('apps/marketing/app/components/site-chrome.tsx','utf8').split('export function MarketingFooter')[1];
  assert.ok(chrome);
  const footerLinks=Array.from(chrome.matchAll(/<Link\b[^>]*\bto="([^"]+)"[^>]*>/g),match=>match[1]);
  assert.deepEqual(footerLinks,['/','/help-centre','/about','/contact']);
  assert.match(chrome,/aria-label="Footer navigation"/);
  assert.match(chrome,/ABN 52 703 550 609/);
  assert.match(chrome,/ACN 703 550 609/);
  for(const path of ['/privacy','/website-terms','/platform-terms','/terms','/booking-policy','/service-scopes','/subscription-terms'])
    assert.equal(isMarketingStylePath(path),true,path+' remains a public route');
});

test('Co-Working is public editorial content, not a booking or indexed release', () => {
  const path='/co-spaces/co-working';
  assert.equal(isMarketingStylePath(path),true);
  assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),false);
  for(const file of ['apps/platform/app/routes.ts','apps/marketing/app/routes.ts'])
    assert.ok(readFileSync(file,'utf8').includes("route('co-spaces/co-working',"));
  const home=readFileSync('apps/marketing/app/routes/home.tsx','utf8');
  assert.match(home,/RebuildSubscriptionTiles/);
  assert.match(home,/to="\/subscriptions"/);
  assert.doesNotMatch(home,/PlanComparison|EditorialSteps|Have something specific in mind\?/);
});
