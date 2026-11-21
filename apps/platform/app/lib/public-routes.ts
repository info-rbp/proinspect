import { retiredPublicPath } from '../../../../packages/domain/residential-policy.ts';
import { PUBLIC_LEGAL_APPROVAL, type PublicLegalKey } from '../../../../packages/marketing/legal-drafts.ts';
import { RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED } from '../../../../packages/marketing/pricing-publication.ts';

/** Public marketing route families for the unified Worker, including unapproved legal drafts. */
export function isPublicSitePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/help-centre' || pathname === '/example-reports' || pathname === '/residential/services' || pathname === '/residential/subscriptions' || /^\/residential\/services\/[a-z-]+$/.test(pathname) || pathname === '/services' || pathname === '/contact' || pathname === '/tenants' ||
      pathname === '/resources' || new Set(['/residential','/commercial','/strata','/co-living','/student-living','/construction','/leasing','/maintenance']).has(pathname) || pathname === '/service-finder' || pathname === '/who-we-help' || pathname === '/residential-property-support' || pathname === '/robots.txt' || pathname === '/sitemap.xml')
    return true;
  if (pathname === '/properties-for-lease' || /^\/properties-for-lease\/(?:residential|commercial)(?:\/[a-z0-9-]+)?$/.test(pathname)) return true;
  if (/^\/(?:services|sectors|how-we-work|resources|who-we-help)\/.+/.test(pathname)) return true;
  return new Set([
    '/how-it-works', '/why-proinspect', '/client-experience', '/areas-we-service',
    '/about', '/privacy', '/terms', '/website-terms', '/platform-terms', '/booking-policy', '/service-scopes', '/subscription-terms',
  ]).has(pathname);
}

/** Never index the Worker preview alias or pages containing customer data. */
export function shouldIndexPublicPage(pathname: string, requestOrigin: string, appEnv: string): boolean {
  if (retiredPublicPath(pathname) || pathname === '/student-living' || pathname === '/who-we-help') return false;
  // Canonical sector redirects remain routable but must not be indexed as distinct pages.
  if (/^\/sectors\/(?:residential|commercial|strata-building)$/.test(pathname)) return false;
  // Do not publicly index unapproved leasing/visitor flows in V3.
  if ((pathname === '/residential-property-support' || pathname === '/residential/subscriptions') && !RESIDENTIAL_SUPPORT_COMMERCIAL_APPROVED) return false;
  if (pathname === '/leasing' || pathname.startsWith('/properties-for-lease') || pathname.startsWith('/open-home')) return false;
  const key = pathname.slice(1) as PublicLegalKey;
  if (Object.prototype.hasOwnProperty.call(PUBLIC_LEGAL_APPROVAL, key) && !PUBLIC_LEGAL_APPROVAL[key].approved) return false;
  return appEnv === 'production' &&
    requestOrigin === 'https://proinspect.systems' && isPublicSitePath(pathname);
}
/** Render private applicant, check-in and cancellation journeys with marketing chrome without indexing them. */
export function isMarketingStylePath(pathname: string): boolean {
  if (/^\/commercial-application\/(?:session|recover|[a-f0-9]{64}|recipient\/[a-f0-9]{64})$/.test(pathname) ||
      /^\/properties-for-lease\/commercial\/[a-z0-9-]+\/apply$/.test(pathname)) return true;
  return isPublicSitePath(pathname) || /^\/guest\/(?:services|request(?:\/[a-zA-Z0-9_-]+)?)$/.test(pathname) || /^\/guest\/(?:book(?:\/[a-z0-9-]+)?|verify|manage|quote|checkout-result)$/.test(pathname) || /^\/(?:rental-application|rental-package)\/[a-f0-9]{64}$/.test(pathname) ||
    /^\/rental-recipient\/verify\/[a-f0-9]{64}$/.test(pathname) || pathname === '/rental-application/recover' || pathname === '/open-home/check-in' || /^\/properties-for-lease\/cancel\/[a-f0-9]{64}$/.test(pathname) ||
    /^\/properties-for-lease\/residential\/[a-z0-9-]+\/apply$/.test(pathname);
}
