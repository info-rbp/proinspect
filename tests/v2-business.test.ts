import { test } from 'node:test';
import assert from 'node:assert/strict';
import { V2_MARKETS,V2_SERVICE_SEEDS,V2_PLANS } from '../packages/v2/catalogue.ts';
import { calculateV2Quote } from '../packages/v2/pricing.ts';
test('V2 model has eleven markets and 69 stable, draft service identities',()=>{
  assert.equal(V2_MARKETS.length,11);
  assert.equal(new Set(V2_MARKETS.map(m=>m.code)).size,11);
  assert.equal(V2_PLANS.length,3);
  assert.equal(V2_SERVICE_SEEDS.length,69);
  assert.equal(new Set(V2_SERVICE_SEEDS.map(s=>s.code)).size,69);
  assert.equal(V2_SERVICE_SEEDS.filter(s=>s.legacyId).length,23);
  assert.ok(V2_SERVICE_SEEDS.every(s=>s.proposedMarkets.length>0));
});
test('V2 pricing separates delivery margin and third-party pass-through',()=>{
  const x=calculateV2Quote({hoursMilli:2000,visits:1,quantity:2,complexityBp:10000,externalPassThroughCents:20000,loadedHourlyCents:6200,travelVisitCents:2500,fixedAdminCents:1200,contingencyBp:1000,targetMarginBp:3800,gstBp:1000});
  assert.equal(x.laborCents,12400);
  assert.equal(x.attendanceCents,2500);
  assert.equal(x.riskAdjustedUnitCents,17710);
  assert.equal(x.unitServiceFeeCents,28565);
  assert.equal(x.externalCents,40000);
  assert.equal(x.exGstCents,97130);
  assert.equal(x.gstCents,9713);
  assert.equal(x.totalCents,106843);
});
test('V2 pricing rejects invalid, unbounded and impossible margin inputs',()=>{
 const base={hoursMilli:1000,visits:0,quantity:1,complexityBp:10000,externalPassThroughCents:0,loadedHourlyCents:6200,travelVisitCents:0,fixedAdminCents:0,contingencyBp:0,targetMarginBp:3800,gstBp:1000};
 assert.throws(()=>calculateV2Quote({...base,targetMarginBp:10000}),RangeError);
 assert.throws(()=>calculateV2Quote({...base,quantity:0}),RangeError);
 assert.throws(()=>calculateV2Quote({...base,hoursMilli:-1}),RangeError);
});
