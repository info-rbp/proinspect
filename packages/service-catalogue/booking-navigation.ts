import type { Service } from '../domain/index';

/**
 * Customer-facing appointment discovery for the existing service catalogue.
 * This is a presentation grouping, not a new catalogue or an entitlement.
 * Availability, pricing, authority and subscription coverage remain enforced
 * by the established booking APIs.
 *
 * Documentation and recurring support have no individual bookable service IDs
 * in the canonical seed catalogue and stay in their own property workflows.
 */
export const BOOKING_CATEGORIES = [
  {
    id: 'inspections',
    title: 'Book an inspection',
    description: 'Property condition, routine, vacate, exit and other inspections.',
    family: 'inspections',
  },
  {
    id: 'attendance',
    title: 'Arrange property attendance',
    description: 'Property meetings and authorised on-site assistance.',
    family: 'attendance',
  },
  {
    id: 'maintenance',
    title: 'Maintenance & follow-up',
    description: 'Maintenance assessments, completed works and reinspections.',
    family: 'maintenance',
  },
  {
    id: 'access',
    title: 'Access & handover',
    description: 'Contractor entry, key handovers and other authorised access.',
    family: 'access',
  },
] as const;

export type BookingCategoryId = (typeof BOOKING_CATEGORIES)[number]['id'];

export function isBookingCategoryId(value: string | null): value is BookingCategoryId {
  return BOOKING_CATEGORIES.some((category) => category.id === value);
}

export function bookingCategoryForService(
  service: Pick<Service, 'family'> | undefined,
): BookingCategoryId | null {
  return BOOKING_CATEGORIES.find((category) => category.family === service?.family)?.id ?? null;
}

/** No unauthorised, inactive or out-of-sector catalogue entries are displayed. */
export function propertyBookingCategories(services: readonly Service[], sector: string) {
  const eligible = services.filter(
    (service) => service.active === 1 && service.sectors.includes(sector),
  );
  return BOOKING_CATEGORIES.map((category) => ({
    ...category,
    services: eligible.filter((service) => service.family === category.family),
  })).filter((category) => category.services.length > 0);
}
