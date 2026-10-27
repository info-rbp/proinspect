import { z } from 'zod';
import { bookingSchema, email, id } from '../validation/index';

export const guestBookingSchema = z.object({
  requestKey: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email,
  phone: z.string().trim().min(6).max(40),
  serviceId: id,
  sector: z.enum(['residential','commercial','strata-building']),
  address: z.string().trim().min(5).max(180),
  suburb: z.string().trim().min(2).max(80),
  postcode: z.string().regex(/^\d{4}$/),
  propertyType: z.enum(['House','Apartment','Townhouse','Villa','Office','Retail','Warehouse','Industrial','Mixed-use','Other']),
  launchOffer: z.literal('pcr100').optional(),
  offsiteKeyCollection: z.boolean().optional(),
  keyCollectionLocation: z.string().trim().max(180).optional(),
  saleVariantId: id.optional(),
  saleQuantity: z.number().int().min(1).max(500).optional(),
  legalConsent: z.unknown().optional(),
  startsAt: z.string().datetime({offset:true}).optional(),
  access: bookingSchema.shape.access,
  consent: z.literal(true),
  website: z.string().max(100).optional(),
  turnstile: z.string().max(2048).optional(),
}).strict();
export type GuestBookingInput = z.infer<typeof guestBookingSchema>;
export const guestTokenSchema = z.object({token:z.string().regex(/^[a-f0-9]{64}$/)});
export const guestChangeSchema = guestTokenSchema.extend({
  legalConsent: z.unknown().optional(),
  applyPcrDiscount: z.boolean().optional(),
  appointmentTotalCents: z.number().int().positive().max(200000000).optional(),
  discountTotalCents: z.number().int().positive().max(200000000).optional(),
  action: z.enum(['cancel','reschedule','confirm']),
  startsAt: z.string().datetime({offset:true}).optional(),
});
export const guestQuoteSchema = z.object({
  priceExGstCents: z.number().int().min(0).max(100000000),
  validDays: z.number().int().min(1).max(30).default(14),
});
export function isGuestDirectBookable(service: {booking_mode:string;price_ex_gst_cents:number|null;active:number}) {
  return service.active===1 && service.booking_mode==='instant' && service.price_ex_gst_cents!==null;
}
export function guestPriceLabel(cents:number|null,basis:'published'|'quote') {
  return cents===null?'Quote required':new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(cents/100)+' ex GST'+(basis==='quote'?' (quoted)':'');
}
