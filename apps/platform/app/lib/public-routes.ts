/** Public, indexable marketing route families for the unified Worker. */
export function isPublicSitePath(pathname: string): boolean {
  if (pathname === '/' || pathname === '/services' || pathname === '/contact' ||
      pathname === '/resources' || pathname === '/robots.txt' || pathname === '/sitemap.xml')
    return true;
  if (/^\/properties-for-lease\/cancel\/[a-f0-9]{64}$/.test(pathname)) return false;
  if (pathname === '/properties-for-lease' || /^\/properties-for-lease\/(?:residential|commercial)(?:\/[a-z0-9-]+)?$/.test(pathname)) return true;
  if (/^\/(?:services|sectors|how-we-work|resources)\/.+/.test(pathname)) return true;
  return new Set([
    '/how-it-works', '/why-proinspect', '/client-experience', '/areas-we-service',
    '/about', '/privacy', '/terms',
  ]).has(pathname);
}

/** Never index the Worker preview alias or pages containing customer data. */
export function shouldIndexPublicPage(pathname: string, requestOrigin: string, appEnv: string): boolean {
  return appEnv === 'production' &&
    requestOrigin === 'https://proinspect.systems' && isPublicSitePath(pathname);
}
/** Sensitive applicant links share the marketing styling but are NEVER indexable. */
export function isMarketingStylePath(pathname:string):boolean {
 return pathname==='/open-home/check-in'||isPublicSitePath(pathname)||/^\/rental-application\/[a-f0-9]{64}$/.test(pathname)||
  /^\/properties-for-lease\/residential\/[a-z0-9-]+\/apply$/.test(pathname);
}
