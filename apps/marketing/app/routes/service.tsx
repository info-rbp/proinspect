import { Link, useLoaderData, useOutletContext, type LoaderFunctionArgs } from 'react-router';
import { findService, SERVICE_SEEDS, FAMILIES } from '../../../../packages/service-catalogue/index';
import { seo } from '../lib/seo';
export function loader({ params }: LoaderFunctionArgs) {
  const service = findService(params.slug ?? '');
  if (!service) throw new Response('Not found', { status: 404 });
  return {
    service,
    related: SERVICE_SEEDS.filter((s) => s.family === service.family && s.id !== service.id).slice(
      0,
      3,
    ),
  };
}
export const meta = ({ data }: { data?: ReturnType<typeof loader> }) =>
  data
    ? seo(data.service.name, data.service.summary, `/services/${data.service.id}`)
    : [{ title: 'Service not found | ProInspect' }];
export default function ServicePage() {
  const { service: s, related } = useLoaderData<typeof loader>();
  const { appOrigin } = useOutletContext<{ appOrigin: string }>();
  return (
    <>
      <header className="service-hero">
        <div className="site-container">
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            <Link to="/services">Services</Link>
            <span>/</span>
            <span>{FAMILIES[s.family].name}</span>
          </nav>
          <p className="eyebrow">
            {s.sectors.map((v) => (v === 'strata-building' ? 'Strata & buildings' : v)).join(' · ')}
          </p>
          <h1>{s.name}</h1>
          <p>{s.summary}</p>
          <div className="actions">
            <a className="button" href={`${appOrigin}/book/${s.id}`}>
              Arrange this service
            </a>
            <Link className="button secondary" to={`/contact?service=${s.id}`}>
              Ask about the scope
            </Link>
          </div>
        </div>
      </header>
      <section className="section">
        <div className="site-container detail-grid">
          <article className="prose">
            <h2>Clear work. A useful record.</h2>
            <p>
              {s.summary} The instruction, property context and agreed access arrangements guide the
              attendance. Any specialist assessment or additional work needs a separately agreed
              scope.
            </p>
            <h2>Before the visit</h2>
            <p>
              Add or select your property, choose the service and explain what needs attention.
              ProInspect must have authorised access and any relevant documents or prior reports
              needed for the instruction.
            </p>
            <h2>What happens next</h2>
            <p>
              When the service is confirmed, it creates a booking and an operational work order. An
              issued report or service record is kept with the property in your authorised account,
              rather than relying on an email attachment as the permanent record.
            </p>
            <h2>Scope and pricing</h2>
            <p>
              The online booking flow shows whether an appointment and approved price are available.
              If the service requires review, submit a request so the scope, price and timing can be
              confirmed. The catalogue is not a promise of immediate attendance.
            </p>
            <h2>Is this the right service?</h2>
            <p>
              Tell ProInspect the outcome you need. A visible-condition inspection, specialist
              diagnosis, repair and legal determination are different services; the agreed
              instruction should make those boundaries clear.
            </p>
            <Link to={`/contact?service=${s.id}`}>Discuss your property requirement →</Link>
          </article>
          <aside className="panel stack" style={{ alignSelf: 'start' }}>
            <p className="eyebrow">At a glance</p>
            <h2>{s.name}</h2>
            <div className="definition">
              <span className="muted">Category</span>
              <span>{FAMILIES[s.family].name}</span>
              <span className="muted">Typical attendance</span>
              <span>{s.duration_minutes} minutes, subject to scope</span>
              <span className="muted">Your record</span>
              <span>Linked to your property account</span>
            </div>
            <p className="small">
              Sign-in is required to book. A service request does not reserve an appointment until
              it is confirmed.
            </p>
            <a className="button" href={`${appOrigin}/book/${s.id}`}>
              Continue to ProInspect
            </a>
          </aside>
        </div>
      </section>
      {related.length > 0 && (
        <section className="section soft">
          <div className="site-container">
            <div className="section-heading">
              <h2>Related property services</h2>
            </div>
            <div className="grid-3">
              {related.map((r) => (
                <article key={r.id} className="service-card">
                  <h3>{r.name}</h3>
                  <p>{r.summary}</p>
                  <Link to={`/services/${r.id}`}>Explore service →</Link>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
