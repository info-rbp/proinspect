export function seo(title: string, description: string, path: string) {
  return [
    { title: `${title} | ProInspect` },
    { name: 'description', content: description },
    { property: 'og:title', content: `${title} | ProInspect` },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: `https://proinspect.systems${path}` },
    { tagName: 'link', rel: 'canonical', href: `https://proinspect.systems${path}` },
  ];
}
