import test from 'node:test';
import assert from 'node:assert/strict';
import { futurePerthWeekday } from './fixtures/perth-date.ts';

test('Perth fixture returns the checked weekday, not the preceding UTC Sunday', () => {
  assert.equal(futurePerthWeekday(Date.parse('2026-10-26T22:41:00Z'), 4), '2026-11-02');
  assert.equal(futurePerthWeekday(Date.parse('2026-10-26T15:59:00Z'), 4), '2026-10-30');
  assert.equal(futurePerthWeekday(Date.parse('2026-10-26T16:00:00Z'), 4), '2026-11-02');
  assert.equal(futurePerthWeekday(Date.parse('2026-12-31T23:00:00Z'), 4), '2027-01-05');
});

test('weekday allocation fixtures remain in their Perth roster across every UTC hour', () => {
  for (let hour = 0; hour < 366 * 24; hour++) {
    const now = Date.UTC(2026, 0, 1) + hour * 3600000;
    const date = futurePerthWeekday(now, 4);
    const appointment = Date.parse(date + 'T09:00:00+08:00');
    assert.ok(appointment > now);
    assert.ok(![0, 6].includes(new Date(appointment + 8 * 3600000).getUTCDay()));
    assert.equal(new Date(appointment + 8 * 3600000).toISOString().slice(0, 10), date);
  }
});

test('invalid fixture dates fail explicitly', () => {
  for (const now of [NaN, Infinity, Number.MAX_VALUE]) assert.throws(() => futurePerthWeekday(now));
  for (const days of [-1, 0, 0.5, 91]) assert.throws(() => futurePerthWeekday(Date.now(), days));
});
