import { SERVICE_FOCUS } from '../../../../packages/marketing/content';
import { serviceScopeFor } from '../../../../packages/marketing/service-scopes';
import { Link, useLoaderData, useOutletContext, type LoaderFunctionArgs, type MetaFunction } from 'react-router';
import { findService, SERVICE_SEEDS, FAMILIES } from '../../../../packages/service-catalogue/index';
import { IllustrativeReport, MarketingCta, PropertyArtwork } from '../components/marketing-ui';
import { MarketingFaq } from '../components/page-patterns';
import { seo } from '../lib/seo';

export function loader({ params }: LoaderFunctionArgs) {
  const service = findService(params.slug ?? '');
  if (!service) throw new Response('Not found', { status: 404 });
  return {
    service,
    scope: serviceScopeFor(service.id),
    related: SERVICE_SEEDS.filter((s) => s.family === service.family && s.id !== service.id).slice(0, 3),
  };
}
export const meta: MetaFunction<typeof loader> = ({ loaderData }) =>
  loaderData
    ? seo(loaderData.service.name, loaderData.service.summary, '/services/' + loaderData.service.id)
    : [{ title: 'Service not found | ProInspect' }];

const routineSteps = [
  ['01', 'Choose the inspection', 'Tell us about the property and your preferred timeframe.'],
  ['02', 'Confirm access and scope', 'Provide the authorised access arrangements and relevant prior information.'],
  ['03', 'Property attendance', 'The agreed visible-condition inspection is undertaken on site.'],
  ['04', 'Receive the record', 'The issued result is associated with your authorised property account.'],
];
const routineFaq: [string, string][] = [
  ['Is a routine inspection the same as a Property Condition Report?', 'No. A routine inspection records visible condition and matters needing attention during the tenancy. A PCR serves a different incoming-condition documentation purpose.'],
  ['Does the service include repairs?', 'No. The inspection documents observations within scope. Repair work and specialist assessments require separate arrangements.'],
  ['Will an online request reserve a time?', 'Not automatically. One-off requests may require a quotation and confirmation. Eligible subscription customers can select available appointments through their signed-in workspace.'],
  ['What if access or specialist assessment is needed?', 'Provide any known restrictions before attendance. Any additional specialist work requires a separate scope and approval.'],
];
const generalSteps: [string, string, string][] = [
  ['01', 'Describe the task', 'Select the service and give the property details and intended outcome.'],
  ['02', 'Confirm the instruction', 'Agree scope, relevant access arrangements, timing and any applicable charges.'],
  ['03', 'On-site attendance', 'ProInspect undertakes the agreed activity within the accepted service limits.'],
  ['04', 'Review the outcome', 'The issued observations or service record are available in the authorised property context.'],
];
const generalFaq: [string, string][] = [
  ['Does a request confirm an appointment?', 'Not by itself. A one-off request may require a quotation, while eligible signed-in clients may reserve an included service when an appointment is available.'],
  ['What if the matter requires specialist assessment?', 'Visible observations, operational attendance and specialist assessment are different services. Additional technical work or certification requires a separately agreed scope.'],
  ['How do access and supporting documents work?', 'Provide the authorised access arrangements and relevant context as part of the instruction. Do not submit private entry codes through a public enquiry.'],
];

