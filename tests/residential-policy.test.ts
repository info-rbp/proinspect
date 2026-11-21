import test from 'node:test';
import assert from 'node:assert/strict';
import {
  earliestResidentialCancellation,
  retiredPublicPath,
} from '../packages/domain/residential-policy.ts';
test('ordinary notice respects both minimum term and notice, including leap-day commencement', () => {
  assert.equal(
    earliestResidentialCancellation('2028-02-29T08:00:00Z', '2028-03-01T08:00:00Z'),
    '2030-02-28T08:00:00.000Z',
  );
  assert.equal(
    earliestResidentialCancellation('2026-01-01T00:00:00Z', '2027-12-31T00:00:00Z'),
    '2028-02-29T00:00:00.000Z',
  );
  assert.throws(() => earliestResidentialCancellation('not a date', '2026-01-01'));
});
test('retired application and data aliases cannot reopen acquisition', () => {
  for (const path of [
    '/commercial-application/session',
    '/commercial-application/recover',
    '/commercial.data',
    '/%63ommercial/',
    '/sectors/strata-building',
  ])
    assert.equal(retiredPublicPath(path), true, path);
  for (const path of ['/residential', '/co-living', '/api/w/commercial/history', '/signin'])
    assert.equal(retiredPublicPath(path), false, path);
});
