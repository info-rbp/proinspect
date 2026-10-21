import { Link, Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from 'react-router';
import { MarketingHeader, MarketingFooter } from '../../../marketing/app/components/site-chrome';

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
      <MarketingHeader appOrigin={appOrigin} />
      <main id="main">
        <Outlet context={{ appOrigin }} />
      </main>
      <MarketingFooter appOrigin={appOrigin} />
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