export default function ServicePage() {
  const { service: s, related, scope } = useLoaderData<typeof loader>();
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
              <p className="mkt-booking-note">New customers can discuss one-off services without subscribing. Eligible existing clients can sign in to book included services. One-off requests and quotations do not reserve an appointment until confirmed.</p>
            </div>
            <div className="mkt-detail-visual">
              <PropertyArtwork slot="service-hero" kind={s.sectors.includes('commercial') && !s.sectors.includes('residential') ? 'commercial' : s.sectors.includes('strata-building') && !s.sectors.includes('residential') ? 'strata' : 'residential'} />
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

      {scope && (
        <section className="section mkt-section mkt-stone" aria-labelledby="service-scope-heading">
          <div className="site-container">
            <div className="mkt-section-heading">
              <div><p className="eyebrow">The intended service</p><h2 id="service-scope-heading">Inclusions, exclusions and deliverables.</h2></div>
              <p>Indicative guidance only. The accepted instruction specifies the actual areas, output, access and any applicable fees.</p>
            </div>
            <div className="grid-3">
              <article className="mkt-related-card">
                <h3>Typical activities</h3>
                <ul className="mkt-check-list">{scope.included.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
              <article className="mkt-related-card">
                <h3>Not included unless separately agreed</h3>
                <ul className="mkt-check-list">{scope.excluded.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
              <article className="mkt-related-card">
                <h3>Intended deliverables</h3>
                <ul className="mkt-check-list">{scope.deliverables.map((item) => <li key={item}>{item}</li>)}</ul>
              </article>
            </div>
            <p className="mkt-section-footnote">No certification, legal determination, specific report format or guaranteed timing is implied by this marketing guidance.</p>
          </div>
        </section>
      )}

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
        <>
          <section className="section mkt-section">
            <div className="site-container mkt-service-intro-grid">
              <div>
                <p className="eyebrow">The service explained</p>
                <h2>What is {s.name}?</h2>
                <p>{s.summary}</p>
                <p>The agreed instruction defines the property areas, intended activity, authorised access and requested output. ProInspect records the outcome within that agreed service boundary.</p>
                <Link className="mkt-text-link" to={'/contact?service=' + s.id}>Discuss the scope <span aria-hidden="true">↗</span></Link>
              </div>
              <aside className="mkt-at-glance">
                <p className="eyebrow">At a glance</p>
                <h3>{s.name}</h3><p>{FAMILIES[s.family].name}</p>
                <div className="mkt-aside-divider" />
                <h3>Indicative attendance</h3>
                <p>{s.duration_minutes} minutes, subject to the agreed instruction, timing and access.</p>
                <div className="mkt-aside-divider" />
                <p>Online requests are not confirmed bookings until accepted.</p>
                <a className="button" href={appOrigin + '/book/' + s.id}>Arrange this service <span aria-hidden="true">→</span></a>
              </aside>
            </div>
          </section>
          <section className="section mkt-section mkt-report-section">
            <div className="site-container mkt-proof-grid">
              <div className="mkt-proof-copy">
                <p className="eyebrow">The documented outcome</p>
                <h2>Know what the attendance is intended to produce.</h2>
                <p>{focus?.[2] ?? 'The agreed attendance produces an appropriate service record within its defined scope.'}</p>
                <ul className="mkt-check-list">
                  <li>The instruction and relevant property context are identified</li>
                  <li>Agreed tasks and relevant observations are recorded</li>
                  <li>Matters needing review can inform a separately authorised next step</li>
                  <li>An issued result is linked to the relevant authorised property account</li>
                </ul>
              </div>
              <div className="mkt-callout-panel mkt-service-record-preview">
                <span className="mkt-card-number">ILLUSTRATIVE SERVICE OUTCOME</span>
                <h3>{s.name}</h3>
                <div className="mkt-service-record-line"><span>Focus</span><strong>{focus?.[0] ?? s.summary}</strong></div>
                <div className="mkt-service-record-line"><span>Preparation</span><strong>{focus?.[1] ?? 'Agreed property and access details'}</strong></div>
                <div className="mkt-service-record-line"><span>Intended record</span><strong>{focus?.[2] ?? 'A documented service outcome'}</strong></div>
                <p className="mkt-image-disclosure">Editorial illustration, not a real issued report or a promise of a fixed report format.</p>
              </div>
            </div>
          </section>
          <section className="section mkt-section mkt-process-section">
            <div className="site-container">
              <div className="mkt-section-heading"><div><p className="eyebrow">How the service works</p><h2>From instruction to an issued record.</h2></div></div>
              <ol className="mkt-steps">{generalSteps.map(([n, title, body]) => <li key={n}><span className="mkt-step-number">{n}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
            </div>
          </section>
          <section className="section mkt-section">
            <div className="site-container mkt-detail-two-col">
              <div><p className="eyebrow">Before the visit</p><h2>Prepare the property instruction.</h2><p>Provide the general location, purpose, relevant records and authorised access. Known hazards or restrictions must be identified before an attendance is confirmed.</p></div>
              <div><p className="eyebrow">After the visit</p><h2>Review and decide what happens next.</h2><p>The authorised customer can review the issued record. Additional repairs, specialist investigations or return visits are separate decisions requiring the appropriate instruction.</p></div>
            </div>
          </section>
          <section className="section mkt-section mkt-stone">
            <div className="site-container mkt-faq-grid">
              <div><p className="eyebrow">Common questions</p><h2>What to know before arranging this service.</h2></div>
              <MarketingFaq questions={generalFaq} />
            </div>
          </section>
        </>
      )}

      {related.length > 0 && <section className="section mkt-section mkt-related-section"><div className="site-container"><div className="mkt-section-heading"><div><p className="eyebrow">Explore further</p><h2>Related property services.</h2></div><Link className="mkt-text-link" to="/services">All services <span aria-hidden="true">↗</span></Link></div><div className="grid-3">{related.map((r) => <article className="mkt-related-card" key={r.id}><p className="mkt-kicker">{FAMILIES[r.family].name}</p><h3>{r.name}</h3><p>{r.summary}</p><Link className="mkt-text-link" to={'/services/' + r.id}>Explore service <span aria-hidden="true">↗</span></Link></article>)}</div></div></section>}
      <MarketingCta title={routine ? 'Ready to arrange a Routine Inspection?' : 'Ready to discuss your property task?'} description="Share the service and property requirements. Timing, access and any fees are confirmed before an attendance is accepted." appOrigin={appOrigin} serviceId={s.id} />
    </>
  );
}
