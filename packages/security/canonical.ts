/** Redirect only safe page navigation from explicitly known legacy production aliases. */
export function canonicalPageRedirect(request: Request, appOrigin: string, appEnv: string): Response | null {
  if (appEnv !== 'production' || !['GET', 'HEAD'].includes(request.method)) return null;
  const current = new URL(request.url);
  if (current.pathname.startsWith('/api/')) return null;
  let canonical: URL;
  try { canonical = new URL(appOrigin); } catch { return null; }
  if (canonical.origin !== 'https://proinspect.systems' || current.origin === canonical.origin) return null;
  const legacy = new Set([
    'proinspect-platform.delicate-dream-e4c9.workers.dev',
    'bookings.proinspect.systems',
  ]);
  if (!legacy.has(current.hostname)) return null;
  const destination = new URL(canonical.origin);
  destination.pathname = current.pathname;
  destination.search = current.search;
  return new Response(null, {status: 308, headers: {
    Location: destination.href,
    'Cache-Control': 'private, no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  }});
}
