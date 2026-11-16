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
  return value === 'ONB-COM-OWNER' ? value : 'ONB-RES-OWNER';
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
      clientName: form.get('clientName'),
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
        <p className="eyebrow">Free owner account · Your details</p>
        <h1>{commercial ? 'Set up commercial property' : 'Set up residential property'}</h1>
        <p>
          {commercial
            ? 'Arrange inspections, property reports and operational support for the commercial premises you own and self-manage.'
            : 'Arrange inspections, property reports, leasing and maintenance support for your self-managed homes, including co-living and student accommodation.'}{' '}
          Start with your name and account, then add your property. Registration is free and does
          not start a paid plan.
        </p>
        <nav className="actions" aria-label="Choose property owner onboarding">
          <Link
            className={commercial ? 'button secondary' : 'button'}
            to={
              serviceId
                ? '/onboarding?flow=ONB-RES-OWNER&service=' + encodeURIComponent(serviceId)
                : '/onboarding?flow=ONB-RES-OWNER'
            }
          >
            Residential owner
          </Link>
          <Link
            className={commercial ? 'button' : 'button secondary'}
            to={
              serviceId
                ? '/onboarding?flow=ONB-COM-OWNER&service=' + encodeURIComponent(serviceId)
                : '/onboarding?flow=ONB-COM-OWNER'
            }
          >
            Commercial owner
          </Link>
        </nav>
        <Form method="post" className="form">
          <input type="hidden" name="flowId" value={flowId} />
          <input type="hidden" name="serviceId" value={serviceId ?? ''} />
          <Field label="Your name" name="displayName">
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
          <Field
            label="Account name"
            name="clientName"
            help="Use your name or the name of the entity that owns the property."
          >
            <input
              id="clientName"
              name="clientName"
              required
              minLength={2}
              maxLength={160}
              defaultValue={user.display_name}
            />
          </Field>
          <label className="checkbox">
            <input type="checkbox" name="selfManaged" value="yes" required />
            <span>I confirm I own and self-manage the properties I will add to this account.</span>
          </label>
          <details className="panel stack">
            <summary>Interested in other ProInspect services? (optional)</summary>
            <p className="small">
              Preferences do not create service entitlements, property access or a subscription.
            </p>
            {[
              ['residential', 'Residential'],
              ['commercial', 'Commercial'],
              ['strata', 'Strata'],
              ['co-living', 'Co-living and student living'],
              ['construction', 'Construction support'],
              ['leasing', 'Leasing'],
              ['maintenance', 'Maintenance'],
            ].map(([value, label]) => (
              <label className="checkbox" key={value}>
                <input type="checkbox" name="serviceInterests" value={value} />
                <span>{label}</span>
              </label>
            ))}
          </details>
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
              {busy ? 'Creating account…' : 'Create free account'}
            </button>
          </div>
        </Form>
        <p className="small">
          Next: Add your first authorised property or continue the service you selected. We check
          existing property matches before linking access. Separate rooms, shared areas and service
          scope are configured when relevant; preferences do not activate paid services.
        </p>
      </section>
    </main>
  );
}
