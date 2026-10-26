import { PUBLIC_LEGAL_APPROVAL, type PublicLegalKey } from '../../../../packages/marketing/legal-drafts.ts';

/** Public marketing route families for the unified Worker, including unapproved legal drafts. */
export function isPublicSitePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/services' || pathname === '/contact' ||
      pathname === '/resources' || pathname === '/robots.txt' || pathname === '/sitemap.xml')
    return true;
  if (pathname === '/properties-for-lease' || /^\/properties-for-lease\/(?:residential|commercial)(?:\/[a-z0-9-]+)?$/.test(pathname)) return true;
  if (/^\/(?:services|sectors|how-we-work|resources)\/.+/.test(pathname)) return true;
  return new Set([
    '/how-it-works', '/why-proinspect', '/client-experience', '/areas-we-service',
    '/about', '/privacy', '/terms', '/website-terms', '/platform-terms', '/booking-policy', '/service-scopes', '/subscription-terms',
  ]).has(pathname);
}

/** Never index the Worker preview alias or pages containing customer data. */
export function shouldIndexPublicPage(pathname: string, requestOrigin: string, appEnv: string): boolean {
  // Do not publicly index unapproved leasing/visitor flows in V3.
  if (pathname.startsWith('/properties-for-lease') || pathname.startsWith('/open-home')) return false;
  const key = pathname.slice(1) as PublicLegalKey;
  if (Object.prototype.hasOwnProperty.call(PUBLIC_LEGAL_APPROVAL, key) && !PUBLIC_LEGAL_APPROVAL[key].approved) return false;
  return appEnv === 'production' &&
    requestOrigin === 'https://proinspect.systems' && isPublicSitePath(pathname);
}
/** Render private applicant, check-in and cancellation journeys with marketing chrome without indexing them. */
export function isMarketingStylePath(pathname: string): boolean {
  return isPublicSitePath(pathname) || /^\/guest\/(?:services|request(?:\/[a-zA-Z0-9_-]+)?)$/.test(pathname) || /^\/guest\/(?:book(?:\/[a-z0-9-]+)?|verify|manage|quote|checkout-result)$/.test(pathname) || /^\/rental-application\/[a-f0-9]{64}$/.test(pathname) ||
    /^\/rental-recipient\/verify\/[a-f0-9]{64}$/.test(pathname) || pathname === '/rental-application/recover' || pathname === '/open-home/check-in' || /^\/properties-for-lease\/cancel\/[a-f0-9]{64}$/.test(pathname) ||
    /^\/properties-for-lease\/residential\/[a-z0-9-]+\/apply$/.test(pathname);
}
