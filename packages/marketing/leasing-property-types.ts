/** Search taxonomy only. This is not a listing-creation or publication
 * entitlement, and must not widen the existing residential publication guard. */
export const LEASING_PROPERTY_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'co-living', label: 'Co-Living' },
  { value: 'co-working', label: 'Co-Working' },
  { value: 'other', label: 'Other' },
] as const;
export type LeasingPropertyType = typeof LEASING_PROPERTY_TYPES[number]['value'];

export function leasingPropertyType(value: unknown): LeasingPropertyType | '' {
  return LEASING_PROPERTY_TYPES.find(type => type.value === value)?.value ?? '';
}
export function leasingPropertyTypeLabel(value: unknown): string | undefined {
  return LEASING_PROPERTY_TYPES.find(type => type.value === value)?.label;
}
export function filterLeasingListings<T extends {
  kind?: unknown; suburb?: unknown; postcode?: unknown; display_address?: unknown; title?: unknown;
}>(listings: readonly T[], type: LeasingPropertyType | '', query: string): T[] {
  const q = query.trim().toLowerCase();
  return listings.filter(listing =>
    (!type || listing.kind === type) &&
    (!q || [listing.suburb, listing.postcode, listing.display_address, listing.title]
      .map(value => String(value ?? '')).join(' ').toLowerCase().includes(q))
  );
}
