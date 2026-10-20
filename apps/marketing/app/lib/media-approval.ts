/**
 * Public-only marketing media registry.
 *
 * Nothing in private R2, customer-issued reports or portal documents may be
 * rendered as marketing imagery merely because a user can view it in a portal.
 * A photograph is publishable only after the business supplies the asset,
 * confirms rights/consent and reviews the specific use and alt text.
 *
 * This deliberately ships with NO approved photo assets. Until review,
 * original non-photographic illustrations continue to render as fallback.
 *
 * When adding assets, use a build-managed public path starting /marketing-media/
 * in BOTH application builds, and keep a record in docs/MARKETING_RELEASE_REVIEW.md.
 */
export type PublicMarketingMediaSlot =
  | 'home-hero'
  | 'sector-residential'
  | 'sector-commercial'
  | 'sector-strata'
  | 'service-hero';

export type PublicMarketingImage = {
  src: `/marketing-media/${string}`;
  alt: string;
  source: string;
  rightsRecord: string;
  propertyAndPersonConsentRecord: string;
  approvedBy: string;
  approvedForPublicUse: true;
};

/** Empty until copyright, privacy and permitted-use evidence has been supplied. */
export const APPROVED_PUBLIC_MARKETING_IMAGES: Partial<Record<PublicMarketingMediaSlot, PublicMarketingImage>> = {};

export function approvedPublicMarketingImage(slot?: PublicMarketingMediaSlot): PublicMarketingImage | null {
  if (!slot) return null;
  const item = APPROVED_PUBLIC_MARKETING_IMAGES[slot];
  if (!item || item.approvedForPublicUse !== true) return null;
  if (!/^\/marketing-media\/[a-z0-9][a-z0-9/_-]*\.(?:avif|webp|png|jpe?g)$/i.test(item.src)) return null;
  if ([item.alt, item.source, item.rightsRecord, item.propertyAndPersonConsentRecord, item.approvedBy]
      .some((value) => !value || value.trim().length < 3)) return null;
  return item;
}
