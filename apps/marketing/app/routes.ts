import {type RouteConfig,index,route} from '@react-router/dev/routes';
export default [index('routes/home.tsx'),route('services','routes/services.tsx'),route('services/:slug','routes/service.tsx'),route('sectors/:sector','routes/sector.tsx'),route(':page','routes/information.tsx'),route('sitemap.xml','routes/sitemap.ts'),route('robots.txt','routes/robots.ts')] satisfies RouteConfig;
