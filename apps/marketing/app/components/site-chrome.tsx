import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';

const sectors = [
  { path: '/sectors/residential', label: 'Residential', detail: 'Self-managing owners and property managers' },
  { path: '/sectors/commercial', label: 'Commercial', detail: 'Owners, property and asset managers' },
  { path: '/sectors/strata-building', label: 'Strata & buildings', detail: 'Strata managers and building operators' },
];

export function MarketingHeader({ appOrigin = '' }: { appOrigin?: string }) {
  const { pathname } = useLocation();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const audienceMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (mobileMenu.current) mobileMenu.current.open = false;
    if (audienceMenu.current) audienceMenu.current.open = false;
  }, [pathname]);
  return (
    <div className="mkt-header-wrap">
      <div className="site-container">
        <header className="site-header mkt-site-header">
          <Link className="brand mkt-brand" to="/" aria-label="ProInspect homepage">
            ProInspect<span>PROPERTY SERVICES</span>
          </Link>
          <nav className="site-links mkt-site-links" aria-label="Primary navigation">
            <Link to="/services" aria-current={pathname.startsWith('/services') ? 'page' : undefined}>Services</Link>
            <details className="mkt-nav-dropdown" ref={audienceMenu}>
              <summary>Who we help</summary>
              <div className="mkt-nav-popover">
                <p className="mkt-nav-caption">Support for every property setting</p>
                {sectors.map((sector) => (
                  <Link key={sector.path} to={sector.path} className="mkt-nav-sector">
                    <strong>{sector.label}</strong>
                    <small>{sector.detail}</small>
                  </Link>
                ))}
              </div>
            </details>
            <Link to="/how-it-works" aria-current={pathname.startsWith('/how-') ? 'page' : undefined}>How we work</Link>
            <Link to="/why-proinspect" aria-current={pathname === '/why-proinspect' ? 'page' : undefined}>Why ProInspect</Link>
            <Link to="/resources" aria-current={pathname.startsWith('/resources') ? 'page' : undefined}>Resources</Link>
          </nav>
          <div className="mkt-header-actions">
            <a className="mkt-signin" href={appOrigin + '/signin'}>Sign in</a>
            <a className="button mkt-header-book" href={appOrigin + '/book'}>Book a service <span aria-hidden="true">→</span></a>
          </div>
          <details className="marketing-menu" ref={mobileMenu}>
            <summary aria-label="Open site menu"><span aria-hidden="true">☰</span><span>Menu</span></summary>
            <nav aria-label="Mobile site navigation">
              <Link to="/services">Services</Link>
              <p className="mkt-nav-caption">Who we help</p>
              {sectors.map((sector) => <Link key={sector.path} to={sector.path}>{sector.label}</Link>)}
              <Link to="/how-it-works">How we work</Link>
              <Link to="/why-proinspect">Why ProInspect</Link>
              <Link to="/resources">Resources</Link>
              <Link to="/contact">Contact</Link>
              <a href={appOrigin + '/signin'}>Sign in</a>
            </nav>
          </details>
        </header>
      </div>
    </div>
  );
}

export function MarketingFooter({ appOrigin = '' }: { appOrigin?: string }) {
  return (
    <footer className="site-footer mkt-site-footer">
      <div className="site-container">
        <div className="mkt-footer-top">
          <div className="mkt-footer-intro">
            <Link className="brand inverse" to="/">ProInspect<span>PROPERTY SERVICES</span></Link>
            <p>On-the-ground property inspections, attendance and operational support. Documented work with a connected property record.</p>
            <Link className="mkt-footer-contact" to="/contact">Talk to ProInspect <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="mkt-footer-group">
            <h3>Explore</h3>
            <Link to="/services">All services</Link>
            <Link to="/services/category/inspections">Inspections</Link>
            <Link to="/services/category/maintenance">Maintenance &amp; works</Link>
            <Link to="/how-it-works">How we work</Link>
            <Link to="/client-experience">The client experience</Link>
          </div>
          <div className="mkt-footer-group">
            <h3>Who we help</h3>
            {sectors.map((sector) => <Link key={sector.path} to={sector.path}>{sector.label}</Link>)}
            <Link to="/areas-we-service">Service areas</Link>
          </div>
          <div className="mkt-footer-group">
            <h3>ProInspect</h3>
            <Link to="/why-proinspect">Why ProInspect</Link>
            <Link to="/resources">Guides &amp; resources</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <a href={appOrigin + '/signin'}>Sign in</a>
          </div>
        </div>
        <div className="mkt-footer-bottom">
          <span>© {new Date().getFullYear()} ProInspect Property Services · Western Australia</span>
          <div><Link to="/privacy">Privacy</Link><Link to="/terms">Service terms</Link></div>
        </div>
      </div>
    </footer>
  );
}
