import {Link,useLoaderData,type LoaderFunctionArgs,type MetaFunction} from 'react-router';
import {FAMILIES,SERVICE_SEEDS} from '../../../../packages/service-catalogue/index';
import {ENGAGEMENTS,GUIDES} from '../../../../packages/marketing/content';
import {seo} from '../lib/seo';
export function loader({params,request}:LoaderFunctionArgs){
 const path=new URL(request.url).pathname;
 if(params.family){const family=FAMILIES[params.family];if(!family)throw new Response('Not found',{status:404});return {title:family.name,intro:family.description,path,sections:[['Start with the outcome','Choose the service around the property task and the decision you need to make. Scope, pricing and availability must be confirmed.'],['How the work connects','An authorised account links the request or booking to its property or scheme. Issued documents stay with that record.']] as [string,string][],services:SERVICE_SEEDS.filter(s=>s.family===params.family)};}
 const page=params.model?ENGAGEMENTS[params.model]:GUIDES[params.guide??''];if(!page)throw new Response('Not found',{status:404});
 return {...page,path,services:SERVICE_SEEDS.filter(s=>'services' in page&&(page.services as string[]).includes(s.id))};
}
export const meta:MetaFunction<typeof loader>=({loaderData:d})=>d?seo(d.title,d.intro,d.path):[];
export default function Content(){const d=useLoaderData<typeof loader>();return <><header className="service-hero"><div className="site-container"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/services">Services</Link><Link to="/resources">Guides &amp; comparisons</Link></nav><h1>{d.title}</h1><p>{d.intro}</p></div></header><section className="section"><div className="site-container"><article className="prose">{d.sections.map(([title,body])=><section key={title}><h2>{title}</h2><p>{body}</p></section>)}<p>Service information explains the proposed scope; it is not legal or specialist technical advice.</p><Link className="button" to="/contact">Discuss the right service</Link></article>{d.services.length>0&&<div className="grid-3" style={{marginTop:32}}>{d.services.map(s=><article className="service-card" key={s.id}><h2>{s.name}</h2><p>{s.summary}</p><Link to={`/services/${s.id}`}>Explore this service</Link></article>)}</div>}</div></section></>;}
