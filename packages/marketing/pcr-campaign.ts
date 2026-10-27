/** Fixed launch campaign policy. All advertised amounts are AUD customer totals. */
export const PCR_LAUNCH_CODE = 'pcr100' as const;
export const PCR_LAUNCH_SERVICE = 'property-condition-report' as const;
export const PCR_ROUTINE_DISCOUNT_BPS = 2000;
export const PCR_ROUTINE_DISCOUNT_USES = 4;
export const PCR_OFFSITE_KEY_CENTS = 1000;
export type PcrAppointmentPrice = {
  day: 'weekday'|'saturday'|'sunday';
  baseCents: number;
  keyCollectionCents: number;
  totalCents: number;
  priceExGstCents: number;
  gstCents: number;
};
/** Perth is UTC+08:00 year-round. Times must be actual absolute instants. */
export function pcrAppointmentPrice(startsAt: string, durationMinutes: number, offsiteKeys = false): PcrAppointmentPrice {
  const ms = Date.parse(startsAt);
  if (!/(?:Z|[+-]\d{2}:\d{2})$/.test(startsAt) || !Number.isFinite(ms) || !Number.isSafeInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 480) throw new RangeError('Invalid appointment');
  const local = new Date(ms + 8 * 3600000), minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  if (minutes < 540 || minutes + durationMinutes > 1020) throw new RangeError('PCR hours are 9 am–5 pm Perth time');
  const dayOfWeek = local.getUTCDay();
  const day = dayOfWeek === 0 ? 'sunday' : dayOfWeek === 6 ? 'saturday' : 'weekday';
  const baseCents = day === 'sunday' ? 15000 : day === 'saturday' ? 12500 : 10000;
  const keyCollectionCents = offsiteKeys ? PCR_OFFSITE_KEY_CENTS : 0;
  const totalCents = baseCents + keyCollectionCents;
  // The customer total is fixed. Separate its 10% GST component only after tax approval.
  const priceExGstCents = Math.round(totalCents / 1.1);
  return { day, baseCents, keyCollectionCents, totalCents, priceExGstCents, gstCents: totalCents - priceExGstCents };
}
export function pcrCustomerPrice(day: 'weekday'|'saturday'|'sunday', keys = false): number {
  return (day === 'sunday' ? 15000 : day === 'saturday' ? 12500 : 10000) + (keys ? PCR_OFFSITE_KEY_CENTS : 0);
}
