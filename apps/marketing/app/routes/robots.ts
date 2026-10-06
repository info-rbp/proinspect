import type {LoaderFunctionArgs} from 'react-router';
import {runtimeContext} from '../../../../packages/database/context';
export function loader({context}:LoaderFunctionArgs){const env=context.get(runtimeContext).env as Record<string,string>;return new Response(env.APP_ENV==='production'?'User-agent: *\nAllow: /\nSitemap: https://proinspect.systems/sitemap.xml\n':'User-agent: *\nDisallow: /\n',{headers:{'Content-Type':'text/plain; charset=utf-8'}});}
