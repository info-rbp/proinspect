import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import { bookingCategoryForService, propertyBookingCategories } from '../packages/service-catalogue/booking-navigation.ts';
import { RESIDENTIAL_BOOKING_GROUPS, RESIDENTIAL_SERVICE_IDS,
  RESIDENTIAL_ADD_ONS } from '../packages/service-catalogue/residential-workflows.ts';

test('historic 23 catalogue identities remain and 16 new request-only services are defined',()=>{
  assert.equal(SERVICE_SEEDS.length,39);
  assert.equal(new Set(SERVICE_SEEDS.map(service=>service.id)).size,39);
  for(const service of SERVICE_SEEDS.slice(0,23)){
    assert.ok(service.active===1);
  }
  for(const service of SERVICE_SEEDS.slice(23)){
    assert.equal(service.booking_mode,'request',service.id);
    assert.equal(service.price_ex_gst_cents,null,service.id);
  }
});

test('residential clients see exactly seven inspections, four leasing, seven access, and one urgent service',()=>{
  const groups=propertyBookingCategories(SERVICE_SEEDS,'residential');
  assert.deepEqual(groups.map(g=>[g.id,g.services.length]),[
    ['inspections',7],['leasing',4],['access',7],['urgent',1],
  ]);
  assert.equal(RESIDENTIAL_BOOKING_GROUPS.length,4);
  assert.equal(RESIDENTIAL_SERVICE_IDS.size,19);
  const ids=groups.flatMap(g=>g.services.map(s=>s.id));
  assert.equal(ids.length,19);
  assert.equal(new Set(ids).size,19);
  for(const id of RESIDENTIAL_SERVICE_IDS)assert.ok(ids.includes(id),id);
  assert.ok(ids.includes('maintenance-inspection'));
  assert.ok(!ids.includes('pre-vacate-inspection'));
  assert.ok(!ids.includes('maintenance-attendance'));
  assert.ok(!ids.includes('property-meeting'));
  assert.ok(!ids.includes('follow-up-reinspection'));
  assert.equal(bookingCategoryForService(SERVICE_SEEDS.find(s=>s.id==='open-home')),'leasing');
  assert.equal(bookingCategoryForService(SERVICE_SEEDS.find(s=>s.id==='urgent-maintenance-make-good')),'urgent');
});

test('inactive and cross-sector services are never exposed as new residential bookings',()=>{
  const adjusted=SERVICE_SEEDS.map(s=>s.id==='routine-inspection'?{...s,active:0}:s);
  assert.equal(propertyBookingCategories(adjusted,'residential')
    .flatMap(g=>g.services).some(s=>s.id==='routine-inspection'),false);
  assert.equal(propertyBookingCategories(SERVICE_SEEDS,'commercial')
    .flatMap(g=>g.services).some(s=>s.id==='property-condition-report'),false);
  assert.deepEqual(propertyBookingCategories(SERVICE_SEEDS,'unknown'),[]);
});

test('all candidate add-ons are parent-scoped and explicitly non-billable until review',()=>{
  assert.deepEqual(Object.keys(RESIDENTIAL_ADD_ONS),[
    'inventory_with_pcr','form19_service','tenant_attendance_coordination',
  ]);
  assert.equal(RESIDENTIAL_ADD_ONS.inventory_with_pcr.exGstCents,15000);
  assert.equal(RESIDENTIAL_ADD_ONS.form19_service.exGstCents,4000);
  assert.equal(RESIDENTIAL_ADD_ONS.tenant_attendance_coordination.exGstCents,4000);
  assert.ok(Object.values(RESIDENTIAL_ADD_ONS).every(a=>a.kind==='staff_review'));
  assert.ok(SERVICE_SEEDS.every(s=>s.price_ex_gst_cents===null));
});
