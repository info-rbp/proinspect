import { Link, redirect, type LoaderFunctionArgs } from 'react-router';
import { principal } from '../../../../packages/auth/server';
import { platformEnv } from '../../../../packages/database/context';
export const meta = () => [{ title:'Client Portal | ProInspect' },{ name:'robots', content:'noindex,nofollow' }];
export async function loader({request,context}:LoaderFunctionArgs) {
  const user=await principal(request,platformEnv(context));
  if(user) throw redirect('/workspaces');
  return null;
}
export default function ClientEntry() {
  return <main id="main" className="auth-page"><div className="auth-grid">
    <section className="auth-copy"><p className="eyebrow">ProInspect Client Portal</p><h1>One account for your properties and services.</h1><p>Manage your property portfolio, book authorised services and review subscriptions and billing in one place.</p></section>
    <section className="panel auth-panel stack"><h2>Sign up or sign in</h2><p>Enter your email to get a secure link. New customers complete their account setup after verification.</p><Link className="button" to="/signin?returnTo=%2Fworkspaces">Continue with email</Link><p>Creating an account does not start a subscription or payment.</p><Link to="/">Return to website</Link></section>
  </div></main>;
}
