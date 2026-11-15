import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SECTOR_OVERVIEWS } from '../packages/marketing/sector-overviews.ts';
import { SECTOR_PROGRAMMES } from '../packages/marketing/sector-programmes.ts';
import { AUDIENCES } from '../packages/marketing/audiences.ts';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { RELATED_SERVICE_IDS, SERVICE_EXAMPLES } from '../packages/marketing/related-services.ts';
import { ENGAGEMENTS, GUIDES } from '../packages/marketing/content.ts';
import { PUBLIC_PLANS } from '../packages/marketing/public-facts.ts';
import { PUBLIC_LEGAL_APPROVAL } from '../packages/marketing/legal-drafts.ts';
import { shouldIndexPublicPage } from '../apps/platform/app/lib/public-routes.ts';

test('dedicated Student Living service is published alongside all seven programme briefs', () => {
  assert.ok(SECTOR_OVERVIEWS['student-living']);
  assert.equal(SECTOR_OVERVIEWS['student-living'].services.length, 4);
  assert.equal(Object.keys(SECTOR_PROGRAMMES).length, 7);
  for (const slug of ['residential','commercial','strata','co-living','student-living','construction','maintenance']) {
    const p = SECTOR_PROGRAMMES[slug];
    assert.ok(p, slug);
    assert.equal(p.outputs.length, 4, slug + ' outputs');
    assert.equal(p.onboarding.length, 4, slug + ' onboarding');
    assert.ok(p.benefit.length > 40);
  }
  assert.equal(shouldIndexPublicPage('/student-living', 'https://proinspect.systems','production'), true);
});

test('three approved marketing prices remain unchanged, without invented entitlements', () => {
  assert.deepEqual(PUBLIC_PLANS.map(x=>x.monthlyExGst),[20,150,150]);
  const comparison = readFileSync('apps/marketing/app/components/plan-comparison.tsx','utf8');
  assert.match(comparison,/not confirmed included entitlements/);
  assert.match(comparison,/property-specific subscription schedule/);
  assert.doesNotMatch(comparison,/unlimited visits included/i);
});

test('all 23 individual services have relevant recommendations and usable examples', () => {
  assert.equal(SERVICE_SEEDS.length,23);
  const ids = new Set(SERVICE_SEEDS.map(x=>x.id));
  for (const service of SERVICE_SEEDS) {
    const recommended = RELATED_SERVICE_IDS[service.id];
    assert.ok(recommended && recommended.length > 0, service.id + ' related');
    assert.ok(SERVICE_EXAMPLES[service.id]?.length >= 2, service.id + ' examples');
    for (const id of recommended) {
      assert.ok(ids.has(id), 'unknown recommendation '+id);
      assert.notEqual(id,service.id,'self recommendation');
    }
  }
  const commercial = RELATED_SERVICE_IDS['commercial-property-inspection'];
  assert.ok(!commercial.includes('routine-inspection'));
  assert.ok(!commercial.includes('property-condition-report'));
});

test('all four engagement models and six educational guides provide practical detail', () => {
  assert.equal(Object.keys(ENGAGEMENTS).length,4);
  assert.equal(Object.keys(GUIDES).length,6);
  for (const [key, model] of Object.entries(ENGAGEMENTS)) {
    assert.ok(model.sections.length >= 4,key);
  }
  for (const [key, guide] of Object.entries(GUIDES)) {
    assert.ok(guide.sections.length >= 5,key);
    assert.ok(guide.services.every(s=>SERVICE_SEEDS.some(row=>row.id===s)),key);
  }
});

test('ten audience segments include each new customer type and concrete outputs', () => {
  assert.equal(Object.keys(AUDIENCES).length,10);
  for (const slug of ['co-living-operators','student-accommodation-operators','construction-project-owners','construction-teams']) {
    assert.ok(AUDIENCES[slug].programme);
    assert.ok(AUDIENCES[slug].deliverables?.length >= 3);
  }
});

test('legal publication lock and no-index boundaries are preserved', () => {
  assert.ok(Object.values(PUBLIC_LEGAL_APPROVAL).every(item=>item.approved===false));
  assert.equal(shouldIndexPublicPage('/privacy','https://proinspect.systems','production'),false);
  assert.equal(shouldIndexPublicPage('/terms','https://proinspect.systems','production'),false);
  const sitemap = readFileSync('apps/marketing/app/routes/sitemap.ts','utf8');
  assert.match(sitemap,/student-living/);
  assert.doesNotMatch(sitemap,/['"]\/sectors\/residential['"]/);
  const redirect = readFileSync('apps/marketing/app/routes/sector-redirect.tsx','utf8');
  assert.match(redirect,/301/);
});
