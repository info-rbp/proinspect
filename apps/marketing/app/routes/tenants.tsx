import { Link } from 'react-router';
import { EditorialHero } from '../components/editorial';
import { MarketingFaq } from '../components/page-patterns';
import { seo } from '../lib/seo';

export const meta = () =>
  seo(
    'Tenant Support & Open Home Information — Western Australia',
    'Find a rental, register for an open home, follow property application instructions and find the right maintenance and inspection support as a tenant in WA.',
    '/tenants',
    { breadcrumbs: [{ name: 'Tenants', path: '/tenants' }] },
  );

export default function Tenants() {
  return (
    <>
      <EditorialHero
        eyebrow="Tenants"
        title="A little more clarity, wherever you are in your rental journey."
        intro="Looking for a home, preparing for an inspection or reporting a property issue? Find the right next step and understand how ProInspect can assist."
        image="leasing"
        primary={{ label: 'Browse properties for lease', to: '/leasing' }}
        secondary={{ label: 'Sign Up/Sign In to access', to: '/client' }}
      />
      <section className="mkt-section pi-editorial-section">
        <div className="site-container">
          <div className="pi-section-heading">
            <p className="eyebrow">Finding your next home</p>
            <h2>From the first look to the right application pathway.</h2>
          </div>
          <ol className="pi-process-list">
            <li>
              <span className="pi-step-number">01</span>
              <h3>Explore available properties</h3>
              <p>
                Review published property details, photos and inspection information. The listing
                identifies the landlord or leasing representative responsible for the property.
              </p>
              <Link className="pi-inline-link" to="/leasing">
                View current listings <span aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <span className="pi-step-number">02</span>
              <h3>Register for an open home</h3>
              <p>
                Choose an advertised inspection on the property page and register your details. If
                no session is advertised, register your interest. Check in when you arrive at an
                open home.
              </p>
              <Link className="pi-inline-link" to="/open-home/check-in">
                Open home check-in <span aria-hidden="true">→</span>
              </Link>
            </li>
            <li>
              <span className="pi-step-number">03</span>
              <h3>Follow the application instructions</h3>
              <p>
                Use the application option shown on the property page when available. The
                responsible landlord or agent sets the requirements and makes the decision.
                Inspection registration is a separate step.
              </p>
              <Link className="pi-inline-link" to="/rental-application/recover">
                Resume an existing application <span aria-hidden="true">→</span>
              </Link>
            </li>
          </ol>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section pi-neutral">
        <div className="site-container pi-introduction">
          <div>
            <p className="eyebrow">Already living in the property?</p>
            <h2>Support starts with the right connection.</h2>
            <p>
              Your landlord or property manager remains your first point of contact for tenancy
              decisions, rent, permissions and urgent maintenance.
            </p>
          </div>
          <div className="pi-support-list">
            <article>
              <h3>Property inspections</h3>
              <p>
                Where ProInspect is instructed to attend, follow the appointment and access
                information supplied by your manager. Let the responsible person know about relevant
                property concerns so the visit can address the agreed scope. Keep your incoming
                condition report and safe supporting evidence; raise corrections or concerns
                through your responsible representative.
              </p>
            </article>
            <article>
              <h3>Maintenance reporting</h3>
              <p>
                Use your property’s nominated reporting process. Describe where the issue is, what
                is happening and any relevant photos. Use your authorised tenant workspace if your
                property provides one. Requests about pets, modifications, replacement keys,
                access or permissions should go to the responsible landlord or manager for a
                decision. Keep private documents and access secrets out of general enquiries.
              </p>
              <Link className="pi-inline-link" to="/maintenance">
                How maintenance support works <span aria-hidden="true">→</span>
              </Link>
            </article>
            <article>
              <h3>Your tenant workspace</h3>
              <p>
                Where access has been arranged, your verified property relationship determines the
                information and actions available. Signing up alone does not grant access to a home
                or someone else’s records.
              </p>
              <Link className="pi-inline-link" to="/client">
                Sign Up/Sign In to access <span aria-hidden="true">→</span>
              </Link>
            </article>
          </div>
        </div>
      </section>
      <section className="mkt-section pi-editorial-section">
        <div className="site-container pi-faq-layout">
          <div>
            <p className="eyebrow">Helpful answers</p>
            <h2>Know what happens next.</h2>
          </div>
          <MarketingFaq
            questions={[
              [
                'Does registering for an inspection apply for the property?',
                'No. Registering for an open home, checking in and submitting a rental application are separate steps. Use the application instructions displayed on the property page when available.',
              ],
              [
                'Who decides whether my application is approved?',
                'The responsible landlord or leasing representative makes the leasing decision. ProInspect’s inspection attendance or application pathway does not guarantee acceptance.',
              ],
              [
                'What should I do about urgent maintenance?',
                'Follow the urgent-maintenance instructions provided by your landlord, property manager or building team. This website and its enquiry form are not an emergency service. Contact emergency services if there is immediate danger.',
              ],
              [
                'Why can’t I see a property after signing in?',
                'Access depends on a verified invitation or relationship to that property. Ask your responsible manager to confirm the email address and access arrangements associated with your tenancy.',
              ],
            ]}
          />
        </div>
      </section>
      <section className="mkt-final-cta">
        <div className="site-container mkt-cta-inner">
          <div>
            <p className="eyebrow">We can point you in the right direction</p>
            <h2>Have a question about ProInspect’s role?</h2>
            <p>
              For a ProInspect service or access question, get in touch. For tenancy decisions or
              urgent repairs, contact your responsible manager.
            </p>
          </div>
          <Link className="button mkt-button-light" to="/contact">
            Contact Us <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
