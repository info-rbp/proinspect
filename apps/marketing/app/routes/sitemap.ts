import { ENGAGEMENTS, GUIDES } from '../../../../packages/marketing/content';
import { SERVICE_SEEDS, FAMILIES } from '../../../../packages/service-catalogue/index';
import { shouldIndexPublicPage } from '../../../platform/app/lib/public-routes';
import { AUDIENCES } from '../../../../packages/marketing/audiences';

/** Sitemap intentionally contains only canonical, indexable public marketing pages.
 * Unapproved legal documents, proposed pricing, leasing records and private pages
 * are excluded even when their route can be visited directly.
 */
export function loader() {
  const paths = [
    '/',
    '/services',
    '/service-finder',
    '/who-we-help',
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
    '/residential-property-support',
    ...Object.keys(AUDIENCES).map(a => '/who-we-help/' + a),
    ...Object.keys(FAMILIES).map(f => '/services/category/' + f),
    ...Object.keys(ENGAGEMENTS).map(e => '/how-we-work/' + e),
    ...Object.keys(GUIDES).map(g => '/resources/' + g),
    ...SERVICE_SEEDS.map(s => '/services/' + s.id),
  ];
  const indexable = [...new Set(paths)].filter(path =>
    shouldIndexPublicPage(path, 'https://proinspect.systems', 'production'));
  const items = indexable.map(path =>
    '<url><loc>https://proinspect.systems' + path + '</loc></url>').join('');
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    items + '</urlset>',
    { headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    } },
  );
}
