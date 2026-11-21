import { RETIRED_WORKSPACES } from '../../../../packages/domain/residential-policy';
import { useEffect, useRef, useState } from 'react';
import { ClientServiceTabs } from '../components/ClientServiceTabs';
import {
  Form,
  Link,
  NavLink,
  Outlet,
  useLoaderData,
  useLocation,
  useNavigation,
  type LoaderFunctionArgs,
} from 'react-router';
import { loadApi } from '../lib/api.server';
import type { WorkspaceData } from '../lib/workspace';
import { portalFamily, PORTAL_FAMILIES, effectiveExperienceLabels } from '../../../../packages/domain/portal-experience';
import { getNavigationProfile, MORE_TOOL_GROUPS } from '../../../../packages/domain/portal-navigation';
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
    [toolSearch, setToolSearch] = useState(''),
    pending = useNavigation().state !== 'idle';
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const items: string[][] = [['', 'Overview', '']];
  items.push(['records', 'Browse all records', '']);
  const customer = ['landlord', 'property-manager', 'commercial', 'strata-manager'].includes(
      w.kind,
    ),
    management = ['landlord', 'property-manager', 'commercial'].includes(w.kind),
    staff = w.kind === 'staff';
  if (management || staff)
    items.push(['properties', management ? 'My properties' : 'Properties', '']);
  if (['landlord','property-manager'].includes(w.kind) && (w.experienceTags ?? []).some(tag => tag === 'co_living' || tag === 'student_living'))
    items.push(['co-living', (w.experienceTags ?? []).includes('student_living') ? 'Student & co-living' : 'Co-living', '']);
  if (w.kind === 'property-manager' && ['owner','admin'].includes(w.role))
    items.push(['outsourcing','Outsourced ProInspect services','']);
  if ((['landlord','property-manager'].includes(w.kind) && w.role !== 'viewer') ||
      (['commercial','strata-manager'].includes(w.kind) && ['owner','admin'].includes(w.role)))
    items.push(['resident-invitations', 'Invite residents & members', '']);
  if(w.kind==='commercial'&&['owner','admin'].includes(w.role))
    items.push(['commercial-occupancies','Occupants & invitations','']);
  if((w.kind==='strata-manager'&&['owner','admin'].includes(w.role))||
     (staff&&['administrator','operations_manager'].includes(user.staffRole??'')))
    items.push(['council-appointments','Council appointments','']);
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
  if (staff && ['administrator', 'operations_manager'].includes(user.staffRole ?? ''))
    items.push(['wa-form-queue', 'WA residential forms', ''], ['bond-review-queue', 'WA bond operations', '']);
  if (w.kind === 'tenant') items.push(['inspections', 'Inspections', ''], ['my-room', 'My residence', '']);
  items.push(['reports', w.kind === 'staff' ? 'Report creation & review' : 'Issued inspection reports', '']);
  items.push(['documents', 'Documents & reports', '']);
  if ((customer && w.role !== 'viewer') || (staff && ['administrator', 'operations_manager'].includes(user.staffRole ?? '')))
    items.push(['document-operations', 'Document preparation', '']);
  if (customer) items.push(['service-agreements', 'Service agreements', '']);
  if (staff && ['administrator','operations_manager'].includes(user.staffRole??'')) {
    items.push(['account-tags','Account experience tags','']);
    items.push(['release-readiness','Release acceptance','']);
    items.push(['pricing-administration','Service price approvals','']);
    items.push(['legal-administration','Legal versions & acceptance','']);
    items.push(['agency-administration','Agency contracts & statements','']);
    items.push(['v2-business','Business services & agreements','']);
    items.push(['maintenance-delivery','Maintenance delivery','']);
    items.push(['asset-compliance','Assets & compliance','']);
    items.push(['market-packs','Specialist market packs','']);
    items.push(['enterprise-intelligence','Capital & portfolio intelligence','']);
  }
  if (customer || w.kind === 'council' || (staff && user.staffRole !== 'inspector'))
    items.push([
      'finance',
      w.kind === 'council' ? 'Council decisions' : 'Approvals & payments',
      '',
    ]);
  if((customer&&['owner','admin'].includes(w.role))||(staff&&['administrator','operations_manager'].includes(user.staffRole??'')))items.push(['billing','Billing & reconciliation','']);
  if ((management && ['owner','admin'].includes(w.role)) ||
    (staff && ['administrator','operations_manager'].includes(user.staffRole ?? '')))
    items.push(['contractor-payments','Contractor payments','']);
  if (customer || w.kind === 'council' || (staff && user.staffRole !== 'inspector'))
    items.push(['reporting', 'Operational reporting', '']);
  if (customer && ['owner', 'admin'].includes(w.role)) items.push(['team', 'Team & access', '']);
  if (staff && user.staffRole !== 'inspector')
    items.push(
      ['administration', 'Operations administration', ''],
      ['services', 'Service catalogue', ''],
    );
  if (staff && ['administrator', 'operations_manager'].includes(user.staffRole ?? ''))
    items.push(['enquiries', 'Marketing enquiries', ''], ['leasing', 'Property leasing', ''], ['open-home-checkins', 'Open home attendance', ''], ['rental-applications', 'Rental applications', ''], ['guest-orders', 'One-off booking requests', ''], ['v4-service-requests','V4 service requests',''], ['integrations', 'Integrations', '']);
  if (data.restrictedEnabled && (w.kind === 'tenant' || staff))
    items.push(['confidential', 'Confidential assistance', '']);
  if((w.kind==='property-manager'&&['owner','admin'].includes(w.role))||(staff&&['administrator','operations_manager'].includes(user.staffRole??'')))items.push(['owner-invitations','Owner visibility invitations','']);
  if((['commercial','property-manager'].includes(w.kind) && data.properties.some(p=>p.sector==='commercial')) ||
     (staff&&['administrator','operations_manager'].includes(user.staffRole??'')))
    items.push(['commercial-leases','Lease obligations & dates','']);
  if(['strata-manager','building','council'].includes(w.kind)||(staff&&['administrator','operations_manager'].includes(user.staffRole??'')))items.push(['facilities','Building operations','']);
  if(w.kind==='strata-manager'||(staff&&['administrator','operations_manager'].includes(user.staffRole??'')))items.push(['building-communications','Notice draft reviews','']);
  if(w.kind==='building-manager')items.splice(0,items.length,['','Overview',''],['facilities','Building operations',''],['building-communications','Notice drafts',''],['documents','Authorised building reports','']);
  if(w.kind==='commercial-occupant')items.splice(0,items.length,
    ['','Overview',''],['occupant-premises','My premises',''],['occupant-requests','My requests','']);
  if(['building','council','strata-manager','building-manager'].includes(w.kind))
    items.push(['community','Community & building updates','']);
  if(data.amenitiesEnabled && ['strata-manager','building'].includes(w.kind))
    items.push(['amenities','Shared amenity requests','']);
  // Historical deep links remain authorised reads; new retired-sector actions are blocked server-side.
  const retiredTools = new Set(['council-appointments','schemes','commercial-leases','facilities','building-communications','market-packs']);
  for (let i = items.length - 1; i >= 0; i--) {
    if (retiredTools.has(items[i][0]) || (RETIRED_WORKSPACES.has(w.kind) &&
      !['','records','reports','documents','billing','finance','bookings','work-orders'].includes(items[i][0]))) items.splice(i, 1);
  }

  const navigationProfile = getNavigationProfile(w.kind);
  const primaryPaths = [...navigationProfile.primary,
    ...(w.kind === 'landlord' && (w.experienceTags ?? []).some(tag => ['co_living','student_living'].includes(tag)) ? ['co-living'] : []),
  ];
  const primary = items.filter(([path]) => primaryPaths.includes(path)).map(([path, label, icon]) => [
    path, w.kind === 'staff' ? ({
      '': 'Today', bookings: 'Schedule', 'work-orders': 'Work Orders',
      reports: 'Reports', properties: 'Clients & properties', finance: 'Finance',
    } as Record<string, string>)[path] ?? label : label, icon,
  ]);
  const secondary = items.filter(([path]) => !primaryPaths.includes(path));
  const pathname = useLocation().pathname;
  const currentSection = [...primary, ...secondary]
    .filter(([path]) => pathname === w.href + (path ? '/' + path : '') ||
      (Boolean(path) && pathname.startsWith(w.href + '/' + path + '/')))
    .sort(([left], [right]) => right.length - left.length)[0]?.[1] ?? 'Workspace';
  useEffect(() => {
    setOpen(false);
    setToolSearch('');
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  const toolGroups = MORE_TOOL_GROUPS;
  const searchText = toolSearch.trim().toLocaleLowerCase();
  const groupedTools = toolGroups.map(group => ({
    label: group.label,
    links: secondary.filter(([path, label]) => group.paths.includes(path) && (!searchText || label.toLocaleLowerCase().includes(searchText))),
  })).filter(group => group.links.length > 0);
  const ungroupedTools = secondary.filter(([path, label]) => !toolGroups.some(group => group.paths.includes(path)) && (!searchText || label.toLocaleLowerCase().includes(searchText)));
  if (ungroupedTools.length) groupedTools.push({ label: 'Other tools', links: ungroupedTools });
  const moreActive = secondary.some(([path]) =>
    pathname === `${w.href}/${path}` || pathname.startsWith(`${w.href}/${path}/`),
  );
  return (
    <div className="app-shell" data-density={w.displayDensity ?? 'comfortable'}>
      {pending && <div className="loading-line" role="progressbar" aria-label="Loading page" />}
      {open && <button type="button" className="pi-sidebar-scrim" aria-label="Close navigation"
        onClick={() => { setOpen(false); toggleRef.current?.focus(); }} />}
      <aside id="portal-sidebar" className={`sidebar ${open ? 'open' : ''}`} aria-label="Workspace navigation">
        <Link className="brand inverse" to="/workspaces">
          ProInspect<span>PROPERTY OPERATIONS</span>
        </Link>
        {open && <button ref={closeRef} type="button" className="pi-mobile-menu-close"
          onClick={() => { setOpen(false); toggleRef.current?.focus(); }}>Close menu</button>}
        <div className="workspace-label">{PORTAL_FAMILIES[portalFamily(w.kind)].name} · {effectiveExperienceLabels(w).join(' · ')}</div>
        <nav className="side-nav">
          {primary.map(([path, label]) => (
            <NavLink end={!path} onClick={() => setOpen(false)} key={path}
              to={`${w.href}${path ? '/' + path : ''}`}>
              {label}
            </NavLink>
          ))}
          {secondary.length > 0 && (
            <details className="side-nav-more" key={moreActive ? 'active-route' : 'collapsed'} open={moreActive}>
              <summary aria-label="More tools">More tools <span className="side-nav-count">{secondary.length}</span></summary>
              <div className="side-nav-more-content">
                {secondary.length > 8 && (
                  <label className="side-nav-search-label" htmlFor="portal-tool-search">
                    Find a tool
                    <input id="portal-tool-search" type="search" value={toolSearch}
                      placeholder="Search workspace tools" onChange={event => setToolSearch(event.target.value)} />
                  </label>
                )}
                {groupedTools.length ? groupedTools.map(group => (
                  <section className="side-nav-group" key={group.label} aria-label={group.label}>
                    <h2>{group.label}</h2>
                    <div className="side-nav-more-links">
                      {group.links.map(([path, label]) => (
                        <NavLink end={!path} key={path} onClick={() => { setOpen(false); setToolSearch(''); }}
                          to={`${w.href}/${path}`}>{label}</NavLink>
                      ))}
                    </div>
                  </section>
                )) : <p className="side-nav-no-results">No matching tools</p>}
              </div>
            </details>
          )}
        </nav>
        <div className="sidebar-foot">
          <Link to={w.href+'/experience-settings'}>My portal preferences</Link>
          <Link to="/account">Account &amp; sign-in security</Link>
          <Link to="/workspaces">My ProInspect / Switch workspace →</Link>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="actions">
            <button
              ref={toggleRef}
              className="mobile-toggle"
              type="button"
              aria-label="Open navigation"
              aria-expanded={open}
              aria-controls="portal-sidebar"
              onClick={() => setOpen(!open)}
            >
              <span aria-hidden="true">☰</span>
            </button>
            <div className="topbar-context">
              {w.name}
              <span>{PORTAL_FAMILIES[portalFamily(w.kind)].name}</span>
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
        <main id="main" className="content" tabIndex={-1}>
          <nav className="portal-breadcrumb" aria-label="Breadcrumb">
            <Link to="/workspaces">Workspaces</Link><span aria-hidden="true">/</span>
            <Link to={w.href}>{PORTAL_FAMILIES[portalFamily(w.kind)].name}</Link>
            <span aria-hidden="true">/</span><span aria-current="page">{currentSection}</span>
          </nav>
          <ClientServiceTabs data={data} />
          <Outlet context={data} />
        </main>
      </div>
    </div>
  );
}
