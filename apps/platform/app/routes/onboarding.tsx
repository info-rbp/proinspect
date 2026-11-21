import { LegalAcceptance } from '../components/LegalAcceptance';
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
  redirect,
  data,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from 'react-router';
import { bookingIntent, propertySetupPath } from '../../../../packages/domain/booking-intent';
import { getOnboardingFlow } from '../../../../packages/onboarding/registry';
import { entryPath, withService } from '../../../../packages/onboarding/entry';
import { loadApi, callApi } from '../lib/api.server';
import { Field, Feedback } from '../../../../packages/ui/components';

type OwnerTag = 'ONB-RES-OWNER' | 'ONB-COM-OWNER';
function ownerTag(value: unknown): OwnerTag {
  return 'ONB-RES-OWNER';
}
export const meta = () => [
  { title: 'Set up your free property account | ProInspect' },
  { name: 'robots', content: 'noindex,nofollow' },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const session = await loadApi(request, context, '/api/session');
  const url = new URL(request.url);
  const flowId = ownerTag(url.searchParams.get('flow'));
  if (url.searchParams.has('flow') && url.searchParams.get('flow') !== flowId)
    throw redirect(entryPath(url.searchParams.get('flow'), url.searchParams.get('service')));
  return {
    user: session.user,
    flowId,
    flow: getOnboardingFlow(flowId)!,
    serviceId: bookingIntent(url.searchParams.get('service')),
  };
}
export async function action({ request, context }: ActionFunctionArgs) {
  const form = await request.formData();
  // The selected tagged flow determines the account sector. A browser-supplied
  // label cannot create organisation, tenant, council or Staff privileges.
  const flowId = ownerTag(form.get('flowId'));
  if (form.get('flowId') !== flowId)
    return data({ error: 'Choose a valid property owner registration.' }, { status: 422 });
  if (form.get('selfManaged') !== 'yes')
    return data(
      { error: 'Confirm ownership and self-management before creating this account.' },
      { status: 422 },
    );
  const landlordType = flowId === 'ONB-RES-OWNER' ? 'residential' : 'commercial';
  const response = await callApi(request, context, '/api/onboarding', {
    method: 'POST',
    body: {
      displayName: form.get('displayName'),
      clientName: String(form.get('clientName') || '').trim() || String(form.get('displayName') || '').trim(),
      landlordType,
      serviceInterests: form.getAll('serviceInterests'),
      legalConsent: form.get('legalConsent'),
    },
  });
  const result = (await response.json()) as Record<string, any>;
  if (!response.ok)
    return data({ error: result.message, fields: result.fields }, { status: response.status });
  return redirect(
    propertySetupPath(
      `/w/${result.workspaceKind}/${result.clientId}`,
      bookingIntent(form.get('serviceId')),
    ),
  );
}
export default function Onboarding() {
  const { user, flowId, flow, serviceId } = useLoaderData<typeof loader>();
  const result = useActionData<any>();
  const busy = useNavigation().state !== 'idle';
  const commercial = flowId === 'ONB-COM-OWNER';
  return (
    <main id="main" className="auth-page form-width">
      <Link className="brand" to="/workspaces">
        ProInspect<span>PROPERTY OPERATIONS</span>
      </Link>
      <section className="panel stack">
        <p className="eyebrow">Free account · Step 2 of 3</p>
        <h1>Welcome. Let's set up your property.</h1>
        <p>
          Tell us your name and confirm that you own and self-manage the residential properties
          you will add. Your free account is created first; you can add a property and book
          inspections next. No subscription, payment method or invoice is created by registration.
        </p>
        <ol className="signup-progress" aria-label="Registration progress">
          <li>1. Email verified</li>
          <li aria-current="step">2. Your details</li>
          <li>3. Add property</li>
        </ol>
        <Form method="post" className="form">
          <input type="hidden" name="flowId" value={flowId} />
          <input type="hidden" name="serviceId" value={serviceId ?? ''} />
          <Field label="Your full name" name="displayName">
            <input
              id="displayName"
              name="displayName"
              required
              minLength={2}
              maxLength={100}
              autoComplete="name"
              defaultValue={user.display_name}
            />
          </Field>
          <details className="signup-optional-entity">
            <summary>Does a business or entity own the property? (optional)</summary>
            <Field label="Owning entity / account name" name="clientName"
              help="Leave blank to use your personal name. This does not verify company or property ownership.">
              <input id="clientName" name="clientName" minLength={2} maxLength={160}
                autoComplete="organization" />
            </Field>
          </details>
          <label className="checkbox">
            <input type="checkbox" name="selfManaged" value="yes" required />
            <span>I confirm I own and self-manage the properties I will add to this account.</span>
          </label>
          <LegalAcceptance purpose="onboarding" />
          <p className="small">
            Manage property on behalf of another owner?{' '}
            <Link
              to={withService(
                commercial
                  ? '/organisation?flow=ONB-COM-MANAGER'
                  : '/organisation?flow=ONB-RES-AGENCY',
                serviceId,
              )}
            >
              Apply for professional organisation access
            </Link>
            . <Link to="/start?flow=ONB-INV-CORE">Tenant and resident access</Link> is by invitation
            only.
          </p>
          <Feedback value={result} />
          <div className="form-footer">
            <Link to="/workspaces">Back</Link>
            <button className="primary" disabled={busy}>
              {busy ? 'Creating account…' : 'Continue to add your property'}
            </button>
          </div>
        </Form>
        <p className="small">
          Next you can add your first property and choose a service, or finish later. Existing
          property matches are reviewed before access is linked. Adding a property does not
          start a paid plan; tenancy and Co-Living details can be entered when needed.
        </p>
      </section>
    </main>
  );
}
