import { ENGAGEMENTS, GUIDES } from '../../../../packages/marketing/content';
import { SERVICE_SEEDS, FAMILIES } from '../../../../packages/service-catalogue/index';
export function loader() {
  const paths = [
    '/',
    '/services',
    '/sectors/residential',
    '/sectors/commercial',
    '/sectors/strata-building',
    '/how-it-works',
    '/client-experience',
    '/about',
    '/contact',
    '/why-proinspect',
    '/areas-we-service',
    '/resources',
    ...Object.keys(FAMILIES).map((x) => `/services/category/${x}`),
    ...Object.keys(ENGAGEMENTS).map((x) => `/how-we-work/${x}`),
    ...Object.keys(GUIDES).map((x) => `/resources/${x}`),
    ...SERVICE_SEEDS.map((s) => `/services/${s.id}`),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>https://proinspect.systems${path}</loc></url>`).join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
}
