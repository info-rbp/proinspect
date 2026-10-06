import { Link, useLoaderData, redirect, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import type { Workspace } from '../../../../packages/domain/index';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  const options = (session.workspaces as Workspace[]).filter((w) => w.kind === 'landlord');
  const suffix = params.serviceId ? `/${encodeURIComponent(params.serviceId)}` : '';
  if (options.length === 1) throw redirect(`${options[0].href}/book${suffix}`);
  return { options, suffix };
}
export default function Intent() {
  const { options, suffix } = useLoaderData<typeof loader>();
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
          <p>First create your Landlord account, then add your property and select the service.</p>
          <Link className="button" to="/onboarding">
            Set up account
          </Link>
        </section>
      )}
    </main>
  );
}
