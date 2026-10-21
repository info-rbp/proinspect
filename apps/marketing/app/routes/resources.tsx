import { Link, useOutletContext } from 'react-router';
import { GUIDES } from '../../../../packages/marketing/content';
import { MarketingCta } from '../components/marketing-ui';
import { MarketingPageHero, MarketingSectionTitle, MarketingGuideCard } from '../components/page-patterns';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'Property service guides and comparisons',
    'Choose the appropriate inspection, attendance or operational support for your property.',
    '/resources',
  );
const guides = Object.entries(GUIDES);
export default function Resources() {
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <>
      <MarketingPageHero
        eyebrow="Property knowledge"
        title="Property service guides."
        intro="Clear comparisons and practical guidance for deciding what to inspect, attend and document. Understand service boundaries before arranging property work."
        crumbs={[{ label: 'Resources' }]}
        visual="resources"
        primary={{ label: 'Browse all guides', to: '#guides' }}
      />
      <section className="section mkt-section" id="guides">
        <div className="site-container">
          <MarketingSectionTitle
            eyebrow="Start with a useful answer"
            title="Know what the work needs to achieve."
            description="These guides describe common property situations and help identify the right type of attendance, documentation or follow-up."
          />
          <div className="mkt-catalogue-grid">
            {guides.map(([slug, guide], i) => <MarketingGuideCard key={slug} slug={slug} title={guide.title} intro={guide.intro} index={i} />)}
          </div>
        </div>
      </section>
      <section className="section mkt-section mkt-stone">
        <div className="site-container mkt-callout-grid">
          <div>
            <p className="eyebrow">Guidance with practical context</p>
            <h2>Understanding a service is the first step.</h2>
            <p>ProInspect offers separate services for inspections, operational attendance, documentation and contractor support. A routine inspection, incoming report and specialist technical assessment are not interchangeable.</p>
          </div>
          <div className="mkt-callout-panel">
            <span className="mkt-card-number">READING WITH A PURPOSE</span>
            <h3>Explore the services behind each guide.</h3>
            <p>Each article links to related services so you can review their scope and intended outcome before making an enquiry or booking request.</p>
            <Link className="mkt-text-link" to="/services">Browse the service catalogue <span aria-hidden="true">↗</span></Link>
          </div>
        </div>
      </section>
      <section className="section mkt-section">
        <div className="site-container mkt-callout-grid">
          <div><p className="eyebrow">Property-specific advice</p><h2>Still unsure which inspection or attendance fits?</h2><p>Describe the property task, the intended outcome and relevant timing or access restrictions. We can explain how a defined ProInspect service could fit.</p></div>
          <div className="mkt-callout-panel"><h3>Service guidance is general.</h3><p>Content in this library is information about ProInspect services, not legal advice, technical certification or a determination of property responsibilities.</p><Link className="button secondary" to="/contact">Ask about your requirements <span aria-hidden="true">→</span></Link></div>
        </div>
      </section>
      <MarketingCta title="Ready to arrange the right service?" description="Review the catalogue or tell us the property problem and the outcome you need. Scope and availability are confirmed before attendance." appOrigin={appOrigin} />
    </>
  );
}
