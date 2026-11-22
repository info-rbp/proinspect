import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {RESIDENTIAL_CATEGORIES,residentialCategory} from '../packages/marketing/residential-categories.ts';
import {SERVICE_SEEDS} from '../packages/service-catalogue/index.ts';
import {shouldIndexPublicPage} from '../apps/platform/app/lib/public-routes.ts';
test('eight Residential categories link to valid canonical bookable services or scoped public flows',()=>{
 assert.equal(RESIDENTIAL_CATEGORIES.length,8);
 const published=new Set(SERVICE_SEEDS.filter(s=>s.sectors.includes('residential')).map(s=>s.id));
 const names=new Set();
 for(const c of RESIDENTIAL_CATEGORIES){
  assert.ok(!names.has(c.slug));names.add(c.slug);
  assert.equal(residentialCategory(c.slug)?.title,c.title);
  assert.ok(c.features.length>=3);
  for(const f of c.features){
   assert.ok(f.href.startsWith('/'));
   if(f.href.startsWith('/services/'))assert.ok(published.has(f.href.split('/')[2]),f.href);
   assert.ok(f.description.length>30);
  }
 }
 assert.equal(residentialCategory('unknown'),undefined);
});
test('new public marketing routes exist in both apps and follow public publication boundaries',()=>{
 for(const path of ['apps/marketing/app/routes.ts','apps/platform/app/routes.ts']){
  const content=readFileSync(path,'utf8');
  for(const route of ['residential/services','residential/services/:category','residential/subscriptions','help-centre','example-reports'])
   assert.ok(content.includes("route('"+route+"'"),path+' '+route);
 }
 for(const path of ['/residential/services','/residential/services/property-inspections','/help-centre','/example-reports'])
  assert.equal(shouldIndexPublicPage(path,'https://proinspect.systems','production'),true);
 assert.equal(shouldIndexPublicPage('/residential/subscriptions','https://proinspect.systems','production'),false);
 assert.equal(shouldIndexPublicPage('/commercial','https://proinspect.systems','production'),false);
});
