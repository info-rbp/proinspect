import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from 'react-router';
import type { ReactNode } from 'react';
import '../../../packages/ui/styles.css';
export function Layout({children}:{children:ReactNode}) {return <html lang="en-AU"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><Meta/><Links/></head><body><a className="skip" href="#main">Skip to content</a>{children}<ScrollRestoration/><Scripts/></body></html>;}
export default function App(){return <Outlet/>;}
export function ErrorBoundary(){const e=useRouteError();return <main id="main" className="container"><h1>{isRouteErrorResponse(e)?e.status:'Page unavailable'}</h1><a href="/">Return to ProInspect</a></main>;}
