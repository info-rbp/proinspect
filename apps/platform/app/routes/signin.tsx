import {
  Form,
  Link,
  useLoaderData,
  useActionData,
  useNavigation,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data,
} from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { beginSignIn, isLocal } from '../../../../packages/auth/server';
import { safeReturnTo } from '../../../../packages/domain/index';
import { apiError } from '../../worker/api';
import { Feedback, Field } from '../../../../packages/ui/components';
import { Turnstile } from '../components/Turnstile';
export const meta = () => [{ title: 'Sign in | ProInspect' }];
export function loader({ request, context }: LoaderFunctionArgs) {
  const env = platformEnv(context);
  return {
    returnTo: safeReturnTo(new URL(request.url).searchParams.get('returnTo')),
    siteKey: env.TURNSTILE_SITE_KEY,
    local: isLocal(request, env),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    return await beginSignIn(request, platformEnv(context), Object.fromEntries(form));
  } catch (error) {
    const response = apiError(error);
    const result = (await response.json()) as any;
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  }
}
export default function SignIn() {
  const settings = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const pending = useNavigation().state !== 'idle';
  return (
    <main id="main" className="auth-page">
      <Link className="brand" to="/">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </Link>
      <div className="auth-grid">
        <section className="auth-copy">
          <p className="eyebrow">Welcome to your workspace</p>
          <h1>
            Your properties.
            <br />
            Your work.
            <br />
            One place.
          </h1>
          <p>
            Sign in securely to book a service, manage a request or view a report. No password to
            remember.
          </p>
        </section>
        <section className="panel auth-panel">
          <h2>Sign in or get started</h2>
          <p>
            We will email you a one-time sign-in link. Your workspace access is based on your
            approved relationships.
          </p>
          <Form method="post" className="form">
            <input type="hidden" name="returnTo" value={settings.returnTo} />
            <Field label="Email address" name="email">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Turnstile siteKey={settings.siteKey} />
            <Feedback value={result} />
            <button className="primary" disabled={pending}>
              {pending ? 'Sending link…' : 'Email sign-in link'}
            </button>
            {settings.local && result?.localSignInUrl && (
              <div className="notice warning">
                <p>Local development only. This link is never returned in a hosted environment.</p>
                <Link to={result.localSignInUrl}>Continue with local sign-in</Link>
              </div>
            )}
          </Form>
          <p className="auth-foot">
            New self-managing landlord? You can set up your account after verifying your email.
            Tenant access requires an invitation.
          </p>
        </section>
      </div>
    </main>
  );
}
