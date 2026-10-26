import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SERVICE_SEEDS} from '../packages/service-catalogue/index.ts';
import {SERVICE_SCOPE_DETAILS,SERVICE_SCOPE_SECTIONS} from '../packages/marketing/contractual-service-scopes.ts';
import {PUBLIC_LEGAL_APPROVAL,PUBLIC_LEGAL_DRAFTS,PUBLIC_LEGAL_VERSION} from '../packages/marketing/legal-drafts.ts';
import {shouldIndexPublicPage,isPublicSitePath} from '../apps/platform/app/lib/public-routes.ts';

const expected=['privacy','terms','website-terms','platform-terms','booking-policy','service-scopes','subscription-terms'];
test('seven distinct review-only legal drafts are accessible and not indexable',()=>{
 assert.deepEqual(Object.keys(PUBLIC_LEGAL_DRAFTS).sort(),expected.sort());
 for(const key of expected){
  assert.equal(PUBLIC_LEGAL_APPROVAL[key as keyof typeof PUBLIC_LEGAL_APPROVAL].approved,false);
  assert.equal(PUBLIC_LEGAL_DRAFTS[key as keyof typeof PUBLIC_LEGAL_DRAFTS].version,PUBLIC_LEGAL_VERSION);
  assert.ok(PUBLIC_LEGAL_DRAFTS[key as keyof typeof PUBLIC_LEGAL_DRAFTS].sections.length>=10);
  assert.equal(isPublicSitePath('/'+key),true);
  assert.equal(shouldIndexPublicPage('/'+key,'https://proinspect.systems','production'),false);
 }
});
test('all and only the published 23 services receive one descriptive scope',()=>{
 assert.equal(SERVICE_SEEDS.length,23);
 assert.equal(SERVICE_SCOPE_SECTIONS.length,23);
 assert.deepEqual(Object.keys(SERVICE_SCOPE_DETAILS).sort(),SERVICE_SEEDS.map(s=>s.id).sort());
 for(const service of SERVICE_SEEDS){
  const scope=SERVICE_SCOPE_DETAILS[service.id];
  assert.ok(scope.work.length>50);
  assert.ok(scope.output.length>35);
  assert.ok(scope.limits.length>45);
  assert.equal(service.price_ex_gst_cents,null);
 }
});
test('existing marketing and platform routes retain legal links with draft notice',()=>{
 const i=readFileSync('apps/marketing/app/routes/information.tsx','utf8');
 const f=readFileSync('apps/marketing/app/components/site-chrome.tsx','utf8');
 for(const key of expected)assert.ok(f.includes('to="/'+key+'"'),key);
 assert.match(i,/noindex, nofollow/);
 assert.match(i,/Do not treat this review draft as an approved policy or a binding contract/);
});
test('negotiated residential prices and limits are not applied to the service catalogue',()=>{
 const s=readFileSync('packages/service-catalogue/index.ts','utf8');
 assert.match(s,/price_ex_gst_cents: null/);
 const p=PUBLIC_LEGAL_DRAFTS['subscription-terms'].sections.map(x=>x[1]).join(' ');
 assert.match(p,/two routine inspections/);
 assert.match(p,/quarterly Routine Inspections/);
});
