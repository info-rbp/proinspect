import {
  Form,
  Link,
  useLoaderData,
  useActionData,
  useNavigation,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data,
  redirectDocument,
} from 'react-router';
import { platformEnv } from '../../../../packages/database/context';
import { beginSignIn, isLocal, requireOrigin } from '../../../../packages/auth/server';
import { stagingAccess } from '../../../../packages/auth/staging-access';
import { bookingIntent } from '../../../../packages/domain/booking-intent';
import {
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
    staging: stagingAccess(request, env),
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
    const env = platformEnv(context);
    if (stagingAccess(request, env)) {
      requireOrigin(request, env);
      return redirectDocument('/auth/staging?' + new URLSearchParams({returnTo}), 303);
    }
    return await beginSignIn(request, env, {
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
    <main id="main" className={settings.signup ? "auth-page auth-page-signup" : "auth-page"}>
      <Link className="brand" to="/">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </Link>
      <div className="auth-grid">
        <section className="auth-copy">
          <p className="eyebrow">Your ProInspect account</p>
          <h1>{settings.signup ? 'Property support starts with you.' : 'Welcome back to ProInspect.'}</h1>
          <p>
            {settings.signup
              ? 'Book property inspections, manage your property records and follow work in one secure place.'
              : 'Return to the properties and services you are authorised to manage or access.'}
          </p>
          {settings.signup ? (
            <ol className="signup-steps" aria-label="Account setup steps">
              <li><strong>Verify your email</strong><span>No password to remember.</span></li>
              <li><strong>Tell us a little about yourself</strong><span>Only the details needed to set up your account.</span></li>
              <li><strong>Add your property</strong><span>Arrange a service when you are ready.</span></li>
            </ol>
          ) : <p>One email gives you access to your existing authorised ProInspect workspaces.</p>}
        </section>
        <section className="panel auth-panel">
          <h2>{settings.signup ? 'Create your free account' : 'Sign in to your account'}</h2>
          <p>
            {settings.staging ? 'Use an approved staging test email. Cloudflare will send you a one-time code.' : settings.signup
              ? 'Create a free account with your email address. We will send you a secure sign-in link; no payment details are needed.'
              : 'Enter your email and we will send a secure one-time link. No password to remember.'}
          </p>
          <Form method="post" className="form" reloadDocument={settings.staging}>
            <input type="hidden" name="returnTo" value={settings.returnTo} />
            <input type="hidden" name="mode" value={settings.signup ? 'signup' : 'signin'} />
            {settings.signup && settings.chooseRole && (
              <fieldset className="signup-choice-fieldset">
                <legend>What brings you to ProInspect?</legend>
                <p id="signup-choice-help" className="small">
                  Choose what you need to do. This guides setup; it does not grant property access.
                </p>
                <div className="signup-choice-grid" aria-describedby="signup-choice-help">
                  <label className="signup-choice">
                    <input type="radio" name="flow" value="ONB-RES-OWNER"
                      defaultChecked={settings.flow === 'ONB-RES-OWNER'} required />
                    <span className="signup-choice-copy">
                      <strong>I own a residential property</strong>
                      <span>Inspections, reports and support for property I own and self-manage.</span>
                    </span>
                  </label>
                  <label className="signup-choice">
                    <input type="radio" name="flow" value="ONB-RES-AGENCY"
                      defaultChecked={settings.flow === 'ONB-RES-AGENCY'} />
                    <span className="signup-choice-copy">
                      <strong>I manage properties for owners</strong>
                      <span>Apply for a reviewed property management organisation account.</span>
                    </span>
                  </label>
                  <label className="signup-choice">
                    <input type="radio" name="flow" value="ONB-RES-OWNER" />
                    <span className="signup-choice-copy">
                      <strong>I need a one-off inspection</strong>
                      <span>For property I own and self-manage. No subscription required to register.</span>
                    </span>
                  </label>
                  <label className="signup-choice">
                    <input type="radio" name="flow" value="ONB-INV-CORE"
                      defaultChecked={settings.flow === 'ONB-INV-CORE'} />
                    <span className="signup-choice-copy">
                      <strong>I am a tenant or resident</strong>
                      <span>Use your invitation to access tenancy information.</span>
                    </span>
                  </label>
                </div>
              </fieldset>
            )}
            {!settings.staging && <><Field label="Email address" name="email">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </Field>
            <Turnstile siteKey={settings.siteKey} /></>}
            <Feedback value={result} />
            <button className="primary" disabled={pending}>
              {settings.staging ? 'Continue with staging email' : pending ? 'Sending link…' : 'Email sign-in link'}
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
                <Link reloadDocument to={'/signin?returnTo=' + encodeURIComponent(settings.returnTo)}>
                  Sign in with your existing email
                </Link>
                .
              </>
            ) : (
              <>
                New to ProInspect?{' '}
                <Link reloadDocument to={'/signup?returnTo=' + encodeURIComponent(settings.returnTo)}>
                  Create a free account
                </Link>
                .
              </>
            )}
          </p>
          <p className="auth-foot">
            Registration is free and never starts a subscription. Property management access requires
            approval. Tenant and resident access is invitation-only and requires a verified invitation.
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
