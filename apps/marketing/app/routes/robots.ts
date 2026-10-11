import type { LoaderFunctionArgs } from 'react-router';
import { runtimeContext } from '../../../../packages/database/context';
export function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env as Record<string, string>;
  return new Response(
    env.APP_ENV === 'production' && new URL(request.url).origin === 'https://proinspect.systems'
      ? 'User-agent: *\nAllow: /\nSitemap: https://proinspect.systems/sitemap.xml\n'
      : 'User-agent: *\nDisallow: /\n',
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
}