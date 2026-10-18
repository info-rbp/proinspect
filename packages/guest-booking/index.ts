import { z } from 'zod';
import { bookingSchema, email, id } from '../validation/index';

/** Guest purchasers have no client membership, subscription or login session. */
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
  propertyType: z.string().trim().min(2).max(80),
  startsAt: z.string().datetime({offset:true}).optional(),
  access: bookingSchema.shape.access,
  consent: z.literal(true),
  website: z.string().max(100).optional(),
  turnstile: z.string().max(2048).optional(),
}).strict();

export type GuestBookingInput = z.infer<typeof guestBookingSchema>;
export const guestTokenSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
});
export function isGuestDirectBookable(service: {
  booking_mode: string; price_ex_gst_cents: number | null; active: number;
}) {
  return service.active === 1 && service.booking_mode === 'instant' &&
    service.price_ex_gst_cents !== null;
}
