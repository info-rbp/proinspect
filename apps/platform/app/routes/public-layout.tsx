import { Link, Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from 'react-router';

/** The public marketing chrome is displayed inside the authenticated app's SSR root. */
export function loader() {
  // Empty base ensures every customer link stays on the currently visited
  // origin, including workers.dev until the canonical domain is connected.
  return { appOrigin: '' };
}

export default function PublicLayout() {
  const { appOrigin } = useLoaderData<typeof loader>();
  return (
    <>
      <div className="site-container">
        <header className="site-header">
          <Link className="brand" to="/">
            ProInspect<span>PROPERTY SERVICES</span>
          </Link>
          <nav className="site-links" aria-label="Primary navigation">
            <Link to="/services">Services</Link>
            <Link to="/sectors/residential">Residential</Link>
            <Link to="/sectors/commercial">Commercial</Link>
            <Link to="/sectors/strata-building">Strata &amp; buildings</Link>
            <Link to="/how-it-works">How it works</Link>
            <Link to="/properties-for-lease">Properties for lease</Link>
          </nav>
          <details className="marketing-menu">
            <summary>Menu</summary>
            <nav aria-label="Mobile site navigation">
              <Link to="/services">Services</Link>
              <Link to="/sectors/residential">Residential</Link>
              <Link to="/sectors/commercial">Commercial</Link>
              <Link to="/sectors/strata-building">Strata &amp; buildings</Link>
              <Link to="/how-it-works">How we work</Link>
              <Link to="/why-proinspect">Why ProInspect</Link>
              <Link to="/properties-for-lease">Properties for lease</Link>
              <Link to="/resources">Resources</Link>
              <Link to="/contact">Contact</Link>
            </nav>
          </details>
          <div className="actions">
            <Link className="small" to="/signin">Sign in</Link>
            <Link className="button" to="/book">Book a service</Link>
          </div>
        </header>
      </div>
      <main id="main">
        <Outlet context={{ appOrigin }} />
      </main>
      <footer className="site-footer">
        <div className="site-container">
          <div className="footer-grid">
            <div>
              <Link className="brand inverse" to="/">
                ProInspect<span>PROPERTY OPERATIONS</span>
              </Link>
              <p>
                Property inspections, on-site attendance and operational support, organised around
                your property.
              </p>
            </div>
            <div>
              <h3>Explore ProInspect</h3>
              <Link to="/services">All services</Link>
              <Link to="/how-it-works">How we work</Link>
              <Link to="/client-experience">Your property record</Link>
              <Link to="/why-proinspect">Why ProInspect</Link>
              <Link to="/resources">Guides &amp; comparisons</Link>
              <Link to="/properties-for-lease">Properties for lease</Link>
              <Link to="/areas-we-service">Service areas</Link>
              <Link to="/about">About</Link>
              <Link to="/contact">Contact</Link>
            </div>
            <div>
              <h3>Your workspace</h3>
              <Link to="/signin">Sign in</Link>
              <Link to="/workspaces">Open your workspaces</Link>
              <Link to="/privacy">Privacy</Link>
              <Link to="/terms">Service terms</Link>
            </div>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} ProInspect Property Services. Western Australia.
          </div>
        </div>
      </footer>
    </>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <main id="main" className="site section">
      <div className="site-container prose">
        <h1>{isRouteErrorResponse(error) && error.status === 404 ? 'Page not found' : 'This page is unavailable'}</h1>
        <p>Return to the service catalogue to find the right property service.</p>
        <Link className="button" to="/services">Explore services</Link>
      </div>
    </main>
  );
}