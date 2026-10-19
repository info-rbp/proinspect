import { SERVICE_FOCUS } from '../../../../packages/marketing/content';
import { Link, useLoaderData, useOutletContext, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { findService, SERVICE_SEEDS, FAMILIES } from '../../../../packages/service-catalogue/index';
import { IllustrativeReport, MarketingCta, PropertyArtwork } from '../components/marketing-ui';
import { seo } from '../lib/seo';

export function loader({ params }: LoaderFunctionArgs) {
  const service = findService(params.slug ?? '');
  if (!service) throw new Response('Not found', { status: 404 });
  return {
    service,
    related: SERVICE_SEEDS.filter((s) => s.family === service.family && s.id !== service.id).slice(0, 3),
  };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  loaderData
    ? seo(loaderData.service.name, loaderData.service.summary, '/services/' + loaderData.service.id)
    : [{ title: 'Service not found | ProInspect' }];

const routineIncluded = [
  ['Visible condition', 'Observe accessible nominated rooms and areas within the agreed scope.'],
  ['Photographic record', 'Capture relevant visible conditions and matters requiring attention.'],
  ['Maintenance observations', 'Identify apparent issues for the authorised customer to review.'],
  ['Structured outcome', 'Provide the recorded observations and relevant next steps.'],
];
const routineSteps = [
  ['01', 'Choose the inspection', 'Tell us about the property and your preferred timeframe.'],
  ['02', 'Confirm access and scope', 'Provide the authorised access arrangements and relevant prior information.'],
  ['03', 'Property attendance', 'The agreed visible-condition inspection is undertaken on site.'],
  ['04', 'Receive the record', 'The issued result is associated with your authorised property account.'],
];
const routineFaq = [
  ['Is a routine inspection the same as a Property Condition Report?', 'No. A routine inspection records visible condition and matters needing attention during the tenancy. A PCR serves a different incoming-condition documentation purpose.'],
  ['Does the service include repairs?', 'No. The inspection documents observations within scope. Repair work and specialist assessments require separate arrangements.'],
  ['Will an online request reserve a time?', 'Not automatically. Appointment availability, price, scope and authorised access must be confirmed.'],
  ['What if access or specialist assessment is needed?', 'Provide any known restrictions before attendance. Any additional specialist work requires a separate scope and approval.'],
];
export default function ServicePage() {
  const { service: s, related } = useLoaderData<typeof loader>();
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  const routine = s.id === 'routine-inspection';
  const focus = SERVICE_FOCUS[s.id];
  return (
    <>
      <header className={'mkt-detail-hero' + (routine ? ' mkt-routine-hero' : '')}>
        <div className="site-container">
          <nav className="breadcrumbs mkt-breadcrumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link><span aria-hidden="true">/</span>
            <Link to="/services">Services</Link><span aria-hidden="true">/</span>
            <Link to={'/services/category/' + s.family}>{FAMILIES[s.family].name}</Link>
            <span aria-hidden="true">/</span><span aria-current="page">{s.name}</span>
          </nav>
          <div className="mkt-detail-hero-grid">
            <div>
              <p className="eyebrow">{FAMILIES[s.family].name}</p>
              <h1>{s.name}</h1>
              <p className="mkt-hero-lead">{routine
                ? 'Document your rental property’s visible condition, with clear observations that help you understand what may need attention.'
                : s.summary}</p>
              <div className="actions">
                <a className="button" href={appOrigin + '/book/' + s.id}>Arrange this service <span aria-hidden="true">→</span></a>
                <Link className="button secondary" to={'/contact?service=' + s.id}>Ask about the scope</Link>
              </div>
              <p className="mkt-booking-note">Booking and timing are subject to confirmed scope, price, access and availability.</p>
            </div>
            <div className="mkt-detail-visual">
              <PropertyArtwork kind={s.sectors.includes('commercial') && !s.sectors.includes('residential') ? 'commercial' : s.sectors.includes('strata-building') && !s.sectors.includes('residential') ? 'strata' : 'residential'} />
              <div className="mkt-detail-visual-tag">Property attendance <span aria-hidden="true">·</span> Recorded outcome</div>
            </div>
          </div>
        </div>
      </header>

      <section className="mkt-service-highlights">
        <div className="site-container mkt-assurance-items">
          <span>Defined service scope</span><span>Authorised property access</span>
          <span>Visible-condition observations</span><span>Recorded outcome</span>
        </div>
      </section>

      {routine ? (
        <>
          <section className="section mkt-section">
            <div className="site-container mkt-service-intro-grid">
              <div>
                <p className="eyebrow">The service explained</p>
                <h2>What is a Routine Inspection?</h2>
                <p>A routine inspection is an agreed attendance to observe a rental property's visible condition and identify matters that may need follow-up.</p>
                <p>It is designed to create a useful point-in-time record for the authorised owner or manager. It is not a specialist building assessment, a repair service, or a determination of a tenant's legal responsibilities.</p>
                <Link className="mkt-text-link" to="/resources/routine-inspection-vs-pcr">Routine inspection or PCR? Compare the services <span aria-hidden="true">↗</span></Link>
              </div>
              <aside className="mkt-at-glance">
                <p className="eyebrow">At a glance</p>
                <h3>Commonly requested by</h3>
                <ul><li>Self-managing private landlords</li><li>Professional property management firms</li></ul>
                <div className="mkt-aside-divider" />
                <h3>You'll need to provide</h3>
                <p>Property and access details, nominated areas and any known concerns or relevant previous records.</p>
                <div className="mkt-aside-divider" />
                <Link to={'/contact?service=' + s.id}>Not sure about the scope? Ask us <span aria-hidden="true">↗</span></Link>
              </aside>
            </div>
          </section>
          <section className="section mkt-section mkt-stone">
            <div className="site-container">
              <div className="mkt-section-heading"><div><p className="eyebrow">What is included</p><h2>A considered look at the property.</h2></div><p>The activities below describe the intended visible-condition focus. The accepted instruction determines the final scope.</p></div>
              <div className="mkt-inclusions">
                {routineIncluded.map(([title, body], index) => <div key={title} className="mkt-inclusion-item"><span className="mkt-inclusion-check" aria-hidden="true">✓</span><div><h3>{title}</h3><p>{body}</p></div><span className="mkt-inclusion-index">0{index + 1}</span></div>)}
              </div>
            </div>
          </section>
          <section className="section mkt-section mkt-report-section">
            <div className="site-container mkt-proof-grid">
              <div className="mkt-proof-copy">
                <p className="eyebrow">The documented result</p>
                <h2>See what a useful inspection record can contain.</h2>
                <p>A clearly organised record helps you understand what was observed and which items may require a separate decision or instruction.</p>
                <ul className="mkt-check-list"><li>Identified property and agreed attendance scope</li><li>Location-based observations where applicable</li><li>Supporting photographic evidence where relevant</li><li>Matters identified for customer review</li></ul>
                <p className="mkt-image-disclosure">Illustrative example only. Not a genuine customer record, issued report, or promise of a fixed report format.</p>
              </div>
              <div className="mkt-report-display"><IllustrativeReport /></div>
            </div>
          </section>
          <section className="section mkt-section mkt-process-section">
            <div className="site-container">
              <div className="mkt-section-heading"><div><p className="eyebrow">How the visit works</p><h2>A clear path from instruction to result.</h2></div></div>
              <ol className="mkt-steps">{routineSteps.map(([n, title, body]) => <li key={n}><span className="mkt-step-number">{n}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
            </div>
          </section>
          <section className="section mkt-section">
            <div className="site-container mkt-detail-two-col">
              <div><p className="eyebrow">Before the visit</p><h2>Help us prepare for the property.</h2><p>Supply confirmed authorised access, any entry restrictions, specific concerns and relevant records. Access arrangements must comply with applicable requirements and the accepted instruction.</p></div>
              <div><p className="eyebrow">After the visit</p><h2>Observations. Then informed action.</h2><p>The issued record helps the authorised customer consider next steps. Any repair, specialist inspection or return attendance is a separate decision and must be arranged independently.</p></div>
            </div>
          </section>
          <section className="section mkt-section mkt-stone">
            <div className="site-container mkt-faq-grid">
              <div><p className="eyebrow">Common questions</p><h2>Before you arrange a Routine Inspection.</h2><Link className="mkt-text-link" to="/resources/routine-inspection-vs-pcr">Compare inspection types <span aria-hidden="true">↗</span></Link></div>
              <div className="mkt-faq-list">{routineFaq.map(([q, a]) => <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>)}</div>
            </div>
          </section>
        </>
      ) : (
        <section className="section mkt-section">
          <div className="site-container mkt-service-intro-grid">
            <article className="prose">
              {focus && <><p className="eyebrow">Service focus</p><h2>What this service covers</h2><p>{focus[0]}</p><h2>What to prepare</h2><p>{focus[1]}</p><h2>The documented outcome</h2><p>{focus[2]}</p></>}
              <h2>Scope, timing and approvals</h2><p>The property, agreed access and instruction determine what can be done. Additional work, technical assessment or certification requires a separately confirmed scope.</p>
              <h2>What happens next</h2><p>Availability, any approved price and the appointment are confirmed through the booking process. An issued record is linked to the authorised property account.</p>
              <Link className="mkt-text-link" to={'/contact?service=' + s.id}>Discuss your requirements <span aria-hidden="true">↗</span></Link>
            </article>
            <aside className="mkt-at-glance">
              <p className="eyebrow">At a glance</p><h3>{s.name}</h3>
              <p>{FAMILIES[s.family].name}</p>
              <div className="mkt-aside-divider" />
              <p>Indicative attendance: {s.duration_minutes} minutes, subject to scope and confirmation.</p>
              <p>Online service requests are not confirmed bookings until accepted.</p>
              <a className="button" href={appOrigin + '/book/' + s.id}>Arrange this service <span aria-hidden="true">→</span></a>
            </aside>
          </div>
        </section>
      )}

      {related.length > 0 && <section className="section mkt-section mkt-related-section"><div className="site-container"><div className="mkt-section-heading"><div><p className="eyebrow">Explore further</p><h2>Related property services.</h2></div><Link className="mkt-text-link" to="/services">All services <span aria-hidden="true">↗</span></Link></div><div className="grid-3">{related.map((r) => <article className="mkt-related-card" key={r.id}><p className="mkt-kicker">{FAMILIES[r.family].name}</p><h3>{r.name}</h3><p>{r.summary}</p><Link className="mkt-text-link" to={'/services/' + r.id}>Explore service <span aria-hidden="true">↗</span></Link></article>)}</div></div></section>}
      <MarketingCta title={routine ? 'Ready to arrange a Routine Inspection?' : 'Ready to discuss your property task?'} description="Share the service and property requirements. Timing, access and any fees are confirmed before an attendance is accepted." appOrigin={appOrigin} serviceId={s.id} />
    </>
  );
}
