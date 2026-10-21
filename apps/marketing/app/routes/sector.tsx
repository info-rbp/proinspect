import { Link, useLoaderData, useOutletContext, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { SERVICE_SEEDS } from '../../../../packages/service-catalogue/index';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingSectionTitle, MarketingServiceGrid } from '../components/page-patterns';
import { seo } from '../lib/seo';

const sectors = {
  residential: {
    name: 'Residential property',
    description: 'Inspection and on-site support for private self-managing landlords and property management firms.',
    need: 'Manage the property without losing track of the work.',
    body: 'An incoming condition record, routine visit, final inspection or maintenance attendance each has a different purpose. Choose the service around the tenancy stage and the decision you need to make.',
    audience: [
      ['Self-managing private landlords', 'Arrange appropriate inspections and property attendance when managing your own residential rental.'],
      ['Property management firms', 'Support scheduled inspection workloads and specific on-the-ground tasks without transferring the agency’s professional responsibilities.'],
      ['Rental property decisions', 'Keep observations and documentation connected to the correct property and tenancy context.'],
    ] as [string, string][],
    examples: ['Routine inspections and incoming records', 'Pre-vacate and final condition', 'Maintenance and completed-works attendance'],
  },
  commercial: {
    name: 'Commercial property',
    description: 'Condition, make-good, contractor attendance and operational support for commercial properties.',
    need: 'Keep site work and handover requirements visible.',
    body: 'Commercial property instructions often involve several parties and a defined lease or works scope. Use ProInspect for an agreed attendance or condition record, with specialist matters identified for the appropriate reviewer.',
    audience: [
      ['Commercial property owners', 'Arrange agreed condition observations and on-site assistance without assuming a full property management engagement.'],
      ['Property managers', 'Coordinate particular attendance needs and document work across managed commercial sites.'],
      ['Asset and portfolio managers', 'Maintain clear instructions and service outputs as part of wider property oversight.'],
    ] as [string, string][],
    examples: ['Commercial condition inspections', 'Pre-vacate and final make-good observations', 'Contractor access and completed-works checks'],
  },
  'strata-building': {
    name: 'Strata & buildings',
    description: 'Common-property inspections, building attendance and contractor support for strata environments.',
    need: 'Operational support for shared spaces.',
    body: 'Common areas, building access and contractor attendance need a clear location and instruction. ProInspect supports on-the-ground delivery while the authorised scheme representatives retain their decision-making roles.',
    audience: [
      ['Strata management firms', 'Arrange documented common-property attendance and contractor support for authorised schemes.'],
      ['Building managers', 'Support specific building tasks, site attendance, handovers and reported maintenance matters.'],
      ['Strata councils', 'Understand documented shared-area issues while the authorised manager and scheme retain their decision-making authority.'],
    ] as [string, string][],
    examples: ['Common-property condition and issue records', 'Contractor attendance and authorised access', 'Building handovers and shared-area inspections'],
  },
};
export function loader({ params }: LoaderFunctionArgs) {
  const key = params.sector as keyof typeof sectors;
  if (!sectors[key]) throw new Response('Not found', { status: 404 });
  return { key, ...sectors[key], services: SERVICE_SEEDS.filter((service) => service.sectors.includes(key)) };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  loaderData ? seo(loaderData.name + ' services', loaderData.description, '/sectors/' + loaderData.key) : [];

export default function Sector() {
  const d = useLoaderData<typeof loader>();
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <>
      <MarketingPageHero
        eyebrow="Who we help"
        title={d.name + ' services'}
        intro={d.description}
        crumbs={[{ label: 'Who we help' }, { label: d.name }]}
        visual={d.key === 'strata-building' ? 'strata' : d.key}
        primary={{ label: 'Discuss your requirements', to: '/contact' }}
      />
      <section className="section mkt-section">
        <div className="site-container mkt-callout-grid">
          <div>
            <p className="eyebrow">Your property setting</p>
            <h2>{d.need}</h2>
            <p>{d.body}</p>
            <Link className="mkt-text-link" to="/how-it-works">How our attendance works <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="mkt-callout-panel">
            <span className="mkt-card-number">COMMON PROPERTY NEEDS</span>
            <ul className="mkt-check-list">{d.examples.map((example) => <li key={example}>{example}</li>)}</ul>
            <p className="mkt-image-disclosure">Services are subject to the accepted scope, access and availability.</p>
          </div>
        </div>
      </section>
      <section className="section mkt-section mkt-stone">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow="Who uses this support"
            title="Different responsibilities. A clear service boundary."
            description="Relevant support depends on who instructs the work, who authorises access and who makes the property decisions."
          />
          <div className="mkt-editorial-grid">
            {d.audience.map(([name, copy], index) => (
              <article className="mkt-editorial-panel" key={name}>
                <span className="mkt-card-number">0{index + 1}</span>
                <h3>{name}</h3><p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section mkt-section">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow="Services for this setting"
            title="Explore relevant inspections and attendance."
            description="Every service has its own purpose, agreed activity and documented output. Choose the one that meets your requirement."
            to="/services"
            linkText="Full service catalogue"
          />
          <MarketingServiceGrid services={d.services} />
        </div>
      </section>
      <section className="section mkt-section mkt-stone">
        <div className="site-container mkt-callout-grid">
          <div><p className="eyebrow">A documented outcome</p><h2>Keep the instruction and observations in context.</h2><p>Clear property and location information, agreed access and specific reporting expectations help the resulting record support your next decision.</p></div>
          <div className="mkt-callout-panel"><span className="mkt-card-number">WHAT HAPPENS NEXT</span><h3>Confirm before attending.</h3><p>ProInspect reviews scope, capacity and access arrangements. Additional repairs, technical assessments or management decisions are not automatically included.</p><Link className="mkt-text-link" to="/client-experience">Explore the client experience <span aria-hidden="true">↗</span></Link></div>
        </div>
      </section>
      <MarketingCta
        title={'Need on-the-ground ' + d.name.toLowerCase() + ' support?'}
        description="Tell us about the property, the task and your authority to instruct the work. We can clarify an appropriate service and agreed scope."
        appOrigin={appOrigin}
      />
    </>
  );
}
