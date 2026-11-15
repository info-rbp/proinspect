import { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { PUBLIC_NAVIGATION } from '../../../../packages/marketing/public-navigation';

export function MarketingHeader({ appOrigin = '' }: { appOrigin?: string }) {
  const { pathname } = useLocation();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (mobileMenu.current) mobileMenu.current.open = false;
  }, [pathname]);
  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      for (const menu of [mobileMenu.current])
        if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      for (const menu of [mobileMenu.current]) {
        if (!menu?.open) continue;
        menu.open = false;
        menu.querySelector('summary')?.focus();
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, []);
  return (
    <div className="mkt-header-wrap">
      <div className="site-container">
        <header className="site-header mkt-site-header">
          <Link className="brand mkt-brand" to="/" aria-label="ProInspect homepage">
            ProInspect<span>PROPERTY SERVICES</span>
          </Link>
          <nav className="site-links mkt-site-links" aria-label="Primary navigation">
            {PUBLIC_NAVIGATION.filter(item => !['/client','/contact'].includes(item.href)).map(item =>
              <Link key={item.href} to={item.href} aria-current={pathname === item.href ? 'page' : undefined}>{item.label}</Link>)}
          </nav>
          <div className="mkt-header-actions">
            <Link className="button mkt-header-book" to="/client">Sign Up / Sign In</Link>
            <Link className="mkt-signin" to="/contact">Contact Us</Link>
          </div>
          <details className="marketing-menu" ref={mobileMenu}>
            <summary aria-label="Open site menu"><span aria-hidden="true">☰</span><span>Menu</span></summary>
            <nav aria-label="Mobile site navigation">
              {PUBLIC_NAVIGATION.map(item => <Link key={item.href} to={item.href}>{item.label}</Link>)}
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
            <p>Practical on-site property services. Documented outcomes and connected records for residential, commercial and strata properties.</p>
            <Link className="mkt-footer-contact" to="/contact">Talk to ProInspect <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="mkt-footer-group">
            <h3>Services</h3>
            <Link to="/services">All services</Link>
            <Link to="/service-finder">Find a service</Link>
            <Link to="/services/category/inspections">Inspections &amp; reports</Link>
            <Link to="/services/category/maintenance">Maintenance &amp; works</Link>
            <Link to="/services/category/access">Contractor access</Link>
          </div>
          <div className="mkt-footer-group">
            <h3>Who we help</h3>
            {PUBLIC_NAVIGATION.filter(item => ['residential','commercial','strata','co-living','construction'].includes(item.href.slice(1))).map(item => <Link key={item.href} to={item.href}>{item.label}</Link>)}
            <Link to="/who-we-help">All customer types</Link>
            <Link to="/residential-property-support">Residential support options</Link>
          </div>
          <div className="mkt-footer-group">
            <h3>ProInspect</h3>
            <Link to="/how-it-works">How it works</Link>
            <Link to="/client-experience">Client experience</Link>
            <Link to="/properties-for-lease">Properties for lease</Link>
            <Link to="/resources">Resources</Link>
            <Link to="/about">About</Link>
            <Link to="/contact">Contact</Link>
            <a href={appOrigin + '/client'}>Sign in</a>
          </div>
        </div>
        <div className="mkt-footer-bottom">
          <span>© {new Date().getFullYear()} ProInspect Property Services · Western Australia</span>
          <div><Link to="/privacy">Privacy</Link><Link to="/website-terms">Website terms</Link><Link to="/platform-terms">Platform terms</Link><Link to="/terms">Service terms</Link><Link to="/booking-policy">Booking &amp; refunds</Link><Link to="/service-scopes">Service scopes</Link><Link to="/subscription-terms">Plans</Link></div>
        </div>
      </div>
    </footer>
  );
}
