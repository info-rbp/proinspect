import { z } from 'zod';
export const email = z.string().trim().toLowerCase().email().max(254);
export const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
export const signInSchema = z.object({
  email,
  returnTo: z.string().max(500).optional(),
  turnstile: z.string().max(2048).optional(),
});
export const onboardingSchema = z.object({
  displayName: z.string().trim().min(2).max(100),
  clientName: z.string().trim().min(2).max(160),
});
export const propertySchema = z.object({
  address: z.string().trim().min(5).max(180),
  suburb: z.string().trim().min(2).max(80),
  postcode: z.string().regex(/^\d{4}$/),
  propertyType: z.enum(['House', 'Apartment', 'Townhouse', 'Villa', 'Other']).default('House'),
  selfManaged: z.literal(true),
});
export const bookingSchema = z.object({
  propertyId: id,
  serviceId: id,
  startsAt: z.string().datetime({ offset: true }),
  requestKey: z.string().min(16).max(100),
  access: z.object({
    method: z.enum(['tenant', 'owner', 'agent', 'lockbox', 'other']),
    instructions: z.string().trim().max(3000),
    noticeConfirmed: z.boolean(),
  }),
});
export const requestSchema = z.object({
  propertyId: id.optional(),
  tenancyId: id.optional(),
  schemeId: id.optional(),
  category: z
    .enum(['maintenance', 'inspection_access', 'occupant', 'vacate', 'complaint', 'other'])
    .default('maintenance'),
  title: z.string().trim().min(4).max(180),
  details: z.string().trim().min(10).max(5000),
  priority: z.enum(['routine', 'urgent', 'emergency']).default('routine'),
});
export const workOrderUpdateSchema = z.object({
  status: z
    .enum([
      'triage',
      'quote_required',
      'awaiting_approval',
      'approved',
      'assigned',
      'scheduled',
      'in_progress',
      'report_pending',
      'completed',
      'cancelled',
    ])
    .optional(),
  assignedStaffId: id.optional(),
  completionNotes: z.string().trim().max(3000).optional(),
  version: z.number().int().positive(),
});
export function addressKey(address: string, suburb: string, postcode: string) {
  return `${address}|${suburb}|WA|${postcode}`
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/[^a-z0-9|/]/g, '');
}
