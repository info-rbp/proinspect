import { Link, useLoaderData, useOutletContext, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingSectionTitle, MarketingServiceGrid } from '../components/page-patterns';
import { seo } from '../lib/seo';

import { AUDIENCES } from '../../../../packages/marketing/audiences';

export function loader({params}:LoaderFunctionArgs) {
  const slug = params.audience ?? '';
  const audience = AUDIENCES[slug];
  if (!audience) throw new Response('Audience not found',{status:404});
  return { slug, ...audience, services: SERVICE_SEEDS.filter(s=>audience.serviceIds.includes(s.id)) };
}
export const meta:MetaFunction<typeof loader> = ({loaderData:d}) => d ? seo(
  d.name + ' — Property inspections and support WA',d.description,'/who-we-help/'+d.slug,
  {breadcrumbs:[{name:'Who we help',path:'/who-we-help'},{name:d.name,path:'/who-we-help/'+d.slug}]},
):[];
export default function AudiencePage(){
  const d=useLoaderData<typeof loader>();
  const {appOrigin}=useOutletContext<{appOrigin:string}>();
  return <>
    <MarketingPageHero eyebrow="Who we help" title={d.title} intro={d.description}
      crumbs={[{label:'Who we help',to:'/who-we-help'},{label:d.name}]} visual={d.visual}
      primary={{label:'Discuss your requirements',to:'/contact'}} />
    <section className="section mkt-section"><div className="site-container mkt-service-intro-grid">
      <div><p className="eyebrow">A practical working arrangement</p><h2>Support that fits the responsibility.</h2><p>{d.purpose}</p>
        <Link className="mkt-text-link" to="/how-it-works">How ProInspect works <span aria-hidden="true">→</span></Link></div>
      <aside className="mkt-at-glance"><p className="eyebrow">Before you arrange a service</p><h3>What helps us prepare</h3><p>{d.before}</p></aside>
    </div></section>
    <section className="section mkt-section mkt-stone"><div className="site-container">
      <MarketingSectionTitle eyebrow="The day-to-day advantage" title="Useful support at the property." description="Choose work around a specific outcome, with a clear instruction and documented result." />
      <div className="mkt-editorial-grid">{d.what.map(([title,body],i)=><article key={title} className="mkt-editorial-panel">
        <span className="mkt-card-number">{String(i+1).padStart(2,'0')}</span><h3>{title}</h3><p>{body}</p></article>)}</div>
    </div></section>
    <section className="section mkt-section"><div className="site-container">
      <MarketingSectionTitle eyebrow="Relevant services" title={'Explore services for '+d.name.toLowerCase()+'.'}
        description="Read what each service usually covers, what it excludes and the intended outcome."
        to="/services" linkText="Browse all 23 services" />
      <MarketingServiceGrid services={d.services} />
    </div></section>
    <section className="section mkt-section mkt-stone"><div className="site-container mkt-callout-grid">
      <div><p className="eyebrow">Service boundaries</p><h2>Your authority stays with you.</h2><p>{d.boundary}</p></div>
      <div className="mkt-callout-panel"><h3>One-off work or ongoing support?</h3><p>Discuss the property, expected workload and who is authorised to instruct services. We will confirm scope, availability and applicable commercial terms before accepting an engagement.</p>
      {d.slug==='private-landlords'&&<Link className="mkt-text-link" to="/residential-property-support">Residential property support options <span aria-hidden="true">→</span></Link>}
      <Link className="mkt-text-link" to="/contact">Talk through your requirement <span aria-hidden="true">→</span></Link></div>
    </div></section>
    <MarketingCta title="Have a property that needs attention?" description="Tell us the task, general location and intended outcome. We will clarify the service and next step." appOrigin={appOrigin}/>
  </>;
}
