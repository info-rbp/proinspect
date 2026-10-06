import { Link, useLoaderData, redirect, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { bookingIntent, propertySetupPath } from '../../../../packages/domain/booking-intent';
import type { Workspace } from '../../../../packages/domain/index';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  const options = (session.workspaces as Workspace[]).filter((w) =>
    ['landlord', 'property-manager', 'strata-manager', 'commercial'].includes(w.kind),
  );
  const serviceId = bookingIntent(params.serviceId);
  const suffix = serviceId ? `/${serviceId}` : '';
  const onboardingPath = `/onboarding${serviceId ? `?service=${serviceId}` : ''}`;
  if (options.length === 1) {
    const selected = options[0];
    const current = await loadApi(request, context, `/api/w/${selected.kind}/${selected.scopeId}`);
    if (!current.properties.length)
      throw redirect(
        selected.kind === 'landlord'
          ? propertySetupPath(selected.href, serviceId)
          : selected.href + (selected.kind === 'strata-manager' ? '/schemes' : '/portfolio'),
      );
    throw redirect(`${selected.href}/book${suffix}`);
  }
  return { options, suffix, onboardingPath };
}
export default function Intent() {
  const { options, suffix, onboardingPath } = useLoaderData<typeof loader>();
  return (
    <main id="main" className="auth-page">
      <div>
        <p className="eyebrow">Book a service</p>
        <h1>Which account are you booking for?</h1>
      </div>
      <div className="workspace-grid">
        {options.map((w) => (
          <Link className="workspace-card" to={`${w.href}/book${suffix}`} key={w.href}>
            <h2>{w.name}</h2>
            <p>Continue to property selection →</p>
          </Link>
        ))}
      </div>
      {!options.length && (
        <section className="panel stack">
          <h2>Set up your self-managed property account.</h2>
          <p>
            First create your Landlord account, then add your property. Your selected service will
            be kept for you.
          </p>
          <Link className="button" to={onboardingPath}>
            Set up account
          </Link>
          <Link className="button secondary" to="/organisation">
            Set up a professional organisation
          </Link>
        </section>
      )}
    </main>
  );
}
