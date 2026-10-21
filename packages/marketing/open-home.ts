import { z } from 'zod';

/**
 * A check-in is evidence of a self-declared visit, not proof of identity,
 * tenancy eligibility or a residential rental application.
 */
export const openHomeCheckInInput = z.object({
  requestKey: z.string().uuid(),
  listingId: z.string().min(3).max(100),
  sessionId: z.string().min(3).max(100),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(6).max(40).regex(/^[+\d\s().-]+$/),
  email: z.string().trim().email().max(254).transform(v => v.toLowerCase()),
  consent: z.literal(true),
  source: z.enum(['web', 'qr']).default('web'),
});
export type OpenHomeCheckInInput = z.infer<typeof openHomeCheckInInput>;

export const CHECK_IN_CONSENT_VERSION = 'open-home-attendance-v1';
export const CHECK_IN_BEFORE_MINUTES = 30;
export const CHECK_IN_AFTER_MINUTES = 45;

/** The session must be in progress or within a narrow on-site arrival window. */
export function isOpenHomeCheckInAvailable(
  session: { starts_at: string; ends_at: string },
  at: Date = new Date(),
): boolean {
  const start = Date.parse(session.starts_at);
  const end = Date.parse(session.ends_at);
  const t = at.getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start &&
    t >= start - CHECK_IN_BEFORE_MINUTES * 60_000 &&
    t <= end + CHECK_IN_AFTER_MINUTES * 60_000;
}

/** Prefilled QR and property links are hints, never attendance authorisation. */
export function openHomeCheckInUrl(
  origin: string,
  listingId: string,
  sessionId: string,
): string {
  const u = new URL('/open-home/check-in', origin);
  u.searchParams.set('property', listingId);
  u.searchParams.set('session', sessionId);
  return u.toString();
}

export const OPEN_HOME_SHEET_COLUMNS = [
  'Check-in ID','Arrival (Australia/Perth)','Property','Property ID','Listing ID',
  'Session ID','Session start (Australia/Perth)','Name','Phone','Email',
  'Advance registration','Leasing representative','Consent version','Sync event ID'
] as const;
