import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 CO_LIVING_BANNERS,CO_LIVING_GUIDE_SLUGS,CO_LIVING_STAGE_STEPS,CO_LIVING_EXAMPLE_ROOMS,
 EXAMPLE_CO_LIVING_ROOM_WEEKLY_CENTS,sampleCoLivingProjection,coLivingProjection,
} from '../packages/marketing/co-living-hub.ts';
import {isPublicSitePath,shouldIndexPublicPage} from '../apps/platform/app/lib/public-routes.ts';

test('Co-Living hub provides exactly six navigable banners, not dead links',()=>{
 assert.deepEqual(CO_LIVING_BANNERS.map(x=>x.slug),[
  'overview','how-it-works','property-setup','inclusions','pricing','example-property']);
 assert.equal(new Set(CO_LIVING_BANNERS.map(x=>x.href)).size,6);
 assert.equal(CO_LIVING_BANNERS[0].href,'/co-living#overview');
 for(const item of CO_LIVING_BANNERS){
  assert.ok(item.title.length>4&&item.action.length>5&&item.description.length>60);
  assert.match(item.href,/^\/co-living(?:[\/#][a-z-]+)?$/);
 }
 assert.equal(CO_LIVING_GUIDE_SLUGS.length,5);
 assert.ok(CO_LIVING_GUIDE_SLUGS.every(x=>CO_LIVING_BANNERS.some(b=>b.slug===x)));
 assert.deepEqual(CO_LIVING_STAGE_STEPS.map(x=>x.title),['Enquiry','Site Visit','Proposal','Implementation','Advertising','Tenanted']);
 assert.ok(CO_LIVING_STAGE_STEPS.every(x=>x.owner.length>25&&x.outcome.length>30));
});
test('only the intended five subpages are public and indexable at canonical origin',()=>{
 for(const slug of CO_LIVING_GUIDE_SLUGS){
  const url='/co-living/'+slug;
  assert.equal(isPublicSitePath(url),true,url);
  assert.equal(shouldIndexPublicPage(url,'https://proinspect.systems','production'),true,url);
  assert.equal(shouldIndexPublicPage(url,'https://preview.proinspect.systems','production'),false,url);
 }
 assert.equal(isPublicSitePath('/co-living/not-a-page'),false);
 const routes=readFileSync('apps/platform/app/routes.ts','utf8');
 assert.match(routes,/route\('co-living\/:topic'/);
 assert.match(routes,/co-living-guide\.tsx/);
 const sitemap=readFileSync('apps/marketing/app/routes/sitemap.ts','utf8');
 for(const slug of CO_LIVING_GUIDE_SLUGS)assert.ok(sitemap.includes("'/co-living/"+slug+"'"));
});
test('six-bedroom illustration preserves agreed gross, fee, GST and annual utility allowance',()=>{
 assert.equal(CO_LIVING_EXAMPLE_ROOMS.length,6);
 assert.equal(EXAMPLE_CO_LIVING_ROOM_WEEKLY_CENTS,205000);
 const p=sampleCoLivingProjection(100);
 assert.equal(p.grossWeeklyCents,210000);
 assert.equal(p.grossAnnualCents,10920000);
 assert.equal(p.managementAnnualExGstCents,2730000);
 assert.equal(p.managementGstAnnualCents,273000);
 assert.equal(p.managementAnnualIncludingGstCents,3003000);
 assert.equal(p.annualUtilityAllowanceCents,682500);
 assert.equal(p.ownerAnnualAfterFeesCents,7917000);
});
test('95% occupancy and annual utility overrun lower owner income transparently',()=>{
 const p=sampleCoLivingProjection(95,10000,683408);
 assert.equal(p.grossWeeklyCents,199750);
 assert.equal(p.grossAnnualCents,10387000);
 assert.equal(p.managementAnnualExGstCents,2596750);
 assert.equal(p.annualUtilityAllowanceCents,649188);
 assert.equal(p.utilityOverageCents,34220);
 assert.equal(p.ownerAnnualAfterFeesCents,7530575);
 assert.equal(p.ownerAnnualAfterModelledCostsCents,6976355);
});
test('fees apply to rent collected, not vacant room potential and not GST-inclusive management',()=>{
 const empty=coLivingProjection({roomWeeklyCents:205000,parkingWeeklyCents:0,occupancyPercent:0});
 assert.equal(empty.managementAnnualExGstCents,0);
 assert.equal(empty.annualUtilityAllowanceCents,0);
 const parking=coLivingProjection({roomWeeklyCents:205000,parkingWeeklyCents:5000,occupancyPercent:0});
 assert.equal(parking.grossWeeklyCents,5000);
 assert.equal(parking.annualUtilityAllowanceCents,16250);
 assert.throws(()=>coLivingProjection({roomWeeklyCents:1,parkingWeeklyCents:1,occupancyPercent:101}),RangeError);
});

test('main Co-Living page never displays figures derived from a sample floor plan',()=>{
 const landing=readFileSync('apps/marketing/app/components/co-living-landing.tsx','utf8');
 assert.match(landing,/Your property deserves its own numbers/);
 assert.match(landing,/to="\/co-living\/pricing"/);
 assert.match(landing,/to="\/contact\?topic=co-living"/);
 assert.doesNotMatch(landing,/sampleCoLivingProjection|pi-co-living-metrics|example\.grossWeeklyCents/);
 assert.doesNotMatch(landing,/Illustrative six-bedroom example|Potential gross rent|Annual utility allowance at full income/);
});
