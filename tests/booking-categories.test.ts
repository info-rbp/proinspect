import test from 'node:test';
import assert from 'node:assert/strict';
import { SERVICE_SEEDS } from '../packages/service-catalogue/index.ts';
import {
  BOOKING_CATEGORIES, bookingCategoryForService, isBookingCategoryId,
  propertyBookingCategories,
} from '../packages/service-catalogue/booking-navigation.ts';

test('every canonical appointment service appears in exactly one of four client categories', () => {
  assert.equal(BOOKING_CATEGORIES.length, 4);
  assert.equal(SERVICE_SEEDS.length, 23);
  for (const service of SERVICE_SEEDS) {
    const category = bookingCategoryForService(service);
    assert.ok(category, service.id);
    const matches = BOOKING_CATEGORIES.filter(c => c.family === service.family);
    assert.equal(matches.length, 1, service.id);
  }
  const groups = ['inspections','attendance','maintenance','access'].map(id =>
    SERVICE_SEEDS.filter(service => bookingCategoryForService(service) === id).length);
  assert.deepEqual(groups, [10,5,4,4]);
});

test('residential customer sees exactly eleven applicable appointment services', () => {
  const groups = propertyBookingCategories(SERVICE_SEEDS, 'residential');
  assert.deepEqual(groups.map(group => [group.id, group.services.length]), [
    ['inspections',4],['attendance',2],['maintenance',3],['access',2],
  ]);
  const ids = groups.flatMap(g => g.services.map(s => s.id));
  assert.equal(new Set(ids).size, 11);
  assert.ok(ids.includes('property-condition-report'));
  assert.ok(!ids.includes('commercial-property-inspection'));
  assert.ok(!ids.includes('urgent-building-attendance'));
});

test('booking category links and service display remain restricted to active sector matches', () => {
  const adjusted = SERVICE_SEEDS.map(service => service.id === 'routine-inspection'
    ? {...service, active: 0} : service);
  const residential = propertyBookingCategories(adjusted, 'residential');
  assert.ok(!residential.flatMap(g=>g.services).some(s=>s.id==='routine-inspection'));
  assert.ok(!propertyBookingCategories(SERVICE_SEEDS,'commercial')
    .flatMap(g=>g.services).some(s=>s.id==='property-condition-report'));
  assert.deepEqual(propertyBookingCategories(SERVICE_SEEDS, 'unknown'), []);
});

test('category is navigation only and cannot add entitlement, prices or booking modes', () => {
  assert.ok(isBookingCategoryId('maintenance'));
  assert.equal(isBookingCategoryId('../../staff'), false);
  assert.equal(bookingCategoryForService({family:'documents'}), null);
  assert.equal(bookingCategoryForService({family:'operations'}), null);
  const groups = propertyBookingCategories(SERVICE_SEEDS,'residential');
  for (const s of groups.flatMap(g=>g.services)) {
    assert.equal(s.price_ex_gst_cents, null);
    assert.equal(s.booking_mode, 'request');
  }
});
