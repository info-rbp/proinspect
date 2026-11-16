import { Link, Form, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { type Workspace } from '../../../../packages/domain/index';
import { groupWorkspaces, effectiveExperienceLabels } from '../../../../packages/domain/portal-experience';

export const meta = () => [{ title: 'My ProInspect | ProInspect' }];
export async function loader({ request, context }: LoaderFunctionArgs) {
  return loadApi(request, context, '/api/session');
}
export default function Workspaces() {
  const data = useLoaderData<typeof loader>();
  const workspaces = (data.workspaces ?? []) as Workspace[];
  const groups = groupWorkspaces(workspaces);
  const hasResidential = workspaces.some(w => w.kind === 'landlord');
  const hasCommercial = workspaces.some(w => w.accountType === 'commercial_landlord');
  return (
    <main id="main" className="auth-page">
      <header className="page-heading">
        <Link className="brand" to="/">ProInspect<span>PROPERTY OPERATIONS</span></Link>
        <Form action="/signout" method="post"><button className="button secondary small">Sign out</button></Form>
      </header>
      <section className="stack">
        <div>
          <p className="eyebrow">{data.user.display_name || data.user.email}</p>
          <h1>My ProInspect</h1>
          <p style={{ marginTop: 12 }}>Your properties, services and invitations in one place. Open a workspace to see the activities that your verified relationship allows.</p>
        </div>
        <div className="actions">
          <Link className="button secondary" to="/my-properties">All my properties</Link>
          <Link className="button secondary" to="/account">Profile &amp; sign-in security</Link>
          <Link className="button secondary" to="/organisation">Set up a professional organisation</Link>
          <Link className="button secondary" to="/owner-decisions">My owner decisions</Link>
        </div>
        {groups.map(group => <section className="stack" key={group.family} aria-label={group.name+' portal'}>
          <div><h2>{group.name}</h2><p className="small">{group.description}</p></div>
          <div className="workspace-grid">
            {group.workspaces.map(w => <Link key={w.href}
              to={w.href+(w.landingSection&&w.landingSection!=='overview'?'/'+w.landingSection:'')}
              className="workspace-card">
              <p className="eyebrow">{group.name}</p>
              <h3>{w.name}</h3>
              <p className="small">{effectiveExperienceLabels(w).join(' · ')}</p>
              {w.landingSection&&w.landingSection!=='overview'&&
                <p className="small">Opens at: {w.landingSection.replaceAll('-',' ')}</p>}
              <small>Open workspace →</small>
            </Link>)}
          </div>
        </section>)}
        {!groups.length && <section className="panel stack">
          <h2>Start using ProInspect</h2>
          <p>Create an account for a property you own, or follow a valid invitation to join a tenancy, building or council. Resident access cannot be self-registered.</p>
          <Link className="button" to="/onboarding">Create a property account</Link>
        </section>}
        {(!hasResidential || !hasCommercial) && <section className="panel stack">
          <h2>Own a property?</h2>
          <p>Set up a free Residential or Commercial owner account and add your authorised property. Paid plans are optional. Professional portfolios require reviewed organisation authority; Resident access is invitation-only.</p>
          <Link className="button" to="/onboarding">Set up a property account</Link>
        </section>}
      </section>
    </main>
  );
}
