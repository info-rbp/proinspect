import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  PUBLIC_NAVIGATION,
  SECONDARY_NAVIGATION,
  activePublicCategory,
} from '../../../../packages/marketing/public-navigation';
export function MarketingHeader({ appOrigin = '' }: { appOrigin?: string }) {
  const location = useLocation();
  const { pathname } = location;
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const clientHref = appOrigin.replace(/\/$/, '') + '/client';
  const navItems = PUBLIC_NAVIGATION.filter((item) => item.href !== '/client');
  const active = activePublicCategory(pathname);
  const current = (href: string) =>
    pathname.replace(/\/+$/, '') === href ? 'page' : active === href ? 'location' : undefined;
  useEffect(() => {
    setOpen(null);
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, [location.key]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) {
        setOpen(null);
        if (mobileMenu.current) mobileMenu.current.open = false;
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (open) {
        header.current?.querySelector<HTMLButtonElement>('[aria-controls="' + open + '"]')?.focus();
        setOpen(null);
      } else if (mobileMenu.current?.open) {
        mobileMenu.current.open = false;
        mobileMenu.current.querySelector('summary')?.focus();
      }
    };
    const resize = () => {
      setOpen(null);
      if (mobileMenu.current) mobileMenu.current.open = false;
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', resize);
    };
  }, [open]);
  const items = (mode: string) =>
    navItems.map((item) => {
      const children = SECONDARY_NAVIGATION[item.href];
      const id = mode + '-' + item.href.slice(1) + '-pages';
      return (
        <div
          className="pi-nav-group"
          key={item.href}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node) && open === id)
              setOpen(null);
          }}
        >
          <div className="pi-nav-top">
            <Link to={item.href} aria-current={current(item.href)} onClick={() => setOpen(null)}>
              {item.label}
            </Link>
            {children && (
              <button
                type="button"
                className="pi-nav-toggle"
                aria-label={item.label + ' pages'}
                aria-expanded={open === id}
                aria-controls={id}
                onClick={() => setOpen(open === id ? null : id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setOpen(id);
                    requestAnimationFrame(() =>
                      document.getElementById(id)?.querySelector('a')?.focus(),
                    );
                  }
                }}
              >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                  <path d="m3 6 5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            )}
          </div>
          {children && (
            <div className="pi-nav-submenu" id={id} hidden={open !== id}>
              {children.map((child) => (
                <Link
                  key={child.href}
                  to={child.href}
                  onClick={() => {
                    setOpen(null);
                    if (mobileMenu.current) mobileMenu.current.open = false;
                  }}
                >
                  {child.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    });
  return (
    <div className="mkt-header-wrap" ref={header}>
      <div className="site-container">
        <header className="site-header mkt-site-header">
          <div className="mkt-header-identity">
            <Link
              className="brand mkt-brand"
              to="/"
              aria-label="ProInspect home"
              aria-current={pathname === '/' ? 'page' : undefined}
            >
              ProInspect<span>PROPERTY SERVICES</span>
            </Link>
            <div className="mkt-header-actions">
              <Link className="button mkt-header-book" to={clientHref}>
                Sign Up / Sign In
              </Link>
            </div>
          </div>
          <div className="mkt-header-navigation">
            <nav className="site-links mkt-site-links" aria-label="Primary navigation">
              {items('desktop')}
            </nav>
            <details
              className="marketing-menu"
              ref={mobileMenu}
              onToggle={(event) => {
                if (!event.currentTarget.open) setOpen(null);
              }}
            >
              <summary aria-label="Site menu">
                <span aria-hidden="true">☰</span>
                <span>Menu</span>
              </summary>
              <nav aria-label="Mobile site navigation">{items('mobile')}</nav>
            </details>
          </div>
        </header>
      </div>
    </div>
  );
}
export function MarketingFooter(_props: { appOrigin?: string } = {}) {
  return (
    <footer className="site-footer mkt-site-footer">
      <div className="site-container">
        <div className="mkt-footer-top pi-footer-compact">
          <div className="mkt-footer-intro">
            <Link className="brand inverse" to="/">
              ProInspect<span>PROPERTY SERVICES</span>
            </Link>
            <p>
              Providing innovative property solutions and practical support across residential and
              commercial properties, shared spaces and building projects in Western Australia.
            </p>
          </div>
          <nav className="pi-footer-actions" aria-label="Footer navigation">
            <Link to="/help-centre">Help Centre</Link>
            <Link to="/about">About Us</Link>
            <Link to="/contact">Contact Us</Link>
          </nav>
        </div>
        <div className="mkt-footer-bottom pi-footer-legal">
          <span>
            © {new Date().getFullYear()} ProInspect Property Services Pty Ltd · ABN 52 703 550 609 ·
            ACN 703 550 609
          </span>
        </div>
      </div>
    </footer>
  );
}
