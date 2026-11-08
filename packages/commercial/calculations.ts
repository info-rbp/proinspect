/** Explicit source inputs only: no inferred rent, tax, frequency or legal entitlement. */
export class CommercialRuleError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}
const LIMIT = 1_000_000_000_000;
function rule(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new CommercialRuleError(code, message);
}
export function roundRatio(n: bigint, d: bigint): bigint {
  rule(d > 0n, 'INVALID_DIVISOR', 'The denominator must be positive.');
  const sign = n < 0n ? -1n : 1n;
  return sign * ((n * sign * 2n + d) / (d * 2n));
}
export function dateDay(value: string): number {
  rule(/^\d{4}-\d{2}-\d{2}$/.test(value), 'INVALID_DATE', 'Use YYYY-MM-DD.');
  const t = Date.parse(value + 'T00:00:00.000Z');
  rule(
    Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === value,
    'INVALID_DATE',
    'The calendar date does not exist.',
  );
  return t / 86400000;
}
export interface ChargeCalculation {
  sourceAmountCents: number;
  gstBasisPoints: number;
  taxBasis: 'inclusive' | 'exclusive';
  method: 'fixed' | 'actual_days';
  periodFrom: string;
  periodTo: string;
  basisFrom: string;
  basisTo: string;
}
export function calculateCharge(input: ChargeCalculation) {
  rule(
    Number.isSafeInteger(input.sourceAmountCents) && Math.abs(input.sourceAmountCents) <= LIMIT,
    'INVALID_MONEY',
    'Use integer cents within the supported range.',
  );
  rule(
    Number.isInteger(input.gstBasisPoints) &&
      input.gstBasisPoints >= 0 &&
      input.gstBasisPoints <= 10000,
    'INVALID_TAX',
    'Supply an approved tax rate in basis points.',
  );
  rule(
    ['inclusive', 'exclusive'].includes(input.taxBasis),
    'INVALID_TAX',
    'Specify inclusive or exclusive tax.',
  );
  rule(
    ['fixed', 'actual_days'].includes(input.method),
    'INVALID_METHOD',
    'Specify the approved calculation method.',
  );
  const from = dateDay(input.periodFrom),
    to = dateDay(input.periodTo),
    start = dateDay(input.basisFrom),
    end = dateDay(input.basisTo);
  rule(
    to > from && end > start && from >= start && to <= end,
    'INVALID_PERIOD',
    'The charge period must lie within the source period. End dates are exclusive.',
  );
  rule(
    input.method !== 'fixed' || (from === start && to === end),
    'PARTIAL_FIXED_PERIOD',
    'Partial periods require an explicit approved proration method.',
  );
  const source = BigInt(input.sourceAmountCents),
    rate = BigInt(input.gstBasisPoints);
  const amount =
    input.method === 'fixed' ? source : roundRatio(source * BigInt(to - from), BigInt(end - start));
  const tax =
    input.taxBasis === 'inclusive'
      ? roundRatio(amount * rate, 10000n + rate)
      : roundRatio(amount * rate, 10000n);
  const subtotal = input.taxBasis === 'inclusive' ? amount - tax : amount,
    total = subtotal + tax;
  rule(
    [subtotal, tax, total].every((v) => v >= -BigInt(LIMIT) && v <= BigInt(LIMIT)),
    'AMOUNT_LIMIT',
    'The calculated amount exceeds the supported range.',
  );
  return {
    ...input,
    periodDays: to - from,
    basisDays: end - start,
    subtotalCents: Number(subtotal),
    gstCents: Number(tax),
    totalCents: Number(total),
    rounding: 'integer_cents_symmetric_half_up',
    dateConvention: 'start_inclusive_end_exclusive',
  };
}
export interface LeaseTerms {
  kind: 'commencement' | 'variation' | 'renewal' | 'expiry';
  effectiveAt: string;
  startsAt: string;
  endsAt: string;
  optionOpensAt?: string | null;
  optionClosesAt?: string | null;
}
export function validateLeaseTransition(next: LeaseTerms, prior: LeaseTerms | null) {
  const [effective, start, end] = [next.effectiveAt, next.startsAt, next.endsAt].map(Date.parse);
  rule(
    [effective, start, end].every(Number.isFinite) && end > start,
    'LEASE_DATES',
    'Expiry must follow commencement.',
  );
  rule(
    Boolean(next.optionOpensAt) === Boolean(next.optionClosesAt),
    'OPTION_WINDOW',
    'Supply both option-window boundaries or neither.',
  );
  if (next.optionOpensAt && next.optionClosesAt) {
    const open = Date.parse(next.optionOpensAt),
      close = Date.parse(next.optionClosesAt);
    rule(
      Number.isFinite(open) && Number.isFinite(close) && open < close && close <= end,
      'OPTION_WINDOW',
      'The option window must be ordered and close no later than expiry.',
    );
  }
  if (!prior) {
    rule(next.kind === 'commencement', 'LEASE_SEQUENCE', 'Approve a commencement source first.');
    return;
  }
  rule(
    next.kind !== 'commencement' && effective >= Date.parse(prior.effectiveAt),
    'LEASE_SEQUENCE',
    'Preserve the chronological approved source history.',
  );
  if (next.kind === 'renewal')
    rule(
      start >= Date.parse(prior.endsAt),
      'LEASE_OVERLAP',
      'A renewal cannot overlap the preceding lease period.',
    );
  else {
    rule(
      prior.kind !== 'expiry' && start === Date.parse(prior.startsAt),
      'LEASE_SEQUENCE',
      'A variation or expiry must retain the active source commencement.',
    );
    if (next.kind === 'expiry')
      rule(
        end === Date.parse(prior.endsAt) && effective >= end,
        'LEASE_NOT_EXPIRED',
        'Expiry cannot change source dates or precede the source expiry.',
      );
    else rule(effective < end, 'LEASE_DATES', 'A variation must take effect before expiry.');
  }
}

