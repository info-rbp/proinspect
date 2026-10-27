import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCharge,
  calculateReviewedCharge,
  dateDay,
  roundRatio,
  validateLeaseTransition,
  type ChargeRule,
  type LeaseTerms,
} from '../packages/commercial/calculations.ts';
import { moneyAUD, csvRows } from '../packages/finance/export.ts';
const base = {
  sourceAmountCents: 310000,
  gstBasisPoints: 1000,
  taxBasis: 'exclusive' as const,
  method: 'actual_days' as const,
  periodFrom: '2026-10-16',
  periodTo: '2026-11-01',
  basisFrom: '2026-10-01',
  basisTo: '2026-11-01',
};
const rule: ChargeRule = {
  ...base,
  obligationKey: 'rent-premises-1',
  category: 'rent',
  frequency: 'monthly',
  reviewMethod: 'none',
};
const lease: LeaseTerms = {
  kind: 'commencement',
  effectiveAt: '2026-01-01T00:00:00Z',
  startsAt: '2026-01-01T00:00:00Z',
  endsAt: '2027-01-01T00:00:00Z',
};
test('actual-day allocation uses exact cents and exclusive end dates', () => {
  const r = calculateCharge(base);
  assert.equal(r.periodDays, 16);
  assert.equal(r.basisDays, 31);
  assert.equal(r.subtotalCents, 160000);
  assert.equal(r.gstCents, 16000);
  assert.equal(r.totalCents, 176000);
});
test('half-up rounding is symmetric for reversals, including half cents', () => {
  for (let a = -100; a <= 100; a++)
    for (let b = 1; b <= 20; b++)
      assert.equal(roundRatio(BigInt(a), BigInt(b)), -roundRatio(BigInt(-a), BigInt(b)));
  assert.equal(roundRatio(1n, 2n), 1n);
  assert.equal(roundRatio(-1n, 2n), -1n);
});
test('inclusive tax is extracted, never added a second time', () => {
  const r = calculateCharge({
    ...base,
    sourceAmountCents: 110000,
    taxBasis: 'inclusive',
    method: 'fixed',
    periodFrom: base.basisFrom,
  });
  assert.equal(r.subtotalCents, 100000);
  assert.equal(r.gstCents, 10000);
  assert.equal(r.totalCents, 110000);
});
test('calendar validation rejects rollover and supports genuine leap days', () => {
  assert.throws(() => dateDay('2026-02-29'));
  assert.throws(() => dateDay('2026-02-30'));
  assert.throws(() => dateDay('2026-13-01'));
  assert.equal(dateDay('2024-03-01') - dateDay('2024-02-29'), 1);
});
test('partial fixed periods, inverted ranges and over-allocation are rejected', () => {
  assert.throws(() => calculateCharge({ ...base, method: 'fixed' }));
  assert.throws(() => calculateCharge({ ...base, periodFrom: '2026-09-30' }));
  assert.throws(() => calculateCharge({ ...base, periodTo: base.periodFrom }));
});
test('money and tax inputs are bounded integers, not floating point', () => {
  for (const amount of [0.5, NaN, Infinity, 1e12 + 1])
    assert.throws(() => calculateCharge({ ...base, sourceAmountCents: amount }));
  for (const rate of [-1, 0.5, 10001, NaN])
    assert.throws(() => calculateCharge({ ...base, gstBasisPoints: rate }));
  assert.equal(calculateCharge({ ...base, gstBasisPoints: 0 }).gstCents, 0);
});
test('review percentage and source caps precede explicit proration', () => {
  const r = calculateReviewedCharge(
    { ...rule, reviewMethod: 'percentage', reviewBasisPoints: 1000, capCents: 325500 },
    base.periodFrom,
    base.periodTo,
  );
  assert.equal(r.reviewedAmountCents, 325500);
  assert.equal(r.subtotalCents, 168000);
  assert.equal(r.totalCents, 184800);
});
test('index reviews use approved integer ratios with source floors', () => {
  const r = calculateReviewedCharge(
    {
      ...rule,
      reviewMethod: 'index',
      indexNumerator: 90,
      indexDenominator: 100,
      floorCents: 300700,
    },
    base.basisFrom,
    base.basisTo,
  );
  assert.equal(r.reviewedAmountCents, 300700);
  assert.throws(() =>
    calculateReviewedCharge(
      { ...rule, reviewMethod: 'index', indexNumerator: 100, indexDenominator: 0 },
      base.basisFrom,
      base.basisTo,
    ),
  );
  assert.throws(() =>
    calculateReviewedCharge({ ...rule, capCents: 1, floorCents: 2 }, base.basisFrom, base.basisTo),
  );
});
test('source frequency matches real calendar periods including month-end', () => {
  const r = { ...rule, basisFrom: '2026-01-31', basisTo: '2026-02-28' };
  assert.doesNotThrow(() => calculateReviewedCharge(r, r.basisFrom, r.basisTo));
  assert.throws(() =>
    calculateReviewedCharge({ ...r, basisTo: '2026-03-01' }, r.basisFrom, '2026-03-01'),
  );
});
test('lease commencement, variation, renewal and expiry preserve chronology', () => {
  assert.doesNotThrow(() => validateLeaseTransition(lease, null));
  const varied = { ...lease, kind: 'variation' as const, effectiveAt: '2026-06-01T00:00:00Z' };
  assert.doesNotThrow(() => validateLeaseTransition(varied, lease));
  const renewed = {
    ...lease,
    kind: 'renewal' as const,
    effectiveAt: lease.endsAt,
    startsAt: lease.endsAt,
    endsAt: '2028-01-01T00:00:00Z',
  };
  assert.doesNotThrow(() => validateLeaseTransition(renewed, varied));
  assert.doesNotThrow(() =>
    validateLeaseTransition({ ...renewed, kind: 'expiry', effectiveAt: renewed.endsAt }, renewed),
  );
});
test('illegal sequences and invalid option windows are rejected', () => {
  assert.throws(() => validateLeaseTransition({ ...lease, kind: 'variation' }, null));
  assert.throws(() => validateLeaseTransition(lease, lease));
  assert.throws(() => validateLeaseTransition({ ...lease, kind: 'renewal' }, lease));
  assert.throws(() => validateLeaseTransition({ ...lease, kind: 'expiry' }, lease));
  assert.throws(() =>
    validateLeaseTransition({ ...lease, optionOpensAt: '2026-08-01T00:00:00Z' }, null),
  );
  assert.throws(() =>
    validateLeaseTransition(
      { ...lease, optionOpensAt: '2026-08-01T00:00:00Z', optionClosesAt: '2028-01-01T00:00:00Z' },
      null,
    ),
  );
});
test('accounting display remains exact beyond JavaScript safe-number totals', () => {
  assert.equal(moneyAUD('123456789012345678'), '$1,234,567,890,123,456.78');
  assert.equal(moneyAUD(-101), '-$1.01');
  assert.throws(() => moneyAUD(1.1));
  assert.throws(() => moneyAUD('1e3'));
});
test('CSV neutralizes formula text but preserves signed integer amounts', () => {
  const csv = csvRows([['=1+1', '  @evil', 'normal,"text"', -100, 123n]]);
  assert.equal(csv, '"\'=1+1","\'  @evil","normal,""text""",-100,123\r\n');
});
