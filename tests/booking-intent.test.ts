import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingIntent, propertySetupPath } from '../packages/domain/booking-intent.ts';
test('booking intent cannot become an arbitrary redirect', () => {
  assert.equal(bookingIntent('routine-inspection'), 'routine-inspection');
  for (const value of ['//external.test', '../staff', 'https://external.test', '/auth']) assert.equal(bookingIntent(value), null);
  assert.equal(propertySetupPath('/w/landlord/client', 'routine-inspection'), '/w/landlord/client/properties?service=routine-inspection');
});
