/** Residential fee comparison model.
 * Source assumptions: "Perth Property Management Costs — Adjusted for Average Tenancy Length"
 * (user-supplied, October 2026). Not a market-wide agency tariff or a like-for-like quote.
 * All costs are AUD cents; agency and ProInspect charges INCLUDE 10% GST.
 */
export const savingsDefaults = Object.freeze({
  weeklyRent: 750,
  months: 24,
  properties: 1,
  commissionPct: 9,
  lettingWeeks: 2,
  advertisingEx: 400,
  entryPcrEx: 200,
  routineFeeEx: 100,
  routineVisitsPerYear: 3,
  renewalFeeEx: 250,
  exitFeeEx: 200,
  statementFeeEx: 75,
  adminMonthlyEx: 0,
  additionalSelfManagedInc: 0,
  arrangement: 'self',
  include: Object.freeze({
    management: true, letting: true, advertising: true, entry: true,
    routine: true, renewal: true, exit: true, statements: true, admin: true,
  }),
});

export const savingsFeeLabels = Object.freeze({
  management: 'Management commission',
  letting: 'New tenant letting / placement',
  advertising: 'Property advertising',
  entry: 'Entry Property Condition Report',
  routine: 'Routine inspections',
  renewal: 'Lease renewal',
  exit: 'Final / exit inspection',
  statements: 'Annual financial statements',
  admin: 'Monthly administration (if applicable)',
});

const toCents = (value) => Math.round(value * 100);
const withGst = (cents) => Math.round(cents * 1.10);
function nonnegative(value, max, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max)
    throw new RangeError('Invalid ' + label);
  return value;
}

/** All modelled properties are assumed to have the same rent/fee schedule.
 * Returns integer-cent amounts so a piecemeal-agency comparison stays reconcilable.
 */
export function calculateResidentialSavings(input = {}) {
  const a = {...savingsDefaults, ...input, include: {...savingsDefaults.include, ...(input.include || {})}};
  const months = nonnegative(a.months, 60, 'tenancy months');
  const properties = nonnegative(a.properties, 100, 'property count');
  if (!Number.isInteger(months) || months < 1 || !Number.isInteger(properties) || properties < 1)
    throw new RangeError('Months and property count must be positive whole numbers.');
  const fields = ['weeklyRent','commissionPct','lettingWeeks','advertisingEx','entryPcrEx',
    'routineFeeEx','routineVisitsPerYear','renewalFeeEx','exitFeeEx','statementFeeEx',
    'adminMonthlyEx','additionalSelfManagedInc'];
  for (const key of fields) nonnegative(a[key], key === 'weeklyRent' ? 50000 : 100000, key);
  if (a.commissionPct > 40 || a.lettingWeeks > 12 || a.routineVisitsPerYear > 4)
    throw new RangeError('Agency commission, letting weeks or inspection frequency outside allowed comparison range.');
  if (!['self','retain'].includes(a.arrangement)) throw new RangeError('Unknown comparison arrangement');
  const weeks = Math.round(months * 52 / 12);
  const renewals = Math.max(0, Math.ceil(months / 12) - 1);
  const annualStatements = Math.ceil(months / 12);
  const routineInspections = Math.round(a.routineVisitsPerYear * months / 12);
  const rentCents = toCents(a.weeklyRent);
  const grossRentPerPropertyCents = rentCents * weeks;
  const costPerProperty = {
    management: withGst(Math.round(grossRentPerPropertyCents * a.commissionPct / 100)),
    letting: withGst(Math.round(rentCents * a.lettingWeeks)),
    advertising: withGst(toCents(a.advertisingEx)),
    entry: withGst(toCents(a.entryPcrEx)),
    routine: withGst(toCents(a.routineFeeEx) * routineInspections),
    renewal: withGst(toCents(a.renewalFeeEx) * renewals),
    exit: withGst(toCents(a.exitFeeEx)),
    statements: withGst(toCents(a.statementFeeEx) * annualStatements),
    admin: withGst(toCents(a.adminMonthlyEx) * months),
  };
  const counts = {management: weeks, letting: 1, advertising: 1, entry: 1,
    routine: routineInspections, renewal: renewals, exit: 1,
    statements: annualStatements, admin: months};
  const descriptions = {
    management: a.commissionPct.toFixed(1) + '% + GST on rent',
    letting: a.lettingWeeks + ' weeks rent + GST',
    advertising: 'once',
    entry: 'once',
    routine: routineInspections + ' visits',
    renewal: renewals + ' renewals',
    exit: 'once',
    statements: annualStatements + ' statements',
    admin: months + ' months',
  };
  const breakdown = Object.keys(savingsFeeLabels).map(key => ({
    key, label: savingsFeeLabels[key], count: counts[key],
    frequency: descriptions[key], enabled: a.include[key] !== false,
    perPropertyCents: a.include[key] === false ? 0 : costPerProperty[key],
    totalCents: a.include[key] === false ? 0 : costPerProperty[key] * properties,
  }));
  const agencyPerPropertyCents = breakdown.reduce((sum, item) => sum + item.perPropertyCents, 0);
  const agencyTotalCents = agencyPerPropertyCents * properties;
  const subscriptionPerPropertyCents = weeks * 5500;
  const subscriptionTotalCents = subscriptionPerPropertyCents * properties;
  const additionalTotalCents = toCents(a.additionalSelfManagedInc) * properties;
  const retainedAgencyCents = a.arrangement === 'retain' ? agencyTotalCents : 0;
  const alternativeTotalCents = subscriptionTotalCents + additionalTotalCents + retainedAgencyCents;
  const differenceCents = agencyTotalCents - alternativeTotalCents;
  const rentalIncomeTotalCents = grossRentPerPropertyCents * properties;
  return {
    months, weeks, properties, routineInspections, renewals, annualStatements,
    rentalIncomeTotalCents, agencyTotalCents, agencyPerPropertyCents,
    agencyMonthlyEquivalentCents: Math.round(agencyTotalCents / months),
    agencyEffectiveRentPercent: rentalIncomeTotalCents === 0 ? null :
      (agencyTotalCents * 100 / rentalIncomeTotalCents),
    subscriptionTotalCents, subscriptionPerPropertyCents,
    subscriptionMonthlyEquivalentCents: Math.round(subscriptionTotalCents / months),
    additionalTotalCents, retainedAgencyCents, alternativeTotalCents,
    alternativeMonthlyEquivalentCents: Math.round(alternativeTotalCents / months),
    differenceCents,
    differencePercent: agencyTotalCents === 0 ? null : differenceCents * 100 / agencyTotalCents,
    arrangement: a.arrangement, breakdown,
  };
}
