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
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import {
  ENTRY_CHOICES,
  authDestination,
  entryFlow,
  entryPath,
  withService,
} from '../../../../packages/onboarding/entry';
import { apiError } from '../../worker/api';
import { Feedback, Field } from '../../../../packages/ui/components';
import { Turnstile } from '../components/Turnstile';
export const meta = ({ data: settings }: { data?: { signup: boolean } }) => [
  { title: settings?.signup ? 'Create your free account | ProInspect' : 'Sign in | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];
export function loader({ request, context }: LoaderFunctionArgs) {
  const env = platformEnv(context);
  const url = new URL(request.url);
  const returnTo = authDestination(url.searchParams.get('returnTo'));
  const destination = new URL(returnTo, url.origin);
  const serviceId =
    bookingIntent(destination.searchParams.get('service')) ??
    bookingIntent(url.searchParams.get('service'));
  return {
    signup: false,
    returnTo: returnTo === '/start' ? withService(returnTo, serviceId) : returnTo,
    chooseRole: destination.pathname === '/start',
    flow:
      entryFlow(destination.searchParams.get('flow')) ?? entryFlow(url.searchParams.get('flow')),
    siteKey: env.TURNSTILE_SITE_KEY,
    local: isLocal(request, env),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    let returnTo = authDestination(form.get('returnTo'));
    const destination = new URL(returnTo, request.url);
    if (form.get('mode') === 'signup' && destination.pathname === '/start') {
      const flow = entryFlow(form.get('flow'));
      if (!flow)
        return data(
          { error: 'Choose the role that best describes you to continue.' },
          { status: 422 },
        );
      returnTo = entryPath(flow, destination.searchParams.get('service'));
    }
    return await beginSignIn(request, platformEnv(context), {
      ...Object.fromEntries(form),
      returnTo,
    });
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
          <p className="eyebrow">Your ProInspect Client Portal</p>
          <h1>
            {settings.signup ? 'Property support starts here.' : 'Welcome back to ProInspect.'}
          </h1>
          <p>
            Inspections, property reports, leasing and maintenance support, with the right tools for
            your role.
          </p>
          <p>
            Residential, Commercial, Strata and Resident portals, connected through one secure
            account.
          </p>
        </section>
        <section className="panel auth-panel">
          <h2>{settings.signup ? 'Create your free account' : 'Sign in to your account'}</h2>
          <p>
            {settings.signup
              ? 'Verify your email, then complete the setup for your role. No payment details are needed.'
              : 'Enter your email and we will send a secure one-time link. No password to remember.'}
          </p>
          <Form method="post" className="form">
            <input type="hidden" name="returnTo" value={settings.returnTo} />
            <input type="hidden" name="mode" value={settings.signup ? 'signup' : 'signin'} />
            {settings.signup && settings.chooseRole && (
              <Field
                label="Which best describes you?"
                name="flow"
                help="This guides your setup. Property access is confirmed separately."
              >
                <select id="flow" name="flow" required defaultValue={settings.flow ?? ''}>
                  <option value="">Choose your role</option>
                  {['Residential', 'Commercial', 'Strata', 'Resident'].map((family) => (
                    <optgroup label={family} key={family}>
                      {ENTRY_CHOICES.filter((choice) => choice.family === family).map((choice) => (
                        <option key={choice.id} value={choice.id}>
                          {choice.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
            )}
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
            {settings.signup ? (
              <>
                Already registered?{' '}
                <Link to={'/signin?returnTo=' + encodeURIComponent(settings.returnTo)}>
                  Sign in with your existing email
                </Link>
                .
              </>
            ) : (
              <>
                New to ProInspect?{' '}
                <Link to={'/signup?returnTo=' + encodeURIComponent(settings.returnTo)}>
                  Create a free account
                </Link>
                .
              </>
            )}
          </p>
          <p className="auth-foot">
            An account does not start a subscription. Professional management access requires
            review. Resident access is invitation-only; building managers need an approved
            assignment.
          </p>
          <p className="auth-foot">
            Have an invitation? Open the original link and use the email it was sent to. Looking for
            a rental? <Link to="/properties-for-lease">View properties and apply</Link>.
          </p>
          <p className="auth-foot">
            <Link to="/privacy">Privacy information</Link> ·{' '}
            <Link to="/contact">Get help signing in</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
