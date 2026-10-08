import { useState } from 'react';
import {
  Form,
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useNavigation,
  type LoaderFunctionArgs,
} from 'react-router';
import { loadApi } from '../lib/api.server';
import type { WorkspaceData } from '../lib/workspace';
import { WORKSPACES } from '../../../../packages/domain/index';
export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(
    request,
    context,
    `/api/w/${params.kind}/${params.scopeId}`,
  )) as unknown as WorkspaceData;
}
export default function WorkspaceLayout() {
  const data = useLoaderData<typeof loader>(),
    { workspace: w, user } = data;
  const [open, setOpen] = useState(false),
    pending = useNavigation().state !== 'idle';
  const items: string[][] = [['', 'Overview', '']];
  items.push(['records', 'Browse all records', '']);
  const customer = ['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(
      w.kind,
    ),
    management = ['landlord', 'property-manager', 'commercial'].includes(w.kind),
    staff = w.kind === 'staff';
  if (management || staff)
    items.push(['properties', management ? 'My properties' : 'Properties', '']);
  if (management)
    items.push([
      'portfolio',
      w.kind === 'landlord' ? 'Inspection plans' : 'Portfolio operations',
      '',
    ]);
  if (
    ['strata-manager', 'building', 'council'].includes(w.kind) ||
    (staff && user.staffRole !== 'inspector')
  )
    items.push(['schemes', w.kind === 'building' ? 'My building' : 'Schemes & buildings', '']);
  if (customer || staff)
    items.push(
      ['bookings', 'Bookings', ''],
      ['booking-changes', 'Booking changes', ''],
      ['work-orders', 'Work orders', ''],
    );
  if (management || w.kind === 'tenant' || (staff && user.staffRole !== 'inspector'))
    items.push(['tenancies', w.kind === 'tenant' ? 'My tenancy & forms' : 'Tenancies & forms', '']);
  if (w.kind !== 'council')
    items.push([
      'requests',
      w.kind === 'tenant' || w.kind === 'building' ? 'My requests' : 'Requests',
      '',
    ]);
  if (w.kind === 'tenant') items.push(['inspections', 'Inspections', '']);
  items.push(['documents', 'Documents & reports', '']);
  if (customer || (staff && ['administrator', 'operations_manager'].includes(user.staffRole ?? '')))
    items.push(['document-operations', 'Document preparation', '']);
  if (customer || w.kind === 'council' || (staff && user.staffRole !== 'inspector'))
    items.push([
      'finance',
      w.kind === 'council' ? 'Council decisions' : 'Approvals & payments',
      '',
    ]);
  if (customer || w.kind === 'council' || (staff && user.staffRole !== 'inspector'))
    items.push(['reporting', 'Operational reporting', '']);
  if (customer && ['owner', 'admin'].includes(w.role)) items.push(['team', 'Team & access', '']);
  if (staff && user.staffRole !== 'inspector')
    items.push(
      ['administration', 'Operations administration', ''],
      ['services', 'Service catalogue', ''],
    );
  if (staff && ['administrator', 'operations_manager'].includes(user.staffRole ?? ''))
    items.push(['enquiries', 'Marketing enquiries', ''], ['integrations', 'Integrations', '']);
  if (data.restrictedEnabled && (w.kind === 'tenant' || staff))
    items.push(['confidential', 'Confidential assistance', '']);
  return (
    <div className="app-shell">
      {pending && <div className="loading-line" role="progressbar" aria-label="Loading page" />}
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Workspace navigation">
        <Link className="brand inverse" to="/workspaces">
          ProInspect<span>PROPERTY OPERATIONS</span>
        </Link>
        <div className="workspace-label">{WORKSPACES[w.kind].name}</div>
        <nav className="side-nav">
          {items.map(([path, label, symbol]) => (
            <NavLink
              end={!path}
              onClick={() => setOpen(false)}
              key={path}
              to={`${w.href}${path ? '/' + path : ''}`}
            >
              <span className="nav-symbol" aria-hidden="true">
                {symbol}
              </span>
              {label}
            </NavLink>
          ))}
          <NavLink onClick={() => setOpen(false)} to={`${w.href}/notifications`}>
            <span className="nav-symbol" aria-hidden="true">
              ○
            </span>
            Notifications
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          <Link to="/account">Account &amp; sign-in security</Link>
          <Link to="/workspaces">Switch workspace →</Link>
          <p style={{ color: '#b0c3ce', marginTop: 12 }}>
            Your access follows your relationship to each property.
          </p>
          {open && (
            <button
              className="button secondary"
              onClick={() => setOpen(false)}
              style={{ marginTop: 20 }}
            >
              Close menu
            </button>
          )}
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="actions">
            <button
              className="mobile-toggle"
              type="button"
              aria-label="Open navigation"
              aria-expanded={open}
              onClick={() => setOpen(!open)}
            >
              ☰
            </button>
            <div className="topbar-context">
              {w.name}
              <span>{WORKSPACES[w.kind].name}</span>
            </div>
          </div>
          <div className="topbar-user">
            <span className="avatar" aria-hidden="true">
              {(user.display_name || user.email).slice(0, 1).toUpperCase()}
            </span>
            <span className="user-name">{user.display_name || user.email}</span>
            <Form action="/signout" method="post">
              <button className="button secondary small">Sign out</button>
            </Form>
          </div>
        </header>
        <main id="main" className="content">
          <Outlet context={data} />
        </main>
      </div>
    </div>
  );
}
