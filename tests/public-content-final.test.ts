import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PUBLIC_PLANS, PUBLIC_COMPANY, RESIDENTIAL_SERVICE_GROUPS, BUILDING_SERVICE_GROUPS } from '../packages/marketing/public-facts.ts';
import { SECTOR_OVERVIEWS } from '../packages/marketing/sector-overviews.ts';
import { descriptiveCatalogue, descriptiveV4Service } from '../packages/marketing/public-catalogue.ts';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { v4Catalogue } from '../packages/v4/catalogue.ts';
import { findServiceArea } from '../packages/marketing/service-areas.ts';
import coverageReference from '../packages/marketing/service-area-reference.json' with { type: 'json' };
import { enquirySchema } from '../packages/marketing/enquiry.ts';

test('final public offers and service groups use the controlling register', () => {
  assert.deepEqual(PUBLIC_PLANS.map(p => p.monthlyExGst), [20,150,150]);
  assert.equal(PUBLIC_COMPANY.abn, '52 703 550 609');
  assert.equal(RESIDENTIAL_SERVICE_GROUPS.length, 14);
  assert.equal(BUILDING_SERVICE_GROUPS.length, 8);
  for (const page of Object.values(SECTOR_OVERVIEWS)) {
    assert.equal(page.services.length, 4);
    assert.equal(page.difference.length, 3);
    assert.equal(page.questions.length, 3);
    assert.doesNotMatch(JSON.stringify(page), /\$50|\$250|\$100|65 hours|management is planned|not yet available to book/);
  }
});
test('anonymous catalogue projections cannot expose stored amounts or future rate columns', async () => {
  const priced=SERVICE_SEEDS.map(s=>({...s,price_ex_gst_cents:123456,private_rate:654321}));
  const publicRows=descriptiveCatalogue(priced);
  assert.ok(publicRows.every(s=>s.price_ex_gst_cents===null));
  assert.doesNotMatch(JSON.stringify(publicRows),/123456|654321|private_rate/);
  assert.equal(priced[0].price_ex_gst_cents,123456,'Private pricing must remain unchanged');
  for(const source of (await v4Catalogue()).services) {
    const projected=descriptiveV4Service(source);
    assert.equal(projected.baseCents,null); assert.equal(projected.minimumCents,null);
    assert.doesNotMatch(projected.feeText,/\$/);
    assert.equal(projected.staffGuide,'');
  }
});
test('location matching requires the exact pair and never infers a broad postcode range', () => {
  assert.equal(coverageReference.length,589);
  assert.equal(coverageReference.filter(r=>r.classification==='manual_review').length,146);
  assert.equal(coverageReference.filter(r=>r.classification==='standard_reference').length,443);
  assert.equal(findServiceArea('Perth','6000').classification,'standard_reference');
  assert.equal(findServiceArea('  ALEXANDER-HEIGHTS  ','6064').classification,'standard_reference');
  assert.equal(findServiceArea('Perth','6168').classification,'by_request');
  assert.equal(findServiceArea('Garden Island','6168').classification,'manual_review');
  assert.equal(findServiceArea('Rottnest Island','6161').classification,'manual_review');
  assert.equal(findServiceArea('Boddington','6390').classification,'manual_review');
});
test('contact categories and postcode stay compatible with existing enquiry storage', () => {
  const value=enquirySchema.parse({requestKey:crypto.randomUUID(),name:'Example Enquirer',email:'example@example.test',kind:'portfolio',category:'student-living',postcode:'6000',message:'Please scope our shared property support.',consent:true});
  assert.equal(value.kind,'portfolio'); assert.equal(value.category,'student-living');
  assert.equal(enquirySchema.safeParse({...value,postcode:'60000'}).success,false);
});

test('inactive guest campaign copy does not expose obsolete rates in public JavaScript',()=>{
 const source=readFileSync('apps/platform/app/routes/guest-book.tsx','utf8');
 assert.doesNotMatch(source,/\$[0-9]+/);
 assert.match(source,/Sign in to view individual service pricing or request a quote/);
});
