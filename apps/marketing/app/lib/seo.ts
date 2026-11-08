import type { MetaDescriptor } from 'react-router';

const ORIGIN = 'https://proinspect.systems';
const business = { '@type': 'Organization', name: 'ProInspect Property Services', url: ORIGIN };

export type SeoOptions = {
  type?: 'WebPage' | 'CollectionPage' | 'Service';
  breadcrumbs?: Array<{ name: string; path: string }>;
  noindex?: boolean;
};

/**
 * Public metadata is written once and shared by both marketing builds.
 * Never advertise fictional ratings, prices, opening hours, addresses or imagery.
 * Proposed plans, unapproved documents and authenticated journeys stay noindex.
 */
export function seo(title: string, description: string, path: string, options: SeoOptions = {}): MetaDescriptor[] {
  const canonicalPath = path.startsWith('/') ? path : '/' + path;
  const url = ORIGIN + canonicalPath;
  const fullTitle = title === 'ProInspect' ? title : title + ' | ProInspect';
  const graph: Record<string, unknown>[] = [{
    '@type': options.type ?? 'WebPage',
    '@id': url + '#page',
    name: title,
    description,
    url,
    inLanguage: 'en-AU',
    isPartOf: { '@type': 'WebSite', name: 'ProInspect', url: ORIGIN },
    publisher: business,
  }];
  if (options.type === 'Service') {
    graph.push({
      '@type': 'Service',
      name: title,
      description,
      serviceType: title,
      provider: business,
      areaServed: { '@type': 'AdministrativeArea', name: 'Western Australia' },
      url,
    });
  }
  if (options.breadcrumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN + '/' },
        ...options.breadcrumbs.map((crumb, i) => ({
          '@type': 'ListItem', position: i + 2, name: crumb.name,
          item: ORIGIN + (crumb.path.startsWith('/') ? crumb.path : '/' + crumb.path),
        })),
      ],
    });
  }
  return [
    { title: fullTitle },
    { name: 'description', content: description },
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:site_name', content: 'ProInspect' },
    { property: 'og:locale', content: 'en_AU' },
    { property: 'og:url', content: url },
    { tagName: 'link', rel: 'canonical', href: url },
    { 'script:ld+json': { '@context': 'https://schema.org', '@graph': graph } },
    ...(options.noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
  ];
}
