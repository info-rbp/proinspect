import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEASING_PROPERTY_TYPES, leasingPropertyType, leasingPropertyTypeLabel, filterLeasingListings } from '../packages/marketing/leasing-property-types.ts';
import { residentialPublicResponse } from '../packages/domain/residential-policy.ts';

test('public leasing search exposes exactly the five approved property types in order', () => {
  assert.deepEqual(LEASING_PROPERTY_TYPES.map(x=>[x.value,x.label]), [
    ['residential','Residential'], ['commercial','Commercial'], ['co-living','Co-Living'],
    ['co-working','Co-Working'], ['other','Other'],
  ]);
  for(const {value,label} of LEASING_PROPERTY_TYPES){
    assert.equal(leasingPropertyType(value),value);
    assert.equal(leasingPropertyTypeLabel(value),label);
  }
  for(const value of [null, '', 'invalid', 'RESIDENTIAL', '__proto__']){
    assert.equal(leasingPropertyType(value),'');
    assert.equal(leasingPropertyTypeLabel(value),undefined);
  }
});

test('type and location filters combine without relabelling or generating listings', () => {
  const records = LEASING_PROPERTY_TYPES.map(({value},i)=>({kind:value,title:'Example '+i,suburb:i%2?'Fremantle':'Perth',postcode:i%2?'6160':'6000',display_address:'Test '+i}));
  assert.deepEqual(filterLeasingListings(records,'',''),records);
  for(const {value} of LEASING_PROPERTY_TYPES) assert.deepEqual(filterLeasingListings(records,value,''),records.filter(x=>x.kind===value));
  assert.equal(filterLeasingListings(records,'co-working',' FREMANTLE ').length,1);
  assert.equal(filterLeasingListings(records,'co-working','6000').length,0);
  assert.equal(filterLeasingListings(records,'other','test 4').length,1);
  const currentlyPublished=records.filter(x=>x.kind==='residential');
  for(const {value} of LEASING_PROPERTY_TYPES.filter(x=>x.value!=='residential'))
    assert.deepEqual(filterLeasingListings(currentlyPublished,value,''),[]);
  assert.deepEqual(filterLeasingListings([{kind:'unrecognised'}],'other',''),[]);
});

test('search taxonomy does not reopen retired publication or application flows',()=>{
  const code=readFileSync('apps/platform/worker/features/leasing.server.ts','utf8');
  assert.ok(code.includes("if(kind && kind!=='residential')return [];"));
  assert.ok(code.includes("kind='residential';"));
  assert.match(code,/requireResidentialSector\(kind\)/);
  for(const origin of ['https://proinspect-rebuild.delicate-dream-e4c9.workers.dev','https://proinspect.systems'])
    for(const path of ['/properties-for-lease/commercial','/properties-for-lease/commercial/example','/properties-for-lease/commercial/example/apply'])
      assert.equal(residentialPublicResponse(new Request(origin+path))?.status,410);
});
