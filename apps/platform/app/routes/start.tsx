import { Link, redirect, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import type { Workspace } from '../../../../packages/domain/index';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import {
  ENTRY_CHOICES,
  entryFlow,
  entryPath,
  resolvePortalEntry,
} from '../../../../packages/onboarding/entry';

export const meta = () => [
  { title: 'Get started | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  const query = new URL(request.url).searchParams;
  const flow = entryFlow(query.get('flow'));
  const service = bookingIntent(query.get('service'));
  const target = resolvePortalEntry(session.workspaces as Workspace[], flow, service);
  if (target) throw redirect(target);
  return { flow, service, email: session.user.email };
}
export default function Start() {
  const { flow, service, email } = useLoaderData<typeof loader>();
  const invited = flow === 'ONB-INV-CORE' || flow === 'ONB-STR-BUILDING';
  return (
    <main id="main" className="auth-page form-width">
      <Link className="brand" to="/">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </Link>
      <section className="panel stack">
        <p className="eyebrow">Your ProInspect account</p>
        <h1>{invited ? 'Connect to your invitation' : 'How will you use ProInspect?'}</h1>
        <p>
          Signed in as {email}.{' '}
          {invited
            ? 'Use the invitation sent to this email address by your authorised property owner or manager.'
            : 'Choose your role so we can guide you to the right setup. One email can access several authorised accounts.'}
        </p>
        {invited ? (
          <>
            <p>
              Open your original invitation link to accept access. If you have not received one, ask
              your representative to invite this email address. ProInspect can help you resolve a
              missing or expired invitation.
            </p>
            <p className="small">
              Invitations connect you only to the relevant tenancy, premises, building or scheme. A
              sign-up choice does not create a property relationship or management authority.
            </p>
            <div className="actions">
              <Link className="button" to="/workspaces">
                Check my existing access
              </Link>
              <Link className="button secondary" to="/contact">
                Get help with access
              </Link>
            </div>
            <p>
              Looking for a rental?{' '}
              <Link to="/properties-for-lease">Browse properties and apply</Link>. Applying for a
              property is separate from Resident Portal access.
            </p>
            <Link to="/start">Choose a different account type</Link>
          </>
        ) : (
          <>
            <div className="stack">
              {['Residential', 'Commercial', 'Strata', 'Resident'].map((family) => (
                <section key={family} className="stack-sm">
                  <h2>{family}</h2>
                  <p>
                    {family === 'Residential'
                      ? 'Inspections, property reports, leasing and maintenance support, including co-living and student accommodation.'
                      : family === 'Commercial'
                        ? 'Inspections, reports and operational support for your premises or managed portfolio.'
                        : family === 'Strata'
                          ? 'Scheme, building and facilities support within your verified appointment.'
                          : 'Invited access for residential tenants.'}
                  </p>
                  <div className="actions">
                    {ENTRY_CHOICES.filter((choice) => choice.family === family).map((choice) => (
                      <Link
                        className="button secondary"
                        key={choice.id}
                        to={entryPath(choice.id, service)}
                      >
                        {choice.label}
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <p className="small">
              Owner accounts are free. Professional organisations require authority review; Resident
              and building manager access requires an invitation or approved assignment. Setup does
              not start a paid subscription.
            </p>
            <p>
              Need construction or project support?{' '}
              <Link to="/contact">Discuss the scope with ProInspect</Link> so we can confirm the
              service and responsible account.
            </p>
          </>
        )}
        <div className="form-footer">
          <Link to="/workspaces">My ProInspect</Link>
          <Link to="/account">Account &amp; sign-in security</Link>
        </div>
      </section>
    </main>
  );
}
