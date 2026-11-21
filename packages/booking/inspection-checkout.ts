import { z } from 'zod';

/** Canonical IDs are shared with the existing catalogue and report-tool mapping. */
export const PRIMARY_INSPECTIONS = [
  'property-condition-report',
  'final-exit-inspection',
  'routine-inspection',
] as const;
export type CashPaymentTerm = 'upon_booking' | 'net_7' | 'eom_7';
export const cashPaymentTermSchema = z.enum(['upon_booking', 'net_7', 'eom_7']);
export const CASH_PAYMENT_TERM_LABELS: Record<CashPaymentTerm, string> = {
  upon_booking: 'Pay securely when booking',
  net_7: 'Invoice: 7 calendar days from issue',
  eom_7: 'Monthly invoice: due 7th of following month',
};

/**
 * Published source candidate amounts in AUD cents EX GST.
 * Source: ProInspect - Residential Property Support - Schedule of Fees (All Services),
 * rows 01.01, 01.02 and 11.04. They are NOT approval to deploy live charging.
 */
export const INSPECTION_SOURCE_PRICES: Readonly<Record<string, {
  centsExGst: number; sourceRow: string; sourceName: string;
}>> = Object.freeze({
  'property-condition-report': {centsExGst: 20000, sourceRow: '01.01', sourceName: 'Property Condition Reports (Form 1)'},
  'routine-inspection': {centsExGst: 6000, sourceRow: '01.02', sourceName: 'Routine Property Inspections'},
  'final-exit-inspection': {centsExGst: 10000, sourceRow: '11.04', sourceName: 'Exit Inspections & Condition Comparisons'},
});

export function orderBookingServices<T extends { id: string; name: string }>(services: readonly T[]): T[] {
  const priority = new Map<string, number>(PRIMARY_INSPECTIONS.map((id, i) => [id, i]));
  return [...services].sort((a, b) => {
    const ai = priority.get(a.id), bi = priority.get(b.id);
    if (ai !== undefined || bi !== undefined) return (ai ?? 999) - (bi ?? 999);
    return a.name.localeCompare(b.name, 'en-AU');
  });
}
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
/** New inspection intake is optional for old API clients; required by the new customer UI. */
export const bookingIntakeSchema = z.object({
  contactPhone: z.string().trim().min(6).max(40),
  reason: z.string().trim().min(3).max(500),
  occupancyStatus: z.enum(['vacant', 'tenanted', 'occupied_other', 'unknown']),
  accessContactName: optionalText(120),
  accessContactPhone: optionalText(40),
  petsAndSafety: optionalText(1000),
  siteNotes: optionalText(2000),
  bedrooms: z.number().int().min(0).max(100).optional(),
  bathrooms: z.number().int().min(0).max(100).optional(),
  furnished: z.enum(['yes', 'no', 'unknown']).optional(),
  tenancyCommencesOn: date,
  vacateDate: date,
  keysReturned: z.enum(['yes', 'no', 'not_applicable', 'unknown']).optional(),
  originalPcrAvailable: z.enum(['yes', 'no', 'unknown']).optional(),
  areasOfConcern: optionalText(1500),
}).strict();
export type BookingIntake = z.infer<typeof bookingIntakeSchema>;
export function inspectionIntakeKind(serviceId: string): 'pcr' | 'exit' | 'routine' | 'general' {
  if (serviceId === 'property-condition-report') return 'pcr';
  if (serviceId === 'final-exit-inspection') return 'exit';
  if (serviceId === 'routine-inspection') return 'routine';
  return 'general';
}

/** Perth is UTC+08:00, with no daylight saving. Output is a precise UTC instant. */
export function cashInvoiceDueAt(issuedAt: string, term: CashPaymentTerm): string | null {
  if (term === 'upon_booking') return null;
  const issued = new Date(issuedAt);
  if (Number.isNaN(issued.getTime())) throw new Error('Valid invoice issue timestamp required');
  if (term === 'net_7') return new Date(issued.getTime() + 7 * 86400000).toISOString();
  const perth = new Date(issued.getTime() + 8 * 3600000);
  const due = new Date(Date.UTC(perth.getUTCFullYear(), perth.getUTCMonth() + 1, 7, 15, 59, 59));
  return due.toISOString(); // 23:59:59 on 7th in Australia/Perth
}
export function cashInvoicePeriod(completedAt: string, term: CashPaymentTerm): string {
  if (term === 'upon_booking') throw new Error('Prepaid booking has no credit invoice period');
  const completed = new Date(completedAt);
  if (Number.isNaN(completed.getTime())) throw new Error('Valid service completion timestamp required');
  const perth = new Date(completed.getTime() + 8 * 3600000);
  return `${perth.getUTCFullYear()}-${String(perth.getUTCMonth() + 1).padStart(2, '0')}`;
}
/** Only group EOM charges once the service month has ended in Perth. */
export function cashPeriodIsClosed(period: string, currentAt: string): boolean {
  const perth = new Date(new Date(currentAt).getTime() + 8 * 3600000);
  const currentPeriod = `${perth.getUTCFullYear()}-${String(perth.getUTCMonth() + 1).padStart(2, '0')}`;
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period < currentPeriod;
}

/** Month-end terms follow the service-completion month, not the month a delayed invoice is issued. */
export function cashInvoiceDueForServicePeriod(term: 'net_7'|'eom_7',period:string,issuedAt:string):string {
 if(term==='net_7') return cashInvoiceDueAt(issuedAt,'net_7')!;
 const m=/^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
 if(!m)throw new Error('Valid service completion month required');
 const due=new Date(Date.UTC(Number(m[1]),Number(m[2]),7,15,59,59));
 const issued=new Date(issuedAt);
 if(Number.isNaN(issued.getTime())||issued.getTime()>=due.getTime())
  throw new Error('Month-end due date has passed; financial exception review required');
 return due.toISOString();
}
