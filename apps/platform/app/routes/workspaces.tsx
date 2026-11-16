import { Link, Form, useLoaderData, type LoaderFunctionArgs } from 'react-router';
import { loadApi } from '../lib/api.server';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import { WORKSPACES, type Workspace } from '../../../../packages/domain/index';
import { portalFamilyForWorkspace, PORTAL_FAMILIES } from '../../../../packages/onboarding/registry';
export const meta = () => [{ title: 'My ProInspect | ProInspect' }];
export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  const serviceId = bookingIntent(new URL(request.url).searchParams.get('service'));
  return { ...session, serviceId };
}
const families = ['residential','commercial','strata','resident','operations'] as const;
export default function Workspaces() {
  const data = useLoaderData<typeof loader>();
  const workspaces = data.workspaces as Workspace[];
  const groups = families.map(family => ({
    family,
    label: PORTAL_FAMILIES[family].label,
    description: PORTAL_FAMILIES[family].description,
    workspaces: workspaces.filter(w => portalFamilyForWorkspace(w.kind) === family),
  })).filter(g => g.workspaces.length);
  const hasOwner = (kind: 'landlord'|'commercial') => workspaces.some(w=>w.kind===kind);
  const ownerLink = (flow: string) => '/onboarding?flow='+flow+(data.serviceId?'&service='+encodeURIComponent(data.serviceId):'');
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
          <p style={{marginTop:12}}>One secure account for your authorised property, organisation and Resident memberships. Choose where you want to work.</p>
        </div>
        <div className="actions">
          <Link className="button secondary" to="/my-properties">All my properties</Link>
          <Link className="button secondary" to="/account">Account &amp; sign-in security</Link>
          <Link className="button secondary" to="/owner-decisions">My owner decisions</Link>
        </div>
        {groups.length ? groups.map(group=>(
          <section key={group.family} className="panel stack" aria-label={group.label+' workspaces'}>
            <div className="panel-header"><div><h2>{group.label}</h2><p>{group.description}</p></div></div>
            <div className="workspace-grid">
              {group.workspaces.map(w=>(
                <Link key={w.href} to={w.href} className="workspace-card">
                  <p className="eyebrow">{WORKSPACES[w.kind].name}</p>
                  <h3>{w.name}</h3>
                  <p>{WORKSPACES[w.kind].purpose}</p>
                  <small>Open authorised workspace →</small>
                </Link>
              ))}
            </div>
          </section>
        )) : <section className="panel stack">
          <h2>No property or organisation relationships yet</h2>
          <p>You can create a free owner account or apply for a professional organisation. Resident &amp; Member access is by invitation only.</p>
        </section>}
        {(!hasOwner('landlord')||!hasOwner('commercial')) && <section className="panel stack">
          <h2>Own and self-manage property?</h2>
          <p>Choose the sector for your free account. A subscription or paid service is a separate decision.</p>
          <div className="actions">
            {!hasOwner('landlord')&&<Link className="button" to={ownerLink("ONB-RES-OWNER")}>Residential owner</Link>}
            {!hasOwner('commercial')&&<Link className="button secondary" to={ownerLink("ONB-COM-OWNER")}>Commercial owner</Link>}
          </div>
        </section>}
        <section className="panel stack">
          <h2>Represent a property management organisation?</h2>
          <p>Apply for professional access to Residential, Commercial or Strata. Your assignments and authority are verified before activation.</p>
          <div className="actions">
            <Link className="button secondary" to="/organisation?flow=ONB-RES-AGENCY">Residential management</Link>
            <Link className="button secondary" to="/organisation?flow=ONB-COM-MANAGER">Commercial management</Link>
            <Link className="button secondary" to="/organisation?flow=ONB-STR-MANAGER">Strata management</Link>
          </div>
        </section>
        <p className="small">Resident &amp; Member accounts cannot be self-registered. Ask the authorised owner or manager to send an invitation from your property or scheme. Staff access is provisioned separately.</p>
      </section>
    </main>
  );
}
