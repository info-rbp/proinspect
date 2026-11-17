import { Link, redirect, type LoaderFunctionArgs } from 'react-router';
import { principal } from '../../../../packages/auth/server';
import { platformEnv } from '../../../../packages/database/context';
export const meta = () => [
  { title: 'Client Portal | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await principal(request, platformEnv(context));
  if (user) throw redirect('/start');
  return null;
}
export default function ClientEntry() {
  return (
    <main id="main" className="auth-page">
      <div className="auth-grid">
        <section className="auth-copy">
          <p className="eyebrow">ProInspect Client Portal</p>
          <h1>One account for your properties and services.</h1>
          <p>
            Access Residential, Commercial, Strata or Resident tools for your authorised role. Book
            services, follow requests and review the records shared with you.
          </p>
        </section>
        <section className="panel auth-panel stack">
          <h2>Sign up or sign in</h2>
          <p>
            Use a secure email link. We will guide you to your existing portal or the right account
            setup.
          </p>
          <Link className="button" to="/signin">
            Sign in with email
          </Link>
          <Link className="button secondary" to="/signup">
            Create a free account
          </Link>
          <p>
            Creating an account does not start a subscription or payment. Resident access is by
            invitation.
          </p>
          <Link to="/">Return to website</Link>
        </section>
      </div>
    </main>
  );
}