export interface ChargeRule extends Omit<ChargeCalculation, 'periodFrom' | 'periodTo'> {
  obligationKey: string;
  category: 'rent' | 'outgoings' | 'insurance' | 'make_good' | 'other';
  frequency: 'once' | 'monthly' | 'quarterly' | 'annual' | 'other';
  reviewMethod: 'none' | 'percentage' | 'index';
  reviewBasisPoints?: number;
  indexNumerator?: number;
  indexDenominator?: number;
  floorCents?: number;
  capCents?: number;
}
/** Percent/index figures are supplied from reviewed sources, never fetched or guessed. */
export function calculateReviewedCharge(source: ChargeRule, periodFrom: string, periodTo: string) {
  rule(
    /^[A-Za-z0-9_-]{1,100}$/.test(source.obligationKey),
    'INVALID_OBLIGATION',
    'Supply the stable source-obligation key.',
  );
  rule(
    ['once', 'monthly', 'quarterly', 'annual', 'other'].includes(source.frequency),
    'INVALID_FREQUENCY',
    'Choose the source frequency.',
  );
  rule(
    Number.isSafeInteger(source.sourceAmountCents) &&
      source.sourceAmountCents >= 0 &&
      source.sourceAmountCents <= LIMIT,
    'INVALID_MONEY',
    'Source charges must be non-negative integer cents.',
  );
  const months = ({ monthly: 1, quarterly: 3, annual: 12 } as Record<string, number>)[
    source.frequency
  ];
  if (months) {
    dateDay(source.basisFrom);
    dateDay(source.basisTo);
    const [year, month, day] = source.basisFrom.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + months, 1));
    next.setUTCDate(
      Math.min(
        day,
        new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate(),
      ),
    );
    rule(
      next.toISOString().slice(0, 10) === source.basisTo,
      'FREQUENCY_PERIOD',
      'The source period must match its stated frequency.',
    );
  }
  let reviewed = BigInt(source.sourceAmountCents);
  if (source.reviewMethod === 'percentage') {
    rule(
      Number.isSafeInteger(source.reviewBasisPoints) &&
        source.reviewBasisPoints! >= -10000 &&
        source.reviewBasisPoints! <= 100000,
      'INVALID_REVIEW',
      'Supply the approved review percentage in basis points.',
    );
    reviewed = roundRatio(reviewed * BigInt(10000 + source.reviewBasisPoints!), 10000n);
  } else if (source.reviewMethod === 'index') {
    rule(
      Number.isSafeInteger(source.indexNumerator) &&
        source.indexNumerator! > 0 &&
        source.indexNumerator! <= 1e9 &&
        Number.isSafeInteger(source.indexDenominator) &&
        source.indexDenominator! > 0 &&
        source.indexDenominator! <= 1e9,
      'INVALID_REVIEW',
      'Supply positive approved index values.',
    );
    reviewed = roundRatio(
      reviewed * BigInt(source.indexNumerator!),
      BigInt(source.indexDenominator!),
    );
  } else
    rule(
      source.reviewMethod === 'none',
      'INVALID_REVIEW',
      'Choose an explicitly supported review method.',
    );
  for (const value of [source.floorCents, source.capCents])
    if (value !== undefined)
      rule(
        Number.isSafeInteger(value) && value >= 0 && value <= LIMIT,
        'INVALID_CAP',
        'Caps and floors must be non-negative integer cents in the same tax basis as the source.',
      );
  rule(
    source.floorCents === undefined ||
      source.capCents === undefined ||
      source.floorCents <= source.capCents,
    'INVALID_CAP',
    'The floor cannot exceed the cap.',
  );
  if (source.floorCents !== undefined && reviewed < BigInt(source.floorCents))
    reviewed = BigInt(source.floorCents);
  if (source.capCents !== undefined && reviewed > BigInt(source.capCents))
    reviewed = BigInt(source.capCents);
  rule(
    reviewed <= BigInt(LIMIT),
    'AMOUNT_LIMIT',
    'The reviewed amount exceeds the supported range.',
  );
  return {
    ...calculateCharge({ ...source, sourceAmountCents: Number(reviewed), periodFrom, periodTo }),
    sourceRule: source,
    reviewedAmountCents: Number(reviewed),
  };
}
