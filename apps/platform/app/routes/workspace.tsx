import { useEffect, useRef, useState } from 'react';
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
import { isPortalRoute, portalLocation, portalNavigation } from '../lib/portal-navigation';
import { WORKSPACES } from '../../../../packages/domain/index';

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  return (await loadApi(request, context, '/api/w/' + params.kind + '/' + params.scopeId)) as WorkspaceData;
}
export default function WorkspaceLayout() {
  const data = useLoaderData<typeof loader>();
  const { workspace: w, user } = data;
  const { pathname } = useLocation();
  const pending = useNavigation().state !== 'idle';
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menu = portalNavigation(w.kind, w.role, user.staffRole, data.restrictedEnabled);
  const section = portalLocation(menu, pathname, w.href);
  const activeLink = (path: string) => isPortalRoute(pathname, w.href, path);
  const moreActive = menu.groups.some(g => g.links.some(l => activeLink(l.path)));

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [open]);
  const navLink = ({path,label}: {path:string;label:string}) => (
    <NavLink
      key={path}
      end={!path}
      onClick={() => setOpen(false)}
      aria-label={label}
      to={w.href + (path ? '/' + path : '')}
    >{label}</NavLink>
  );
  return (
    <div className="app-shell pi-portal" data-portal-kind={w.kind}>
      {pending && <div className="loading-line" role="progressbar" aria-label="Loading page" />}
      {open && <button type="button" className="pi-sidebar-scrim" aria-label="Close navigation" onClick={() => {setOpen(false);toggleRef.current?.focus();}} />}
      <aside id="portal-sidebar" className={'sidebar' + (open ? ' open' : '')} aria-label="Workspace navigation">
        <div className="pi-sidebar-head">
          <Link className="brand inverse" onClick={() => setOpen(false)} to="/workspaces">ProInspect<span>PROPERTY OPERATIONS</span></Link>
          <button ref={closeRef} type="button" className="pi-nav-close" aria-label="Close menu" onClick={() => {setOpen(false);toggleRef.current?.focus();}}>Close menu</button>
        </div>
        <div className="workspace-label">{WORKSPACES[w.kind].name} workspace</div>
        <nav className="side-nav" aria-label={WORKSPACES[w.kind].name + ' sections'}>
          {menu.primary.map(navLink)}
          {menu.groups.length > 0 && (
            <details className="side-nav-more" key={moreActive ? 'more-active' : 'more-closed'} defaultOpen={moreActive}>
              <summary>More tools</summary>
              <div className="side-nav-more-links">
                {menu.groups.map(group => {
                  const groupActive = group.links.some(l => activeLink(l.path));
                  return (
                    <details className="pi-nav-group" key={group.id + (groupActive ? '-active' : '-idle')} defaultOpen={groupActive}>
                      <summary>{group.label}</summary>
                      <div className="pi-nav-group-links">{group.links.map(navLink)}</div>
                    </details>
                  );
                })}
              </div>
            </details>
          )}
        </nav>
        <div className="sidebar-foot">
          <Link onClick={() => setOpen(false)} to="/account">Account &amp; security</Link>
          <Link onClick={() => setOpen(false)} to="/workspaces">Switch workspace</Link>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <div className="actions">
            <button ref={toggleRef} className="mobile-toggle" type="button"
              aria-label="Open navigation" aria-expanded={open} aria-controls="portal-sidebar"
              onClick={() => setOpen(v => !v)}><span aria-hidden="true">☰</span></button>
            <div className="topbar-context">{w.name}<span>{WORKSPACES[w.kind].name}</span></div>
          </div>
          <div className="topbar-user">
            <span className="avatar" aria-hidden="true">{(user.display_name || user.email).slice(0,1).toUpperCase()}</span>
            <span className="user-name">{user.display_name || user.email}</span>
            <Form action="/signout" method="post"><button type="submit" className="button secondary small">Sign out</button></Form>
          </div>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <nav className="pi-breadcrumb" aria-label="Breadcrumb">
            <Link to={w.href}>{w.kind === 'staff' ? 'Operations' : WORKSPACES[w.kind].name}</Link>
            <span aria-hidden="true">/</span><span aria-current="page">{section}</span>
          </nav>
          <Outlet context={data} />
        </main>
      </div>
    </div>
  );
}
