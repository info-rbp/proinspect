import { Link, Form, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { WORKSPACES, type Workspace } from '../../../../packages/domain/index';
export const meta = () => [{ title: 'Your workspaces | ProInspect' }];
export async function loader({ request, context }: LoaderFunctionArgs) {
  return loadApi(request, context, '/api/session');
}
export default function Workspaces() {
  const data = useLoaderData<typeof loader>();
  return (
    <main id="main" className="auth-page">
      <header className="page-heading">
        <Link className="brand" to="/">
          ProInspect<span>PROPERTY OPERATIONS</span>
        </Link>
        <Form action="/signout" method="post">
          <button className="button secondary small">Sign out</button>
        </Form>
      </header>
      <section className="stack">
        <div>
          <p className="eyebrow">{data.user.display_name || data.user.email}</p>
          <h1>Choose your workspace.</h1>
          <p style={{ marginTop: 12 }}>
            One sign-in. Separate access for each property relationship.
          </p>
        </div>
        <div className="actions">
          <Link className="button secondary" to="/account">
            Account &amp; sign-in security
          </Link>
          <Link className="button secondary" to="/organisation">
            Set up a professional organisation
          </Link>
          <Link className="button secondary" to="/owner-decisions">
            My owner decisions
          </Link>
        </div>
        <div className="workspace-grid">
          {data.workspaces.map((w: Workspace) => (
            <Link key={w.href} to={w.href} className="workspace-card">
              <p className="eyebrow">{WORKSPACES[w.kind].name}</p>
              <h2>{w.name}</h2>
              <p>{WORKSPACES[w.kind].purpose}</p>
              <small>Open workspace →</small>
            </Link>
          ))}
        </div>
        {!data.workspaces.some((w: Workspace) => w.kind === 'landlord') && (
          <section className="panel">
            <h2>Self-managing your own rental?</h2>
            <p style={{ margin: '12px 0 18px' }}>
              Create a Landlord account to add your residential property and book ProInspect
              services. Professional and tenancy access is granted separately.
            </p>
            <Link to="/onboarding" className="button">
              Set up a Landlord account
            </Link>
          </section>
        )}
      </section>
    </main>
  );
}
