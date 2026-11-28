import { Link } from 'react-router';
import { BrandImage, type BrandImageKey } from '../components/brand-image';
import { EditorialHero } from '../components/editorial';
import { seo } from '../lib/seo';

export const meta = () => seo(
  'Property Solutions. Built Around You. — Western Australia',
  'Explore ProInspect residential and commercial property services, co-living and co-working, construction project management, modular building and maintenance.',
  '/'
);

type ServiceTile = { title: string; copy: string; image: BrandImageKey; href: string; action: string };
const residential: ServiceTile[] = [
  { title: 'Residential Solutions', copy: 'From inspections and leasing to tenancy administration and ongoing property support, we help make looking after your residential property easier.', image: 'residential', href: '/residential', action: 'Explore Our Residential Solutions' },
  { title: 'Co-Living Spaces', copy: 'Let us help you discover a more connected approach to shared living with property set-up, resident support and on-going care', image: 'co-living', href: '/co-living', action: 'Explore Our Co-Living Solutions' },
];
const commercial: ServiceTile[] = [
  { title: 'Commercial Solutions', copy: 'Take the stress out of your commercial properties with regular inspections, tenant engagement and support when things go wrong with our commercial property solutions', image: 'commercial', href: '/commercial', action: 'Explore Our Commercial Solutions' },
  { title: 'Co-Working Spaces', copy: 'Convert your commercial space into a co-working space with flexible tailored workspaces, shared environments and fully managed solutions', image: 'co-working', href: '/co-spaces/co-working', action: 'Explore Our Co-Working Solutions' },
];
const projects: ServiceTile[] = [
  { title: 'Construction Project Management', copy: 'Take the stress out of your construction project and keep your project on track with our Construction Project Management Services', image: 'construction', href: '/construction', action: 'Explore Construction' },
  { title: 'Modular Building', copy: 'Discover a more flexible approach to building with modular solutions for evolving residential and commercial property needs.', image: 'modular', href: '/modular', action: 'Explore Modular' },
  { title: 'Maintenance', copy: 'Keep your property functioning at its best through practical maintenance support, approved contractor coordination and ongoing care.', image: 'maintenance', href: '/maintenance', action: 'Explore Maintenance' },
];
function ServiceBanner({ id, eyebrow, title, intro, tiles, neutral = false }: {
  id: string; eyebrow: string; title: string; intro: string; tiles: ServiceTile[]; neutral?: boolean;
}) {
  return <section id={id} className={'mkt-section pi-editorial-section pi-home-service-banner' + (neutral ? ' pi-neutral' : '')} aria-labelledby={id + '-heading'}>
    <div className="site-container">
      <div className="pi-section-heading pi-home-stacked-heading">
        <p className="eyebrow">{eyebrow}</p><h2 id={id + '-heading'}>{title}</h2><p>{intro}</p>
      </div>
      <div className={'pi-home-services-grid ' + (tiles.length === 3 ? 'pi-home-three' : 'pi-home-two')}>
        {tiles.map(tile => <article className="pi-property-card pi-home-service-card" key={tile.href}>
          <Link to={tile.href} className="pi-card-image-link" aria-label={'View ' + tile.title}><BrandImage name={tile.image}/></Link>
          <div><h3><Link to={tile.href}>{tile.title}</Link></h3><p>{tile.copy}</p>
          <Link to={tile.href} className="pi-inline-link">{tile.action} <span aria-hidden="true">↗</span></Link></div>
        </article>)}
      </div>
    </div>
  </section>;
}
function CustomerCommitment() {
  return <section className="mkt-section pi-editorial-section" id="customer-commitment">
    <div className="site-container">
      <div className="pi-section-heading pi-home-stacked-heading">
        <p className="eyebrow">Our Commitment to You</p><h2>Property support that puts you first.</h2>
        <p>Every property is different, and so are the people behind it. We believe in building lasting working relationships through understanding, flexibility and responsive service.</p>
      </div>
      <div className="pi-home-principles">
        <article><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M27 15c0 6-5 10-11 10H8l-5 4v-9a10 10 0 0 1-1-5C2 9 8 4 15 4s12 5 12 11z"/><path d="M9 14h13M9 18h9"/></svg>
          <h3>We listen first.</h3><p>We take the time to understand your property, priorities and expectations before working with you to identify the right solution.</p></article>
        <article><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M4 8h24M4 16h24M4 24h24"/><circle cx="11" cy="8" r="3" fill="white"/><circle cx="22" cy="16" r="3" fill="white"/><circle cx="14" cy="24" r="3" fill="white"/></svg>
          <h3>We adapt to your needs.</h3><p>Our approach is flexible. We work with you to shape property services that fit your circumstances and evolve as your requirements change.</p></article>
        <article><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="5" width="24" height="18" rx="4"/><path d="m9 13 5 5 9-9M12 23v5h8v-5"/></svg>
          <h3>We stay connected.</h3><p>Clear communication, responsive support and a collaborative approach help keep you informed and involved along the way.</p></article>
      </div>
    </div>
  </section>;
}
export default function Home() {
  return <div className="pi-public-home pi-home-rebuild">
    <EditorialHero home eyebrow="ProInspect Property Services"
      title={'Property Solutions.\nBuilt Around You.'}
      intro="From Residential Homes to Co-Living Spaces, ProInspect helps realise potential in properties and provide the necessary support that landlords and agencies need with innovative solutions in the modern world"
      image="residential" primary={{ label: 'Learn More About ProInspect', to: '/about' }}
      secondary={{ label: 'Get Started Today', to: '/client' }}/>
    <ServiceBanner id="property-services" eyebrow="How we can help" title="The right support for your residential property."
      intro="Whether you own a single rental, manage a property portfolio or operate shared accommodation, discover flexible property solutions designed around your needs." tiles={residential}/>
    <ServiceBanner id="commercial-property-services" eyebrow="Commercial Property Services" title="Spaces that work better for your business."
      intro="Practical, flexible property solutions for commercial owners, property managers and operators who want to focus on what matters most to their business." tiles={commercial} neutral/>
    <ServiceBanner id="property-projects" eyebrow="Building, developing and maintaining property" title="Build it. Improve it. Keep it working."
      intro="From bringing a new project to life to keeping an existing property at its best, our solutions support every stage of the property journey." tiles={projects}/>
 <section className="mkt-section pi-editorial-section pi-neutral" id="home-leasing" aria-labelledby="home-leasing-heading"><div className="site-container pi-residential-feature">
  <div className="pi-residential-feature-image"><BrandImage name="leasing"/></div>
  <div className="pi-residential-feature-content"><p className="eyebrow">Looking for your next home?</p><h2 id="home-leasing-heading">Properties Available</h2>
   <p>Find your next place with ProInspect. Browse our available homes, see when the next advertised open home is and submit an application online</p>
   <Link to="/leasing" className="button">See What's Available <span aria-hidden="true">→</span></Link></div>
 </div></section>

    <section className="mkt-section pi-editorial-section pi-deep" id="proinspect-approach" aria-labelledby="home-innovation-heading">
      <div className="site-container pi-residential-feature pi-residential-approach">
        <div className="pi-residential-feature-image"><BrandImage name="innovation"/></div>
        <div className="pi-residential-feature-content">
          <p className="eyebrow">Innovation with purpose</p><h2 id="home-innovation-heading">Innovative property solutions.<br/>Connected by design.</h2>
          <p>Property needs are constantly evolving.</p>
          <p>We bring together innovative property solutions, practical expertise and connected technology to support residential and commercial properties in a more effective way.</p>
          <p>From shared living and working environments to construction, modular building, inspections and maintenance, our approach is designed to simplify the way you look after, develop and operate your property.</p>
          <Link to="/about" className="pi-inline-link">Discover the ProInspect Approach <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
    <section className="mkt-section pi-editorial-section pi-neutral" id="home-subscriptions" aria-labelledby="home-subscriptions-heading">
      <div className="site-container pi-residential-feature pi-residential-feature-reverse">
        <div className="pi-residential-feature-image"><BrandImage name="subscription-care"/></div>
        <div className="pi-residential-feature-content">
          <p className="eyebrow">ProInspect Subscriptions</p>
          <h2 id="home-subscriptions-heading">A smarter way to support your property.</h2>
          <p>We believe property support should be more than a series of separate transactions. Our innovative subscription approach brings ongoing property services, practical expertise and connected technology together.</p>
          <p>From inspections and outsourced support to Co-Living, Co-Working and commercial property support, discover a more flexible way to meet your property’s evolving needs.</p>
          <Link className="button" to="/subscriptions">Explore Our Subscriptions <span aria-hidden="true">→</span></Link>
        </div>
      </div>
    </section>
    <CustomerCommitment/>
 <section className="mkt-final-cta"><div className="site-container mkt-cta-inner">
  <div><p className="eyebrow">Ready for the next step?</p><h2>Let’s make property work easier.</h2>
   <p>No long calls or waiting for an email reply to create an account. Sign up for free, add your authorised property and explore the services available to you.</p></div>
  <div className="actions"><Link className="button mkt-button-light" to="/client">Sign Up Today <span aria-hidden="true">→</span></Link></div>
 </div></section>

  </div>;
}
