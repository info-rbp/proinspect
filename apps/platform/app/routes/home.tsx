import { Link, redirect, type LoaderFunctionArgs } from 'react-router';
import { principal } from '../../../../packages/auth/server';
import { platformEnv } from '../../../../packages/database/context';
export const meta = () => [{ title: 'ProInspect | Your property workspace' }];
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = platformEnv(context);
  if (env.DB && (await principal(request, env))) throw redirect('/workspaces');
  return null;
}
export default function Home() {
  return (
    <main id="main" className="auth-page">
      <a className="brand" href="https://proinspect.systems">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </a>
      <div className="auth-grid">
        <section className="auth-copy">
          <p className="eyebrow">One account. Your property work.</p>
          <h1>
            A clearer picture
            <br />
            of your property.
          </h1>
          <p>
            Book services, follow the work and keep your reports together in one secure property
            record.
          </p>
          <div className="actions" style={{ marginTop: 28 }}>
            <Link className="button" to="/signin">
              Sign in or create an account
            </Link>
          </div>
        </section>
        <section className="panel stack">
          <p className="eyebrow">A connected service</p>
          <h2>From first booking to final report.</h2>
          <div className="record-row">
            <div>
              <h3>Choose your property</h3>
              <p>Start with a property you are authorised to manage.</p>
            </div>
            <span className="badge">01</span>
          </div>
          <div className="record-row">
            <div>
              <h3>Arrange the right service</h3>
              <p>Inspection, attendance or a property request.</p>
            </div>
            <span className="badge">02</span>
          </div>
          <div className="record-row">
            <div>
              <h3>Keep the record</h3>
              <p>View issued reports and follow your requests.</p>
            </div>
            <span className="badge">03</span>
          </div>
        </section>
      </div>
    </main>
  );
}
