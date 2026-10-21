import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  Link,
  useLoaderData,
  type LoaderFunctionArgs,
  useRouteError,
  isRouteErrorResponse,
} from 'react-router';
import { runtimeContext } from '../../../packages/database/context';
import '../../../packages/ui/styles.css';
import '../../../packages/ui/marketing-nav.css';
import '../../../packages/ui/marketing-redesign.css';
import '../../../packages/ui/leasing.css';
import '../../../packages/ui/rental-application.css';
import '../../../packages/ui/rental-print.css';
import '../../../packages/ui/open-home.css';
import { MarketingHeader, MarketingFooter } from './components/site-chrome';
export function loader({ context }: LoaderFunctionArgs) {
  const env = context.get(runtimeContext).env as Record<string, string>;
  return { appOrigin: env.PLATFORM_ORIGIN || 'https://app.proinspect.systems' };
}
export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="site">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
export default function Root() {
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
    <main id="main" className="auth-page">
      <h1>
        {isRouteErrorResponse(error) && error.status === 404
          ? 'Page not found'
          : 'This page is unavailable'}
      </h1>
      <p>Return to the service catalogue to find the right property service.</p>
      <Link className="button" to="/services">
        Explore services
      </Link>
    </main>
  );
}
