import { PUBLIC_LEGAL_APPROVAL } from '../../../../packages/marketing/legal-drafts.ts';

/** Public marketing route families for the unified Worker, including unapproved legal drafts. */
export function isPublicSitePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/services' || pathname === '/contact' ||
      pathname === '/resources' || pathname === '/robots.txt' || pathname === '/sitemap.xml')
    return true;
  if (/^\/(?:services|sectors|how-we-work|resources)\/.+/.test(pathname)) return true;
  return new Set([
    '/how-it-works', '/why-proinspect', '/client-experience', '/areas-we-service',
    '/about', '/privacy', '/terms',
  ]).has(pathname);
}

/** Never index the Worker preview alias or pages containing customer data. */
export function shouldIndexPublicPage(pathname: string, requestOrigin: string, appEnv: string): boolean {
  if (pathname === '/privacy' && !PUBLIC_LEGAL_APPROVAL.privacy.approved) return false;
  if (pathname === '/terms' && !PUBLIC_LEGAL_APPROVAL.terms.approved) return false;
  return appEnv === 'production' &&
    requestOrigin === 'https://proinspect.systems' && isPublicSitePath(pathname);
}