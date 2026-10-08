import { type RouteConfig, index, route } from '@react-router/dev/routes';
export default [
  index('routes/home.tsx'),
  route('services', 'routes/services.tsx'),
  route('services/category/:family', 'routes/content.tsx', { id: 'service-family' }),
  route('how-we-work/:model', 'routes/content.tsx', { id: 'engagement-model' }),
  route('resources', 'routes/resources.tsx'),
  route('resources/:guide', 'routes/content.tsx', { id: 'resource-guide' }),
  route('services/:slug', 'routes/service.tsx'),
  route('sectors/:sector', 'routes/sector.tsx'),
  route('contact', 'routes/contact.tsx'),
  route(':page', 'routes/information.tsx'),
  route('sitemap.xml', 'routes/sitemap.ts'),
  route('robots.txt', 'routes/robots.ts'),
] satisfies RouteConfig;
