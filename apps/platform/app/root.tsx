import { Links, Meta, Outlet, Scripts, ScrollRestoration, isRouteErrorResponse, useRouteError } from 'react-router';
import type { ReactNode } from 'react';
import '../../../packages/ui/styles.css';
export function Layout({children}:{children:ReactNode}) { return <html lang="en-AU"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex, nofollow"/><Meta/><Links/></head><body><a className="skip" href="#main">Skip to content</a>{children}<ScrollRestoration/><Scripts/></body></html>; }
export default function App(){ return <Outlet/>; }
export function ErrorBoundary(){const e=useRouteError();return <main id="main" className="container"><h1>{isRouteErrorResponse(e)?e.status:'Unable to load this page'}</h1><p>{isRouteErrorResponse(e)&&e.status===404?'This page does not exist.':'Your access may have changed, or this action could not be completed.'}</p><a href="/">Return to your workspace</a></main>;}
