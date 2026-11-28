import { Link, useLoaderData, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { EditorialHero } from '../components/editorial';
import type { BrandImageKey } from '../components/brand-image';
import { seo } from '../lib/seo';

type Resource = { title: string; description: string; href: string; action: string };
type Landing = { label: string; title: string; intro: string; image: BrandImageKey; heading: string; note?: string; resources: Resource[] };

// Editorial landing pages only. No price, service eligibility or provider
// configuration is changed by navigation. Existing detailed pages remain canonical.
const landings: Record<string, Landing> = {
  commercial: {
    label: 'Commercial',
    title: 'Commercial property services.',
    intro: 'Explore property support for commercial premises and discuss your requirements with ProInspect.',
    image: 'commercial',
    heading: 'Discuss your property requirements.',
    note: 'Commercial service scopes and availability are being reviewed as part of the rebuild. This information page does not enable commercial bookings, paid plans or new commercial account access.',
    resources: [
      { title: 'Property requirements', description: 'Outline your property type, the work you need and the outcomes you want to discuss.', href: '/contact', action: 'Contact ProInspect' },
      { title: 'Maintenance support', description: 'Explore the existing maintenance information and discuss the appropriate scope for your property.', href: '/maintenance', action: 'Explore maintenance' },
      { title: 'Existing accounts', description: 'Access your existing authorised ProInspect property and organisation workspaces.', href: '/client', action: 'Sign in to ProInspect' },
    ],
  },
  'co-spaces': {
    label: 'Co-Spaces',
    title: 'Support for shared spaces and shared living.',
    intro: 'Explore the existing Co-Living information, property setup guidance and resident pathways within Co-Spaces.',
    image: 'co-living',
    heading: 'Explore Co-Spaces.',
    resources: [
      { title: 'Co-Living', description: 'Discover the existing Co-Living programme and shared accommodation information.', href: '/co-living', action: 'Explore Co-Living' },
      { title: 'Property setup', description: 'Review the existing guidance on preparing a property, furnishings and shared facilities.', href: '/co-living/property-setup', action: 'Explore property setup' },
      { title: 'Tenants and residents', description: 'Find information for renters and residents, including the appropriate account access pathway.', href: '/tenants', action: 'Tenant information' },
    ],
  },
  modular: {
    label: 'Modular',
    title: 'Modular.',
    intro: 'The Modular section is being developed as part of the ProInspect website rebuild.',
    image: 'construction',
    heading: 'Modular information and enquiries.',
    note: 'The detailed Modular offering and its service boundaries are yet to be specified. No new service, pricing or booking availability is represented on this page.',
    resources: [
      { title: 'Discuss your requirements', description: 'Contact ProInspect to discuss your requirements while the detailed Modular information is being prepared.', href: '/contact', action: 'Contact ProInspect' },
      { title: 'Existing property services', description: 'Explore the existing service information in the meantime.', href: '/services', action: 'Explore services' },
    ],
  },
  construction: {
    label: 'Construction',
    title: 'Construction property services.',
    intro: 'Explore the Construction section of ProInspect and discuss your property or project requirements.',
    image: 'construction',
    heading: 'Construction information and enquiries.',
    note: 'Construction service scopes and availability are being reviewed as part of the rebuild. This information page does not activate new construction bookings, pricing or paid services.',
    resources: [
      { title: 'Project requirements', description: 'Tell us about your construction project, its stage and the support you would like to discuss.', href: '/contact', action: 'Contact ProInspect' },
      { title: 'Existing property services', description: 'Explore existing property service information while the Construction offering is being developed.', href: '/services', action: 'Explore services' },
    ],
  },
  subscriptions: {
    label: 'Subscriptions',
    title: 'Explore ProInspect subscriptions.',
    intro: 'Review existing subscription information, proposed service inclusions and terms before deciding what suits your property.',
    image: 'residential',
    heading: 'Subscription information.',
    note: 'Creating an account does not activate a paid subscription. Any paid plan remains subject to its approved terms, agreed scope and availability.',
    resources: [
      { title: 'Residential subscriptions', description: 'Review the existing Residential All Inclusive Subscription, its proposed inclusions and contract terms.', href: '/residential/subscriptions', action: 'View residential subscriptions' },
      { title: 'Subscription terms', description: 'Read the existing proposed subscription terms and conditions.', href: '/subscription-terms', action: 'Review subscription terms' },
      { title: 'Individual services', description: 'Explore individual Residential services separately from an ongoing subscription.', href: '/residential/services', action: 'View residential services' },
    ],
  },
  information: {
    label: 'Information',
    title: 'Information about ProInspect.',
    intro: 'Find company information, property resources, helpful guidance and the right contact details in one place.',
    image: 'leasing',
    heading: 'Find the information you need.',
    resources: [
      { title: 'About Us', description: 'Learn about ProInspect, our approach and the people we support.', href: '/about', action: 'About ProInspect' },
      { title: 'Contact', description: 'Get in touch with ProInspect about your property or service enquiry.', href: '/contact', action: 'Contact ProInspect' },
      { title: 'Help Centre', description: 'Find answers to common questions about services and account access.', href: '/help-centre', action: 'Open Help Centre' },
      { title: 'Resources', description: 'Explore the existing property guides and helpful information.', href: '/resources', action: 'View resources' },
      { title: 'Example reports', description: 'Review illustrative inspection reports and reporting information.', href: '/example-reports', action: 'View example reports' },
      { title: 'Privacy and terms', description: 'Review existing privacy information and website terms.', href: '/privacy', action: 'Privacy information' },
    ],
  },
};

export function loader({ request }: LoaderFunctionArgs) {
  const key = new URL(request.url).pathname.replace(/\.data$/, '').replace(/\/+$/, '').slice(1);
  if (!Object.hasOwn(landings, key)) throw new Response('Not found', { status: 404 });
  return { ...landings[key], key };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData: page }) =>
  page ? seo(page.label, page.intro, '/' + page.key, { noindex: true }) : [];

export default function RebuildLanding() {
  const page = useLoaderData<typeof loader>();
  return <>
    <EditorialHero eyebrow={page.label} title={page.title} intro={page.intro} image={page.image}
      primary={{ label: ['Modular', 'Commercial', 'Construction'].includes(page.label) ? 'Contact ProInspect' : 'Explore information', to: ['Modular', 'Commercial', 'Construction'].includes(page.label) ? '/contact' : '#landing-options' }} />
    <section className="mkt-section pi-editorial-section pi-neutral" id="landing-options">
      <div className="site-container">
        <div className="pi-section-heading">
          <p className="eyebrow">{page.label}</p>
          <h2>{page.heading}</h2>
          {page.note && <p>{page.note}</p>}
        </div>
        <div className="mkt-editorial-grid">
          {page.resources.map(resource => <article className="mkt-editorial-panel" key={resource.href}>
            <h3>{resource.title}</h3>
            <p>{resource.description}</p>
            <Link className="pi-inline-link" to={resource.href}>{resource.action} <span aria-hidden="true">↗</span></Link>
          </article>)}
        </div>
      </div>
    </section>
  </>;
}
