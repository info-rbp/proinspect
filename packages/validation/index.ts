import { z } from 'zod';
import { bookingIntakeSchema } from '../booking/inspection-checkout.ts';
import { residentialServiceRequestIntakeSchema } from '../booking/residential-service-requests.ts';
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
export const landlordTypes = ['residential', 'commercial'] as const;
export const accountServiceAreaSchema=z.enum(['residential','commercial','strata','co-living','construction','leasing','maintenance']);
export const onboardingSchema = z.object({
  legalConsent: z.unknown().optional(),
  displayName: z.string().trim().min(2).max(100),
  clientName: z.string().trim().min(2).max(160),
  // Legacy API clients are residential unless they explicitly select commercial.
  landlordType: z.enum(landlordTypes).default('residential'),
  serviceInterests: z.array(accountServiceAreaSchema).max(7).default([]),
});
export const propertySchema = z.object({
  address: z.string().trim().min(5).max(180),
  suburb: z.string().trim().min(2).max(80),
  postcode: z.string().regex(/^\d{4}$/),
  propertyType: z.enum([
    'House', 'Unit', 'Apartment', 'Townhouse', 'Villa', 'Duplex', 'Studio',
    'Office', 'Retail', 'Warehouse', 'Industrial', 'Mixed-use', 'Other',
  ]).default('House'),
  selfManaged: z.literal(true),
});
/** Property-wide facts, which can be reused by future reports and bookings. */
export const residentialPropertyProfileSchema = z.object({
  bedrooms: z.number().int().min(0).max(40),
  bathrooms: z.number().int().min(0).max(40),
  ensuites: z.number().int().min(0).max(40),
  separateToilets: z.number().int().min(0).max(40),
  carSpaces: z.number().int().min(0).max(40),
  furnishing: z.enum(['unfurnished','part_furnished','furnished','unknown']),
}).refine(value=>value.ensuites<=value.bathrooms,{
  path:['ensuites'],message:'En-suites are included in the total number of bathrooms.',
});
const australianDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value=>!Number.isNaN(Date.parse(value+'T00:00:00Z')) &&
    new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value,
  'Enter a valid calendar date.');
const optionalDate = australianDate.nullable().default(null);
/** These are private onboarding notes, NOT a canonical tenancy or invitation. */
export const residentialTenancyInformationSchema = z.object({
  occupancyStatus: z.enum(['tenanted','upcoming','vacant','unknown']),
  leaseType: z.enum(['fixed','periodic','unknown']).nullable().default(null),
  startsOn: optionalDate,
  endsOn: optionalDate,
  tenants: z.array(z.object({
    name: z.string().trim().min(2).max(120),
    email: z.union([email,z.literal('')]).optional(),
    phone: z.string().trim().max(40).optional(),
  })).max(10).default([]),
}).superRefine((value,ctx)=>{
  const applicable=value.occupancyStatus==='tenanted'||value.occupancyStatus==='upcoming';
  if(!applicable&&(value.leaseType!==null||value.startsOn!==null||value.endsOn!==null||value.tenants.length))
    ctx.addIssue({code:'custom',path:['occupancyStatus'],
      message:'Vacant or unknown occupancy must not include tenant or lease details.'});
  if(applicable&&!value.leaseType)
    ctx.addIssue({code:'custom',path:['leaseType'],message:'Select a lease arrangement or not yet confirmed.'});
  if(value.endsOn&&!value.startsOn)
    ctx.addIssue({code:'custom',path:['startsOn'],message:'Provide a commencement date before a lease end date.'});
  if(value.endsOn&&value.startsOn&&value.endsOn<=value.startsOn)
    ctx.addIssue({code:'custom',path:['endsOn'],message:'End date must be after commencement.'});
  if(value.leaseType==='periodic'&&value.endsOn)
    ctx.addIssue({code:'custom',path:['endsOn'],message:'A periodic tenancy must not specify a fixed end date.'});
});
export const residentialPropertySetupSchema = z.object({
  profile: residentialPropertyProfileSchema,
  tenancy: residentialTenancyInformationSchema,
  notes: z.string().trim().max(3000).default(''),
});
export const residentialPropertyOnboardingSchema = propertySchema.safeExtend(
  residentialPropertySetupSchema.shape,
);
export const residentialPropertyUpdateSchema = residentialPropertySetupSchema.extend({
  expectedVersion: z.number().int().min(0),
});

export const bookingSchema = z.object({
  intake: bookingIntakeSchema.optional(),
  legalConsent: z.unknown().optional(),
  propertyId: id,
  serviceId: id,
  startsAt: z.string().datetime({ offset: true }),
  requestKey: z.string().min(16).max(100),
  recurringPlanId: id.optional(),
  planDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  access: z.object({
    method: z.enum(['tenant', 'owner', 'agent', 'lockbox', 'other']),
    instructions: z.string().trim().max(3000),
    noticeConfirmed: z.boolean(),
  }),
});
export const requestSchema = z.object({
  serviceIntake: residentialServiceRequestIntakeSchema.optional(),
  propertyId: id.optional(),
  spaceId: id.optional(),
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
